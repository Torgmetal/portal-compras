import "server-only";
import { gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { uploadFileToFolder } from "./sharepoint";

// ─── BACKUP DO BANCO PARA O SHAREPOINT ────────────────────────────────────────
// Vitor (29/08/2026), depois de perguntar onde ficava o backup do sistema: código e documentos têm
// duas cópias (GitHub, e SharePoint ao lado do Blob), mas o BANCO tinha uma só — nenhum dump,
// nenhuma rotina, nada fora do Neon. E o desenvolvimento roda contra a produção, sem staging: um
// script errado escreve no que está valendo, e a única rede embaixo é a retenção do Neon.
//
// ⚠⚠ UMA TABELA POR ARQUIVO, EM PÁGINAS. O banco tem 196 MB e 133 tabelas, e a maior (MesOrdem)
// tem 121 mil linhas. Carregar tudo em memória para escrever um arquivo só estoura a função antes
// de terminar — e um backup que falha na metade é pior que nenhum, porque parece existir.
// Assim o pico de memória é o de uma página, e cada tabela sobe assim que fica pronta.
//
// ⚠ NDJSON, não JSON. Uma linha por registro: se um arquivo truncar, o que veio antes continua
// legível. Um array JSON gigante truncado não abre de jeito nenhum.
export const PASTA_BACKUP = "/Workspace/Backup - Portal";
const PAGINA = 2000;

/** BigInt e Date não sobrevivem ao JSON.stringify padrão — viram texto legível na restauração. */
const substituir = (_k, v) => (typeof v === "bigint" ? v.toString() : v);

/** Os modelos do Prisma, em ordem alfabética — a lista vem do próprio schema, nunca digitada. */
export function modelosDoBanco() {
  return Prisma.dmmf.datamodel.models
    .map((m) => ({ nome: m.name, acessor: m.name.charAt(0).toLowerCase() + m.name.slice(1) }))
    .filter((m) => typeof prisma[m.acessor]?.findMany === "function")
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Exporta uma tabela para NDJSON comprimido e sobe.
 *
 * ⚠ A paginação é por `id` quando existe (keyset), não por `skip`. Com `skip` o Postgres relê e
 * descarta as linhas puladas a cada página — na tabela de 121 mil linhas isso vira leitura
 * quadrática e a função morre no tempo.
 */
async function exportarTabela({ nome, acessor }, pasta) {
  const cliente = prisma[acessor];
  const temId = Prisma.dmmf.datamodel.models.find((m) => m.name === nome)?.fields.some((f) => f.name === "id");
  const partes = [];
  let linhas = 0;
  let cursor = null;

  for (;;) {
    const pagina = await cliente.findMany({
      take: PAGINA,
      ...(temId
        ? { orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }
        : { skip: linhas }),
    });
    if (!pagina.length) break;
    for (const linha of pagina) partes.push(JSON.stringify(linha, substituir));
    linhas += pagina.length;
    if (temId) cursor = pagina[pagina.length - 1].id;
    if (pagina.length < PAGINA) break;
    // ⚠ tabela sem `id` cai no skip e não tem ordem garantida: corta em 50 mil para não girar
    // para sempre se o banco devolver a mesma página. Nenhuma tabela sem id chega perto disso.
    if (!temId && linhas >= 50_000) break;
  }

  if (!linhas) return { tabela: nome, linhas: 0, arquivo: null };

  const buffer = gzipSync(Buffer.from(partes.join("\n") + "\n", "utf8"));
  const arquivo = `${nome}.ndjson.gz`;
  await uploadFileToFolder({
    folderPath: pasta, fileName: arquivo, buffer, contentType: "application/gzip", conflict: "replace",
  });
  return { tabela: nome, linhas, arquivo, bytes: buffer.length };
}

/**
 * Roda o backup inteiro. Devolve o manifesto — que também vai gravado na pasta.
 *
 * ⚠⚠ O MANIFESTO É O QUE PROVA QUE TERMINOU. Ele é o ÚLTIMO arquivo a subir: pasta com tabelas e
 * sem manifesto significa backup interrompido no meio, e é assim que se descobre isso sem abrir
 * arquivo por arquivo. O monitor de crons olha para ele.
 *
 * @param {{ dia?: string, aoTerminarTabela?: (r:object)=>void }} opts
 */
export async function rodarBackup({ dia = null, aoTerminarTabela = null } = {}) {
  const inicio = Date.now();
  const data = dia || new Date().toISOString().slice(0, 10);
  const pasta = `${PASTA_BACKUP}/${data}`;

  const tabelas = [];
  const falhas = [];
  for (const modelo of modelosDoBanco()) {
    try {
      const r = await exportarTabela(modelo, pasta);
      if (r.linhas) tabelas.push(r);
      aoTerminarTabela?.(r);
    } catch (e) {
      // ⚠ uma tabela que falha não derruba as outras 132: o manifesto registra a falha e o
      // backup segue. Backup parcial COM a lista do que faltou é utilizável; sem a lista, não.
      falhas.push({ tabela: modelo.nome, erro: String(e?.message || e).slice(0, 200) });
    }
  }

  const manifesto = {
    banco: "portal-compras (Neon sa-east-1)",
    geradoEm: new Date().toISOString(),
    duracaoSegundos: Math.round((Date.now() - inicio) / 1000),
    formato: "NDJSON gzip, um arquivo por tabela",
    totalTabelas: tabelas.length,
    totalLinhas: tabelas.reduce((a, t) => a + t.linhas, 0),
    totalBytes: tabelas.reduce((a, t) => a + (t.bytes || 0), 0),
    falhas,
    tabelas: tabelas.map(({ tabela, linhas, arquivo, bytes }) => ({ tabela, linhas, arquivo, bytes })),
  };
  await uploadFileToFolder({
    folderPath: pasta, fileName: "manifesto.json",
    buffer: Buffer.from(JSON.stringify(manifesto, null, 2), "utf8"),
    contentType: "application/json", conflict: "replace",
  });
  return manifesto;
}
