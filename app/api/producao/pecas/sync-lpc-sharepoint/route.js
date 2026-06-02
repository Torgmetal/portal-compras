// POST /api/producao/pecas/sync-lpc-sharepoint
// Varre as pastas das OPs no SharePoint, acha os arquivos *-LPC_*.xlsx,
// pega a revisão mais recente por obra, baixa, parseia e importa (conjunto→marca).
//
// Query params:
//   ?dryRun=1   → só LISTA os LPC que importaria (não grava). Padrão = 1 (seguro).
//   ?importar=1 → executa a importação de fato.
//   ?op=OP-078  → restringe a uma OP específica (mais rápido).
//
// Config (.env):
//   SHAREPOINT_SERVIDOR_DRIVE_ID  (drive da biblioteca SERVIDOR; cai p/ SHAREPOINT_DRIVE_ID)
//   SHAREPOINT_OP_BASE_FOLDER     (padrão: "/Ordem de Servico/01. OP")

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken, listAllFilesRecursive, downloadFileById } from "@/lib/sharepoint";
import { parseLPC } from "@/lib/parse-lpc";
import { importarLpcParsed } from "@/lib/importar-lpc-core";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

// Resolve o drive da biblioteca SERVIDOR. Ordem:
//   1. SHAREPOINT_SERVIDOR_DRIVE_ID (se setado)
//   2. resolve pelo nome "SERVIDOR" nos drives do site (SHAREPOINT_SITE_ID)
//   3. fallback SHAREPOINT_DRIVE_ID
async function resolveServidorDriveId() {
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
        const servidor = (data.value || []).find(d => (d.name || "").toUpperCase() === "SERVIDOR");
        if (servidor) return servidor.id;
      }
    } catch { /* cai pro fallback */ }
  }
  return process.env.SHAREPOINT_DRIVE_ID || null;
}

// Extrai obra (T<num><letra>) e revisão (R<num>) do nome: "T78A-LPC_R01.xlsx" → { obra:"T78A", rev:1 }
function parseNomeLpc(nome) {
  const mObra = nome.match(/(T\d+[A-Z]?)\b/i);
  if (!mObra) return null;
  const mRev = nome.match(/[_-]R(\d+)/i);
  return { obra: mObra[1].toUpperCase(), rev: mRev ? parseInt(mRev[1], 10) : 0 };
}

// GET = sempre dry-run (somente leitura — fácil de abrir no navegador).
export async function GET(req) {
  return handle(req, { permitirImport: false });
}

// POST = pode importar quando ?importar=1.
export async function POST(req) {
  return handle(req, { permitirImport: true });
}

async function handle(req, { permitirImport }) {
  // Auth: sessão (ADMIN/PRODUCAO) OU Bearer MES_SYNC_API_KEY (automação/testes)
  const auth = req.headers.get("authorization") || "";
  const bearerOk = process.env.MES_SYNC_API_KEY && auth.startsWith("Bearer ") && auth.slice(7) === process.env.MES_SYNC_API_KEY;
  let user;
  if (bearerOk) {
    user = { id: null };
  } else {
    try {
      user = await requireRole(["ADMIN", "PRODUCAO"]);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
    }
  }

  const { searchParams } = new URL(req.url);
  const importar  = permitirImport && searchParams.get("importar") === "1";
  const dryRun    = !importar; // padrão seguro: só lista
  const opFiltro  = (searchParams.get("op") || "").trim();
  const obraFiltro = (searchParams.get("obra") || "").trim().toUpperCase(); // importar só esta obra

  const driveId = await resolveServidorDriveId();
  if (!driveId) {
    return NextResponse.json({ error: "Não foi possível resolver o drive SERVIDOR (verifique SHAREPOINT_SITE_ID/credenciais Azure)" }, { status: 503 });
  }
  const baseFolder = process.env.SHAREPOINT_OP_BASE_FOLDER || "/Ordem de Servico/01. OP";
  const folder = opFiltro ? `${baseFolder}/${opFiltro}` : baseFolder;

  // 1. Varre recursivamente buscando arquivos xlsx
  let arquivos;
  try {
    arquivos = await listAllFilesRecursive(driveId, folder, { maxDepth: 8, supportedTypes: ["xlsx"] });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao varrer SharePoint (${folder}): ${e.message}` }, { status: 502 });
  }

  // 2. Filtra LPC na pasta canônica "Lista de Liberação" e agrupa por obra (revisão mais alta)
  // (ignora cópias em outras pastas como "2.5.5 Cliente/Fabricação/Listas")
  const porObra = new Map(); // obra → { file, rev }
  for (const f of arquivos) {
    if (!/LPC/i.test(f.name)) continue;
    if (!/Lista de Libera/i.test(f.folderPath || "")) continue; // só a pasta canônica
    const info = parseNomeLpc(f.name);
    if (!info) continue;
    const atual = porObra.get(info.obra);
    if (!atual || info.rev > atual.rev) porObra.set(info.obra, { file: f, rev: info.rev });
  }

  let lista = [...porObra.entries()].map(([obra, { file, rev }]) => ({
    obra, rev, nome: file.name, pasta: file.folderPath, id: file.id,
    modificado: file.lastModified, tamanhoKb: Math.round((file.size || 0) / 1024),
  })).sort((a, b) => a.obra.localeCompare(b.obra, undefined, { numeric: true }));

  // Filtro opcional por obra (ex: importar só T78A por vez — evita timeout)
  if (obraFiltro) lista = lista.filter(x => x.obra === obraFiltro);

  // 3. Dry-run: só retorna a lista do que seria importado
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      pastaVarrida: folder,
      totalXlsx: arquivos.length,
      lpcEncontrados: lista.length,
      arquivos: lista,
      aviso: "Modo dry-run (não gravou nada). Para importar de fato, chame com ?importar=1",
    });
  }

  // 4. Importa cada LPC (respeitando orçamento de tempo do Vercel)
  const budget = Date.now() + 50_000;
  const resultados = [];
  let importados = 0, pulados = 0;

  for (const item of lista) {
    if (Date.now() > budget) {
      pulados = lista.length - importados;
      break;
    }
    try {
      const { buffer } = await downloadFileById(driveId, item.id);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const parsed = parseLPC(rows);
      if (parsed.erro) { resultados.push({ obra: item.obra, nome: item.nome, erro: parsed.erro }); continue; }
      const res = await importarLpcParsed(parsed, { sobrescrever: true, userId: user.id });
      resultados.push({ obra: item.obra, nome: item.nome, ...res });
      importados++;
    } catch (e) {
      resultados.push({ obra: item.obra, nome: item.nome, erro: e.message });
    }
  }

  return NextResponse.json({
    dryRun: false,
    pastaVarrida: folder,
    lpcEncontrados: lista.length,
    importados,
    pulados,
    resultados,
  });
}
