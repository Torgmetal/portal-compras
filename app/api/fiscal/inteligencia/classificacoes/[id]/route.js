import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAcesso } from "@/lib/session";
import { aprovar, revogar, substituir } from "@/lib/fiscal/registro-classificacao";

// APROVAR, REVOGAR e SUBSTITUIR — as três transições do registro.
//
// ⚠⚠ NÃO EXISTE "EDITAR" (achado do Codex, 23/09/2026). Depois de aprovada, padrão, código, NCM e
// fundamento são o CONTEÚDO da decisão: mudá-los em lugar apagaria a decisão que já orientou uma
// emissão. Trocar é `substituir`, que revoga a anterior e aprova a nova na mesma transação.
//
// ⚠ Quem propôs PODE aprovar — o time são duas pessoas, e exigir um segundo par de olhos que não
// existe só ensinaria a contornar. Os dois nomes ficam gravados, e a tela mostra quando coincidem.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

const esquema = z.object({
  acao: z.enum(["aprovar", "revogar", "substituir"]),
  motivo: z.string().trim().max(500).optional(),
  nova: z.object({
    codigoProduto: z.string().trim().max(60).optional().nullable(),
    padraoDescricao: z.string().trim().min(3).max(200),
    ncm: z.string().trim().regex(/^\d{4}\.?\d{2}\.?\d{2}$/, "O NCM tem 8 dígitos."),
    fundamento: z.string().trim().min(10, "Escreva o fundamento — é ele que sustenta a decisão."),
    normaChave: z.string().trim().max(120).optional().nullable(),
    observacao: z.string().trim().max(1000).optional().nullable(),
  }).optional(),
}).superRefine((v, ctx) => {
  // ⚠ `z.undefined()` numa união recusaria os DOIS lados na v4 — a regra é `.optional()` + refine.
  if (v.acao === "substituir" && !v.nova) {
    ctx.addIssue({ code: "custom", message: "Informe a classificação que entra no lugar." });
  }
});

// ⚠⚠ CONFLITO DE ÍNDICE É 409 COM EXPLICAÇÃO, NÃO 500. Duas propostas do mesmo padrão aprovadas
// quase juntas: a segunda precisa dizer por que não entrou, senão quem clicou tenta para sempre.
const ERROS = {
  NAO_ENCONTRADA: [404, "Classificação não encontrada."],
  ESTADO_MUDOU: [409, "O estado desta classificação mudou enquanto você olhava a tela — recarregue."],
  JA_EXISTE_APROVADA: [409, "Já existe uma classificação aprovada com este mesmo padrão e escopo. Revogue a anterior ou use “substituir”."],
};

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL"] });
  } catch (e) { return negado(e); }

  let corpo;
  try {
    corpo = esquema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const id = params.id;
    const classificacao = corpo.acao === "aprovar" ? await aprovar(id, user)
      : corpo.acao === "revogar" ? await revogar(id, corpo.motivo, user)
      : await substituir(id, { ...corpo.nova, motivoRevogacao: corpo.motivo }, user);
    return NextResponse.json({ success: true, classificacao });
  } catch (e) {
    const [status, texto] = ERROS[e.message] ?? [400, e.message];
    return NextResponse.json({ success: false, error: texto }, { status });
  }
}
