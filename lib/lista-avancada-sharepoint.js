import "server-only";
import crypto from "node:crypto";
import { getAccessToken } from "@/lib/sharepoint";
import { prismaDirect } from "@/lib/prisma";
import { parseListaAvancada, frenteDoNome, revisaoDoNome } from "@/lib/parse-lista-avancada";

// Importa a "Lista Avançada Expedição" do SharePoint para a tabela ListaExpedicao.
// A lista fica em {OP}/2. Engenharia/2.6 Lista de expedição (local atual, 22/07);
// {OP}/4. Expedição (+4.1) segue como fallback pras OPs antigas — ver
// arquivosListaDaOP. OPs ficam em "01. OP" e as concluídas em "01. OP/Finalizadas".
const DRIVE = process.env.SHAREPOINT_DRIVE_ID;
const BASE = "/Ordem de Servico/01. OP";
const GRAPH = "https://graph.microsoft.com/v1.0";
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

async function listChildren(token, path) {
  const url = `${GRAPH}/drives/${DRIVE}/root:/${enc(path)}:/children?$select=name,id,file,folder,size,lastModifiedDateTime&$top=200`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  return (await r.json()).value || [];
}
async function downloadById(token, id) {
  const r = await fetch(`${GRAPH}/drives/${DRIVE}/items/${id}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Falha ao baixar arquivo (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// PADRÃO (Vitor 22/07): só a lista "LE" — "T67-LE-R00.xlsx" / "T64A-LE_R00.xls",
// formato FORM21. A antiga "Lista Avançada Expedição" é IGNORADA de propósito.
// Aceita .xls porque boa parte da 2.6 está no formato antigo do Excel.
const ehListaArquivo = (name) =>
  /\.(xls|xlsx|xlsm)$/i.test(name) &&
  /[-_\s]le[-_\s]*r?\d/i.test(name) &&
  !/obsolet|matheus|c[óo]pia|backup|antig/i.test(name); // ignora versões de trabalho/obsoletas
const opNum = (nome) => { const m = String(nome).match(/op-?\s*0*(\d+)/i); return m ? (m[1].replace(/^0+/, "") || "0") : null; };
const ehPastaOP = (nome) => /^op-?\s*\d/i.test(String(nome).trim());

// "assinatura" da lista a partir do nome: tira boilerplate/data/revisão. Mantém o
// que distingue listas diferentes (T86 RJ vs T86 SP, 001 vs 002).
function assinaturaLista(nome) {
  let s = String(nome).replace(/\.(xls|xlsx|xlsm)$/i, ""); // .xls entrou com as listas LE
  s = s.replace(/lista\s*avan[çc]ada\s*expedi[çc][ãa]o/ig, " ");
  s = s.replace(/lista\s*de\s*expedi[çc][ãa]o/ig, " ");
  s = s.replace(/\d{1,2}[ ._-]\d{1,2}[ ._-]20\d{2}/g, " ");       // datas
  s = s.replace(/\bR(?:ev)?\.?\s*\d{1,3}\b/ig, " ");             // revisão
  s = s.replace(/_+/g, " ").replace(/\s+/g, " ").trim().replace(/[-\s]+$/, "").trim();
  return s || "lista";
}
// chave única por OP+lista (evita colisão de "001" entre OPs e colapso indevido)
function chaveFrente(nome, opNumero) {
  let a = assinaturaLista(nome);
  if (!/(\bT\d|\bOP-?\d|\bLE\b)/i.test(a)) a = `OP-${String(opNumero).replace(/^0+/, "")} ${a}`.trim();
  return a.toUpperCase();
}

// resolve a pasta da OP (em 01. OP ou em 01. OP/Finalizadas)
async function acharPastaOP(token, opNumero) {
  const num = String(opNumero).replace(/\D/g, "").replace(/^0+/, "");
  const top = await listChildren(token, BASE);
  const direta = top.find((k) => k.folder && opNum(k.name) === num);
  if (direta) return { path: `${BASE}/${direta.name}`, folder: direta.name, finalizada: false };
  const fin = top.find((k) => k.folder && /finalizad/i.test(k.name));
  if (fin) {
    const fk = await listChildren(token, `${BASE}/${fin.name}`);
    const g = fk.find((k) => k.folder && opNum(k.name) === num);
    if (g) return { path: `${BASE}/${fin.name}/${g.name}`, folder: g.name, finalizada: true };
  }
  return null;
}

// Lista os arquivos de Lista em uma OP (4. Expedição + 4.1 Lista de Avançada)
const achaPasta = (kids, rx) => (kids || []).filter((k) => k.folder).find((k) => rx.test(k.name || ""));

/**
 * Onde mora a Lista de Expedição da OP.
 * ATUAL (Vitor 22/07): `2. Engenharia / 2.6 Lista de expedição` — navega por
 * nome (regex) porque acento/caixa/numeração variam entre as pastas.
 * LEGADO: `4. Expedição` (+ 4.1) — só entra se não achar nada no lugar novo,
 * pra não quebrar OPs antigas.
 */
async function arquivosListaDaOP(token, opPath) {
  const out = [];
  const push = (kids, dir) => { for (const k of kids || []) if (k.file && ehListaArquivo(k.name)) out.push({ ...k, dir }); };

  const raiz = await listChildren(token, opPath);
  const eng = achaPasta(raiz, /engenharia/i);
  if (eng) {
    const engPath = `${opPath}/${eng.name}`;
    const pasta = achaPasta(await listChildren(token, engPath), /2\.\s*6|lista\s*(de\s*)?expedi/i);
    if (pasta) {
      const dir = `${engPath}/${pasta.name}`;
      const kids = await listChildren(token, dir);
      push(kids, dir);
      // subpastas (revisões), ignorando OBSOLETO
      for (const s of (kids || []).filter((k) => k.folder && !/obsolet/i.test(k.name || ""))) {
        const sd = `${dir}/${s.name}`;
        push(await listChildren(token, sd), sd);
      }
    }
  }
  if (out.length) return out;

  for (const sub of ["/4. Expedição", "/4. Expedição/4.1 Lista de Avançada"]) {
    push(await listChildren(token, opPath + sub), opPath + sub);
  }
  return out;
}

/** Varre todas as OPs e lista quais têm Lista Avançada (só metadados, sem baixar). */
export async function descobrirListas() {
  const token = await getAccessToken();
  const top = await listChildren(token, BASE);
  const pastas = top.filter((k) => k.folder && ehPastaOP(k.name)).map((k) => ({ path: `${BASE}/${k.name}`, name: k.name, finalizada: false }));
  const fin = top.find((k) => k.folder && /finalizad/i.test(k.name));
  if (fin) {
    const fk = await listChildren(token, `${BASE}/${fin.name}`);
    for (const k of fk) if (k.folder && ehPastaOP(k.name)) pastas.push({ path: `${BASE}/${fin.name}/${k.name}`, name: k.name, finalizada: true });
  }
  const achados = [];
  for (const p of pastas) {
    const arqs = await arquivosListaDaOP(token, p.path);
    if (arqs.length) {
      achados.push({
        op: opNum(p.name), folder: p.name, finalizada: p.finalizada,
        arquivos: arqs.map((a) => ({ name: a.name, frente: chaveFrente(a.name, opNum(p.name)), revisao: revisaoDoNome(a.name), lastModified: a.lastModifiedDateTime, size: a.size })),
      });
    }
  }
  return achados.sort((a, b) => Number(a.op) - Number(b.op));
}

const chaveMarca = (m) => String(m?.marca || "").trim().toUpperCase();
const enxuto = (m) => ({
  marca: m.marca, qte: m.qte ?? null, pesoTotal: m.pesoTotal ?? null, descricao: m.descricao || null,
  ...(m.qteAntes !== undefined ? { qteAntes: m.qteAntes, pesoAntes: m.pesoAntes } : {}),
});

/**
 * Diff de marcas entre a revisão anterior e a nova. É o que o Planejamento
 * precisa tratar: INCLUÍDA entra num lote, EXCLUÍDA sai (pra não expedir peça
 * que não existe mais). ALTERADA = mesma marca com qtd/peso diferente.
 */
export function diffMarcas(antes, depois) {
  const A = new Map((Array.isArray(antes) ? antes : []).map((m) => [chaveMarca(m), m]));
  const D = new Map((Array.isArray(depois) ? depois : []).map((m) => [chaveMarca(m), m]));
  const incluidas = [], excluidas = [], alteradas = [];
  for (const [k, m] of D) if (k && !A.has(k)) incluidas.push(m);
  for (const [k, m] of A) if (k && !D.has(k)) excluidas.push(m);
  for (const [k, m] of D) {
    const a = A.get(k);
    if (!a) continue;
    const qA = Number(a.qte || 0), qD = Number(m.qte || 0);
    const pA = Math.round(Number(a.pesoTotal || 0)), pD = Math.round(Number(m.pesoTotal || 0));
    if (qA !== qD || pA !== pD) alteradas.push({ ...m, qteAntes: a.qte ?? null, pesoAntes: a.pesoTotal ?? null });
  }
  return { incluidas, excluidas, alteradas };
}

/** Importa (upsert) as listas de uma OP — newest por frente. */
export async function importarListasOP({ opNumero, opId = null, userId = null }) {
  const token = await getAccessToken();
  const op = await acharPastaOP(token, opNumero);
  if (!op) return { ok: false, erro: `Pasta da OP-${opNumero} não encontrada no SharePoint.` };

  const arquivos = await arquivosListaDaOP(token, op.path);
  if (!arquivos.length) return { ok: false, erro: `Nenhuma "Lista Avançada Expedição" na pasta 4. Expedição da OP-${opNumero}.` };

  // mais recente por frente (arquivo sem prefixo cai na frente OP-xx)
  const porFrente = new Map();
  for (const a of arquivos) {
    const fr = chaveFrente(a.name, opNumero);
    const cur = porFrente.get(fr);
    if (!cur || String(a.lastModifiedDateTime || "") > String(cur.lastModifiedDateTime || "")) porFrente.set(fr, a);
  }

  const resultados = [];
  for (const [fr, a] of porFrente) {
    try {
      const buf = await downloadById(token, a.id);
      const hash = crypto.createHash("sha1").update(buf).digest("hex");
      const parsed = parseListaAvancada(buf, a.name);
      if (!parsed.ok) { resultados.push({ frente: fr, ok: false, erro: parsed.erro }); continue; }
      const rev = revisaoDoNome(a.name);
      const dados = {
        opNumero: String(opNumero), opId, arquivo: a.name,
        revisao: rev ? String(rev.valor) : null, itemId: a.id,
        fileModificado: a.lastModifiedDateTime ? new Date(a.lastModifiedDateTime) : null, hash,
        marcas: parsed.totais.marcas, qtdItens: parsed.totais.qtdItens,
        pesoContratado: parsed.totais.pesoContratadoReport ?? parsed.totais.pesoTotalSomado,
        pesoExpedido: parsed.totais.pesoExpedidoReport ?? 0,
        pesoFaltante: parsed.totais.pesoFaltanteReport ?? 0,
        expedidasArquivo: parsed.totais.expedidasArquivo,
        marcasJson: parsed.marcas, importadoEm: new Date(), importadoPorId: userId,
      };
      // estado anterior ANTES do upsert — é a base do diff por revisão
      const anterior = await prismaDirect.listaExpedicao.findUnique({ where: { frente: fr }, select: { hash: true, revisao: true, marcasJson: true } });

      await prismaDirect.listaExpedicao.upsert({ where: { frente: fr }, create: { frente: fr, ...dados }, update: dados });

      // conteúdo mudou → registra o diff pro Planejamento tratar
      let mudanca = null;
      if (anterior?.hash && anterior.hash !== hash) {
        const d = diffMarcas(anterior.marcasJson, parsed.marcas);
        if (d.incluidas.length || d.excluidas.length || d.alteradas.length) {
          const reg = await prismaDirect.listaExpedicaoRevisao.create({
            data: {
              opId, opNumero: String(opNumero), frente: fr, arquivo: a.name,
              revisao: dados.revisao, revisaoAnterior: anterior.revisao || null,
              incluidas: d.incluidas.map(enxuto), excluidas: d.excluidas.map(enxuto), alteradas: d.alteradas.map(enxuto),
              nIncluidas: d.incluidas.length, nExcluidas: d.excluidas.length, nAlteradas: d.alteradas.length,
            },
          });
          mudanca = { id: reg.id, nIncluidas: d.incluidas.length, nExcluidas: d.excluidas.length, nAlteradas: d.alteradas.length };
        }
      }
      resultados.push({ frente: fr, ok: true, arquivo: a.name, revisao: dados.revisao, marcas: parsed.totais.marcas, pesoContratado: dados.pesoContratado, pesoExpedido: dados.pesoExpedido, pesoFaltante: dados.pesoFaltante, primeiraImportacao: !anterior, mudanca });
    } catch (e) {
      resultados.push({ frente: fr, ok: false, erro: e.message });
    }
  }
  return { ok: true, op: String(opNumero), folder: op.folder, finalizada: op.finalizada, resultados };
}
