import "server-only";
import { PDFDocument } from "pdf-lib";
import { prisma } from "./prisma";
import { getAccessToken, acharPastaOp, uploadFileToFolder } from "./sharepoint";
import { rastreioDoConjunto } from "./rastreio-peca";
import { carimbarDesenho, folhaRastreabilidade } from "./carimbo-desenho";
import { dataHoraBR } from "./data-br";
import { consumivelDoConjunto, entradasConsumivelSolda } from "./consumivel-solda";

// EMISSÃO EM LOTE dos desenhos, já carimbados. Vitor (19/08): "para podermos imprimir em lote os
// projetos e sair com o carimbo da liberação".
//
// Cada página sai com o carimbo DA SUA marca (R, corrida, certificado, quem emitiu, data/hora) —
// é o mesmo `carimbarDesenho` da emissão avulsa, então o papel do lote e o papel individual são
// idênticos.
//
// ⚠ AGRUPA POR FORMATO. Desenho da Torg vem em A1/A2/A3/A4 e cada um vai numa bandeja diferente;
// um PDF só, misturado, é impossível de imprimir direito. Sai um arquivo por formato.
//
// A busca dos PDFs é UMA listagem recursiva da pasta de Fabricação — não uma busca por marca.
// Com 30 marcas seriam 30 idas ao SharePoint; assim é uma só.

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_MARCAS = 80; // teto por lote: acima disso a função estoura o tempo do serverless

// nome do arquivo casa a marca EXATA (T89A1 não pode pegar T89A10)
function casaMarca(nome, marca) {
  const up = String(nome).toUpperCase();
  const m = String(marca).toUpperCase();
  if (!up.startsWith(m)) return false;
  return /^(\.PDF|[ ._\-])/.test(up.slice(m.length));
}

// Lista TODOS os PDFs de 2.5.2 Fabricação (uma vez), com o formato pela pasta-mãe.
async function listarDesenhosDaOp(opNumero) {
  const base = await acharPastaOp(opNumero);
  if (!base) throw new Error("Pasta da OP não encontrada no SharePoint.");
  const raiz = `${base}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;

  const out = [];
  async function andar(caminho, pastaMae) {
    if (/obsolet/i.test(pastaMae || "")) return;
    const res = await fetch(`${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$select=id,name,folder,file&$top=999`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { value = [] } = await res.json();
    for (const it of value) {
      if (it.folder) await andar(`${caminho}/${it.name}`, it.name);
      else if (it.file && /\.pdf$/i.test(it.name) && !/obsolet/i.test(it.name)) {
        const formato = /^A[1-4]$/i.test(pastaMae || "") ? pastaMae.toUpperCase() : (/croqui/i.test(it.name) ? "A4" : "A4");
        // guarda a PASTA do desenho: é onde o carimbado vai ser salvo, ao lado do original
        out.push({ id: it.id, nome: it.name, formato, pasta: caminho });
      }
    }
  }
  await andar(raiz, "");
  return out;
}

/**
 * @param {object} p { opNumero, marcas[], setor, user, acao: "EMITIR"|"IMPRIMIR" }
 * @returns {Promise<{ arquivos: [{formato, itemId, nome, paginas, marcas[]}], semDesenho: [], erros: [] }>}
 */
export async function emitirLoteDesenhos({ opNumero, marcas, setor = null, user = null, acao = "EMITIR" }) {
  const num = String(opNumero).replace(/\D/g, "").padStart(3, "0");
  const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true, numero: true } });
  if (!op) throw new Error("OP não encontrada.");
  const lista = [...new Set((marcas || []).map((m) => String(m).trim()).filter(Boolean))];
  if (!lista.length) throw new Error("Nenhuma marca selecionada.");
  if (lista.length > MAX_MARCAS) throw new Error(`Lote máximo de ${MAX_MARCAS} marcas por vez (selecionadas: ${lista.length}). Divida em blocos.`);

  const todos = await listarDesenhosDaOp(num);
  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const quando = new Date();

  // marca → o desenho dela (o mais “novo” por nome, que é como a Engenharia versiona: _R01, _R02)
  const entradasCons = await entradasConsumivelSolda().catch(() => []);
  const escolhido = new Map();
  for (const m of lista) {
    const cands = todos.filter((x) => casaMarca(x.nome, m)).sort((a, b) => b.nome.localeCompare(a.nome, "pt-BR", { numeric: true }));
    if (cands.length) escolhido.set(m, cands[0]);
  }
  const semDesenho = lista.filter((m) => !escolhido.has(m));

  // carimba cada uma e agrupa por formato
  const porFormato = new Map(); // formato → { pdf: PDFDocument, marcas: [] }
  const erros = [];
  for (const [marca, arq] of escolhido) {
    try {
      let itens = [];
      try { itens = await rastreioDoConjunto(op.numero, op.id, marca); } catch {}
      const consumivel = await consumivelDoConjunto({ opId: op.id, marca, entradas: entradasCons }).catch(() => null);
      const res = await fetch(`${GRAPH}/drives/${driveId}/items/${arq.id}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const carimbado = await carimbarDesenho(new Uint8Array(await res.arrayBuffer()), {
        opNumero: op.numero, marca, setor, formato: arq.formato, arquivo: arq.nome,
        usuario: user?.name || "—", quando, itens, consumivel,
      });
      const grupo = porFormato.get(arq.formato) || { pdf: await PDFDocument.create(), marcas: [] };
      const src = await PDFDocument.load(carimbado, { ignoreEncryption: true });
      const paginas = await grupo.pdf.copyPages(src, src.getPageIndices());
      for (const pg of paginas) grupo.pdf.addPage(pg);
      grupo.marcas.push(marca);
      porFormato.set(arq.formato, grupo);

      // ⚠ A folha anexa do conjunto é A4 e vai pro GRUPO A4 — nunca junto do A1. Misturar formato
      // no mesmo PDF é o que torna o lote inimprimível (cada tamanho vai numa bandeja).
      const anexo = await folhaRastreabilidade({
        opNumero: op.numero, marca, setor, arquivo: arq.nome,
        usuario: user?.name || "—", quando, itens, consumivel,
      });
      if (anexo) {
        const gA4 = porFormato.get("A4") || { pdf: await PDFDocument.create(), marcas: [] };
        const srcA = await PDFDocument.load(anexo);
        for (const pg of await gA4.pdf.copyPages(srcA, srcA.getPageIndices())) gA4.pdf.addPage(pg);
        if (arq.formato !== "A4") gA4.anexos = (gA4.anexos || 0) + 1;
        porFormato.set("A4", gA4);
      }
    } catch (e) {
      erros.push({ marca, erro: e?.message || "falhou" });
    }
  }

  // ⚠ Cada lote vai pra PASTA DOS DESENHOS daquele formato (croqui, conjunto A1…), junto dos
  // originais e dos DWGs — nada é apagado, só entra o carimbado ao lado. (Vitor 19/08.)
  const baseOp = await acharPastaOp(num);
  const carimboNome = dataHoraBR(quando).replace(/\/\d{4}/, "").replace(/[/:]/g, "-");
  const arquivos = [];
  for (const [formato, grupo] of porFormato) {
    // pasta = a do primeiro desenho do grupo (mesmo formato = mesma pasta na estrutura da Torg)
    const pasta = (grupo.marcas.length ? escolhido.get(grupo.marcas[0])?.pasta : null)
      || (escolhido.get([...escolhido.keys()][0])?.pasta)
      || `${baseOp || `/Ordem de Servico/01. OP/OP-${num}`}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
    grupo.pdf.setTitle(grupo.marcas.length
      ? `Lote ${formato} — OP-${op.numero} (${grupo.marcas.length} desenhos)`
      : `Anexos de rastreabilidade — OP-${op.numero}`);
    const bytes = await grupo.pdf.save();
    const up = await uploadFileToFolder({
      folderPath: pasta,
      // um lote de A1 gera um A4 que só tem anexo de conjunto — o nome diz isso, senão parece
      // um lote de desenhos vazio
      fileName: grupo.marcas.length
        ? `LOTE ${formato} - OP-${op.numero} - ${carimboNome} (${grupo.marcas.length} pc${grupo.anexos ? ` + ${grupo.anexos} anexo${grupo.anexos > 1 ? "s" : ""}` : ""}).pdf`
        : `ANEXOS RASTREABILIDADE A4 - OP-${op.numero} - ${carimboNome} (${grupo.anexos || 0} conjunto${grupo.anexos === 1 ? "" : "s"}).pdf`,
      buffer: Buffer.from(bytes), contentType: "application/pdf",
    });
    arquivos.push({ formato, itemId: up.id, nome: up.name, url: up.webUrl, paginas: grupo.pdf.getPageCount(), marcas: grupo.marcas });
  }

  // GRD por marca — só quando é IMPRESSÃO (mesma regra da emissão avulsa)
  let grds = 0;
  if (acao === "IMPRIMIR") {
    for (const arqLote of arquivos) {
      for (const marca of arqLote.marcas) {
        const arq = escolhido.get(marca);
        const jaTem = await prisma.grdLiberacao.findFirst({
          where: { opNumero: num, marca, arquivo: arq.nome, setor: setor || null },
          orderBy: { createdAt: "desc" }, select: { id: true, impressoes: true },
        });
        if (jaTem) {
          await prisma.grdLiberacao.update({ where: { id: jaTem.id }, data: { impressoes: { increment: 1 }, ultimaImpressaoEm: quando, impressoItemId: arqLote.itemId, impressoUrl: arqLote.url } });
        } else {
          await prisma.grdLiberacao.create({
            data: {
              opId: op.id, opNumero: num, marca, arquivo: arq.nome, formato: arq.formato, setor: setor || null,
              itemId: arq.id, impressoItemId: arqLote.itemId, impressoUrl: arqLote.url,
              impressoes: 1, ultimaImpressaoEm: quando,
              liberadoPorId: user?.id || null, liberadoPorNome: user?.name || null,
            },
          });
        }
        grds++;
      }
    }
  }

  return { op: { numero: op.numero }, arquivos, semDesenho, erros, grds, emitidas: escolhido.size };
}
