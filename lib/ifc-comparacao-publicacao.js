import { z } from "zod";

export const comparacaoIfcSchema = z.object({
  publicar: z.boolean(),
  anterior: z.object({ id: z.string().min(1).max(200) }).nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.publicar && !v.anterior) ctx.addIssue({ code: "custom", message: "Selecione o IFC anterior antes de publicar a comparação." });
});

export function comparacaoIfcPublicada(doc) {
  const c = doc?.comparacaoIfc;
  return c?.publicar === true && c.anterior?.id && c.anterior.id !== doc.id
    && /\.ifc$/i.test(doc.nome || "") && /\.ifc$/i.test(c.anterior.nome || "") ? c : null;
}
