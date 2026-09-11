import { z } from "zod";

export const pecasInformadasSchema = z.array(z.object({
  marca: z.string().trim().toUpperCase().min(1, "Informe a marca de cada peça.").max(40, "A marca deve ter até 40 caracteres."),
  quantidade: z.number({ error: "Informe a quantidade de cada peça." }).int("A quantidade deve ser inteira.").positive("A quantidade deve ser maior que zero.").max(1000000),
})).min(1, "Informe ao menos uma peça.").max(2000).refine(
  pecas => new Set(pecas.map(p => p.marca)).size === pecas.length,
  "Há marcas repetidas. Mantenha uma linha por marca e ajuste a quantidade.",
);

export function pecasDoRelatorio(rel) {
  const salvas = Array.isArray(rel.resultados?.pecasInformadas) ? rel.resultados.pecasInformadas : [];
  return (Array.isArray(rel.marcas) ? rel.marcas : []).map(marca => ({
    marca, quantidade: salvas.find(p => p.marca === marca)?.quantidade ?? "",
  }));
}
export const textoPeca = p => `${p.marca} (${p.quantidade} un.)`;
