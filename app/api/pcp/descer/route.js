// GET /api/pcp/descer?setor=PREPARACAO|MONTAGEM
//   → o que ainda NÃO desceu para o setor, na fábrica inteira, e o que trava cada um.
//
// Vitor (03/09/2026), sobre a Larissa: "a tela é no PCP, mas a questão é que ela está perdida para
// conseguir descer os desenhos para os setores".
//
// ⚠⚠ A TELA NÃO PODE ESPERAR QUE ELA SAIBA O QUE PROCURAR. Hoje o botão "Imprimir e liberar" só
// nasce depois de marcar linha numa tabela de centenas — quem abre o PCP não vê caminho nenhum,
// só um texto cinza dizendo "marque peças". Esta rota responde a pergunta do dia antes de qualquer
// clique: quantos faltam descer, quais dão para descer agora, e por que os outros não dão.
//
// ⚠ POR SETOR, NÃO POR OBRA. Mesma escolha do painel de carga (Vitor: "não precisa ser apenas de
// uma OP, mostre tudo que foi para aquele dia"): quem trabalha o dia da preparação atende a fábrica
// inteira, e obrigar a abrir obra por obra para descobrir onde há trabalho é o que faz perder.
//
// ⚠ NENHUMA REGRA NOVA AQUI. Prontidão vem de `calcularProntidao`, o desenho de `portaoDoDesenho`,
// a GRD de `GrdLiberacao` — as mesmas fontes que a liberação já cobra. Uma segunda régua faria a
// tela dizer "pode" e o POST responder "não pode".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularProntidao, CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { portaoDoDesenho, temDesenhoNaPasta } from "@/lib/pasta-engenharia";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { OP_VIVA } from "@/lib/op-viva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

// ⚠ CORTE E PREPARAÇÃO SÃO A MESMA COISA (Vitor, 03/09/2026). O banco grava CORTE; a fábrica fala
// preparação. Mesmo tratamento do painel de carga.
const STATUS_DO_SETOR = { PREPARACAO: ["CORTE"], MONTAGEM: ["MONTAGEM"] };

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const setor = String(new URL(req.url).searchParams.get("setor") || "PREPARACAO").toUpperCase();
  if (!STATUS_DO_SETOR[setor]) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });
  const ehMontagem = setor === "MONTAGEM";

  // ── quem é candidato a descer ────────────────────────────────────────────────────────────────
  //
  // ⚠ Na montagem, o candidato é o CONJUNTO da LPC (ver CONJUNTO_MONTAVEL — a LE não é produção).
  // Na preparação, é a peça que está no corte: croqui e avulsa, nunca conjunto — conjunto não se
  // corta.
  const where = ehMontagem
    ? { ...CONJUNTO_MONTAVEL, ...OP_VIVA, status: { in: STATUS_DO_SETOR[setor] } }
    : {
        ...SO_FABRICACAO, ...OP_VIVA, status: { in: STATUS_DO_SETOR[setor] },
        NOT: { tipoPeca: "CONJUNTO" },
      };

  const pecas = await prisma.pecaConjunto.findMany({
    where,
    select: {
      id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, opId: true,
      perfil: true, statusEstoque: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      ...(ehMontagem
        ? { conjuntoCroquis: { select: { croqui: { select: { qte: true, qteProduzida: true } } } } }
        : {}),
    },
    take: 6000,
  });
  if (!pecas.length) return NextResponse.json({ setor, obras: [], total: { prontos: 0, travados: 0, jaDesceram: 0 } });

  // ── o que já desceu: a GRD é o registro ──────────────────────────────────────────────────────
  // ⚠ LIBERAR É IMPRIMIR A GRD (decisão do Vitor): não existe estado "liberado" no banco, o que
  // prova que a peça desceu é a GRD emitida. Por isso a mesma consulta serve de "já desceu".
  const marcas = [...new Set(pecas.map((p) => String(p.marca || "").trim().toUpperCase()).filter(Boolean))];
  const grds = marcas.length
    ? await prisma.grdLiberacao.findMany({ where: { marca: { in: marcas } }, select: { marca: true } })
    : [];
  const jaDesceu = new Set(grds.map((g) => String(g.marca || "").trim().toUpperCase()));

  // ── o portão do desenho, uma vez por obra ────────────────────────────────────────────────────
  const opIds = [...new Set(pecas.map((p) => p.opId).filter(Boolean))];
  const portoes = new Map();
  for (const opId of opIds) {
    portoes.set(opId, await portaoDoDesenho(prisma, opId).catch(() => null));
  }

  // ── classifica cada peça ─────────────────────────────────────────────────────────────────────
  const porObra = new Map();
  for (const p of pecas) {
    const chave = p.opId || "sem-op";
    const g = porObra.get(chave) || porObra.set(chave, {
      opId: p.opId, opNumero: p.op?.numero || null, cliente: p.op?.cliente || null, obra: p.op?.obra || null,
      prontos: [], travados: [], jaDesceram: 0, kgProntos: 0,
    }).get(chave);

    const marca = String(p.marca || "").trim().toUpperCase();
    if (jaDesceu.has(marca)) { g.jaDesceram++; continue; }

    // ⚠ ORDEM DOS MOTIVOS = ordem de quem resolve. O croqui que falta é da preparação (interno e
    // do dia); desenho é Engenharia; material é Compras. Mostrar o mais próximo primeiro evita
    // mandar cobrar fornecedor por peça que só falta cortar.
    let motivo = null;
    if (ehMontagem) {
      const pr = calcularProntidao(p);
      if (!pr.pronto) motivo = { tipo: "CROQUI", texto: `faltam ${pr.total - pr.atendidos} de ${pr.total} croquis no corte` };
    }
    if (!motivo) {
      // ⚠ `null` = a obra nunca foi conferida. Não é "sem desenho": afirmar que falta o que não se
      // mediu mandaria cobrar a Engenharia por engano.
      const tem = temDesenhoNaPasta(portoes.get(p.opId), p.marca);
      if (tem === false) motivo = { tipo: "DESENHO", texto: "sem PDF em 2.5.2 Fabricação" };
    }
    if (!motivo && !ehMontagem && p.statusEstoque === "SEM_MATERIAL") {
      motivo = { tipo: "MATERIAL", texto: "aço não entregue nesta obra" };
    }

    const item = {
      id: p.id, marca: p.marca, descricao: p.descricao || null,
      qte: p.qte || 0, kg: Math.round(Number(p.pesoTotalKg) || 0),
    };
    if (motivo) g.travados.push({ ...item, motivo: motivo.tipo, porque: motivo.texto });
    else { g.prontos.push(item); g.kgProntos += Number(p.pesoTotalKg) || 0; }
  }

  const obras = [...porObra.values()]
    .map((g) => ({
      ...g, kgProntos: Math.round(g.kgProntos),
      // ⚠ o que trava vai AGRUPADO por motivo: cinco linhas dizendo "sem PDF" é uma informação só,
      // e quem lê precisa saber para quem ligar, não reler o mesmo texto.
      travadosPorMotivo: Object.entries(
        g.travados.reduce((a, t) => { (a[t.porque] ??= []).push(t.marca); return a; }, {}),
      ).map(([porque, marcasT]) => ({ porque, marcas: marcasT, n: marcasT.length }))
        .sort((a, b) => b.n - a.n),
    }))
    // obra com trabalho pronto primeiro: é onde o dia dela começa
    .sort((a, b) => b.prontos.length - a.prontos.length || String(a.opNumero).localeCompare(String(b.opNumero)));

  return NextResponse.json({
    setor,
    obras,
    total: {
      prontos: obras.reduce((s, o) => s + o.prontos.length, 0),
      kgProntos: obras.reduce((s, o) => s + o.kgProntos, 0),
      travados: obras.reduce((s, o) => s + o.travados.length, 0),
      jaDesceram: obras.reduce((s, o) => s + o.jaDesceram, 0),
    },
  });
}
