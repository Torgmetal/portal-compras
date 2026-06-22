// GET /api/diretoria/dre/lancamentos?linha=KEY&meses=N — lançamentos que compõem
// o REALIZADO de uma linha do DRE no período (drill-down pra auditar o que foi
// lançado). Usa a mesma regra de mapeamento (prefixo→linha) do DRE. requireDiretoria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { DRE_ANO, PREFIXOS_MAPEADOS, fonteDaLinha, prefixoCategoria, ehParcelamento, ehComissao } from "@/lib/dre-alvo";

export const runtime = "nodejs";
export const maxDuration = 30;
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const LIMITE = 400;

export async function GET(req) {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const sp = new URL(req.url).searchParams;
  const linha = sp.get("linha") || "";
  const nowIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [yy, mm] = nowIso.split("-").map(Number);
  const mesesDefault = yy > DRE_ANO ? 12 : yy < DRE_ANO ? 1 : mm;
  let meses = parseInt(sp.get("meses"), 10);
  if (!Number.isFinite(meses)) meses = mesesDefault;
  meses = Math.min(12, Math.max(1, meses));
  const ini = new Date(Date.UTC(DRE_ANO, 0, 1));
  const fim = new Date(Date.UTC(DRE_ANO, meses, 1));

  const fonte = fonteDaLinha(linha);
  if (fonte.tipo === "computed") {
    return NextResponse.json({ computed: true, itens: [], total: 0, qtd: 0, nota: "Linha calculada (subtotal) — não tem lançamentos próprios." });
  }

  if (fonte.tipo === "receber") {
    const rows = await prisma.contaReceber.findMany({
      where: { dataEmissao: { gte: ini, lt: fim }, status: { not: "CANCELADO" } },
      select: { id: true, clienteNome: true, valor: true, numeroDocFiscal: true, numeroDocumento: true, dataEmissao: true, categoriaNome: true },
      orderBy: { valor: "desc" },
    });
    const itens = rows.map((c) => ({ id: c.id, nome: c.clienteNome || "—", valor: r2(c.valor), doc: c.numeroDocFiscal || c.numeroDocumento || "", data: c.dataEmissao, categoria: c.categoriaNome || "" }));
    return NextResponse.json({ nota: fonte.nota || null, total: r2(itens.reduce((s, i) => s + i.valor, 0)), qtd: itens.length, itens: itens.slice(0, LIMITE) });
  }

  // pagar — mesma base do DRE (competência: emitida no período, exceto cancelado)
  const pg = await prisma.contaPagar.findMany({
    where: { dataEmissao: { gte: ini, lt: fim }, status: { not: "CANCELADO" } },
    select: { id: true, fornecedorNome: true, valor: true, numeroDocFiscal: true, numeroDocumento: true, dataEmissao: true, categoriaNome: true, tipoDocumento: true },
  });
  const itens = [];
  for (const c of pg) {
    const nome = (c.categoriaNome || "").trim();
    let match;
    if (fonte.comissao && ehComissao(nome)) match = true;
    else if (ehComissao(nome)) match = false; // comissão só na linha de Gastos Variáveis
    else if (fonte.naoMapeado) {
      const pre = prefixoCategoria(nome);
      if (!nome || !pre) match = true;
      else if (pre === "2") match = false; // impostos s/ venda absorvidos na dedução %
      else match = !PREFIXOS_MAPEADOS.has(pre);
    } else {
      const pre = prefixoCategoria(nome);
      if (fonte.incluirParcelamento && pre === "2" && ehParcelamento(nome)) match = true;
      else if (!nome || !pre) match = false;
      else if (pre === "2") match = fonte.excluirParcelamento ? !ehParcelamento(nome) : false;
      else match = (fonte.prefixos || []).includes(pre);
    }
    if (match) itens.push({ id: c.id, nome: c.fornecedorNome || "—", valor: r2(c.valor), doc: c.numeroDocFiscal || c.numeroDocumento || "", data: c.dataEmissao, categoria: nome || (c.tipoDocumento ? `(${c.tipoDocumento})` : "(sem categoria)") });
  }
  itens.sort((a, b) => b.valor - a.valor);
  return NextResponse.json({ nota: fonte.nota || null, total: r2(itens.reduce((s, i) => s + i.valor, 0)), qtd: itens.length, itens: itens.slice(0, LIMITE) });
}
