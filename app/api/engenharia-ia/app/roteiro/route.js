// GET/POST /api/engenharia-ia/app/roteiro — roteiro de 6 etapas da obra, pelo token do aparelho.
// As regras de transição moram em lib/roteiro-engenharia.js; aqui só há leitura, validação e gravação.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { comAparelho } from "@/lib/ia-aparelho-auth";
import { ETAPAS, STATUS, podeMudar } from "@/lib/roteiro-engenharia";

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
      // Interativa: lê o roteiro e grava na mesma transação, para a regra olhar o estado que vai ser alterado.
      const salvo = await prisma.$transaction(async (tx) => {
        const registros = await tx.roteiroEtapa.findMany({ where: { opId: op.id } });
        const atual = registros.find((r) => r.etapa === etapa && (r.fase ?? null) === fase) ?? null;
        // Sem divergências no pedido vale o que já está gravado: a regra 3 olha a lista da etapa, não uma lista vazia.
        const lista = divergencias ?? (Array.isArray(atual?.divergencias) ? atual.divergencias : []);
        const regra = podeMudar(registros, { etapa, fase, para, divergencias: lista });
        if (!regra.ok) throw Object.assign(new Error(regra.motivo), { recusa: regra });

        const dados = { status: para, atualizadoPorId: user.id };
        if (divergencias) dados.divergencias = divergencias;
        if (observacao !== undefined) dados.observacao = observacao;
        // Regra 4: quem aceita é o dono do aparelho, e só na transição para CONCLUIDA.
        if (para === "CONCLUIDA") { dados.aceitoPorId = user.id; dados.aceitoEm = new Date(); }

        const registro = atual
          ? await tx.roteiroEtapa.update({ where: { id: atual.id }, data: dados })
          : await tx.roteiroEtapa.create({ data: { opId: op.id, etapa, fase, ...dados } });
        await tx.auditLog.create({
          data: {
            userId: user.id, action: "ROTEIRO_ENGENHARIA", entity: "RoteiroEtapa",
            entityId: registro.id ?? `${op.id}|${etapa}|${fase ?? "-"}`,
            diff: { antes: atual ? { status: atual.status } : { status: "PENDENTE" }, depois: { status: para, etapa, fase, opNumero: op.numero }, aparelhoId: aparelho.id },
          },
        });
        return registro;
      });
      return Response.json({ ok: true, registro: salvo }, { headers: NC });
    } catch (e) {
      if (e.recusa) return falha(409, e.recusa.motivo, e.recusa.pendentes ? { pendentes: e.recusa.pendentes } : {});
      if (e.code === "P2002") return falha(409, "Outra alteração desta etapa acabou de ser gravada: recarregue o roteiro.");
      throw e; // 500 genérico em comAparelho
    }
  });
}
