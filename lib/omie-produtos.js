import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, prismaDirect } from "./prisma";
import { omieCall } from "./omie-call";

// CADASTRO DE PRODUTOS do Omie, em cache local (ProdutoOmie).
// Por quê: o portal só conhecia os itens que já passaram por alguma RM (~190 de 2.4k). Perfis que
// existem no Omie mas nunca foram requisitados aqui apareciam "sem código" no romaneio de terceiro
// — foi o caso do TUBO 48,30 X 2,65 (1.1/2"), que o Vitor apontou (18/08). Sincroniza por
// cron/botão; as telas leem só o cache (rápido e sem estourar rate-limit do Omie).

const URL_PRODUTOS = "https://app.omie.com.br/api/v1/geral/produtos/";
const POR_PAGINA = 500;

// O Omie devolve a descrição com entidades HTML (&quot; nas polegadas, &amp; etc.) — limpa pra o
// texto sair legível no romaneio e pro matcher enxergar as aspas de polegada.
const limpar = (t) => String(t || "")
  .replace(/&quot;/gi, '"').replace(/&#34;/g, '"')
  .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&nbsp;/gi, " ").trim();

/**
 * Grava um lote de produtos numa tacada só.
 *
 * ⚠⚠ ESCRITA EM MASSA PELO PADRÃO DO CLAUDE.md, e não por gosto: 2.410 `upsert` sequenciais pelo
 * pooler estouravam os 300s da função (medido em 13/09/2026, na PRIMEIRA vez que este cron chegou
 * a rodar — ele passou meses sendo redirecionado pelo middleware). Statement CONSTANTE, dados como
 * arrays-literais de texto e cast no SQL: SQL com valor embutido vira um plano novo por chamada e
 * derruba a compute do Neon com `CachedPlanQuery`.
 *
 * ⚠ `prismaDirect` (sem pooler) — o PgBouncer estoura `MessageContext` com statement grande.
 *
 * ⚠ O `id` sai daqui porque `@default(cuid())` é do CLIENTE Prisma e não existe no Postgres. Linha
 * que já existe mantém o id dela: o `ON CONFLICT` não toca nessa coluna.
 */
const SQL_PRODUTOS = `
  INSERT INTO "ProdutoOmie" ("id","codigo","codigoOmie","descricao","unidade","familia","inativo","atualizadoEm")
  SELECT id, codigo, cod_omie, descricao, unidade, familia, inativo::boolean, now()
    FROM UNNEST($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
      AS t(id, codigo, cod_omie, descricao, unidade, familia, inativo)
  ON CONFLICT ("codigo") DO UPDATE SET
    "codigoOmie"   = EXCLUDED."codigoOmie",
    "descricao"    = EXCLUDED."descricao",
    "unidade"      = EXCLUDED."unidade",
    "familia"      = EXCLUDED."familia",
    "inativo"      = EXCLUDED."inativo",
    "atualizadoEm" = EXCLUDED."atualizadoEm"`;

/** Array-literal do Postgres: `{"a","b",NULL}`. NULL sem aspas, senão vira a string "NULL". */
const arrayLiteral = (vals) =>
  `{${vals.map((v) => (v === null || v === undefined ? "NULL"
    : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;

async function gravarLote(linhas) {
  if (!linhas.length) return 0;
  const col = (i) => arrayLiteral(linhas.map((l) => l[i]));
  await prismaDirect.$executeRawUnsafe(SQL_PRODUTOS, col(0), col(1), col(2), col(3), col(4), col(5), col(6));
  return linhas.length;
}

export async function sincronizarProdutosOmie() {
  let pagina = 1, totalPaginas = 1, lidos = 0, gravados = 0;
  do {
    const j = await omieCall(URL_PRODUTOS, "ListarProdutos", {
      pagina, registros_por_pagina: POR_PAGINA,
      apenas_importado_api: "N", filtrar_apenas_omiepdv: "N",
    });
    totalPaginas = j.total_de_paginas || 1;
    const lote = j.produto_servico_cadastro || [];
    lidos += lote.length;

    const linhas = [];
    for (const pr of lote) {
      const codigo = String(pr.codigo || "").trim();
      if (!codigo) continue;
      linhas.push([
        randomUUID(),
        codigo,
        pr.codigo_produto != null ? String(pr.codigo_produto) : null,
        limpar(pr.descricao).slice(0, 300),
        pr.unidade ? String(pr.unidade).slice(0, 20) : null,
        pr.descricao_familia ? limpar(pr.descricao_familia).slice(0, 120) : null,
        String(pr.inativo || "N").toUpperCase() === "S" ? "true" : "false",
      ]);
    }
    gravados += await gravarLote(linhas);
    pagina++;
  } while (pagina <= totalPaginas);
  return { lidos, gravados, paginas: totalPaginas };
}

// Produtos do cache no formato que o matcher entende ({ codigo, descricao }). Filtra os inativos
// e, por padrão, só matéria-prima de estrutura (perfil/chapa/tubo/cantoneira/barra) — é o que
// aparece nos romaneios; evita casar com parafuso/tinta.
export async function catalogoOmie() {
  const rows = await prisma.produtoOmie.findMany({
    where: {
      inativo: false,
      OR: [
        { descricao: { startsWith: "PERFIL" } },
        { descricao: { startsWith: "CHAPA" } },
        { descricao: { startsWith: "TUBO" } },
        { descricao: { startsWith: "CANTONEIRA" } },
        { descricao: { startsWith: "BARRA" } },
      ],
    },
    select: { codigo: true, descricao: true },
    take: 4000,
  });
  return rows.map((r) => ({ codigo: r.codigo, descricao: r.descricao, largura: null, comprimento: null }));
}
