// GET — busca a peça pela marca dentro de uma OP. É a saída para peça SEM QR.
//
// Vitor (21/08/2026): "pode ter peça com ou sem QR". Onde tem QR o desenho identifica; onde não
// tem, a pessoa procura aqui. Os dois são caminhos normais, não exceção.
//
// ⚠ CONJUNTO PRIMEIRO. Foto de inspeção quase sempre é do conjunto montado, não do croqui que foi
// cortado — e a OP-067 tem 1.330 conjuntos contra 3.841 croquis. Misturar os dois faz o inspetor
// rolar lista atrás do que ele quer.
//
// ⚠⚠ O INSPETOR VÊ PRODUTO FINAL, NÃO COMPONENTE NEM ACESSÓRIO. Vitor (14/09/2026): "está
// aparecendo peças de croqui no relatório de pintura e também acessórios, isso não pode aparecer na
// tela do inspetor". `todas=1` traz conjunto + peça avulsa (o que se pinta, se solda e embarca);
// croqui (posição cortada, "T89A-P24") só entra com `croquis=1`, que é o dimensional de peças
// avulsas — onde se mede o que saiu do corte. Parafuso, porca, cola, grade comprada (`ehItemComprado`
// e marca AC) nunca entram: ninguém inspeciona pintura de parafuso.
//
// ⚠ SEPARADO POR FASE. "precisamos que separe por fases, no caso da 89 temos A e C por hora, logo
// teremos a B": cada peça sai com `fase` (frente da LPC, ou letra da marca — lib/fase-peca), a
// resposta lista `fases` da OP inteira e `fase=A` filtra ANTES do corte de 60 — senão a fase C de
// uma obra grande nunca apareceria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { ehItemComprado } from "@/lib/item-comprado";
import { marcaEhAC } from "@/lib/marca-ac";
import { faseDaPeca, ordenarFases, SEM_FASE } from "@/lib/fase-peca";

export const runtime = "nodejs";

const LIMITE = 60;

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const opId = url.searchParams.get("opId");
  const busca = (url.searchParams.get("q") || "").trim();
  const todas = url.searchParams.get("todas") === "1";
  const comCroquis = todas && url.searchParams.get("croquis") === "1";
  const faseFiltro = (url.searchParams.get("fase") || "").trim().toUpperCase();
  if (!opId) return NextResponse.json({ error: "OP não informada" }, { status: 400 });

  // ⚠ `tipoPeca: { not: "CROQUI" }` deixaria o NULL de fora (SQL), e a peça avulsa da LPC e toda
  // linha da LE são NULL — por isso o OR explícito.
  const tipo = !todas ? { tipoPeca: "CONJUNTO" } : comCroquis ? {} : { OR: [{ tipoPeca: "CONJUNTO" }, { tipoPeca: null }] };
  const [op, pecas] = await Promise.all([
    prisma.oP.findUnique({ where: { id: opId }, select: { numero: true } }),
    prisma.pecaConjunto.findMany({
      where: { opId, ...tipo, ...(busca ? { marca: { contains: busca, mode: "insensitive" } } : {}) },
      select: { marca: true, descricao: true, tipoPeca: true, perfil: true, qte: true, opNumero: true, fonte: true, material: true, pesoUnitKg: true, pesoTotalKg: true },
      orderBy: { marca: "asc" },
    }),
  ]);

  const lista = consolidar(pecas, op?.numero);
  const fases = ordenarFases(lista.map((p) => p.fase));
  const daFase = faseFiltro ? lista.filter((p) => p.fase === faseFiltro) : lista;
  return NextResponse.json({ pecas: daFase.slice(0, LIMITE), temMais: daFase.length > LIMITE, fases });
}

/**
 * Uma linha por marca, sem o que o inspetor não inspeciona.
 *
 * ⚠ A MESMA MARCA APARECE MAIS DE UMA VEZ — em sub-obras diferentes (ver lib/rastreio-peca) e na
 * LPC e na LE ao mesmo tempo. A quantidade segue a LE, que é o documento da obra
 * ([[torg_peso_real_op]]); só sem LE vale a soma da LPC. Somar tudo dava "2 peças" para todo
 * conjunto que existe nas duas listas.
 *
 * ⚠ ACESSÓRIO SÓ SAI SE FOR ACESSÓRIO EM TODA LINHA: a LE traz conjunto sem perfil e às vezes sem
 * peso, e `ehItemComprado` leria isso como parafuso — a linha da LPC da mesma marca é quem
 * desempata.
 */
function consolidar(pecas, opNumeroDaOp) {
  const porMarca = new Map();
  for (const p of pecas) {
    const marca = p.marca.trim().toUpperCase();
    const g = porMarca.get(marca) || { marca, descricao: null, perfil: null, tipoPeca: null, fase: null, qtdLE: 0, qtdLPC: 0, qtdOutra: 0, compradaEmTudo: true };
    porMarca.set(marca, fundir(g, p, opNumeroDaOp));
  }
  // por fase; dentro dela conjunto/avulsa antes do croqui (ver "CONJUNTO PRIMEIRO" no topo) e a
  // marca em ordem numérica (T89A2 antes de T89A10) — é a ordem em que a tela separa os grupos,
  // então precisa vir pronta daqui
  const ordem = new Map(ordenarFases([...porMarca.values()].map((g) => g.fase)).map((f, i) => [f, i]));
  const croqui = (g) => (g.tipoPeca === "CROQUI" ? 1 : 0);
  return [...porMarca.values()]
    .filter((g) => !g.compradaEmTudo)
    .sort((a, b) => ordem.get(a.fase) - ordem.get(b.fase) || croqui(a) - croqui(b) || a.marca.localeCompare(b.marca, "pt", { numeric: true }))
    .map((g) => ({ marca: g.marca, descricao: g.descricao, perfil: g.perfil, tipoPeca: g.tipoPeca, fase: g.fase, quantidade: g.qtdLE || g.qtdLPC || g.qtdOutra }));
}

/** Soma uma linha do banco ao grupo da marca. */
function fundir(g, p, opNumeroDaOp) {
  g.descricao = g.descricao || p.descricao || null;
  g.perfil = g.perfil || p.perfil || null;
  if (p.tipoPeca === "CONJUNTO" || !g.tipoPeca) g.tipoPeca = p.tipoPeca || g.tipoPeca;
  if (!g.fase || g.fase === SEM_FASE) g.fase = faseDaPeca(p, opNumeroDaOp);
  const q = Number(p.qte) || 0;
  if (p.fonte === "LE_IMPORT") g.qtdLE += q; else if (p.fonte === "LPC_IMPORT") g.qtdLPC += q; else g.qtdOutra += q;
  g.compradaEmTudo = g.compradaEmTudo && (marcaEhAC(g.marca) || ehItemComprado(p));
  return g;
}
