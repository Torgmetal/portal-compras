// Helpers para localizar e baixar os LPC das pastas das OPs no SharePoint.
// Reaproveita os helpers de lib/sharepoint.js. A convenção (proven em produção):
//   /Ordem de Servico/01. OP/{OP}/.../Lista de Liberação/{T..}-LPC_R0X.xlsx
import { getAccessToken, listAllFilesRecursive, downloadFileById } from "@/lib/sharepoint";
import * as XLSX from "xlsx";

// Resolve o drive da biblioteca SERVIDOR (env → resolve por nome → fallback).
export async function resolveServidorDriveId() {
  if (process.env.SHAREPOINT_SERVIDOR_DRIVE_ID) return process.env.SHAREPOINT_SERVIDOR_DRIVE_ID;
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (siteId) {
    try {
      const token = await getAccessToken();
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const servidor = (data.value || []).find((d) => (d.name || "").toUpperCase() === "SERVIDOR");
        if (servidor) return servidor.id;
      }
    } catch { /* fallback abaixo */ }
  }
  return process.env.SHAREPOINT_DRIVE_ID || null;
}

// "T78A-LPC_R01.xlsx" → { obra:"T78A", rev:1 }
export function parseNomeLpc(nome) {
  const mObra = nome.match(/(T\d+[A-Z]?)\b/i);
  if (!mObra) return null;
  const mRev = nome.match(/[_-]R(\d+)/i);
  return { obra: mObra[1].toUpperCase(), rev: mRev ? parseInt(mRev[1], 10) : 0 };
}

/**
 * Varre as pastas das OPs e devolve, por obra, o LPC de revisão MAIS ALTA.
 * @param {object} opts { opFiltro? (subpasta), obraFiltro? (T..), todasPastas? }
 * @returns { driveId, pastaVarrida, totalXlsx, lista: [{obra, rev, nome, pasta, id, modificado, tamanhoKb}] }
 */
export async function scanLpcPorObra({ opFiltro = "", obraFiltro = "", todasPastas = false } = {}) {
  const driveId = await resolveServidorDriveId();
  if (!driveId) {
    const err = new Error("Drive SERVIDOR não resolvido (verifique SHAREPOINT_SITE_ID / credenciais Azure).");
    err.status = 503;
    throw err;
  }
  const baseFolder = process.env.SHAREPOINT_OP_BASE_FOLDER || "/Ordem de Servico/01. OP";
  const folder = opFiltro ? `${baseFolder}/${opFiltro}` : baseFolder;

  let arquivos;
  try {
    arquivos = await listAllFilesRecursive(driveId, folder, { maxDepth: 8, supportedTypes: ["xlsx"] });
  } catch (e) {
    const err = new Error(`Falha ao varrer o SharePoint (${folder}): ${e.message}`);
    err.status = 502;
    throw err;
  }

  // Agrupa por obra, mantendo a revisão mais alta. Por padrão exige a pasta
  // canônica "Lista de Liberação"; se nada for achado lá, repete sem o filtro.
  const coletar = (exigirCanonica) => {
    const porObra = new Map();
    for (const f of arquivos) {
      if (!/LPC/i.test(f.name)) continue;
      if (exigirCanonica && !/Lista de Libera/i.test(f.folderPath || "")) continue;
      const info = parseNomeLpc(f.name);
      if (!info) continue;
      const atual = porObra.get(info.obra);
      if (!atual || info.rev > atual.rev) porObra.set(info.obra, { file: f, rev: info.rev });
    }
    return porObra;
  };

  let porObra = coletar(!todasPastas);
  if (porObra.size === 0 && !todasPastas) porObra = coletar(false); // resiliência

  let lista = [...porObra.entries()].map(([obra, { file, rev }]) => ({
    obra, rev, nome: file.name, pasta: file.folderPath, id: file.id,
    modificado: file.lastModified, tamanhoKb: Math.round((file.size || 0) / 1024),
  })).sort((a, b) => a.obra.localeCompare(b.obra, undefined, { numeric: true }));

  if (obraFiltro) lista = lista.filter((x) => x.obra === obraFiltro.toUpperCase());

  return { driveId, pastaVarrida: folder, totalXlsx: arquivos.length, lista };
}

// Baixa um LPC pelo id e devolve as linhas (aoa) prontas para o parseLPC.
export async function baixarLpcRows(driveId, itemId) {
  const { buffer } = await downloadFileById(driveId, itemId);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}
