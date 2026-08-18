import "server-only";
import { prisma } from "./prisma";
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
    for (const pr of lote) {
      const codigo = String(pr.codigo || "").trim();
      if (!codigo) continue;
      const data = {
        codigoOmie: pr.codigo_produto != null ? String(pr.codigo_produto) : null,
        descricao: limpar(pr.descricao).slice(0, 300),
        unidade: pr.unidade ? String(pr.unidade).slice(0, 20) : null,
        familia: pr.descricao_familia ? limpar(pr.descricao_familia).slice(0, 120) : null,
        inativo: String(pr.inativo || "N").toUpperCase() === "S",
        atualizadoEm: new Date(),
      };
      await prisma.produtoOmie.upsert({ where: { codigo }, create: { codigo, ...data }, update: data });
      gravados++;
    }
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
