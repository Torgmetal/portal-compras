// Localiza e baixa os LPC das pastas das OPs no SharePoint.
// NÃO faz crawl recursivo (a árvore de cada OP é enorme — estoura o tempo do
// Vercel). Usa a BUSCA do Graph (search), que roda no servidor em ~1s.
//   Fluxo: listar pastas de OP (nível 1) → buscar os LPC da OP escolhida.
import { getAccessToken, listFolderChildren } from "@/lib/sharepoint";
import * as XLSX from "xlsx";

const GRAPH = "https://graph.microsoft.com/v1.0";
const baseFolder = () => process.env.SHAREPOINT_OP_BASE_FOLDER || "/Ordem de Servico/01. OP";

// Resolve o drive da biblioteca SERVIDOR (env → resolve por nome → fallback).
export async function resolveServidorDriveId() {
  if (process.env.SHAREPOINT_SERVIDOR_DRIVE_ID) return process.env.SHAREPOINT_SERVIDOR_DRIVE_ID;
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (siteId) {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${GRAPH}/sites/${siteId}/drives?$select=id,name`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const servidor = (data.value || []).find((d) => (d.name || "").toUpperCase() === "SERVIDOR");
        if (servidor) return servidor.id;
      }
    } catch { /* fallback abaixo */ }
  }
  return process.env.SHAREPOINT_DRIVE_ID || null;
}

// Extrai o código da obra e a revisão do nome do arquivo LPC.
// Pega o código T... imediatamente antes do marcador "LPC" (cobre sufixos
// multi-letra: "T67AT - LPC_R00" → {obra:"T67AT", rev:0}; "T83A-LPC_R01" → {obra:"T83A", rev:1}).
export function parseNomeLpc(nome) {
  const i = nome.search(/LPC/i);
  if (i < 0) return null;
  const mObra = nome.slice(0, i).match(/(T\d+[A-Z]*)\s*[-_ .]*$/i);
  if (!mObra) return null;
  const mRev = nome.slice(i).match(/R(\d+)/i);
  return { obra: mObra[1].toUpperCase(), rev: mRev ? parseInt(mRev[1], 10) : 0 };
}

// Lista as pastas de OP no nível 1 (exclui "Finalizadas" e a OP padrão).
export async function listarPastasOp() {
  const driveId = await resolveServidorDriveId();
  if (!driveId) { const e = new Error("Drive SERVIDOR não resolvido (SHAREPOINT_SITE_ID / credenciais Azure)."); e.status = 503; throw e; }
  let itens;
  try { itens = await listFolderChildren(driveId, baseFolder()); }
  catch (e) { const err = new Error(`Falha ao listar as OPs no SharePoint: ${e.message}`); err.status = 502; throw err; }
  const ops = itens
    .filter((x) => x.folder && /^OP[-\s]?\d+/i.test(x.name) && !/padr[aã]o/i.test(x.name))
    .map((x) => {
      const m = x.name.match(/OP[-\s]?(\d+)/i);
      return { pasta: x.name, opNumero: m ? m[1] : null, modificado: x.lastModifiedDateTime || null };
    })
    .sort((a, b) => a.pasta.localeCompare(b.pasta, undefined, { numeric: true }));
  return { driveId, base: baseFolder(), ops };
}

// Busca (server-side) os LPC dentro de UMA pasta de OP e agrupa por obra,
// mantendo a revisão mais alta (empate → modificado mais recente).
export async function buscarLpcDaOp(driveId, opPasta) {
  const token = await getAccessToken();
  const path = `${baseFolder()}/${opPasta}`;
  const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(path)}:/search(q='LPC')?$top=200&$select=id,name,lastModifiedDateTime,parentReference`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err = new Error(`Falha ao buscar LPC em ${opPasta}: HTTP ${res.status} ${txt.slice(0, 140)}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const porObra = new Map(); // obra → { obra, rev, nome, id, modificado }
  for (const it of data.value || []) {
    if (!it.name || it.folder) continue;
    if (!/\.xlsx?$/i.test(it.name) || !/LPC/i.test(it.name)) continue;
    const info = parseNomeLpc(it.name);
    if (!info) continue;
    const cand = { obra: info.obra, rev: info.rev, nome: it.name, id: it.id, modificado: it.lastModifiedDateTime || null };
    const atual = porObra.get(info.obra);
    if (!atual || cand.rev > atual.rev || (cand.rev === atual.rev && (cand.modificado || "") > (atual.modificado || ""))) {
      porObra.set(info.obra, cand);
    }
  }
  return [...porObra.values()].sort((a, b) => a.obra.localeCompare(b.obra, undefined, { numeric: true }));
}

// Agrupa arquivos LPC por obra (rev mais alta; empate → modificado recente).
function agruparLpc(itens) {
  const porObra = new Map();
  for (const it of itens) {
    if (!it.name || it.folder) continue;
    if (!/\.xlsx?$/i.test(it.name) || !/LPC/i.test(it.name)) continue;
    const info = parseNomeLpc(it.name);
    if (!info) continue;
    const cand = { obra: info.obra, rev: info.rev, nome: it.name, id: it.id, modificado: it.lastModifiedDateTime || null };
    const atual = porObra.get(info.obra);
    if (!atual || cand.rev > atual.rev || (cand.rev === atual.rev && (cand.modificado || "") > (atual.modificado || ""))) {
      porObra.set(info.obra, cand);
    }
  }
  return [...porObra.values()].sort((a, b) => a.obra.localeCompare(b.obra, undefined, { numeric: true }));
}

// Navega UMA pasta: devolve as subpastas (para descer) e os LPC ali dentro
// (agrupados por obra). 1 request — usado pelo navegador de pastas.
export async function navegarPasta(driveId, pastaPath) {
  let itens;
  try { itens = await listFolderChildren(driveId, pastaPath); }
  catch (e) { const err = new Error(`Falha ao abrir a pasta: ${e.message}`); err.status = 502; throw err; }
  const pastas = itens
    .filter((x) => x.folder)
    .map((x) => ({ nome: x.name, path: `${pastaPath.replace(/\/+$/, "")}/${x.name}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true }));
  return { atual: pastaPath, pastas, lpcs: agruparLpc(itens) };
}

// Lê os LPC (por obra) de uma pasta específica salva (sem busca/crawl).
export async function lpcsDaPasta(driveId, pastaPath) {
  let itens;
  try { itens = await listFolderChildren(driveId, pastaPath); }
  catch (e) { const err = new Error(`Falha ao ler a pasta salva: ${e.message}`); err.status = 502; throw err; }
  return agruparLpc(itens);
}

// Baixa um LPC pelo id e devolve as linhas (aoa) prontas para o parseLPC.
export async function baixarLpcRows(driveId, itemId) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
  });
  if (!res.ok) throw new Error(`Falha ao baixar o LPC (HTTP ${res.status})`);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}
