// ─── DOCUMENTOS PARA O APP TORG ENGENHARIA (procedimentos, pasta da obra, NORMAS) ──────────────────
//
// O app do projetista não tem credencial do SharePoint: lê tudo por aqui, com o token do aparelho. Três fontes,
// cada uma com a SUA raiz — e o app nunca escolhe a raiz, só um caminho RELATIVO dentro dela.
//
// ⚠ Cada segmento vai ao Graph com encodeURIComponent, então `#` e espaços em nomes de arquivo valem. O `%` CONTINUA
// recusado: o app não tem como dizer se "%2e" é um nome literal ou um `.` codificado, e recusar é mais barato que adivinhar.
// ⚠ O caminho vem de fora, então é validado antes de virar caminho do Graph: `..` subiria para fora da raiz
// (RH, Financeiro) e `%` esconderia o `..` atrás de um decode. Recusa em vez de "limpar".
// ⚠ Procedimentos só baixam por `id` (de DocumentoQualidade vigente): nunca por caminho, senão a lista de
// "procedimentos" viraria porta para a pasta inteira do SGQ.
import "server-only";
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/sharepoint";
import { resolveServidorDriveId } from "@/lib/sharepoint-lpc";
import { pastaDaOp } from "@/lib/le-servidor";

export const FONTES = ["procedimentos", "obra", "normas"];
const GRAPH = "https://graph.microsoft.com/v1.0";
export const TETO_BYTES = 30 * 1024 * 1024;
const RAIZ_NORMAS = "/Engenharia/03. Padrão Torg/NORMAS";

const TIPOS = {
  pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword", dwg: "application/acad", dxf: "application/dxf", ifc: "application/x-step",
  txt: "text/plain", csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", zip: "application/zip",
};

function erro(mensagem, status) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

/** Valida e normaliza um caminho relativo. Aceita "" (a raiz da fonte). */
export function caminhoRelativoSeguro(c) {
  const bruto = String(c ?? "");
  if (/[\\:%\0]/.test(bruto) || bruto.startsWith("/")) throw erro("caminho inválido", 400);
  const partes = bruto.split("/").filter(Boolean);
  if (partes.some((p) => p === ".." || p === ".")) throw erro("caminho inválido", 400);
  return partes.join("/");
}

/** Raiz absoluta + driveId da fonte (procedimentos não passam por aqui). */
async function raizDaFonte(fonte, opNumero) {
  if (fonte === "normas") {
    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    if (!driveId) throw new Error("SHAREPOINT_DRIVE_ID ausente");
    return { driveId, raiz: RAIZ_NORMAS };
  }
  if (fonte === "obra") {
    const driveId = await resolveServidorDriveId();
    if (!driveId) throw new Error("Drive SERVIDOR não resolvido");
    const p = await pastaDaOp(opNumero);
    if (!p) throw erro(`pasta da OP ${opNumero} não encontrada`, 404);
    return { driveId, raiz: `${p.base}/${p.pasta}` };
  }
  throw erro("fonte inválida", 400);
}

const juntar = (raiz, rel) => (rel ? `${raiz}/${rel}` : raiz);
const codificar = (caminho) => caminho.split("/").map(encodeURIComponent).join("/");
const SELECT = "id,name,size,file,folder";

async function graph(url) {
  const token = await getAccessToken();
  return fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow", cache: "no-store" });
}

/** Filhos da pasta, SEGUINDO a paginação: com 200 itens por página, OP grande perdia arquivos (e dava 404 falso). */
async function filhosDaPasta(driveId, caminho) {
  const itens = [];
  let url = `${GRAPH}/drives/${encodeURIComponent(driveId)}/root:${codificar(caminho)}:/children?$select=${SELECT}&$top=200`;
  while (url) {
    const r = await graph(url);
    if (r.status === 404) throw erro("pasta não encontrada", 404);
    if (!r.ok) throw new Error(`Graph HTTP ${r.status} ao listar ${caminho}`);
    const d = await r.json();
    itens.push(...(d.value || []));
    url = d["@odata.nextLink"] || null;
  }
  return itens;
}

/** Metadados do PRÓPRIO item (o tamanho vem daqui, sem varrer o pai). */
async function metadadosDoItem(urlItem) {
  const r = await graph(`${urlItem}?$select=${SELECT}`);
  if (r.status === 404) throw erro("arquivo não encontrado", 404);
  if (!r.ok) throw new Error(`Graph HTTP ${r.status} ao ler metadados`);
  return r.json();
}

/** Abre o conteúdo como STREAM: a Vercel corta resposta bufferizada acima de ~4,5 MB. */
async function abrirConteudo(urlItem) {
  const r = await graph(`${urlItem}/content`);
  if (!r.ok || !r.body) throw new Error(`Graph HTTP ${r.status} ao baixar conteúdo`);
  return r.body;
}

export async function listarDocumentos({ fonte, opNumero, caminho }) {
  if (fonte === "procedimentos") {
    const docs = await prisma.documentoQualidade.findMany({
      where: { categoria: "SISTEMA", ativo: true, sharepointItemId: { not: null } },
      select: { id: true, nome: true, numeroDocumento: true, arquivoTamanho: true },
      orderBy: { numeroDocumento: "asc" },
    });
    return {
      itens: docs.map((d) => {
        // `nome` guarda "PO-06 Titulo - R1": o traço longo separa o código do título na lista do app.
        const titulo = d.numeroDocumento && d.nome.startsWith(d.numeroDocumento) ? d.nome.slice(d.numeroDocumento.length).trim() : d.nome;
        return { id: d.id, nome: d.numeroDocumento ? `${d.numeroDocumento} — ${titulo}` : titulo, tipo: "arquivo", tamanho: d.arquivoTamanho ?? null, caminho: "" };
      }),
    };
  }
  const rel = caminhoRelativoSeguro(caminho);
  const { driveId, raiz } = await raizDaFonte(fonte, opNumero);
  const filhos = await filhosDaPasta(driveId, juntar(raiz, rel));
  return {
    itens: filhos.map((x) => ({
      nome: x.name, tipo: x.folder ? "pasta" : "arquivo", tamanho: x.size ?? 0,
      caminho: rel ? `${rel}/${x.name}` : x.name, id: x.id,
    })),
  };
}

function tipoPorNome(nome) {
  return TIPOS[String(nome).split(".").pop().toLowerCase()] || "application/octet-stream";
}

function conferirItem(item) {
  if (item.folder) throw erro("caminho é uma pasta", 400);
  if ((item.size ?? 0) > TETO_BYTES) throw erro("arquivo grande demais (acima de 30 MB)", 413);
  return { nome: item.name, tamanho: item.size ?? 0, contentType: tipoPorNome(item.name) };
}

async function baixarProcedimento(id) {
  const doc = id ? await prisma.documentoQualidade.findFirst({ where: { id, categoria: "SISTEMA", ativo: true } }) : null;
  if (!doc?.sharepointItemId) throw erro("procedimento não encontrado", 404);
  const driveId = await resolveServidorDriveId();
  if (!driveId) throw new Error("Drive SERVIDOR não resolvido");
  const urlItem = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(doc.sharepointItemId)}`;
  const item = conferirItem(await metadadosDoItem(urlItem));
  return { stream: await abrirConteudo(urlItem), nome: doc.arquivoNome || item.nome, tamanho: item.tamanho, contentType: item.contentType };
}

/** @returns {Promise<{stream: ReadableStream, nome: string, tamanho: number, contentType: string}>} */
export async function baixarDocumento({ fonte, opNumero, caminho, id }) {
  if (fonte === "procedimentos") return baixarProcedimento(id);
  const rel = caminhoRelativoSeguro(caminho);
  if (!rel) throw erro("caminho inválido", 400);
  const { driveId, raiz } = await raizDaFonte(fonte, opNumero);
  const urlItem = `${GRAPH}/drives/${encodeURIComponent(driveId)}/root:${codificar(juntar(raiz, rel))}:`;
  // O 413 sai dos metadados, ANTES de abrir o conteúdo: o teto vale sem trazer o arquivo.
  const item = conferirItem(await metadadosDoItem(urlItem));
  return { stream: await abrirConteudo(urlItem), nome: item.nome, tamanho: item.tamanho, contentType: item.contentType };
}
