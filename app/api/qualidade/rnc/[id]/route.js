// Detalhe / edição / exclusão de uma RNC.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id } });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });
  let plano = null;
  if (rnc.planoAcaoId) plano = await prisma.planoAcao.findUnique({ where: { id: rnc.planoAcaoId }, select: { id: true, numero: true, titulo: true, status: true, itens: true } });
  return NextResponse.json({ rnc, plano });
}

const dstr = z.string().optional().nullable();
const schema = z.object({
  tipo: z.enum(["INTERNA", "CLIENTE"]).optional(),
  data: dstr, cliente: dstr, opNumero: dstr, opId: dstr, desenhoProjetoMarca: dstr,
  origem: dstr, fornecedor: dstr, processoArea: dstr, descricao: dstr,
  fotos: z.array(z.object({ url: z.string().url(), legenda: dstr })).optional(),
  anexos: z.array(z.object({ url: z.string().url(), nome: dstr, tipo: dstr })).optional(),
  disposicao: dstr, pesoRetrabalhoKg: z.number().nullable().optional(),
  // as peças escolhidas da Lista de Expedição — [{ marca, descricao, perfil, material, pesoUnitKg, qtd, pesoKg }]
  pecas: z.array(z.object({
    marca: z.string(), descricao: z.string().nullable().optional(), perfil: z.string().nullable().optional(),
    material: z.string().nullable().optional(), pesoUnitKg: z.number().nullable().optional(),
    qtd: z.number().nullable().optional(), pesoKg: z.number().nullable().optional(),
  })).nullable().optional(),
  setorRetrabalho: z.string().nullable().optional(),
  elaborador: dstr, resultadoReinspecao: dstr, abrangencia: dstr,
  necessitaAcao: dstr, motivoNaoAcao: dstr, causas: dstr,
  cincoPorques: z.array(z.object({ porque: z.string(), resposta: dstr })).optional(),
  planoAcaoId: dstr, prazoResposta: dstr, realizadoEm: dstr, acompanhadoPor: dstr,
  acompanhamento: dstr, avaliacaoEficacia: dstr, encerradaPor: dstr,
  status: z.enum(["ABERTA", "EM_ACAO", "RESPONDIDA", "ENCERRADA"]).optional(),
  pertinente: z.boolean().optional(), recorrente: z.boolean().optional(), rncAnteriorId: dstr,
  anexoUrl: dstr, programa: dstr, jobCliente: dstr, numeroCliente: dstr,
  respostaCliente: dstr,
  evidencias: z.array(z.object({ tipo: dstr, descricao: dstr, url: dstr })).optional(),
});

const asDate = (s) => (s ? new Date(s.length <= 10 ? s + "T12:00:00Z" : s) : null);
const TXT = new Set(["cliente", "opNumero", "opId", "desenhoProjetoMarca", "origem", "fornecedor", "processoArea", "descricao", "disposicao", "elaborador", "resultadoReinspecao", "abrangencia", "necessitaAcao", "motivoNaoAcao", "causas", "planoAcaoId", "acompanhadoPor", "acompanhamento", "avaliacaoEficacia", "encerradaPor", "setorRetrabalho", "rncAnteriorId", "anexoUrl", "programa", "jobCliente", "numeroCliente", "respostaCliente"]);
const DATES = new Set(["data", "prazoResposta", "realizadoEm"]);

export async function PATCH(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.naoConformidade.findUnique({ where: { id: params.id }, select: { id: true, encerradaEm: true } });
  if (!atual) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  for (const k of Object.keys(body)) {
    if (body[k] === undefined) continue;
    if (TXT.has(k)) data[k] = (body[k]?.trim?.() ?? body[k]) || null;
    else if (DATES.has(k)) data[k] = asDate(body[k]);
    else data[k] = body[k]; // fotos, cincoPorques, evidencias, status, pertinente, recorrente
  }
  // Encerramento: ao virar ENCERRADA, carimba encerradaEm (uma vez); ao reabrir, limpa.
  if (body.status === "ENCERRADA" && !atual.encerradaEm) data.encerradaEm = new Date();
  if (body.status && body.status !== "ENCERRADA") data.encerradaEm = null;

  const rnc = await prisma.naoConformidade.update({ where: { id: atual.id }, data });

  // ⚠⚠ A RNC DE RETRABALHO VIRA APONTAMENTO — o mesmo registro que a fábrica preenche no FORM 34.
  // É de lá que o indicador soma; sem espelhar aqui, uma RNC com peças escolhidas não apareceria no
  // retrabalho do setor. O vínculo `rncId` garante que ela conte UMA vez (ver lib/retrabalho).
  try {
    const ehRetrabalho = rnc.disposicao === "RETRABALHAR";
    const pecas = Array.isArray(rnc.pecas) ? rnc.pecas : [];
    const peso = pecas.length
      ? Math.round(pecas.reduce((t, p2) => t + (Number(p2.pesoKg) || (Number(p2.qtd) || 0) * (Number(p2.pesoUnitKg) || 0)), 0) * 100) / 100
      : rnc.pesoRetrabalhoKg ?? null;
    const jaTem = await prisma.apontamentoRetrabalho.findUnique({ where: { rncId: rnc.id }, select: { id: true } });
    if (ehRetrabalho) {
      const dadosAp = {
        data: rnc.data || new Date(), desenho: rnc.desenhoProjetoMarca || null, opNumero: rnc.opNumero || null,
        categoria: "RETRABALHO", qtd: pecas.reduce((t, p2) => t + (Number(p2.qtd) || 0), 0) || null,
        pesoKg: peso, pesoEstimado: false,
        setor: rnc.setorRetrabalho || null, setorTexto: rnc.processoArea || null,
        abriuRnc: true, numeroRnc: `${rnc.numero}/${rnc.ano}`, descricao: rnc.descricao || null,
        pecas: pecas.length ? pecas : null, origem: "PORTAL",
      };
      if (jaTem) await prisma.apontamentoRetrabalho.update({ where: { id: jaTem.id }, data: dadosAp });
      else await prisma.apontamentoRetrabalho.create({ data: { ...dadosAp, rncId: rnc.id } });
    } else if (jaTem) {
      // deixou de ser retrabalho (virou refugo, concessão…): o apontamento sai do indicador
      await prisma.apontamentoRetrabalho.delete({ where: { id: jaTem.id } });
    }
  } catch (e) { console.error("[rnc] apontamento de retrabalho:", e?.message); }

  // ⚠ ARQUIVA AO ENCERRAR. O que se guarda é o documento fechado — a RNC muda enquanto está aberta
  // (disposição, 5 porquês, plano), e arquivar a cada salvamento encheria a pasta de rascunho. Se o
  // SharePoint estiver fora, o encerramento NÃO falha: fica sem `arquivadoEm` e aparece na varredura.
  if (body.status === "ENCERRADA") {
    try {
      const { gerarRncPDF } = await import("@/lib/rnc-pdf");
      const { arquivarERegistrar, pastaDe } = await import("@/lib/arquivar-form");
      const doc = await gerarRncPDF(rnc);
      const r = await arquivarERegistrar(
        { pasta: pastaDe("RNC", { opNumero: rnc.opNumero, ano: rnc.ano }), nomeArquivo: doc.filename, bytes: doc.bytes },
        (dados) => prisma.naoConformidade.update({ where: { id: rnc.id }, data: dados }),
      );
      if (!r.ok) console.error("[rnc] arquivamento:", r.erro);
    } catch (e) { console.error("[rnc] arquivamento:", e?.message); }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  // Apaga também o plano de ação 5W2H vinculado (senão fica órfão na aba Plano de Ação).
  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id }, select: { planoAcaoId: true } });
  await prisma.naoConformidade.delete({ where: { id: params.id } });
  if (rnc?.planoAcaoId) await prisma.planoAcao.delete({ where: { id: rnc.planoAcaoId } }).catch(() => {});
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_RNC", entity: "NaoConformidade", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
