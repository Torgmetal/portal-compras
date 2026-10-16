// GET /api/engenharia-ia/app/documentos/arquivo?fonte=&op=&caminho=|id= — bytes do documento (teto 30 MB).
import { z } from "zod";
import { comAparelho } from "@/lib/ia-aparelho-auth";
import { FONTES, baixarDocumento } from "@/lib/app-documentos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const consulta = z.object({
  fonte: z.enum(FONTES),
  op: z.string().trim().max(20).optional(),
  caminho: z.string().max(500).optional(),
  id: z.string().max(100).optional(),
}).refine((v) => v.fonte !== "obra" || v.op, { message: "op é obrigatório para a fonte obra" })
  .refine((v) => v.fonte === "procedimentos" ? v.id : v.caminho, { message: "informe id (procedimentos) ou caminho" });

// encodeURIComponent deixa `'()*!` passarem, e o RFC 5987 não os aceita sem escape.
const nomeRfc5987 = (n) => encodeURIComponent(n).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const NC = { "cache-control": "no-store" };

export async function GET(req) {
  return comAparelho(req, async () => {
    const sp = new URL(req.url).searchParams;
    const p = consulta.safeParse(Object.fromEntries(["fonte", "op", "caminho", "id"].map((k) => [k, sp.get(k) ?? undefined])));
    if (!p.success) return Response.json({ ok: false, error: p.error.issues[0]?.message || "parâmetros inválidos" }, { status: 400, headers: NC });
    try {
      const { stream, nome, tamanho, contentType } = await baixarDocumento({ fonte: p.data.fonte, opNumero: p.data.op, caminho: p.data.caminho, id: p.data.id });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": contentType, "content-disposition": `attachment; filename*=UTF-8''${nomeRfc5987(nome)}`, "content-length": String(tamanho), ...NC },
      });
    } catch (e) {
      if (e.status) return Response.json({ ok: false, error: e.message }, { status: e.status, headers: NC });
      throw e;
    }
  });
}
