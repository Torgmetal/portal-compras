import "server-only";
import { PDFDocument } from "pdf-lib";
import { prisma } from "./prisma";
import { getAccessToken, acharPastaOp, uploadFileToFolder } from "./sharepoint";
import { rastreioDoConjunto } from "./rastreio-peca";
import { carimbarDesenho } from "./carimbo-desenho";
import { dataHoraBR } from "./data-br";
import { consumivelDoConjunto, entradasConsumivelSolda } from "./consumivel-solda";
import { casaMarca } from "./pasta-engenharia";
import { amarracoesDaOp, amarracaoDoPerfil, aplicarAmarracaoNosItens } from "./r-amarrado";
import { novaEntradaGrd } from "./grd-registro";
import { analisarMaterial } from "./material-liberacao";
import { nomeDePasta } from "./pastas-liberacao";

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

  // ── perfil de cada marca e o R amarrado ────────────────────────────────────────────────────
  // ⚠ O PERFIL É O "TIPO DE MATERIAL" DA PASTA. Vitor (26/08/2026): "além de separar por forma de
  // impressora também separe por tipo de material nas pastas". Impressora resolve a bandeja;
  // material resolve a bancada — quem corta pega um maço por material, não um maço por formato.
  const pecasDaOp = await prisma.pecaConjunto.findMany({
    where: { opId: op.id, marca: { in: lista } },
    select: { marca: true, perfil: true },
  });
  const perfilDaMarca = new Map();
  for (const pc of pecasDaOp) {
    const k = String(pc.marca || "").trim();
    if (k && pc.perfil && !perfilDaMarca.has(k)) perfilDaMarca.set(k, String(pc.perfil).trim());
  }
  const amarradas = await amarracoesDaOp(op.numero).catch(() => new Map());

  // ⚠⚠ MESMA REGRA DO AVULSO: sem material conferido e R definido, o desenho não é liberado.
  // Vitor (26/08/2026). No lote isso não pode ABORTAR tudo — 200 desenhos parados porque três
  // perfis não chegaram seria pior que o problema. As peças sem material ficam de FORA do lote e
  // voltam nomeadas, para o PCP saber exatamente quais e por quê.
  const semMaterial = [];
  if (acao === "IMPRIMIR") {
    try {
      const alvo = pecasDaOp.filter((x) => x.perfil && escolhido.has(String(x.marca || "").trim()));
      const comId = await prisma.pecaConjunto.findMany({
        where: { opId: op.id, marca: { in: alvo.map((x) => x.marca) }, tipoPeca: { not: "CONJUNTO" } },
        select: { id: true, marca: true, perfil: true },
      });
      if (comId.length) {
        const { porPeca } = await analisarMaterial(op.numero, comId);
        for (const pc of comId) {
          const v = porPeca.get(pc.id);
          const ok = v && (v.estado === "NA_OP" || (v.estado === "ESTOQUE" && v.rInformado));
          if (ok) continue;
          const m = String(pc.marca).trim();
          if (!escolhido.has(m)) continue;
          escolhido.delete(m);
          semMaterial.push({ marca: m, perfil: pc.perfil,
            motivo: !v ? "material não medido"
              : v.estado === "ESTOQUE" ? "de estoque, sem o R informado"
              : v.faltaRotulo || "sem entrada no CMR desta obra" });
        }
      }
    } catch {}
  }

  // ⚠ ORDEM NUMÉRICA, do menor para o maior. Vitor (26/08/2026): "precisamos que o agrupamento do
  // pdf seja em ordem numerica do menor para o maior". `localeCompare` cru põe 105A-P10 antes de
  // 105A-P9; com `numeric: true` a sequência sai como a pessoa conta — e é assim que o maço é
  // conferido folha a folha na bancada.
  const emOrdem = [...escolhido.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true, sensitivity: "base" }));

  // carimba cada uma e agrupa por formato + material
  const porGrupo = new Map(); // "A1|CH6.3X142" → { formato, material, pdf, marcas: [] }
  const erros = [];
  for (const [marca, arq] of emOrdem) {
    try {
      let itens = [];
      try { itens = await rastreioDoConjunto(op.numero, op.id, marca); } catch {}
      // ⚠⚠ O R AMARRADO ENTRA NO CARIMBO. `rastreioDoConjunto` só dá R a peça JÁ CORTADA, e o
      // desenho é impresso ANTES de cortar — então o papel saía sem R justamente no momento em que
      // ele é necessário. Vitor (25/08/2026): "imprime os desenhos para o setor já marca o R".
      // ⚠ POR ITEM, pelo perfil DE CADA CROQUI. Ver aplicarAmarracaoNosItens: fazer uma vez pelo
      // perfil do conjunto deixava sem R justamente as posições cujo R alguém já tinha definido.
      itens = aplicarAmarracaoNosItens(itens, amarradas);
      if (!itens.length) {
        const perfilM = perfilDaMarca.get(marca);
        const am = perfilM ? amarracaoDoPerfil(amarradas, perfilM) : null;
        if (am) itens = [{ marca, perfil: perfilM, situacao: "R_INDICADO",
                          usadas: [{ rastreio: am.r, indicado: true, por: am.por || null }] }];
      }
      const consumivel = await consumivelDoConjunto({ opId: op.id, marca, quando, entradas: entradasCons }).catch(() => null);
      const res = await fetch(`${GRAPH}/drives/${driveId}/items/${arq.id}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const carimbado = await carimbarDesenho(new Uint8Array(await res.arrayBuffer()), {
        opNumero: op.numero, marca, setor, formato: arq.formato, arquivo: arq.nome,
        usuario: user?.name || "—", quando, itens, consumivel,
      });
      const material = nomeDePasta(perfilDaMarca.get(marca) || "SEM PERFIL");
      const chave = `${arq.formato}|${material}`;
      const grupo = porGrupo.get(chave) || { formato: arq.formato, material, pdf: await PDFDocument.create(), marcas: [], itens: new Map() };
      const src = await PDFDocument.load(carimbado, { ignoreEncryption: true });
      const paginas = await grupo.pdf.copyPages(src, src.getPageIndices());
      for (const pg of paginas) grupo.pdf.addPage(pg);
      grupo.marcas.push(marca);
      // ⚠ guarda o rastreio POR MARCA: é ele que a GRD grava como prova do que foi para o chão
      grupo.itens.set(marca, itens);
      porGrupo.set(chave, grupo);

    } catch (e) {
      erros.push({ marca, erro: e?.message || "falhou" });
    }
  }

  // ⚠ Cada lote vai pra PASTA DOS DESENHOS daquele formato (croqui, conjunto A1…), junto dos
  // originais e dos DWGs — nada é apagado, só entra o carimbado ao lado. (Vitor 19/08.)
  const baseOp = await acharPastaOp(num);
  const carimboNome = dataHoraBR(quando).replace(/\/\d{4}/, "").replace(/[/:]/g, "-");
  const arquivos = [];
  // ⚠ o maço sai na mesma ordem em que foi montado: formato, e dentro dele o material
  const grupos = [...porGrupo.values()].sort((a, b) =>
    a.formato.localeCompare(b.formato) || a.material.localeCompare(b.material, "pt-BR", { numeric: true }));
  for (const grupo of grupos) {
    const { formato, material } = grupo;
    // pasta = a do primeiro desenho do grupo (mesmo formato = mesma pasta na estrutura da Torg),
    // e DENTRO dela uma pasta por material
    const base = escolhido.get(grupo.marcas[0])?.pasta
      || `${baseOp || `/Ordem de Servico/01. OP/OP-${num}`}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
    const pasta = `${base}/${material}`;
    grupo.pdf.setTitle(`Lote ${formato} · ${material} — OP-${op.numero} (${grupo.marcas.length} desenhos)`);
    const bytes = await grupo.pdf.save();
    const up = await uploadFileToFolder({
      folderPath: pasta,
      fileName: `LOTE ${formato} - ${material} - OP-${op.numero} - ${carimboNome} (${grupo.marcas.length} pc).pdf`,
      buffer: Buffer.from(bytes), contentType: "application/pdf",
    });
    arquivos.push({ formato, material, itemId: up.id, nome: up.name, url: up.webUrl, paginas: grupo.pdf.getPageCount(), marcas: grupo.marcas, itens: grupo.itens });
  }

  // GRD por marca — só quando é IMPRESSÃO (mesma regra da emissão avulsa)
  let grds = 0;
  if (acao === "IMPRIMIR") {
    for (const arqLote of arquivos) {
      for (const marca of arqLote.marcas) {
        const arq = escolhido.get(marca);
        const jaTem = await prisma.grdLiberacao.findFirst({
          where: { opNumero: num, marca, arquivo: arq.nome, setor: setor || null },
          orderBy: { createdAt: "desc" }, select: { id: true, impressoes: true, historico: true },
        });
        // ⚠⚠ O R VAI PARA A GRD. Vitor (26/08/2026): "na GRD não esta indo o R tbm". A linha era
        // criada SEM o campo `rastreio` — o R era carimbado no papel e não ficava gravado, então a
        // GRD, que existe justamente para provar o que desceu, saía dizendo "sem R no papel".
        const rastreio = arqLote.itens?.get(marca) || [];
        const entrada = { anterior: jaTem?.historico || [], quando, usuario: user?.name || null, itemId: arqLote.itemId, itens: rastreio };
        if (jaTem) {
          await prisma.grdLiberacao.update({ where: { id: jaTem.id }, data: { impressoes: { increment: 1 }, ultimaImpressaoEm: quando, impressoItemId: arqLote.itemId, impressoUrl: arqLote.url, historico: novaEntradaGrd(entrada), ...(rastreio.length ? { rastreio } : {}) } });
        } else {
          await prisma.grdLiberacao.create({
            data: {
              opId: op.id, opNumero: num, marca, arquivo: arq.nome, formato: arq.formato, setor: setor || null,
              itemId: arq.id, impressoItemId: arqLote.itemId, impressoUrl: arqLote.url,
              impressoes: 1, ultimaImpressaoEm: quando, rastreio,
              historico: novaEntradaGrd({ ...entrada, anterior: [] }),
              liberadoPorId: user?.id || null, liberadoPorNome: user?.name || null,
            },
          });
        }
        grds++;
      }
    }
  }

  return { op: { numero: op.numero }, arquivos, semDesenho, semMaterial, erros, grds, emitidas: escolhido.size };
}
