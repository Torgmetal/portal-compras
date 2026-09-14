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
import { entrarNoPosto, sairDoPosto, liberarPresenca } from "@/lib/mes/cracha";

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
    ...estado, trabalhos, presencas: await presencasDoPosto(recurso.id),
    // ⚠ `apontado`/`saldo` no topo continuam sendo os do PRIMEIRO trabalho: a tela do totem antiga
    // os lê assim, e trocar o contrato de uma vez quebraria o que já está validado no chão.
    apontado: primeiro?.apontado ?? null, saldo: primeiro?.saldo ?? null,
    motivos, planos, ...programado,
  });
}

/** Quem está com o crachá aberto neste posto — a tela mostra, o operador se reconhece. */
const presencasDoPosto = (recursoId) =>
  prisma.mesPresenca.findMany({
    where: { recursoId, status: "ABERTA" },
    orderBy: { abertaEm: "asc" },
    select: { id: true, abertaEm: true, operador: { select: { nome: true, cracha: true } } },
  });

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
  /**
   * ⚠⚠ ENTRAR DEIXOU DE SER SÓ IDENTIFICAR. Matheus (13/09/2026): "quando um crachá estiver ativado
   * em uma máquina, não pode ser aberto em outro até ele fechar a operação dele na máquina aberta".
   * Agora a entrada ADQUIRE um vínculo (`MesPresenca`), e é ele que a trava usa — ver
   * `lib/mes/cracha.js` para por que isso não podia sair de `MesSessao.operadorId`.
   */
  async entrar({ recurso, operador }) {
    const r = await entrarNoPosto(prisma, { operadorId: operador.id, recursoId: recurso.id });
    if (r.erro) return r;
    return { operador, presencaId: r.presenca.id, liberou: r.liberou ?? null };
  },

  /**
   * ⚠ Só o botão explícito passa por aqui — recarregar a tela não solta operação aberta.
   *
   * ⚠⚠ O POSTO E O VÍNCULO VÃO JUNTOS, e não é detalhe (achado do Codex sobre a implementação):
   * sem eles, um toque numa aba esquecida do posto A liberava o crachá que já estava no posto B.
   */
  async sair({ recurso, operador, presenca }) {
    return sairDoPosto(prisma, {
      operadorId: operador.id, recursoId: recurso.id, presencaId: presenca.presencaId,
    });
  },

  /**
   * A SAÍDA DE EMERGÊNCIA, e ela é do ADMIN (a rota inteira já é ADMIN-only).
   *
   * ⚠⚠ LIBERA O VÍNCULO E NADA MAIS. Não encerra marca nem grava evento: fabricar um encerramento
   * que ninguém viveu no chão de fábrica envenena o OEE com tempo que não existiu (pedido do
   * Codex). O trabalho segue aberto onde está, para quem estiver lá resolver.
   */
  async liberarCracha({ corpo, operador }) {
    const alvo = await prisma.mesOperador.findUnique({ where: { cracha: String(corpo.crachaAlvo || "").trim() } });
    if (!alvo) return { erro: `Crachá ${corpo.crachaAlvo} não encontrado.` };
    return liberarPresenca(prisma, { operadorId: alvo.id, porQuem: operador.nome });
  },

  async abrir({ corpo, recurso, operador , presenca }) {
    return abrirSessao(prisma, {
      presenca, recursoId: recurso.id, operadorId: operador.id,
      opId: corpo.opId ?? null, opNumero: corpo.opNumero ?? null,
      marca: corpo.marca ?? null, operacao: recurso.setor.codigo,
      planejadoQtd: corpo.planejadoQtd,
    });
  },

  async apontar({ corpo, operador , presenca }) {
    return apontarQuantidade(prisma, {
      presenca, sessaoId: corpo.sessaoId, operadorId: operador.id,
      boas: corpo.boas, rejeitadas: corpo.rejeitadas, retrabalho: corpo.retrabalho,
      observacao: corpo.observacao, chaveOperacao: corpo.chaveOperacao,
    });
  },

  async parar({ corpo, operador , presenca }) {
    return mudarEstado(prisma, {
      presenca, sessaoId: corpo.sessaoId, tipo: ESTADO.PARADA, motivoId: corpo.motivoId,
      detalhe: corpo.detalhe, operadorId: operador.id, chaveIdem: corpo.chaveOperacao,
    });
  },

  async produzir({ corpo, operador , presenca }) {
    return mudarEstado(prisma, {
      presenca, sessaoId: corpo.sessaoId, tipo: ESTADO.PRODUCAO,
      operadorId: operador.id, chaveIdem: corpo.chaveOperacao,
    });
  },

  async encerrar({ corpo, operador , presenca }) {
    return encerrarSessao(prisma, { presenca, sessaoId: corpo.sessaoId, operadorId: operador.id, chaveIdem: corpo.chaveOperacao });
  },

  /**
   * ⚠⚠ O PEDIDO INTEIRO DO NESTING EM UMA AÇÃO. Matheus (13/09/2026): *"o nesting vai servir para
   * abrir todas as marcas e iniciar a produção delas sem que o operador precise abrir uma por
   * uma"*. O que chega é a BARRA (ou a chapa); o que abre são as marcas dela.
   */
  async abrirNesting({ corpo, recurso, operador , presenca }) {
    const unidade = await prisma.mesNestingUnidade.findUnique({
      where: { id: corpo.unidadeId },
      include: { itens: true, nesting: { select: { nome: true, opNumero: true } } },
    });
    if (!unidade) return { erro: "Barra/chapa não encontrada." };
    if (!unidade.itens.length) return { erro: "Esta barra não tem marca nenhuma." };

    const r = await abrirLote(prisma, {
      presenca, recursoId: recurso.id, operadorId: operador.id, nestingUnidadeId: unidade.id,
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

  async encerrarLote({ corpo, recurso, operador , presenca }) {
    return encerrarLote(prisma, { presenca, recursoId: recurso.id, loteId: corpo.loteId, operadorId: operador.id });
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

  // ⚠⚠ O CONTEXTO DE PRESENÇA VAI EM TODA AÇÃO, não só na entrada. O totem guarda o crachá em
  // `useState` e o reenvia em todo comando: validando só o `entrar`, quem foi recusado ainda
  // poderia apontar, parar ou encerrar numa sessão que já existe no posto (achado do Codex).
  //
  // ⚠ `presencaId` vem da tela e é conferido contra o vínculo ativo — é o que impede uma aba velha,
  // aberta antes de uma liberação, de voltar a funcionar sozinha.
  // ⚠⚠ `exigirId: true` — no totem o id do vínculo é OBRIGATÓRIO (achado do Codex). Conferindo-o
  // só quando ele vem, quem não o manda pula a proteção inteira, e a tela velha é justamente quem
  // tende a não mandar. Scripts e importações usam as libs sem contexto de presença, que é um
  // caminho explícito e não se confunde com um comando de gente.
  const presenca = { operadorId: operador.id, presencaId: corpo.presencaId ?? null, exigirId: true };
  const r = await executar({ corpo, recurso, operador, presenca });
  if (r?.erro) return erro(r.erro, 409);
  return NextResponse.json({ success: true, ...r, operador: { id: operador.id, nome: operador.nome, cracha: operador.cracha } });
}
