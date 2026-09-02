// GET  /api/pcp/liberacao-material?id=…  → a análise de material de uma liberação do Planejamento
// POST /api/pcp/liberacao-material       → informa o R usado num perfil de estoque
//
// Vitor (25/08/2026): "pcp recebe a solicitação, manda separar o material, analisa se está tudo em
// estoque, caso seja usado um material de estoque informa o R usado, e caso não tenha o material
// não libera aquele projeto para preparar".
//
// ⚠ ESTE É O PORTÃO, e ele é informativo até o PCP responder: a rota devolve o que pode ir para a
// impressão e o que está travado, com o motivo. Quem imprime é /api/producao/desenhos — e é lá que
// a lista de peças precisa vir filtrada por `liberaveis`.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { analisarMaterial, pecasLiberaveis } from "@/lib/material-liberacao";
import { casarPerfilComOmie } from "@/lib/casar-omie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ⚠ ALMOXARIFADO entra em 02/09/2026: quem sabe qual fardo dá para tirar é quem está na frente do
// rack. Vitor: "o almoxarifado informa um R". O nome de quem declarou fica gravado na troca.
const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMPRAS", "ALMOXARIFADO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe a liberação." }, { status: 400 });

  const lib = await prisma.liberacaoProducao.findUnique({
    where: { id },
    include: { op: { select: { id: true, numero: true, cliente: true, obra: true } } },
  });
  if (!lib) return NextResponse.json({ error: "Liberação não encontrada." }, { status: 404 });

  // ⚠ `pecaIds` vazio = a frente inteira (liberações feitas antes de a coluna existir).
  const ids = Array.isArray(lib.pecaIds) ? lib.pecaIds : null;
  const pecas = await prisma.pecaConjunto.findMany({
    where: ids?.length
      ? { id: { in: ids } }
      : { opId: lib.opId, fonte: "LPC_IMPORT", opNumero: lib.frente, tipoPeca: { not: "CONJUNTO" } },
    select: { id: true, marca: true, perfil: true, qte: true, pesoTotalKg: true, comprimentoMm: true, tipoPeca: true },
  });

  const { porPerfil, porPeca, resumo } = await analisarMaterial(lib.op.numero, pecas);
  const liberaveis = pecasLiberaveis(pecas, porPeca);

  // ⚠ agrupado por PERFIL: é assim que se separa material no almoxarifado, e é por perfil que o
  // PCP responde "usei o R tal". Peça a peça seriam 1.700 perguntas iguais.
  const perfis = [...porPerfil.values()].map((v) => {
    const doPerfil = pecas.filter((p) => String(p.perfil || "").trim().toUpperCase() === v.perfil.toUpperCase());
    return {
      ...v,
      pecas: doPerfil.length,
      un: doPerfil.reduce((s, p) => s + (Number(p.qte) || 1), 0),
      kg: Math.round(doPerfil.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0)),
    };
  }).sort((a, b) => {
    const ord = { SEM_MATERIAL: 0, ESTOQUE: 1, NA_OP: 2 };
    if (ord[a.estado] !== ord[b.estado]) return ord[a.estado] - ord[b.estado];
    return b.kg - a.kg;
  });

  return NextResponse.json({
    liberacao: {
      id: lib.id, frente: lib.frente, setores: lib.setores, prioridade: lib.prioridade,
      status: lib.status, liberadoEm: lib.liberadoEm.toISOString(), liberadoPorNome: lib.liberadoPorNome,
    },
    op: lib.op, resumo, perfis,
    liberaveis: liberaveis.map((p) => p.id),
    travadas: pecas.filter((p) => !liberaveis.some((l) => l.id === p.id)).map((p) => ({
      id: p.id, marca: p.marca, perfil: p.perfil, kg: Math.round(p.pesoTotalKg || 0),
      motivo: porPeca.get(p.id)?.estado === "SEM_MATERIAL" ? "material não entrou" : "falta informar o R do estoque",
    })),
  });
}

const schema = z.object({
  opNumero: z.string().min(1),
  perfil: z.string().min(1).max(120),
  rUsado: z.string().min(1).max(40),
  rIndicado: z.string().max(40).nullable().optional(),
  motivo: z.string().max(300).nullable().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const op = await prisma.oP.findFirst({ where: { numero: d.opNumero }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // ⚠ o R informado pode ser de OUTRA obra — é exatamente o caso do material de estoque. Não se
  // valida contra o CMR da OP, senão a resposta correta seria recusada.
  const existe = await prisma.documentoQualidade.findFirst({
    where: { categoria: "MATERIAL", importRef: d.rUsado.trim() },
    select: { id: true, importRef: true, nome: true, opNumero: true, pesoKg: true, numeroCorrida: true },
  });
  if (!existe) return NextResponse.json({ error: `O R ${d.rUsado} não existe no CMR.` }, { status: 400 });

  // ⚠⚠ O R TEM DE SER DO MESMO MATERIAL. Vitor (25/08/2026): "se deixarmos isso dessa maneira não
  // vamos criar uma maneira de burlarmos e informar um material que não era destinado a essa obra".
  // Sem esta checagem dava para digitar o R de uma chapa de 16 num perfil W410 — e o certificado
  // que sai no Data Book apontaria para um aço que a peça não é. É o pior tipo de erro: silencioso
  // e assinado.
  const casa = casarPerfilComOmie(d.perfil, [{ codigo: null, descricao: existe.nome }]);
  if (!casa) {
    return NextResponse.json({
      error: `O R ${existe.importRef} é "${existe.nome}" — não é o material do perfil ${d.perfil}. ` +
             `Informe o R do material certo; se estiver certo e o portal não reconheceu, avise para ajustarmos o cadastro.`,
      naoCasa: true, descricaoDoR: existe.nome,
    }, { status: 400 });
  }

  // ⚠ MESMO R REIVINDICADO POR OUTRA OBRA. O saldo do CMR é recalculado por OP, então duas obras
  // podem apontar para o mesmo fardo sem nenhuma delas ver a outra. Não bloqueia — material de
  // estoque é dividido entre obras mesmo —, mas registra e devolve o aviso, para a conta de quem
  // consumiu o quê não virar invenção depois.
  const outras = await prisma.trocaRastreabilidade.findMany({
    where: { rUsado: d.rUsado.trim(), opNumero: { not: op.numero } },
    select: { opNumero: true, perfil: true, trocadoPorNome: true, createdAt: true },
  });

  const reg = await prisma.trocaRastreabilidade.upsert({
    where: { opNumero_perfil: { opNumero: op.numero, perfil: d.perfil.trim() } },
    create: { opId: op.id, opNumero: op.numero, perfil: d.perfil.trim(), rIndicado: d.rIndicado || null,
              rUsado: d.rUsado.trim(), motivo: (d.motivo || "material de estoque").trim(),
              trocadoPorId: user.id, trocadoPorNome: user.name || null },
    update: { rUsado: d.rUsado.trim(), rIndicado: d.rIndicado || null,
              motivo: (d.motivo || "material de estoque").trim(),
              trocadoPorId: user.id, trocadoPorNome: user.name || null },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "INFORMAR_R_ESTOQUE", entity: "TrocaRastreabilidade", entityId: reg.id,
      diff: { op: op.numero, perfil: d.perfil, rUsado: d.rUsado, materialDe: existe.opNumero,
              descricao: existe.nome, corrida: existe.numeroCorrida, pesoDoR: existe.pesoKg,
              tambemUsadoPor: outras.map((o) => `${o.opNumero}/${o.perfil}`) } },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, perfil: reg.perfil, rUsado: reg.rUsado,
    materialDe: existe.opNumero, descricao: existe.nome, corrida: existe.numeroCorrida,
    pesoDoR: existe.pesoKg,
    // aviso, não erro: o mesmo fardo pode legitimamente atender duas obras
    tambemUsadoPor: outras.map((o) => ({ op: o.opNumero, perfil: o.perfil, por: o.trocadoPorNome })),
  });
}
