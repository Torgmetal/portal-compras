// GET /api/diretoria/dre/lancamentos?linha=KEY&meses=N&de=YYYY-MM-DD&ate=YYYY-MM-DD
// Lançamentos que compõem o REALIZADO de uma linha do DRE (drill-down pra auditar).
// Mesma regra de mapeamento (prefixo→linha) do DRE. Retorna a quebra por mês
// (porMes) pra achar onde está mais crítico + a lista filtrada por de/até.
// requireDiretoria.
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
  const fim = new Date(Date.UTC(DRE_ANO, meses, 1)); // janela do DRE (acumulado)

  // Filtro de data opcional (de/até, YYYY-MM-DD) — recorte fino dentro da janela
  const reData = /^\d{4}-\d{2}-\d{2}$/;
  const de = reData.test(sp.get("de") || "") ? new Date(sp.get("de") + "T00:00:00.000Z") : null;
  const ate = reData.test(sp.get("ate") || "") ? new Date(sp.get("ate") + "T00:00:00.000Z") : null;
  const dentroFiltro = (d) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    if (de && t < de.getTime()) return false;
    if (ate && t > ate.getTime() + 86400000 - 1) return false; // inclui o dia inteiro do "até"
    return true;
  };

  const fonte = fonteDaLinha(linha);
  if (fonte.tipo === "computed") {
    return NextResponse.json({ computed: true, itens: [], total: 0, qtd: 0, porMes: [], nota: "Linha calculada (subtotal) — não tem lançamentos próprios." });
  }

  let matched = [];
  if (fonte.tipo === "receber") {
    const rows = await prisma.contaReceber.findMany({
      where: { dataEmissao: { gte: ini, lt: fim }, status: { not: "CANCELADO" } },
      select: { id: true, clienteNome: true, valor: true, numeroDocFiscal: true, numeroDocumento: true, dataEmissao: true, categoriaNome: true },
    });
    matched = rows.map((c) => ({ id: c.id, nome: c.clienteNome || "—", valor: c.valor || 0, doc: c.numeroDocFiscal || c.numeroDocumento || "", data: c.dataEmissao, categoria: c.categoriaNome || "" }));
  } else {
    const pg = await prisma.contaPagar.findMany({
      where: { dataEmissao: { gte: ini, lt: fim }, status: { not: "CANCELADO" } },
      select: { id: true, fornecedorNome: true, valor: true, numeroDocFiscal: true, numeroDocumento: true, dataEmissao: true, categoriaNome: true, tipoDocumento: true },
    });
    for (const c of pg) {
      const nome = (c.categoriaNome || "").trim();
      let m;
      if (fonte.comissao && ehComissao(nome)) m = true;
      else if (ehComissao(nome)) m = false;
      else if (fonte.naoMapeado) {
        const pre = prefixoCategoria(nome);
        if (!nome || !pre) m = true;
        else if (pre === "2") m = false;
        else m = !PREFIXOS_MAPEADOS.has(pre);
      } else {
        const pre = prefixoCategoria(nome);
        if (fonte.incluirParcelamento && pre === "2" && ehParcelamento(nome)) m = true;
        else if (!nome || !pre) m = false;
        else if (pre === "2") m = fonte.excluirParcelamento ? !ehParcelamento(nome) : false;
        else m = (fonte.prefixos || []).includes(pre);
      }
      if (m) matched.push({ id: c.id, nome: c.fornecedorNome || "—", valor: c.valor || 0, doc: c.numeroDocFiscal || c.numeroDocumento || "", data: c.dataEmissao, categoria: nome || (c.tipoDocumento ? `(${c.tipoDocumento})` : "(sem categoria)") });
    }
  }

  // Quebra por mês (sobre a janela inteira) — pra achar o mês mais crítico
  const porMesMap = new Map();
  for (const it of matched) {
    const k = it.data ? new Date(it.data).toISOString().slice(0, 7) : "—";
    const e = porMesMap.get(k) || { valor: 0, qtd: 0 };
    e.valor += it.valor; e.qtd++; porMesMap.set(k, e);
  }
  const porMes = [...porMesMap.entries()].map(([mes, e]) => ({ mes, valor: r2(e.valor), qtd: e.qtd })).sort((a, b) => a.mes.localeCompare(b.mes));

  // Lista (aplica filtro de/até)
  const filtrados = (de || ate) ? matched.filter((it) => dentroFiltro(it.data)) : matched;
  filtrados.sort((a, b) => b.valor - a.valor);
  const itens = filtrados.slice(0, LIMITE).map((it) => ({ ...it, valor: r2(it.valor) }));

  return NextResponse.json({
    nota: fonte.nota || null,
    total: r2(filtrados.reduce((s, it) => s + it.valor, 0)),
    qtd: filtrados.length,
    totalJanela: r2(matched.reduce((s, it) => s + it.valor, 0)),
    porMes, itens,
  });
}
