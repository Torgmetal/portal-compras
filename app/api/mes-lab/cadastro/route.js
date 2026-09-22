// O CADASTRO DA FÁBRICA — setores, postos, motivos de parada e operadores.
//
// GET    /api/mes-lab/cadastro?tipo=recursos   → a lista (com o uso de cada registro)
// POST   /api/mes-lab/cadastro                 → cria           { tipo, ...campos }
// PATCH  /api/mes-lab/cadastro                 → altera         { tipo, id, ...campos }
// DELETE /api/mes-lab/cadastro?tipo=&id=       → exclui de vez (só o que nunca foi usado)
//
// ⚠ A REGRA NÃO MORA AQUI. Recusas e normalização estão em `lib/mes/cadastro.js`; esta rota traduz
// HTTP, conta o uso de cada registro e grava. Mesmo desenho do totem e da Conferência de Peça.
//
// ⚠⚠ ÁREA DE LABORATÓRIO. `/mes-lab` é ADMIN-only no `middleware.js`, mas o gate do middleware cobre
// PÁGINA, não API — por isso `requireRole` aqui também (§7.4, pedido do Codex).

import { NextResponse } from "next/server";
import { ambientePedido } from "@/lib/mes/ambiente";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  ehEntidade, normalizarCodigo, recusaDoCadastro, recusaDaExclusao, recusaDaTrocaDeCodigo,
  setoresSemPosto,
} from "@/lib/mes/cadastro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERFIS = ["ADMIN"];
const erro = (msg, status = 400) => NextResponse.json({ success: false, error: msg }, { status });
const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

/** Quantas linhas de histórico dependem de cada registro — é o que decide excluir vs desativar. */
const USO = {
  // Setor não tem histórico próprio; quem o segura são os postos dentro dele.
  setores: (id) => prisma.mesRecurso.count({ where: { setorId: id } }),
  recursos: async (id) => {
    const [eventos, sessoes] = await Promise.all([
      prisma.mesEvento.count({ where: { recursoId: id } }),
      prisma.mesSessao.count({ where: { recursoId: id } }),
    ]);
    return eventos + sessoes;
  },
  motivos: (id) => prisma.mesEvento.count({ where: { motivoId: id } }),
  operadores: async (id) => {
    const [eventos, sessoes] = await Promise.all([
      prisma.mesEvento.count({ where: { operadorId: id } }),
      prisma.mesSessao.count({ where: { operadorId: id } }),
    ]);
    return eventos + sessoes;
  },
};

const NOME_DO_USO = {
  setores: "posto(s) dentro dele", recursos: "apontamento(s)/sessão(ões)",
  motivos: "parada(s) registrada(s)", operadores: "apontamento(s)/sessão(ões)",
};

/** Só os campos que cada cadastro aceita — nada do corpo entra por tabela adentro sem passar aqui. */
const CAMPOS = {
  setores: (d) => ({
    codigo: normalizarCodigo(d.codigo), nome: String(d.nome).trim(),
    ordem: Number(d.ordem), cor: d.cor || null, ativo: d.ativo !== false,
  }),
  // ⚠⚠ `ambiente` entra no cadastro porque é ele que separa os dois mundos: o mesmo "SOLDA 5"
  // pode existir em PROD e em DEMO (`@@unique([codigo, ambiente])`), e é a linha — não o código —
  // que carrega a trava de sessão aberta. Ver `lib/mes/ambiente.js`.
  recursos: (d) => ({
    codigo: normalizarCodigo(d.codigo), nome: String(d.nome).trim(), setorId: d.setorId,
    tipo: d.tipo || "MAQUINA", codigoSyneco: d.codigoSyneco?.trim() || null,
    temTerminal: d.temTerminal !== false, ativo: d.ativo !== false,
    ambiente: ambientePedido(d.ambiente),
  }),
  motivos: (d) => ({
    codigo: normalizarCodigo(d.codigo), descricao: String(d.descricao).trim(),
    planejada: !!d.planejada, cor: d.cor || null, ativo: d.ativo !== false,
  }),
  operadores: (d) => ({
    cracha: String(d.cracha).trim(), nome: String(d.nome).trim(), ativo: d.ativo !== false,
    ambiente: ambientePedido(d.ambiente),
  }),
};

const MODELO = {
  setores: () => prisma.mesSetor, recursos: () => prisma.mesRecurso,
  motivos: () => prisma.mesMotivoParada, operadores: () => prisma.mesOperador,
};

const ORDEM = {
  setores: { ordem: "asc" }, recursos: { nome: "asc" },
  motivos: { descricao: "asc" }, operadores: { nome: "asc" },
};

/**
 * Os setores do MES que o Gantt programa — ver `setoresSemPosto`.
 *
 * ⚠ O Gantt ainda chama a Preparação de CORTE (as colunas de `PecaConjunto` são `corteDia…`), e a
 * Expedição não é setor de apontamento: ela recebe, não produz.
 */
const SETORES_PROGRAMADOS = ["PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];

export async function GET(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const tipo = new URL(req.url).searchParams.get("tipo") || "recursos";
  if (!ehEntidade(tipo)) return erro(`Cadastro desconhecido: ${tipo}`);

  // ⚠ Recurso e operador são POR MUNDO; setor e motivo são catálogo comum da fábrica (a cadeia
  // física e as paradas são uma só) — por isso o filtro só se aplica aos dois primeiros.
  const ambiente = ambientePedido(new URL(req.url).searchParams.get("ambiente"));
  if (!ambiente) return erro("Ambiente inválido — use PROD ou DEMO.");
  const porAmbiente = tipo === "recursos" || tipo === "operadores" ? { where: { ambiente } } : {};

  const lista = await MODELO[tipo]().findMany({
    ...porAmbiente,
    orderBy: ORDEM[tipo],
    ...(tipo === "recursos" ? { include: { setor: { select: { codigo: true, nome: true } } } } : {}),
  });

  // ⚠ O USO VIAJA JUNTO COM A LISTA. É ele que diz à tela se o botão é "excluir" ou só "desativar" —
  // e mostrar "excluir" num registro que o servidor vai recusar é prometer o que não se cumpre.
  const usos = await Promise.all(lista.map((r) => USO[tipo](r.id)));
  const comUso = lista.map((r, i) => ({ ...r, usos: usos[i] }));

  const extra = tipo === "recursos"
    ? { setoresOrfaos: setoresSemPosto(SETORES_PROGRAMADOS, lista) }
    : {};

  return NextResponse.json({ success: true, tipo, lista: comUso, ...extra });
}

export async function POST(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { return erro("Corpo inválido."); }
  const { tipo } = corpo || {};
  if (!ehEntidade(tipo)) return erro(`Cadastro desconhecido: ${tipo}`);

  const recusa = recusaDoCadastro(tipo, corpo);
  if (recusa) return erro(recusa);

  // ⚠ Antes de `CAMPOS`, porque `ambientePedido` devolve `null` no valor fora do domínio — e null
  // numa coluna NOT NULL vira 500 em vez da recusa que a pessoa precisa ler.
  if (!ambientePedido(corpo.ambiente)) return erro("Ambiente inválido — use PROD ou DEMO.");

  try {
    const criado = await MODELO[tipo]().create({ data: CAMPOS[tipo](corpo) });
    return NextResponse.json({ success: true, registro: criado });
  } catch (e) {
    return erro(mensagemDoBanco(e, tipo), 409);
  }
}

export async function PATCH(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { return erro("Corpo inválido."); }
  const { tipo, id } = corpo || {};
  if (!ehEntidade(tipo)) return erro(`Cadastro desconhecido: ${tipo}`);
  if (!id) return erro("Informe qual registro alterar.");

  const atual = await MODELO[tipo]().findUnique({ where: { id } });
  if (!atual) return erro("Registro não encontrado.", 404);

  // Alternar ativo/inativo é o caminho normal e não exige o formulário inteiro.
  if (Object.keys(corpo).length === 3 && "ativo" in corpo) {
    const salvo = await MODELO[tipo]().update({ where: { id }, data: { ativo: !!corpo.ativo } });
    return NextResponse.json({ success: true, registro: salvo });
  }

  const recusa = recusaDoCadastro(tipo, { ...atual, ...corpo });
  if (recusa) return erro(recusa);

  if (tipo === "recursos") {
    const usos = await USO.recursos(id);
    const trava = recusaDaTrocaDeCodigo(atual.codigo, corpo.codigo, usos);
    if (trava) return erro(trava, 409);
  }

  try {
    const salvo = await MODELO[tipo]().update({ where: { id }, data: CAMPOS[tipo]({ ...atual, ...corpo }) });
    return NextResponse.json({ success: true, registro: salvo });
  } catch (e) {
    return erro(mensagemDoBanco(e, tipo), 409);
  }
}

export async function DELETE(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const id = searchParams.get("id");
  if (!ehEntidade(tipo)) return erro(`Cadastro desconhecido: ${tipo}`);
  if (!id) return erro("Informe qual registro excluir.");

  const usos = await USO[tipo](id);
  const recusa = recusaDaExclusao(usos, NOME_DO_USO[tipo]);
  if (recusa) return erro(recusa, 409);

  await MODELO[tipo]().delete({ where: { id } });
  return NextResponse.json({ success: true });
}

/**
 * ⚠ "Unique constraint failed" não diz nada a quem está cadastrando. A colisão de código é o erro
 * MAIS comum aqui (a pessoa recadastra um posto que já existe desativado) e merece a frase certa.
 */
function mensagemDoBanco(e, tipo) {
  if (e?.code === "P2002") {
    return tipo === "operadores"
      ? "Já existe um operador com esse crachá."
      : "Já existe um cadastro com esse código — pode ser um desativado. Procure na lista antes de criar outro.";
  }
  if (e?.code === "P2003") return "O setor escolhido não existe.";
  return e?.message || "Não consegui gravar.";
}
