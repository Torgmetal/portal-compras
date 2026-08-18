// Desenhos (projetos) da peça no SharePoint da Engenharia + controle de liberação (GRD).
// GET  ?opNumero=&marca= — busca os PDFs da marca em {OP}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação
//        (conjunto em .../2.5.2.3 Conjunto/{frente}/{A1..A4}/{marca}.pdf → formato = pasta-mãe;
//         croqui em .../2.5.2.2 Croqui/{frente}/{marca} - CROQUI.pdf → A4) + as liberações GRD já
//        registradas da marca. Ignora OBSOLETOS.
// POST — registra a liberação/impressão (GRD): quem, quando, arquivo, formato, setor.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getAccessToken, acharPastaOp } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];
const GRAPH = "https://graph.microsoft.com/v1.0";

// nome do arquivo casa a marca EXATA (evita T89A1 pegar T89A10): "T89A1.pdf", "T89A1 - CROQUI.pdf",
// "T89A1_R01.pdf", "T89A1-R2.pdf" casam; "T89A10.pdf" não.
function casaMarca(nome, marca) {
  const up = String(nome).toUpperCase();
  const m = String(marca).toUpperCase();
  if (!up.startsWith(m)) return false;
  const resto = up.slice(m.length);
  return /^(\.PDF|[ ._\-])/.test(resto);
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const opNumero = sp.get("opNumero");
  const marca = (sp.get("marca") || "").trim();
  if (!opNumero || !marca) return NextResponse.json({ error: "Informe opNumero e marca." }, { status: 400 });

  // Liberações GRD já registradas (independem do SharePoint responder).
  const liberacoes = await prisma.grdLiberacao.findMany({
    where: { opNumero: String(opNumero).replace(/\D/g, "").padStart(3, "0"), marca },
    orderBy: { createdAt: "desc" },
    select: { arquivo: true, formato: true, setor: true, liberadoPorNome: true, createdAt: true },
  });

  let arquivos = [];
  let erroSp = null;
  try {
    const base = await acharPastaOp(opNumero);
    if (!base) throw new Error("Pasta da OP não encontrada no SharePoint.");
    const fab = `${base}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
    const token = await getAccessToken();
    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(fab)}:/search(q='${encodeURIComponent(marca)}')?$select=id,name,size,file,parentReference&$top=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`SharePoint HTTP ${res.status}`);
    const data = await res.json();
    const pdfs = (data.value || []).filter((x) => x.file && /\.pdf$/i.test(x.name) && casaMarca(x.name, marca) && !/obsolet/i.test(x.name));

    // formato = nome da pasta-mãe (A1..A4); croqui identifica pelo nome. Resolve o pai por id
    // (o search não devolve o path) e descarta o que estiver em OBSOLETOS.
    arquivos = (await Promise.all(pdfs.map(async (x) => {
      let pastaMae = "";
      try {
        const rp = await fetch(`${GRAPH}/drives/${driveId}/items/${x.parentReference?.id}?$select=name`, { headers: { Authorization: `Bearer ${token}` } });
        if (rp.ok) pastaMae = (await rp.json()).name || "";
      } catch {}
      if (/obsolet/i.test(pastaMae)) return null;
      const formato = /^A[1-4]$/i.test(pastaMae) ? pastaMae.toUpperCase() : (/croqui/i.test(x.name) ? "A4 (croqui)" : null);
      return { itemId: x.id, nome: x.name, formato, sizeKb: Math.round((x.size || 0) / 1024) };
    }))).filter(Boolean).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  } catch (e) {
    erroSp = e?.message || "Falha ao consultar o SharePoint.";
  }

  return NextResponse.json({ arquivos, liberacoes, erroSp });
}

const schema = z.object({
  opNumero: z.string().min(1),
  opId: z.string().nullable().optional(),
  marca: z.string().min(1),
  arquivo: z.string().min(1),
  formato: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  setor: z.string().nullable().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const reg = await prisma.grdLiberacao.create({
    data: {
      opId: body.opId || null,
      opNumero: String(body.opNumero).replace(/\D/g, "").padStart(3, "0"),
      marca: body.marca.trim(),
      arquivo: body.arquivo.trim(),
      formato: body.formato || null,
      setor: body.setor || null,
      itemId: body.itemId || null,
      liberadoPorId: user.id,
      liberadoPorNome: user.name || null,
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "GRD_LIBERAR_DESENHO", entity: "GrdLiberacao", entityId: reg.id, diff: { op: reg.opNumero, marca: reg.marca, arquivo: reg.arquivo, formato: reg.formato, setor: reg.setor } } }).catch(() => {});
  return NextResponse.json({ ok: true, liberacao: { arquivo: reg.arquivo, formato: reg.formato, setor: reg.setor, liberadoPorNome: reg.liberadoPorNome, createdAt: reg.createdAt } });
}
