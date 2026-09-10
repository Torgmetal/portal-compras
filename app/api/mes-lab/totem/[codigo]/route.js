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
import { abrirSessao, apontarQuantidade, encerrarSessao, mudarEstado, estadoDoRecurso, ESTADO } from "@/lib/mes/sessao";
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

  const [estado, programado, motivos] = await Promise.all([
    estadoDoRecurso(prisma, recurso.id),
    programadoPara(prisma, recurso),
    // O totem precisa da lista para PERGUNTAR o motivo antes de registrar a parada: `mudarEstado`
    // recusa parada sem motivo, e um botão que sempre dá erro é pior que um botão a menos.
    prisma.mesMotivoParada.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" } }),
  ]);

  // A sessão aberta traz o que já foi apontado nela: é o número que o operador confere antes de
  // encerrar, e sem ele a tela pediria fé.
  let apontado = null;
  if (estado.sessao) {
    const s = await prisma.mesApontamentoQtd.aggregate({
      where: { sessaoId: estado.sessao.id },
      _sum: { boas: true, rejeitadas: true, retrabalho: true },
    });
    apontado = { boas: s._sum.boas || 0, rejeitadas: s._sum.rejeitadas || 0, retrabalho: s._sum.retrabalho || 0 };
  }

  return NextResponse.json({
    success: true,
    recurso: { id: recurso.id, codigo: recurso.codigo, nome: recurso.nome, tipo: recurso.tipo,
               setor: { codigo: recurso.setor.codigo, nome: recurso.setor.nome, cor: recurso.setor.cor } },
    ...estado, apontado, motivos, ...programado,
  });
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
