import "server-only";
import crypto from "node:crypto";
import { getAccessToken } from "@/lib/sharepoint";
import { prismaDirect } from "@/lib/prisma";
import { parseListaAvancada, frenteDoNome, revisaoDoNome } from "@/lib/parse-lista-avancada";

// Importa a "Lista Avançada Expedição" do SharePoint para a tabela ListaExpedicao.
// As listas ficam em {OP}/4. Expedição (e às vezes na subpasta 4.1 Lista de
// Avançada). OPs ficam em "01. OP" e as concluídas em "01. OP/Finalizadas".
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

const ehListaArquivo = (name) =>
  /\.(xlsx|xlsm)$/i.test(name) &&
  /(lista\s*avan|lista\s*de\s*expedi|le_r\d)/i.test(name) &&
  !/obsolet|matheus|c[óo]pia|backup|antig/i.test(name); // ignora versões de trabalho/obsoletas
const opNum = (nome) => { const m = String(nome).match(/op-?\s*0*(\d+)/i); return m ? (m[1].replace(/^0+/, "") || "0") : null; };
const ehPastaOP = (nome) => /^op-?\s*\d/i.test(String(nome).trim());

// "assinatura" da lista a partir do nome: tira boilerplate/data/revisão. Mantém o
// que distingue listas diferentes (T86 RJ vs T86 SP, 001 vs 002).
function assinaturaLista(nome) {
  let s = String(nome).replace(/\.(xlsx|xlsm)$/i, "");
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
async function arquivosListaDaOP(token, opPath) {
  const out = [];
  for (const sub of ["/4. Expedição", "/4. Expedição/4.1 Lista de Avançada"]) {
    const kids = await listChildren(token, opPath + sub);
    for (const k of kids) if (k.file && ehListaArquivo(k.name)) out.push({ ...k, dir: opPath + sub });
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
      await prismaDirect.listaExpedicao.upsert({ where: { frente: fr }, create: { frente: fr, ...dados }, update: dados });
      resultados.push({ frente: fr, ok: true, arquivo: a.name, revisao: dados.revisao, marcas: parsed.totais.marcas, pesoContratado: dados.pesoContratado, pesoExpedido: dados.pesoExpedido, pesoFaltante: dados.pesoFaltante });
    } catch (e) {
      resultados.push({ frente: fr, ok: false, erro: e.message });
    }
  }
  return { ok: true, op: String(opNumero), folder: op.folder, finalizada: op.finalizada, resultados };
}
