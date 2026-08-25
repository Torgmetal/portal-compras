// GET /api/planejamento/cargas — todas as cargas, das DUAS origens, numa lista só.
//
// Vitor (25/08/2026): "quero que mude a forma de visualizar... para podermos ver apenas as que estão
// programadas, não ficando em botões por OP... pensei até mesmo em formato de planilha, igual
// fizemos na planilha de rastreabilidade, com filtros".
//
// ⚠⚠ SÃO DUAS TABELAS DE CARGA, E EU LIA SÓ UMA. Vitor (25/08): "havíamos criado algumas prévias,
// por que não listou elas?". Ele está certo:
//     PlanejamentoCarga →  3 registros, todos de junho, parados
//     RomaneioPrevio    → 11 registros, 6 criados ontem — as cargas VIVAS
// A lista mostrava exatamente as paradas e escondia as ativas. As duas são carga (OP, data, itens,
// peso); o que muda é por onde nasceram, e é isso que a coluna "origem" diz — em vez de fingir que
// são a mesma coisa ou de escolher uma e calar a outra.
//
// ⚠ ENXUTA DE PROPÓSITO. /api/expedicao/programacao-cargas devolve o mesmo e mais, mas carrega
// `pecasConjunto` de TODAS as OPs ativas para calcular prontidão — só a OP-067 tem 5.700 peças.
// Pagar essa conta para desenhar uma tabela é o que deixaria a lista lenta quando ela crescer.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⚠ ORDEM DE PRECEDÊNCIA, do fato mais forte para o mais fraco. NF emitida ganha de tudo: a carga
// saiu e foi faturada, e nada depois disso a torna "atrasada". Cancelada vem antes de atrasada pelo
// mesmo motivo — não se cobra o que foi cancelado. "Atrasada" é o que sobra.
function situacaoDe({ cancelada, faturada, embarcada, confirmada, data, hoje }) {
  if (cancelada) return "CANCELADA";
  if (faturada) return "FATURADA";
  if (embarcada) return "EMBARCADA";
  if (confirmada && (!data || data >= hoje)) return "CONFIRMADA";
  // ⚠ sem data não é atrasada: é carga que ninguém datou, e cobrar prazo de algo sem prazo é ruído.
  if (data && data < hoje) return "ATRASADA";
  return data ? "PROGRAMADA" : "SEM_DATA";
}

export async function GET() {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO", "PCP", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const selOp = { id: true, numero: true, cliente: true, obra: true, refCliente: true };
  const [programadas, previas] = await Promise.all([
    prisma.planejamentoCarga.findMany({
      orderBy: { dataPrevista: "asc" },
      include: {
        op: { select: selOp },
        romaneio: { select: { numero: true, data: true, pesoRealKg: true } },
        itens: { select: { status: true, pesoEstimadoKg: true } },
      },
    }),
    prisma.romaneioPrevio.findMany({
      orderBy: [{ dataPrevista: "asc" }, { createdAt: "asc" }],
      include: { op: { select: selOp } },
    }),
  ]);

  // ⚠ HOJE em horário de Brasília, zerado. O servidor roda em UTC: comparar com `new Date()` cru
  // faria a carga do próprio dia aparecer como atrasada nas três primeiras horas da manhã.
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  hoje.setHours(0, 0, 0, 0);
  const dias = (d) => (d ? Math.floor((hoje - d) / 86400000) : 0);

  const base = (op, data, situacao) => ({
    opId: op.id, opNumero: op.numero,
    cliente: op.cliente || "", obra: op.obra || "", refCliente: op.refCliente || "",
    dataPrevista: data ? data.toISOString() : null,
    situacao,
    diasAtraso: situacao === "ATRASADA" ? dias(data) : 0,
  });

  const linhas = [
    ...programadas.map((c) => {
      const itens = c.itens || [];
      const data = c.dataPrevista ? new Date(c.dataPrevista) : null;
      const situacao = situacaoDe({
        cancelada: c.situacao === "CANCELADA", faturada: false,
        embarcada: !!c.romaneioId, confirmada: c.situacao === "CONFIRMADA", data, hoje,
      });
      return {
        id: `pc_${c.id}`, origem: "PROGRAMACAO", ...base(c.op, data, situacao),
        // ⚠ a data ORIGINAL só interessa quando mudou: separa "atrasou" de "foi empurrada".
        remarcadaDe: c.dataOriginal && +c.dataOriginal !== +c.dataPrevista ? c.dataOriginal.toISOString() : null,
        // a carga da programação não tem número próprio: o que identifica é a descrição que
        // alguém digitou ("Romaneio 20"). Fica como está, sem inventar numeração.
        romaneioLabel: c.descricao || "",
        local: "",
        itens: itens.length,
        carregados: itens.filter((i) => i.status === "CARREGADO").length,
        pesoKg: Math.round(itens.reduce((s, i) => s + (Number(i.pesoEstimadoKg) || 0), 0)),
        romaneioEmitido: c.romaneio?.numero ? String(c.romaneio.numero) : null,
        // ⚠ `PlanejamentoCarga` não guarda NF — quem registra nota é o Fiscal, sobre o romaneio
        // prévio. Devolver null aqui é o fato, não uma lacuna a preencher com chute.
        nf: null,
        criadaEm: c.createdAt.toISOString(),
      };
    }),
    ...previas.map((r) => {
      const data = r.dataPrevista ? new Date(r.dataPrevista) : null;
      const situacao = situacaoDe({
        cancelada: r.status === "CANCELADO", faturada: !!r.nfEmitidaEm,
        embarcada: !!r.emitidoEm, confirmada: r.status === "APROVADO", data, hoje,
      });
      return {
        id: `rp_${r.id}`, origem: "PREVIA", ...base(r.op, data, situacao),
        remarcadaDe: null,
        // ⚠⚠ "Romaneio ##", NUNCA "RT-##". RT é a série do `RomaneioTerceiro` — envio a prestador
        // (galvanização, usinagem), que NÃO é carga para o cliente. Eu tinha rotulado assim por
        // engano e Vitor leu, com razão, como se romaneio de terceiro tivesse entrado na lista.
        //
        // ⚠ E não entra mesmo: esta rota lê `PlanejamentoCarga` e `RomaneioPrevio`, nenhuma das
        // duas guarda envio a terceiro (não há campo de fornecedor nelas). Conferido em 25/08/2026:
        // os 2 RT do banco são de MOISES DE ARAUJO, em tabela à parte; os 11 prévios têm todos
        // destino de obra do cliente (Tamanduateí, Paulínia, Franco da Rocha, Arujá…).
        romaneioLabel: `Romaneio ${String(r.numero).padStart(2, "0")}${r.revisao > 0 ? ` R${String(r.revisao).padStart(2, "0")}` : ""}`,
        // ⚠ o local sai da mesma célula do número e vira linha própria: endereço de obra tem três
        // linhas e empurrava o número para fora da vista.
        local: [r.local, r.observacao].filter(Boolean).join(" · "),
        itens: Array.isArray(r.itens) ? r.itens.length : 0,
        carregados: 0,
        pesoKg: Math.round(Number(r.pesoKg) || 0),
        romaneioEmitido: r.emitidoEm ? `R${String(r.revisao).padStart(2, "0")}` : null,
        nf: r.nfNumero ? { numero: r.nfNumero, tipo: r.nfTipo || null, emitidaEm: r.nfEmitidaEm ? r.nfEmitidaEm.toISOString() : null } : null,
        criadaEm: r.createdAt.toISOString(),
      };
    }),
  ].sort((a, b) => {
    // sem data por último — não tem prazo para disputar posição na fila
    if (!a.dataPrevista) return b.dataPrevista ? 1 : 0;
    if (!b.dataPrevista) return -1;
    return a.dataPrevista.localeCompare(b.dataPrevista);
  });

  const conta = (s) => linhas.filter((l) => l.situacao === s).length;
  const emAberto = linhas.filter((l) => ["PROGRAMADA", "ATRASADA", "CONFIRMADA", "SEM_DATA"].includes(l.situacao));
  return NextResponse.json({
    cargas: linhas,
    totais: {
      total: linhas.length,
      programadas: conta("PROGRAMADA"), atrasadas: conta("ATRASADA"), confirmadas: conta("CONFIRMADA"),
      embarcadas: conta("EMBARCADA"), faturadas: conta("FATURADA"),
      canceladas: conta("CANCELADA"), semData: conta("SEM_DATA"),
      previas: linhas.filter((l) => l.origem === "PREVIA").length,
      pesoAberto: emAberto.reduce((s, l) => s + l.pesoKg, 0),
    },
    geradoEm: new Date().toISOString(),
  });
}
