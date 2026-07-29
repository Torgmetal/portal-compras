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

// Move o(s) arquivo(s) que estão HOJE na pasta da lista pra subpasta "Obsoleto"
// (histórico de revisões). Best-effort: se falhar, não bloqueia o salvamento.
async function moverAtuaisParaObsoleto(driveId, folderPath, token) {
  try {
    const clean = "/" + folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const listRes = await fetch(`${GRAPH}/drives/${driveId}/root:${encodeURI(clean)}:/children?$top=200&$select=id,name,file`, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) return;
    const data = await listRes.json();
    const arquivos = (data.value || []).filter((x) => x.file); // só arquivos (a subpasta Obsoleto fica de fora)
    if (!arquivos.length) return;

    // Garante a subpasta Obsoleto e pega o id dela.
    const obsPath = `${folderPath}/Obsoleto`;
    await ensureFolderDrive(driveId, obsPath);
    const obsClean = "/" + obsPath.replace(/^\/+/, "");
    const obsRes = await fetch(`${GRAPH}/drives/${driveId}/root:${encodeURI(obsClean)}?$select=id`, { headers: { Authorization: `Bearer ${token}` } });
    if (!obsRes.ok) return;
    const obsId = (await obsRes.json()).id;
    if (!obsId) return;

    const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"); // AAAA-MM-DD-HH-MM
    for (const a of arquivos) {
      const dot = a.name.lastIndexOf(".");
      const nome = dot > 0 ? `${a.name.slice(0, dot)} (obsoleto ${carimbo})${a.name.slice(dot)}` : `${a.name} (obsoleto ${carimbo})`;
      // PATCH parentReference = mover pra Obsoleto; renomeia com carimbo pra não colidir.
      await fetch(`${GRAPH}/drives/${driveId}/items/${a.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ parentReference: { id: obsId }, name: nome }),
      }).catch(() => {});
    }
  } catch { /* best-effort — não bloqueia o salvamento */ }
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
  const token = await getAccessToken();

  // Antes de subir a nova, joga o(s) arquivo(s) atual(is) da pasta pra "Obsoleto"
  // (histórico). Vale pra revisão nova E pra reenvio da mesma revisão — a pasta da
  // lista fica sempre só com a versão vigente.
  await moverAtuaisParaObsoleto(driveId, folderPath, token);

  const safeName = String(fileNome || "lista.xlsx").replace(/[\\/:*?"<>|]/g, "-");
  const rel = "/" + `${folderPath}/${safeName}`.replace(/^\/+/, "");
  const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(rel)}:/content?@microsoft.graph.conflictBehavior=replace`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Falha ao salvar no SharePoint (${res.status}).`);
  const data = await res.json();
  return { webUrl: data.webUrl, nome: data.name, pastaOp: pastaOp.pasta, caminho: folderPath };
}

/**
 * Salva o romaneio (FORM 22) em "4. Expedição/4.2 Romaneios" da OP. Cada R# é um
 * arquivo distinto que COEXISTE (o "expedido" da lista lê todos) — por isso, ao
 * contrário das listas, NÃO move os atuais pra Obsoleto; só substitui se regerar
 * o mesmo nome de arquivo.
 * @param {{ opNumero:string, fileNome:string, buffer:Buffer }} p
 * @returns {Promise<{ webUrl:string, nome:string, pastaOp:string, caminho:string }>}
 */
export async function salvarRomaneioNoServidor({ opNumero, fileNome, buffer }) {
  if (!opNumero) throw new Error("OP não informada.");
  const { driveId, base, ops } = await listarPastasOp();
  if (!driveId) throw new Error("Drive SERVIDOR não resolvido.");
  const alvo = String(opNumero).replace(/\D/g, "").replace(/^0+/, "");
  const pastaOp = ops.find((o) => (o.opNumero || "").replace(/^0+/, "") === alvo);
  if (!pastaOp) throw new Error(`Não achei a pasta da OP ${opNumero} no servidor (SERVIDOR/01. OP).`);

  const folderPath = `${base.replace(/\/+$/, "")}/${pastaOp.pasta}/4. Expedição/4.2 Romaneios`;
  await ensureFolderDrive(driveId, folderPath);
  const token = await getAccessToken();

  const safeName = String(fileNome || "romaneio.xlsx").replace(/[\\/:*?"<>|]/g, "-");
  const rel = "/" + `${folderPath}/${safeName}`.replace(/^\/+/, "");
  const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(rel)}:/content?@microsoft.graph.conflictBehavior=replace`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Falha ao salvar o romaneio no SharePoint (${res.status}).`);
  const data = await res.json();
  return { webUrl: data.webUrl, nome: data.name, pastaOp: pastaOp.pasta, caminho: folderPath };
}
