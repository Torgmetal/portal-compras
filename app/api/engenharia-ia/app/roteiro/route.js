// GET/POST /api/engenharia-ia/app/roteiro — roteiro de 6 etapas da obra, pelo token do aparelho.
// As regras de transição moram em lib/roteiro-engenharia.js; aqui só há leitura, validação e gravação.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { comAparelho } from "@/lib/ia-aparelho-auth";
import { comTravaDaObra } from "@/lib/conferencia-peca";
import { ETAPAS, STATUS, podeMudar, mesclarDivergencias } from "@/lib/roteiro-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NC = { "cache-control": "no-store" };
const falha = (status, error, extra = {}) => Response.json({ ok: false, error, ...extra }, { status, headers: NC });

const divergencia = z.object({
  id: z.string().min(1).max(100),
  descricao: z.string().max(2000),
  fonte: z.string().max(200),
  evidencia: z.string().max(2000).nullable().default(null),
  situacao: z.enum(["aberta", "resolvida", "aceita", "nao_verificada"]),
});
const corpo = z.object({
  opNumero: z.string().min(1).max(10),
  etapa: z.number().int().min(1).max(6),
  fase: z.number().int().min(0).nullable().default(null),
  para: z.enum(STATUS),
  divergencias: z.array(divergencia).max(500).optional(),
  observacao: z.string().max(2000).optional(),
});

// ⚠ A FORM21 e o app falam "89"; a OP está cadastrada como "089". Exato primeiro, depois pelo número
// ignorando zero à esquerda — e só liga quando o casamento é ÚNICO (mesma regra de lib/importar-le-core.js).
async function acharOP(opNumero) {
  const exata = await prisma.oP.findUnique({ where: { numero: opNumero }, select: { id: true, numero: true } });
  if (exata) return exata;
  const m = opNumero.match(/\d+/);
  if (!m) return null;
  const alvo = parseInt(m[0], 10);
  const cands = await prisma.oP.findMany({ select: { id: true, numero: true } });
  const casa = cands.filter((o) => { const mm = String(o.numero).match(/\d+/); return mm && parseInt(mm[0], 10) === alvo; });
  return casa.length === 1 ? casa[0] : null;
}

const resumo = (r) => ({
  status: r?.status ?? "PENDENTE", divergencias: r?.divergencias ?? [], observacao: r?.observacao ?? null,
  aceitoPorId: r?.aceitoPorId ?? null, aceitoEm: r?.aceitoEm ?? null,
});

// Roda dentro da transação travada por OP: a regra olha o estado que vai ser alterado, e duas chamadas da mesma
// OP não leem o mesmo retrato velho. Lança `{recusa}` para a rota responder 409.
async function gravar(tx, { op, etapa, fase, para, divergencias, observacao, user, aparelho }) {
  const registros = await tx.roteiroEtapa.findMany({ where: { opId: op.id } });
  const atual = registros.find((r) => r.etapa === etapa && (r.fase ?? null) === fase) ?? null;
  const mescla = mesclarDivergencias(atual?.divergencias, divergencias);
  if (!mescla.ok) throw Object.assign(new Error(mescla.motivo), { recusa: mescla });
  const regra = podeMudar(registros, { etapa, fase, para, divergencias: mescla.lista });
  if (!regra.ok) throw Object.assign(new Error(regra.motivo), { recusa: regra });

  const dados = { status: para, atualizadoPorId: user.id, divergencias: mescla.lista };
  if (observacao !== undefined) dados.observacao = observacao;
  // Regra 4: quem aceita é o dono do aparelho, só na transição para CONCLUIDA. Sair de CONCLUIDA (reabrir)
  // apaga o aceite: a linha não pode continuar parecendo aceita.
  if (para === "CONCLUIDA") { dados.aceitoPorId = user.id; dados.aceitoEm = new Date(); }
  else if (atual?.status === "CONCLUIDA") { dados.aceitoPorId = null; dados.aceitoEm = null; }

  const registro = atual
    ? await tx.roteiroEtapa.update({ where: { id: atual.id }, data: dados })
    : await tx.roteiroEtapa.create({ data: { opId: op.id, etapa, fase, ...dados } });
  await tx.auditLog.create({
    data: {
      userId: user.id, action: "ROTEIRO_ENGENHARIA", entity: "RoteiroEtapa", entityId: registro.id,
      diff: { antes: resumo(atual), depois: { ...resumo(registro), etapa, fase, opNumero: op.numero }, aparelhoId: aparelho.id },
    },
  });
  return registro;
}

export async function GET(req) {
  return comAparelho(req, async () => {
    const opNumero = new URL(req.url).searchParams.get("op")?.trim();
    if (!opNumero) return falha(400, "Informe a OP (?op=).");
    const op = await acharOP(opNumero);
    if (!op) return falha(404, "OP não encontrada no portal.");
    const registros = await prisma.roteiroEtapa.findMany({ where: { opId: op.id }, orderBy: [{ etapa: "asc" }, { fase: "asc" }] });
    const etapas = ETAPAS.map((e) => ({ ...e, registros: registros.filter((r) => r.etapa === e.n) }));
    return Response.json({ ok: true, op: { id: op.id, numero: op.numero }, etapas }, { headers: NC });
  });
}

export async function POST(req) {
  return comAparelho(req, async ({ aparelho, user }) => {
    let raw;
    try { raw = await req.json(); } catch { return falha(400, "Corpo inválido: envie JSON."); }
    const p = corpo.safeParse(raw);
    if (!p.success) return falha(400, p.error.issues[0]?.message || "Dados inválidos.");
    const { etapa, fase, para, divergencias, observacao } = p.data;
    const op = await acharOP(p.data.opNumero.trim());
    if (!op) return falha(404, "OP não encontrada no portal.");

    try {
      const salvo = await comTravaDaObra(prisma, op.id, (tx) => gravar(tx, { op, etapa, fase, para, divergencias, observacao, user, aparelho }));
      return Response.json({ ok: true, registro: salvo }, { headers: NC });
    } catch (e) {
      if (e.recusa) return falha(409, e.recusa.motivo, e.recusa.pendentes ? { pendentes: e.recusa.pendentes } : {});
      if (e.code === "P2002") return falha(409, "Outra alteração desta etapa acabou de ser gravada: recarregue o roteiro.");
      throw e; // 500 genérico em comAparelho
    }
  });
}
