// GET /api/engenharia-ia/app/grd?op=&desde=<ISO> — o app confirma que a GRD (FORM 09) da obra entrou no portal.
// Só leitura. `ultimaLeitura` é o último sucesso do cron "grd-sincronizar" (11/17/21h): o app usa para
// explicar por que uma GRD recém-emitida ainda não apareceu, em vez de dizer que ela não existe.
import { prisma } from "@/lib/prisma";
import { comAparelho } from "@/lib/ia-aparelho-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NC = { "cache-control": "no-store" };
const falha = (status, error) => Response.json({ ok: false, error }, { status, headers: NC });

// ⚠ "89" e "089" são a mesma obra gravada por importadores diferentes. Só estas duas formas: "189" NÃO casa.
function variantesDaOp(op) {
  const d = String(op).trim().replace(/^0+/, "");
  if (!/^\d+$/.test(d)) return [String(op).trim()];
  return [...new Set([d, d.padStart(3, "0")])];
}

export async function GET(req) {
  return comAparelho(req, async () => {
    const q = new URL(req.url).searchParams;
    const op = q.get("op")?.trim();
    if (!op) return falha(400, "Informe a OP (?op=).");
    const where = { opNumero: { in: variantesDaOp(op) } };
    const desde = q.get("desde");
    if (desde) {
      const d = new Date(desde);
      if (Number.isNaN(d.getTime())) return falha(400, "desde deve ser uma data ISO.");
      // ⚠ updatedAt, não createdAt: o cron reprocessa a GRD quando o arquivo muda na pasta (nova revisão,
      // item corrigido) — pelo createdAt o app perguntaria "mudou algo desde ontem?" e ouviria que não.
      where.updatedAt = { gte: d };
    }
    const [grds, beat] = await Promise.all([
      prisma.grdEngenharia.findMany({ where, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: 200 }),
      prisma.cronHeartbeat.findUnique({ where: { job: "grd-sincronizar" } }),
    ]);
    return Response.json({
      ok: true,
      grds: grds.map((g) => ({
        numero: g.numero, revisao: g.revisao, data: g.data ? g.data.toISOString() : null,
        itens: (Array.isArray(g.itens) ? g.itens : []).map((i) => ({ documento: i.documento, rev: i.revisao, descricao: i.descricao })),
      })),
      ultimaLeitura: beat?.lastOkAt ? beat.lastOkAt.toISOString() : null,
    }, { headers: NC });
  });
}
