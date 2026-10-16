// GET /api/engenharia-ia/app/documentos?fonte=&op=&caminho= — lista procedimentos, pasta da obra ou NORMAS.
import { z } from "zod";
import { comAparelho } from "@/lib/ia-aparelho-auth";
import { FONTES, listarDocumentos } from "@/lib/app-documentos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const consulta = z.object({
  fonte: z.enum(FONTES),
  op: z.string().trim().max(20).optional(),
  caminho: z.string().max(500).optional(),
}).refine((v) => v.fonte !== "obra" || v.op, { message: "op é obrigatório para a fonte obra" });

const NC = { "cache-control": "no-store" };

export async function GET(req) {
  return comAparelho(req, async () => {
    const sp = new URL(req.url).searchParams;
    const p = consulta.safeParse({ fonte: sp.get("fonte") ?? undefined, op: sp.get("op") ?? undefined, caminho: sp.get("caminho") ?? undefined });
    if (!p.success) return Response.json({ ok: false, error: p.error.issues[0]?.message || "parâmetros inválidos" }, { status: 400, headers: NC });
    try {
      const { itens } = await listarDocumentos({ fonte: p.data.fonte, opNumero: p.data.op, caminho: p.data.caminho });
      return Response.json({ ok: true, itens }, { headers: NC });
    } catch (e) {
      if (e.status) return Response.json({ ok: false, error: e.message }, { status: e.status, headers: NC });
      throw e; // vira 500 genérico em comAparelho
    }
  });
}
