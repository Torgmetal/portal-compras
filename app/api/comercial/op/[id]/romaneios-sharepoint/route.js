// Romaneios (FORM 22) que existem como ARQUIVO no SharePoint da OP — inclusive os que
// NÃO foram emitidos pelo portal. Só registro/leitura: número, data e peso. (Vitor 09/08)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";
import { parseRomaneio } from "@/lib/parse-romaneio";

export const runtime = "nodejs";
export const maxDuration = 60;

const DRIVE = process.env.SHAREPOINT_DRIVE_ID;
const BASES = ["/Ordem de Servico/01. OP", "/Ordem de Servico/01. OP/Finalizadas"];
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

async function ls(token, path) {
  const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE}/root:/${enc(path)}:/children?$select=name,folder,file,size,webUrl,id&$top=200`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? (await r.json()).value || [] : [];
}
async function baixar(token, itemId) {
  const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE}/items/${itemId}/content`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO", "COMERCIAL", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const prefix = `OP-${String(op.numero).replace(/^0+/, "").padStart(3, "0")}`;

  let token;
  try { token = await getAccessToken(); }
  catch { return NextResponse.json({ romaneios: [], erro: "SharePoint indisponível" }); }

  // acha a pasta da OP (em "01. OP" ou "Finalizadas")
  let folderPath = null;
  for (const base of BASES) {
    const f = (await ls(token, base)).find((x) => x.folder && x.name.startsWith(prefix));
    if (f) { folderPath = `${base}/${f.name}`; break; }
  }
  if (!folderPath) return NextResponse.json({ romaneios: [] });

  const arqs = (await ls(token, `${folderPath}/4. Expedição/4.2 Romaneios`)).filter((f) => f.file && /\.xlsm$/i.test(f.name));
  const out = [];
  for (const a of arqs) {
    try {
      const buf = await baixar(token, a.id);
      if (!buf) continue;
      const p = parseRomaneio(buf, a.name);
      if (!p.ok) { out.push({ arquivo: a.name, webUrl: a.webUrl, erro: p.erro }); continue; }
      out.push({
        numero: p.numero, data: p.dataSaida,
        pesoKg: p.totais.pesoDeclarado || p.totais.pesoSomado || 0,
        marcas: p.totais.marcas, itens: p.totais.itens,
        arquivo: a.name, webUrl: a.webUrl,
      });
    } catch (e) { out.push({ arquivo: a.name, webUrl: a.webUrl, erro: e.message }); }
  }
  out.sort((x, y) => String(x.numero ?? x.arquivo).localeCompare(String(y.numero ?? y.arquivo), undefined, { numeric: true }));
  return NextResponse.json({ romaneios: out });
}
