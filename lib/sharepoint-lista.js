// Salva a lista importada (LE/LPC) no servidor (SharePoint, drive SERVIDOR),
// dentro da pasta da OP selecionada, na pasta padrão de cada tipo. Os subcaminhos
// vêm da estrutura padrão (OP-000 - PADRÃO) definida pelo Vitor:
//   LE  → 2. Engenharia/2.6 Lista de Expedição
//   LPC → 2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.1 Lista de Liberação
// Escreve no drive SERVIDOR (resolveServidorDriveId), NÃO no SHAREPOINT_DRIVE_ID
// padrão — por isso as chamadas Graph são parametrizadas pelo driveId aqui.
import { getAccessToken } from "@/lib/sharepoint";
import { listarPastasOp } from "@/lib/sharepoint-lpc";

const GRAPH = "https://graph.microsoft.com/v1.0";

const SUBPASTA = {
  LE: "2. Engenharia/2.6 Lista de Expedição",
  LPC: "2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.1 Lista de Liberação",
};

// Garante que a pasta (e seus pais) existam no drive dado. Cria segmento a
// segmento a partir do primeiro que faltar. `folderPath` começa com "/".
async function ensureFolderDrive(driveId, folderPath) {
  const token = await getAccessToken();
  const clean = "/" + folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const jaExiste = await fetch(`${GRAPH}/drives/${driveId}/root:${encodeURI(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (jaExiste.ok) return;

  const partes = clean.replace(/^\//, "").split("/");
  let atual = "";
  for (const p of partes) {
    const parent = atual;
    atual = atual ? `${atual}/${p}` : p;
    const check = await fetch(`${GRAPH}/drives/${driveId}/root:/${encodeURI(atual)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (check.ok) continue;
    const childrenUrl = parent
      ? `${GRAPH}/drives/${driveId}/root:/${encodeURI(parent)}:/children`
      : `${GRAPH}/drives/${driveId}/root/children`;
    const res = await fetch(childrenUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: p, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!res.ok && res.status !== 409) throw new Error(`Falha ao criar a pasta "${p}" no servidor (${res.status}).`);
  }
}

/**
 * @param {{ tipo:"LE"|"LPC", opNumero:string, fileNome:string, buffer:Buffer }} p
 * @returns {Promise<{ webUrl:string, nome:string, pastaOp:string, caminho:string }>}
 */
export async function salvarListaNoServidor({ tipo, opNumero, fileNome, buffer }) {
  const sub = SUBPASTA[tipo];
  if (!sub) throw new Error("Tipo de lista inválido (use LE ou LPC).");
  if (!opNumero) throw new Error("OP não informada — selecione a OP pra direcionar o arquivo.");

  // Resolve a pasta REAL da OP no SERVIDOR (ex.: "OP-084 - Obra X") pelo número.
  const { driveId, base, ops } = await listarPastasOp();
  if (!driveId) throw new Error("Drive SERVIDOR não resolvido.");
  const alvo = String(opNumero).replace(/\D/g, "").replace(/^0+/, "");
  const pastaOp = ops.find((o) => (o.opNumero || "").replace(/^0+/, "") === alvo);
  if (!pastaOp) throw new Error(`Não achei a pasta da OP ${opNumero} no servidor (SERVIDOR/01. OP). Confira se a pasta da OP existe.`);

  const folderPath = `${base.replace(/\/+$/, "")}/${pastaOp.pasta}/${sub}`;
  await ensureFolderDrive(driveId, folderPath);

  const safeName = String(fileNome || "lista.xlsx").replace(/[\\/:*?"<>|]/g, "-");
  const rel = "/" + `${folderPath}/${safeName}`.replace(/^\/+/, "");
  const token = await getAccessToken();
  const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(rel)}:/content?@microsoft.graph.conflictBehavior=rename`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Falha ao salvar no SharePoint (${res.status}).`);
  const data = await res.json();
  return { webUrl: data.webUrl, nome: data.name, pastaOp: pastaOp.pasta, caminho: folderPath };
}
