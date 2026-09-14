// O TOTEM — estado do recurso, o que o PCP programou, e as ações do operador.
//
// GET  /api/mes-lab/totem/<codigo>            → recurso, sessão aberta, estado, lotes programados
// GET  /api/mes-lab/totem/<codigo>?buscar=T10 → marcas para o caminho de bipar
// POST /api/mes-lab/totem/<codigo>            → { acao: entrar|abrir|apontar|parar|produzir|encerrar }
//
// ⚠ A REGRA NÃO MORA AQUI. Sessão, travas e idempotência estão em `lib/mes/sessao.js`; o que o PCP
// programou, em `lib/mes/programado.js`. Esta rota traduz HTTP e nada mais — é o mesmo desenho da
// Conferência de Peça, e pelo mesmo motivo: regra em rota não se testa sem subir servidor.
//
// ⚠⚠ ÁREA DE LABORATÓRIO. `/mes-lab` é ADMIN-only no `middleware.js`, mas o gate do middleware
// cobre PÁGINA, não API — por isso `requireRole` aqui também. O Codex pediu exatamente isso
// (§7.4): "o gate precisa cobrir API, tempo real e exportação, não só a página".

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { abrirSessao, apontarQuantidade, encerrarSessao, mudarEstado, estadoDoRecurso, saldoDaMarca, ESTADO } from "@/lib/mes/sessao";
import { abrirLote, encerrarLote } from "@/lib/mes/lote";
import { programadoPara, acharMarca } from "@/lib/mes/programado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERFIS = ["ADMIN"];
const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });
const erro = (msg, status = 400) => NextResponse.json({ success: false, error: msg }, { status });

const recursoPorCodigo = (codigo) =>
  prisma.mesRecurso.findUnique({ where: { codigo: decodeURIComponent(codigo) }, include: { setor: true } });

export async function GET(req, { params }) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const recurso = await recursoPorCodigo(params.codigo);
  if (!recurso) return erro("Recurso não encontrado.", 404);

  const buscar = new URL(req.url).searchParams.get("buscar");
  if (buscar) return NextResponse.json({ success: true, marcas: await acharMarca(prisma, buscar) });

  const [estado, programado, motivos, planos] = await Promise.all([
    estadoDoRecurso(prisma, recurso.id),
    programadoPara(prisma, recurso),
    // O totem precisa da lista para PERGUNTAR o motivo antes de registrar a parada: `mudarEstado`
    // recusa parada sem motivo, e um botão que sempre dá erro é pior que um botão a menos.
    prisma.mesMotivoParada.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" } }),
    planosDoPosto(recurso),
  ]);

  // A sessão aberta traz o que já foi apontado nela: é o número que o operador confere antes de
  // encerrar, e sem ele a tela pediria fé.
  //
  // ⚠ `apontado` é DESTA SESSÃO; `saldo` é da MARCA inteira. São perguntas diferentes e a tela
  // mostra as duas: "o que eu fiz agora" e "quanto ainda falta para a marca" — a segunda é a que
  // a trava do lançamento usa, e esconder dela o total já feito em outros turnos faria a recusa
  // parecer arbitrária.
  // ⚠⚠ UMA CONTA POR MARCA ABERTA. Desde 13/09/2026 o posto pode ter várias (o nesting abre a barra
  // inteira), e cada uma tem o seu apontado e o seu saldo — mostrar só o da primeira faria o
  // operador lançar contra o número da marca errada.
  const trabalhos = await Promise.all((estado.sessoes || []).map(async (sessao) => {
    const [s, conta] = await Promise.all([
      prisma.mesApontamentoQtd.aggregate({
        where: { sessaoId: sessao.id },
        _sum: { boas: true, rejeitadas: true, retrabalho: true },
      }),
      saldoDaMarca(prisma, sessao),
    ]);
    return {
      sessao,
      apontado: { boas: s._sum.boas || 0, rejeitadas: s._sum.rejeitadas || 0, retrabalho: s._sum.retrabalho || 0 },
      saldo: conta,
    };
  }));
  const primeiro = trabalhos[0] || null;

  return NextResponse.json({
    success: true,
    recurso: { id: recurso.id, codigo: recurso.codigo, nome: recurso.nome, tipo: recurso.tipo,
               setor: { codigo: recurso.setor.codigo, nome: recurso.setor.nome, cor: recurso.setor.cor } },
    ...estado, trabalhos,
    // ⚠ `apontado`/`saldo` no topo continuam sendo os do PRIMEIRO trabalho: a tela do totem antiga
    // os lê assim, e trocar o contrato de uma vez quebraria o que já está validado no chão.
    apontado: primeiro?.apontado ?? null, saldo: primeiro?.saldo ?? null,
    motivos, planos, ...programado,
  });
}

/**
 * Os planos de corte que este posto pode abrir.
 *
 * ⚠ SÓ NA PREPARAÇÃO: nesting é corte. Oferecer na solda faria o operador abrir uma barra de laser
 * numa bancada de solda — e o apontamento cairia no recurso errado, que é erro que só aparece no
 * relatório do mês.
 *
 * ⚠⚠ DIZ QUAL BARRA JÁ FOI ABERTA, e é isso que impede a barra de ser cortada duas vezes por dois
 * turnos diferentes. A trava real é o índice de trabalho único por posto; isto é o que a tela
 * mostra para ninguém tentar.
 */
async function planosDoPosto(recurso) {
  if (recurso.setor?.codigo !== "PREPARACAO") return [];
  const planos = await prisma.mesNesting.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      unidades: {
        orderBy: { indice: "asc" },
        include: { itens: { select: { marca: true, qtd: true, deduzida: true }, orderBy: { ordem: "asc" } } },
      },
    },
  });
  const ids = planos.flatMap((p) => p.unidades.map((u) => u.id));
  const abertas = await prisma.mesSessao.findMany({
    where: { nestingUnidades: { hasSome: ids }, status: "ABERTA" },
    select: { lotes: true, nestingUnidades: true },
  });
  // ⚠ Uma sessão pode servir a mais de uma barra (a mesma marca repetida no plano), por isso o
  // vínculo é lista dos dois lados.
  const emCurso = new Map();
  for (const s of abertas) {
    for (const u of s.nestingUnidades) if (!emCurso.has(u)) emCurso.set(u, s.lotes[0] || null);
  }
  return planos.map((p) => ({
    id: p.id, nome: p.nome, opNumero: p.opNumero, descricao: p.descricao,
    unidades: p.unidades.map((u) => ({
      id: u.id, indice: u.indice, tipo: u.tipo, pecas: u.pecas,
      marcas: u.itens, loteAberto: emCurso.get(u.id) || null,
    })),
  }));
}

/** O crachá é a porta de entrada: sem operador reconhecido, nada acontece. */
async function operadorDoCracha(cracha) {
  const limpo = String(cracha ?? "").trim();
  if (!limpo) return { erro: "Bipe ou digite o crachá." };
  const operador = await prisma.mesOperador.findUnique({ where: { cracha: limpo } });
  if (!operador || !operador.ativo) return { erro: `Crachá ${limpo} não encontrado.` };
  return { operador };
}

const ACOES = {
  async entrar({ operador }) { return { operador }; },

  async abrir({ corpo, recurso, operador }) {
    return abrirSessao(prisma, {
      recursoId: recurso.id, operadorId: operador.id,
      opId: corpo.opId ?? null, opNumero: corpo.opNumero ?? null,
      marca: corpo.marca ?? null, operacao: recurso.setor.codigo,
      planejadoQtd: corpo.planejadoQtd,
    });
  },

  async apontar({ corpo, operador }) {
    return apontarQuantidade(prisma, {
      sessaoId: corpo.sessaoId, operadorId: operador.id,
      boas: corpo.boas, rejeitadas: corpo.rejeitadas, retrabalho: corpo.retrabalho,
      observacao: corpo.observacao, chaveOperacao: corpo.chaveOperacao,
    });
  },

  async parar({ corpo, operador }) {
    return mudarEstado(prisma, {
      sessaoId: corpo.sessaoId, tipo: ESTADO.PARADA, motivoId: corpo.motivoId,
      detalhe: corpo.detalhe, operadorId: operador.id, chaveIdem: corpo.chaveOperacao,
    });
  },

  async produzir({ corpo, operador }) {
    return mudarEstado(prisma, {
      sessaoId: corpo.sessaoId, tipo: ESTADO.PRODUCAO,
      operadorId: operador.id, chaveIdem: corpo.chaveOperacao,
    });
  },

  async encerrar({ corpo, operador }) {
    return encerrarSessao(prisma, { sessaoId: corpo.sessaoId, operadorId: operador.id, chaveIdem: corpo.chaveOperacao });
  },

  /**
   * ⚠⚠ O PEDIDO INTEIRO DO NESTING EM UMA AÇÃO. Matheus (13/09/2026): *"o nesting vai servir para
   * abrir todas as marcas e iniciar a produção delas sem que o operador precise abrir uma por
   * uma"*. O que chega é a BARRA (ou a chapa); o que abre são as marcas dela.
   */
  async abrirNesting({ corpo, recurso, operador }) {
    const unidade = await prisma.mesNestingUnidade.findUnique({
      where: { id: corpo.unidadeId },
      include: { itens: true, nesting: { select: { nome: true, opNumero: true } } },
    });
    if (!unidade) return { erro: "Barra/chapa não encontrada." };
    if (!unidade.itens.length) return { erro: "Esta barra não tem marca nenhuma." };

    const r = await abrirLote(prisma, {
      recursoId: recurso.id, operadorId: operador.id, nestingUnidadeId: unidade.id,
      loteId: corpo.chaveOperacao || null,
      trabalhos: unidade.itens.map((i) => ({
        marca: i.marca,
        // ⚠ A obra vem do ITEM, que foi casado com `PecaConjunto` na importação — não do nome do
        // arquivo, que é só pista (§16.2).
        opNumero: i.opNumero ?? unidade.nesting.opNumero ?? null,
        pecaId: i.pecaConjuntoId ?? null,
        operacao: recurso.setor.codigo,
        planejadoQtd: i.qtd,
      })),
    });
    return { ...r, plano: unidade.nesting.nome, unidade: unidade.indice };
  },

  async encerrarLote({ corpo, recurso, operador }) {
    return encerrarLote(prisma, { recursoId: recurso.id, loteId: corpo.loteId, operadorId: operador.id });
  },
};

export async function POST(req, { params }) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { return erro("Corpo inválido."); }

  const executar = ACOES[corpo?.acao];
  if (!executar) return erro(`Ação desconhecida: ${corpo?.acao}`);

  const recurso = await recursoPorCodigo(params.codigo);
  if (!recurso) return erro("Recurso não encontrado.", 404);

  const { operador, erro: semCracha } = await operadorDoCracha(corpo.cracha);
  if (semCracha) return erro(semCracha, 403);

  const r = await executar({ corpo, recurso, operador });
  if (r?.erro) return erro(r.erro, 409);
  return NextResponse.json({ success: true, ...r, operador: { id: operador.id, nome: operador.nome, cracha: operador.cracha } });
}
