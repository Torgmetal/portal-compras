// POST /api/engenharia-ia/app/listas — o app Torg Engenharia importa uma LE/LPC no portal pelo token do
// aparelho e recebe o recibo "previsto × gravado" (ver lib/app-listas.js).
import { z } from "zod";
import { comAparelho } from "@/lib/ia-aparelho-auth";
import { importarListaDoApp } from "@/lib/app-listas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // mesma folga da rota da tela: LE grande faz upsert peça a peça

// ⚠ 4 MB de base64, medido ANTES de decodificar: a Vercel corta o corpo em ~4,5 MB e devolve HTML, não
// JSON — melhor o app ouvir um 413 legível daqui do que um erro de parse de lá.
const TETO_BASE64 = 4 * 1024 * 1024;

const corpo = z.object({
  tipo: z.enum(["LE", "LPC"]),
  opNumero: z.string().min(1).max(10),
  revisao: z.string().regex(/^R\d{2}$/, "revisao deve ser no formato R00, R01…"),
  arquivoNome: z.string().min(1).max(260),
  arquivoBase64: z.string().min(1),
  sobrescrever: z.boolean().default(false),
});

const NC = { "cache-control": "no-store" };
const falha = (status, error) => Response.json({ ok: false, error }, { status, headers: NC });

export async function POST(req) {
  return comAparelho(req, async ({ aparelho, user }) => {
    let raw;
    try { raw = await req.json(); } catch { return falha(400, "Corpo inválido: envie JSON."); }
    if (typeof raw?.arquivoBase64 === "string" && raw.arquivoBase64.length > TETO_BASE64) {
      return falha(413, "Arquivo grande demais (máximo 4 MB em base64). Divida a lista ou fale com o administrador do portal.");
    }
    const p = corpo.safeParse(raw);
    if (!p.success) return falha(400, p.error.issues[0]?.message || "Dados inválidos.");

    const { arquivoBase64, ...resto } = p.data;
    try {
      const recibo = await importarListaDoApp({
        ...resto, opNumero: resto.opNumero.trim(), buffer: Buffer.from(arquivoBase64, "base64"),
        userId: user.id, aparelhoId: aparelho.id,
      });
      return Response.json(recibo, { headers: NC });
    } catch (e) {
      if (e.status) return falha(e.status, e.message);
      throw e; // vira 500 genérico em comAparelho
    }
  });
}
