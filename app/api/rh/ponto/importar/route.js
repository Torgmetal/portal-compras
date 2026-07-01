// POST /api/rh/ponto/importar  (multipart: file = arquivo ACJEF .txt)
// Parseia o ACJEF, casa por PIS com o cadastro e cria a PontoCompetencia + itens
// (marcações importadas + totais zerados p/ o RH preencher). Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseAcjef } from "@/lib/acjef";

export const runtime = "nodejs";
export const maxDuration = 60;

const soDig = (s) => String(s || "").replace(/\D/g, "");

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ success: false, error: "Envie o arquivo ACJEF" }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ success: false, error: "Nenhum arquivo enviado" }, { status: 400 });

  let dados;
  try {
    const texto = Buffer.from(await file.arrayBuffer()).toString("latin1");
    dados = parseAcjef(texto);
  } catch (e) {
    return NextResponse.json({ success: false, error: "ACJEF ilegível: " + (e?.message || "erro") }, { status: 422 });
  }
  if (!dados.competencia) return NextResponse.json({ success: false, error: "Não foi possível identificar a competência no arquivo" }, { status: 422 });
  if (!dados.funcionarios.length) return NextResponse.json({ success: false, error: "Nenhuma marcação encontrada no arquivo" }, { status: 422 });

  const existente = await prisma.pontoCompetencia.findUnique({ where: { competencia: dados.competencia }, select: { id: true, _count: { select: { itens: true } } } });
  if (existente && existente._count.itens > 0) {
    return NextResponse.json({ success: false, error: `Já existe ponto importado para ${dados.competencia}. Exclua-o antes de reimportar.` }, { status: 409 });
  }

  // Match por PIS (cadastro pode estar vazio → cai no mapeamento manual da tela)
  const funcs = await prisma.funcionario.findMany({ where: { pis: { not: null } }, select: { id: true, nome: true, pis: true } });
  const porPis = new Map(funcs.map((f) => [soDig(f.pis), f]));

  const ponto = await prisma.$transaction(async (tx) => {
    const pc = existente
      ? await tx.pontoCompetencia.update({ where: { id: existente.id }, data: { empresa: dados.empresa || null } })
      : await tx.pontoCompetencia.create({ data: { competencia: dados.competencia, empresa: dados.empresa || null, criadoPorId: user.id } });
    await tx.pontoItem.createMany({
      data: dados.funcionarios.map((f) => {
        const match = porPis.get(soDig(f.pis));
        return { pontoId: pc.id, pisArquivo: f.pis, funcionarioId: match?.id || null, nome: match?.nome || null, marcacoes: f.dias };
      }),
      skipDuplicates: true,
    });
    return pc;
  });

  const casados = dados.funcionarios.filter((f) => porPis.has(soDig(f.pis))).length;
  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_PONTO", entity: "PontoCompetencia", entityId: ponto.id, diff: { competencia: dados.competencia, total: dados.funcionarios.length, casados } },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: ponto.id, competencia: dados.competencia, total: dados.funcionarios.length, casados, naoCasados: dados.funcionarios.length - casados });
}
