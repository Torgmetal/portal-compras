// POST /api/rh/ponto/importar-pdf  (multipart: file = PDF cartão Secullum)
// Parseia o PDF Secullum, casa por CPF com o cadastro e cria/atualiza a
// PontoCompetencia + itens com os totais por faixa + espelho diário (JSON).
// Reimportar substitui os itens desta origem na mesma competência. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parsePontoSecullum } from "@/lib/ponto-secullum-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
// período "25/06/2026" (fim) → competência "2026-06"
function competenciaDoPeriodo(fim) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(fim || ""));
  return m ? `${m[3]}-${m[2]}` : null;
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ success: false, error: "Envie o PDF do cartão" }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ success: false, error: "Nenhum arquivo enviado" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let dados;
  try {
    dados = await parsePontoSecullum(buf);
  } catch (e) {
    return NextResponse.json({ success: false, error: "PDF ilegível: " + (e?.message || "erro") }, { status: 422 });
  }
  const competencia = competenciaDoPeriodo(dados.periodoFim);
  if (!competencia) return NextResponse.json({ success: false, error: "Não identifiquei o período/competência no PDF" }, { status: 422 });
  if (!dados.funcionarios.length) return NextResponse.json({ success: false, error: "Nenhum funcionário encontrado no PDF" }, { status: 422 });

  // Guarda o PDF COMPLETO no Blob (uma vez). A página de cada funcionário é
  // extraída sob demanda no /meu-rh — assim o funcionário vê/baixa o próprio
  // cartão, igual holerite, sem estourar o tempo do import (nada de 54 uploads).
  let pdfUrl = null;
  try {
    const slug = (dados.empresa || "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
    const blob = await put(`ponto-secullum/${competencia}-${slug}-${Date.now()}.pdf`, buf, { access: "public", contentType: "application/pdf" });
    pdfUrl = blob.url;
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao guardar o PDF: " + (e?.message || "erro") }, { status: 502 });
  }

  // Match por CPF → matrícula (Nº FOLHA) → PIS → nome. O modelo "Montagem
  // Externa" (Ponto Web) não traz CPF, então casamos pelos outros identificadores.
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const funcs = await prisma.funcionario.findMany({ select: { id: true, nome: true, cpf: true, pis: true, matricula: true } });
  const porCpf = new Map(), porMat = new Map(), porPis = new Map(), porNome = new Map();
  for (const f of funcs) {
    if (f.cpf) porCpf.set(soDigitos(f.cpf), f);
    if (f.matricula) porMat.set(soDigitos(f.matricula), f);
    if (f.pis) porPis.set(soDigitos(f.pis), f);
    if (f.nome) porNome.set(norm(f.nome), f);
  }
  const acharMatch = (f) =>
    (f.cpfDigitos && porCpf.get(f.cpfDigitos)) ||
    (f.folha && porMat.get(soDigitos(f.folha))) ||
    (f.pis && porPis.get(soDigitos(f.pis))) ||
    (f.nome && porNome.get(norm(f.nome))) ||
    null;

  const min2h = (m) => Math.round(((Number(m) || 0) / 60) * 100) / 100; // minutos → horas (2 casas)

  const ponto = await prisma.$transaction(async (tx) => {
    const pc = await tx.pontoCompetencia.upsert({
      where: { competencia },
      update: { empresa: dados.empresa || undefined },
      create: { competencia, empresa: dados.empresa || null, criadoPorId: user.id },
    });
    // Reimport: substitui só os itens desta MESMA empresa (TORG e VMI convivem
    // na mesma competência — não pode apagar a outra empresa ao reimportar uma).
    await tx.pontoItem.deleteMany({ where: { pontoId: pc.id, origem: "SECULLUM_PDF", empresa: dados.empresa || null } });
    await tx.pontoItem.createMany({
      data: dados.funcionarios.map((f) => {
        const match = acharMatch(f);
        const t = f.totais;
        return {
          pontoId: pc.id, origem: "SECULLUM_PDF",
          pisArquivo: f.pis || f.cpfDigitos || f.folha || null, cpfArquivo: f.cpfDigitos || null,
          empresa: dados.empresa || null,
          funcionarioId: match?.id || null, nome: match?.nome || null,
          pdfUrl, pagina: f.pagina,
          diario: { totais: t, dias: f.dias, periodoInicio: dados.periodoInicio, periodoFim: dados.periodoFim, folha: f.folha },
          horasNormais: min2h(t.normais), horasExtras50: min2h(t.ex50), horasExtras60: min2h(t.ex60),
          horasExtras80: min2h(t.ex80), horasExtras100: min2h(t.ex100), horasExtras150: min2h(t.ex150),
          faltas: min2h(t.faltas), adicionalNoturno: min2h(t.noturno), dsr: min2h(t.dsr),
        };
      }),
      skipDuplicates: true,
    });
    return pc;
  });

  const casados = dados.funcionarios.filter((f) => acharMatch(f)).length;
  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_PONTO_PDF", entity: "PontoCompetencia", entityId: ponto.id, diff: { competencia, total: dados.funcionarios.length, casados } },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: ponto.id, competencia, total: dados.funcionarios.length, casados, naoCasados: dados.funcionarios.length - casados });
}
