// GET /api/comercial/orcamento-servico/[id]/proposta
// Gera a proposta (.docx) no padrão PTC da Torg, preenchendo uma cópia do
// template (lib/proposta-template-b64) com os dados do orçamento. Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { TEMPLATE_B64 } from "@/lib/proposta-template-b64";

export const runtime = "nodejs";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtBRL = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKg = (v) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });

  // ── Corte / furação (por ora o único serviço com composição) ──
  const comp = (o.composicao && o.composicao.CORTE_FURACAO) || {};
  const linhas = Array.isArray(comp.linhas) ? comp.linhas : [];
  const peso = linhas.reduce((a, l) => a + num(l.pesoKgM) * num(l.comprimento) * num(l.qtdBarras), 0);
  const tempoMin = linhas.reduce((a, l) => a + num(l.tempoMinBarra) * num(l.qtdBarras), 0);
  const barras = linhas.reduce((a, l) => a + num(l.qtdBarras), 0);
  const metodo = comp.metodoPreco === "KG" ? "KG" : "HORA";
  const custoCorte = metodo === "KG" ? peso * num(comp.precoKg) : (tempoMin / 60) * num(comp.valorHora);
  const rkg = peso > 0 ? custoCorte / peso : 0; // proposta sempre por kg (modalidade do template)

  const now = new Date();
  const dataProposta = `${String(now.getDate()).padStart(2, "0")} de ${MESES[now.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${now.getFullYear()}`;
  const numeroPtc = `PTC-${String(o.numero || 0).padStart(3, "0")}-26`;

  const data = {
    numeroPtc,
    dataProposta,
    cliente: o.cliente || "",
    endereco: o.endereco || "",
    cidadeUf: "",
    contato: o.contato || "",
    email: o.email || "",
    telefone: o.telefone || "",
    obra: o.obra || "",
    obraCidadeUf: "",
    // descrição do corte
    corte_material: comp.material || "A definir",
    corte_espessura: comp.espessura || "A definir",
    corte_qtd: barras ? `${barras} barras (${fmtKg(peso)} kg)` : "A definir",
    corte_modalidade: "por kg",
    // linha da tabela de preços
    corte_unid: "kg",
    corte_qtd_tab: fmtKg(peso),
    corte_vu: fmtBRL(rkg),
    corte_vt: fmtBRL(custoCorte),
    valorTotal: fmtBRL(custoCorte),
  };

  let out;
  try {
    const zip = new PizZip(Buffer.from(TEMPLATE_B64, "base64"));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
    doc.render(data);
    out = doc.getZip().generate({ type: "nodebuffer" });
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao gerar o documento: " + (e?.message || "erro") }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "GERAR_PROPOSTA_SERVICO", entity: "OrcamentoServico", entityId: o.id, diff: { numeroPtc } },
  }).catch(() => {});

  return new Response(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${numeroPtc}.docx"`,
    },
  });
}
