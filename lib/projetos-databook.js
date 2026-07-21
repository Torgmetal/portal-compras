import "server-only";
import { getAccessToken, listChildrenByPath } from "./sharepoint";

// Desenhos as-built da OP no SERVIDOR, pra §02 do Data Book. Estrutura confirmada:
//   /Ordem de Servico/01. OP/OP-0XX - .../2. Engenharia/2.5 Projetos/
//       2.5.4 Montagem/            → PDFs de montagem (diretos)
//       2.5.2 Fabricação/Conjunto/ → PDFs por conjunto (em subpastas A + REVISÃO ...)
// Traz Montagem + Conjunto. NÃO traz Croqui (individuais demais — já estão na
// tabela LPC da §02). Pega a revisão mais recente e ignora OBSOLETOS. (Vitor, 07/2026)

const OP_BASE = process.env.SHAREPOINT_OP_BASE_FOLDER || "/Ordem de Servico/01. OP";

// Resolve o drive da biblioteca SERVIDOR (env → nome no site → fallback). Igual ao
// sync-lpc-sharepoint. Exportado pra o merge do PDF baixar do drive certo.
export async function resolveServidorDriveId() {
  if (process.env.SHAREPOINT_SERVIDOR_DRIVE_ID) return process.env.SHAREPOINT_SERVIDOR_DRIVE_ID;
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (siteId) {
    try {
      const token = await getAccessToken();
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        const s = (d.value || []).find((x) => (x.name || "").toUpperCase() === "SERVIDOR");
        if (s) return s.id;
      }
    } catch { /* fallback */ }
  }
  return process.env.SHAREPOINT_DRIVE_ID || null;
}

const fold = (kids, rx) => (kids || []).filter((c) => c.folder).find((c) => rx.test(c.name || ""));
const ehPdf = (c) => c.file && /\.pdf$/i.test(c.name || "");

// PDFs de uma pasta: os diretos + os das subpastas (exceto OBSOLETO), deduplicando
// por nome-base e PREFERINDO a subpasta de "revisão" (versão as-built mais nova).
async function coletarPdfs(driveId, path) {
  const kids = await listChildrenByPath(driveId, path).catch(() => []);
  const itens = kids.filter(ehPdf).map((f) => ({ f, rev: false }));
  for (const s of kids.filter((c) => c.folder && !/obsolet/i.test(c.name || ""))) {
    const sk = await listChildrenByPath(driveId, `${path}/${s.name}`).catch(() => []);
    const rev = /revis/i.test(s.name || "");
    for (const f of sk.filter(ehPdf)) itens.push({ f, rev });
  }
  const porBase = new Map();
  for (const it of itens) {
    const base = it.f.name.replace(/\.pdf$/i, "").trim().toUpperCase();
    const prev = porBase.get(base);
    if (!prev || (it.rev && !prev.rev)) porBase.set(base, it);
  }
  return [...porBase.values()].map((it) => it.f);
}

export async function buscarDesenhosOP(opNumero) {
  const driveId = await resolveServidorDriveId();
  if (!driveId) return { desenhos: [], driveId: null, erro: "Drive SERVIDOR não resolvido (SHAREPOINT_SITE_ID/credenciais)." };
  const num = parseInt(String(opNumero).match(/\d+/)?.[0] || "", 10);
  if (!num) return { desenhos: [], driveId, erro: "OP inválida." };

  const root = await listChildrenByPath(driveId, OP_BASE).catch(() => []);
  const opF = root.filter((c) => c.folder).find((c) => new RegExp(`^OP\\s*-?\\s*0*${num}(?!\\d)`, "i").test(c.name || ""));
  if (!opF) return { desenhos: [], driveId, erro: `Pasta da OP-${String(opNumero).padStart(3, "0")} não encontrada em ${OP_BASE}.` };

  const opP = `${OP_BASE}/${opF.name}`;
  const eng = fold(await listChildrenByPath(driveId, opP).catch(() => []), /engenharia/i);
  if (!eng) return { desenhos: [], driveId, opFolder: opF.name, erro: "Pasta 'Engenharia' não encontrada na OP." };
  const projKids = await listChildrenByPath(driveId, `${opP}/${eng.name}`).catch(() => []);
  const proj = projKids.filter((c) => c.folder).find((c) => /projetos/i.test(c.name || "") && !/or[çc]ad/i.test(c.name || ""));
  if (!proj) return { desenhos: [], driveId, opFolder: opF.name, erro: "Pasta 'Projetos' não encontrada na Engenharia." };
  const projP = `${opP}/${eng.name}/${proj.name}`;
  const areas = await listChildrenByPath(driveId, projP).catch(() => []);

  const out = [];
  const mont = fold(areas, /montagem/i);
  if (mont) for (const f of await coletarPdfs(driveId, `${projP}/${mont.name}`)) out.push({ f, area: "Montagem" });
  const fab = fold(areas, /fabrica/i);
  if (fab) {
    const conj = fold(await listChildrenByPath(driveId, `${projP}/${fab.name}`).catch(() => []), /conjunto/i);
    if (conj) for (const f of await coletarPdfs(driveId, `${projP}/${fab.name}/${conj.name}`)) out.push({ f, area: "Conjunto" });
  }

  const desenhos = out.map(({ f, area }) => ({ id: f.id, name: f.name, url: f.webUrl || null, mime: f.file?.mimeType || null, area }));
  return { desenhos, driveId, opFolder: opF.name };
}
