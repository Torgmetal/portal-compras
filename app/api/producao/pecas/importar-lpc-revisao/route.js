// GET  /api/producao/pecas/importar-lpc-revisao            → lista as pastas de OP (nível 1)
// GET  ?browse=<path>                                      → navega uma pasta (subpastas + LPC)
// GET  ?op=<pasta da OP>                                   → LPC dessa OP (da pasta salva, ou busca)
// POST { acao:"salvar-pasta", opPasta, pastaPath }         → salva o caminho da pasta de LPC da OP
// POST { acao:"remover-pasta", opPasta }                   → remove o caminho salvo
// POST { pasta, obra, permitirDowngrade? }                 → importa a revisão da obra (merge)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  listarPastasOp, buscarLpcDaOp, baixarLpcRows, resolveServidorDriveId,
  navegarPasta, lpcsDaPasta,
} from "@/lib/sharepoint-lpc";
import { parseLPC } from "@/lib/parse-lpc";
import { importarLpcMerge } from "@/lib/importar-lpc-merge";
import { digitosObra } from "@/lib/prazo-producao";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

function statusDo(e) {
  if (e.message === "Unauthorized") return 401;
  if (e.message === "Forbidden") return 403;
  return e.status || 500;
}

// Resolve os LPC de uma OP: usa a pasta salva (1 listagem, sem ambiguidade) ou,
// se não houver, cai na busca automática.
async function lpcDaOp(driveId, opPasta) {
  const salva = await prisma.opLpcPasta.findUnique({ where: { opPasta } });
  if (salva) return { obras: await lpcsDaPasta(driveId, salva.pastaPath), pastaSalva: salva.pastaPath };
  return { obras: await buscarLpcDaOp(driveId, opPasta), pastaSalva: null };
}

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  const sp = new URL(req.url).searchParams;
  const opPasta = (sp.get("op") || "").trim();
  const browse = (sp.get("browse") || "").trim();

  // Navegar uma pasta (navegador de pastas).
  if (browse) {
    try {
      const driveId = await resolveServidorDriveId();
      if (!driveId) return NextResponse.json({ error: "Drive SERVIDOR não resolvido." }, { status: 503 });
      const nav = await navegarPasta(driveId, browse);
      return NextResponse.json(nav);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: statusDo(e) });
    }
  }

  // Sem ?op → lista as pastas de OP + marca quais têm caminho salvo.
  if (!opPasta) {
    try {
      const { ops, base } = await listarPastasOp();
      const salvas = await prisma.opLpcPasta.findMany({ where: { opPasta: { in: ops.map((o) => o.pasta) } } });
      const mapa = new Map(salvas.map((s) => [s.opPasta, s.pastaPath]));
      return NextResponse.json({ base, ops: ops.map((o) => ({ ...o, pastaSalva: mapa.get(o.pasta) || null })) });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: statusDo(e) });
    }
  }

  // Com ?op → LPC dessa OP (da pasta salva ou da busca) cruzados com a rev carregada.
  try {
    const driveId = await resolveServidorDriveId();
    if (!driveId) return NextResponse.json({ error: "Drive SERVIDOR não resolvido." }, { status: 503 });
    const { obras: achados, pastaSalva } = await lpcDaOp(driveId, opPasta);
    const carregadas = achados.length
      ? await prisma.lpcRevisao.findMany({ where: { opNumero: { in: achados.map((a) => a.obra) } } })
      : [];
    const atual = new Map(carregadas.map((c) => [c.opNumero, c]));
    const obras = achados.map((a) => {
      const at = atual.get(a.obra);
      return {
        obra: a.obra, revDisponivel: a.rev, arquivo: a.nome,
        revAtual: at ? at.revisao : null, itensAtual: at ? at.itens : null,
        novidade: !at || a.rev > at.revisao,
      };
    });
    return NextResponse.json({ pasta: opPasta, pastaSalva, obras });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: statusDo(e) });
  }
}

const importSchema = z.object({
  pasta: z.string().min(1, "Informe a pasta da OP"),
  obra: z.string().min(1, "Informe a obra"),
  permitirDowngrade: z.boolean().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  let raw;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // ── Salvar / remover o caminho da pasta de LPC da OP ──────────────────
  if (raw.acao === "salvar-pasta") {
    const opPasta = String(raw.opPasta || "").trim();
    const pastaPath = String(raw.pastaPath || "").trim();
    if (!opPasta || !pastaPath) return NextResponse.json({ error: "Informe a OP e a pasta." }, { status: 400 });
    await prisma.opLpcPasta.upsert({
      where: { opPasta },
      create: { opPasta, pastaPath, salvoPorId: user.id },
      update: { pastaPath, salvoEm: new Date(), salvoPorId: user.id },
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "SALVAR_PASTA_LPC", entity: "OpLpcPasta", entityId: opPasta, diff: { pastaPath } } }).catch(() => {});
    return NextResponse.json({ ok: true, pastaPath });
  }
  if (raw.acao === "remover-pasta") {
    const opPasta = String(raw.opPasta || "").trim();
    await prisma.opLpcPasta.deleteMany({ where: { opPasta } });
    return NextResponse.json({ ok: true });
  }

  // ── Importar a revisão de uma obra ────────────────────────────────────
  let body;
  try { body = importSchema.parse(raw); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const obra = body.obra.trim().toUpperCase();

  let driveId, achados;
  try {
    driveId = await resolveServidorDriveId();
    if (!driveId) return NextResponse.json({ error: "Drive SERVIDOR não resolvido." }, { status: 503 });
    achados = (await lpcDaOp(driveId, body.pasta)).obras;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: statusDo(e) });
  }

  const item = achados.find((a) => a.obra === obra);
  if (!item) return NextResponse.json({ error: `Nenhum LPC da obra ${obra} encontrado na pasta ${body.pasta}.` }, { status: 404 });

  // Guarda anti-downgrade: não rebaixa a revisão carregada sem confirmação.
  const atual = await prisma.lpcRevisao.findUnique({ where: { opNumero: obra } });
  if (atual && item.rev < atual.revisao && !body.permitirDowngrade) {
    return NextResponse.json({
      error: `O SharePoint tem R${String(item.rev).padStart(2, "0")}, abaixo da carregada R${String(atual.revisao).padStart(2, "0")}.`,
      downgrade: true, revDisponivel: item.rev, revAtual: atual.revisao,
    }, { status: 409 });
  }

  let parsed;
  try {
    const rows = await baixarLpcRows(driveId, item.id);
    parsed = parseLPC(rows);
    if (parsed.erro) throw new Error(parsed.erro);
  } catch (e) {
    return NextResponse.json({ error: `Falha ao ler ${item.nome}: ${e.message}` }, { status: 422 });
  }

  const resultado = await importarLpcMerge(parsed, { userId: user.id, revisao: item.rev, arquivo: item.nome });
  if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 422 });

  // Ao selecionar/importar a LPC, a demanda do Planejamento dessa obra sai de
  // "Solicitada" e vira "Programada" (regra do Vitor) — o PCP assumiu a programação.
  try {
    const dig = digitosObra(obra);
    const abertas = await prisma.solicitacaoProducao.findMany({
      where: { status: "SOLICITADA" }, select: { id: true, opNumero: true },
    });
    const alvo = abertas.filter((s) => s.opNumero === obra || digitosObra(s.opNumero) === dig).map((s) => s.id);
    if (alvo.length) {
      await prisma.solicitacaoProducao.updateMany({ where: { id: { in: alvo } }, data: { status: "PROGRAMADA" } });
      await prisma.auditLog.create({
        data: {
          userId: user.id, action: "SOLICITACAO_PRODUCAO_PROGRAMADA", entity: "SolicitacaoProducao",
          entityId: alvo[0], diff: { obra, gatilho: "import-lpc", afetadas: alvo.length },
        },
      }).catch(() => {});
    }
  } catch {}

  return NextResponse.json({ ok: true, arquivo: item.nome, ...resultado });
}
