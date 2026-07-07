// GET /api/comercial/orcamento-servico/[id]/proposta
// Gera a proposta (.docx) no padrão PTC da Torg, preenchendo uma cópia do
// template (lib/proposta-template-b64) com os dados do orçamento: só entram os
// serviços selecionados (blocos condicionais), os nomes dos arquivos anexados,
// a descrição do corte com perfis, o CQ por serviço e os dias de pagamento.
// Só ADMIN/COMERCIAL.
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
const LABEL = { CORTE_FURACAO: "Corte a laser", SOLDA: "Solda", JATEAMENTO: "Jateamento", PINTURA: "Pintura" };
const ESCOPO = { CORTE_FURACAO: "corte a laser, furação e recorte de vigas", SOLDA: "solda de componentes", JATEAMENTO: "jateamento de peças", PINTURA: "pintura industrial de peças" };

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });

  const servs = Array.isArray(o.servicos) ? o.servicos : [];
  const has = (k) => servs.includes(k);

  // ── Corte / furação (único serviço com composição por ora) ──
  const comp = (o.composicao && o.composicao.CORTE_FURACAO) || {};
  const linhas = Array.isArray(comp.linhas) ? comp.linhas : [];
  const peso = linhas.reduce((a, l) => a + num(l.pesoKgM) * num(l.comprimento) * num(l.qtdBarras), 0);
  const barras = linhas.reduce((a, l) => a + num(l.qtdBarras), 0);
  const tempoMin = linhas.reduce((a, l) => a + num(l.tempoMinBarra) * num(l.qtdBarras), 0);
  const metodo = comp.metodoPreco === "KG" ? "KG" : "HORA";
  const custoCorte = metodo === "KG" ? peso * num(comp.precoKg) : (tempoMin / 60) * num(comp.valorHora);
  const rkg = peso > 0 ? custoCorte / peso : 0;
  const perfisTxt = linhas.filter((l) => l.perfil).map((l) => `${l.perfil} (${num(l.qtdBarras)})`).join(", ");

  // ── Tabela de preços: só os serviços oferecidos ──
  const valores = { CORTE_FURACAO: custoCorte };
  const linhasTab = servs.map((s, i) => {
    const isCorte = s === "CORTE_FURACAO";
    return {
      item: String(i + 1).padStart(2, "0"),
      nome: LABEL[s] || s,
      unid: "kg",
      qtd: isCorte ? fmtKg(peso) : "",
      vu: isCorte && rkg ? fmtBRL(rkg) : "",
      vt: valores[s] ? fmtBRL(valores[s]) : "a definir",
    };
  });
  const valorTotal = servs.reduce((a, s) => a + num(valores[s]), 0);

  const escopo = servs.map((s) => ESCOPO[s]).filter(Boolean).join(", ") || "serviços conforme descrito";
  const cq = has("SOLDA")
    ? "São efetuados em nossa linha de produção inspeção dimensional e visual de soldagem."
    : "São efetuados em nossa linha de produção inspeção dimensional.";
  const docs = (Array.isArray(o.arquivos) ? o.arquivos : []).map((a) => ({ doc: a.nome || a.url || "" })).filter((x) => x.doc);

  const now = new Date();
  const dataProposta = `${String(now.getDate()).padStart(2, "0")} de ${MESES[now.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${now.getFullYear()}`;
  const numeroPtc = `PTC-${String(o.numero || 0).padStart(3, "0")}-26`;

  const data = {
    numeroPtc, dataProposta,
    cliente: o.cliente || "", endereco: o.endereco || "", cidadeUf: "",
    contato: o.contato || "", email: o.email || "", telefone: o.telefone || "",
    obra: o.obra || "", obraCidadeUf: "",
    escopo,
    docs,
    s_corte: has("CORTE_FURACAO"), s_solda: has("SOLDA"), s_jato: has("JATEAMENTO"), s_pintura: has("PINTURA"),
    corte_material: comp.material || "A definir",
    corte_espessura: comp.espessura || "A definir",
    corte_qtd: barras ? `${barras} barras${perfisTxt ? " — " + perfisTxt : ""} — ${fmtKg(peso)} kg` : "A definir",
    corte_modalidade: "por kg",
    cq,
    dias: String(o.diasPagamento || 15),
    servicos: linhasTab,
    valorTotal: fmtBRL(valorTotal),
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
