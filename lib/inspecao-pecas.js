import { z } from "zod";

export const pecasInformadasSchema = z.array(z.object({
  marca: z.string().trim().toUpperCase().min(1, "Informe a marca de cada peça.").max(40, "A marca deve ter até 40 caracteres."),
  quantidade: z.number({ error: "Informe a quantidade de cada peça." }).int("A quantidade deve ser inteira.").positive("A quantidade deve ser maior que zero.").max(1000000),
})).min(1, "Informe ao menos uma peça.").max(2000).refine(
  pecas => new Set(pecas.map(p => p.marca)).size === pecas.length,
  "Há marcas repetidas. Mantenha uma linha por marca e ajuste a quantidade.",
);

const chaveMarca = marca => String(marca || "").trim().toUpperCase();
const quantidadeValida = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;

export function quantidadesPorMarca(pecas) {
  const mapa = Object.create(null);
  for (const p of pecas) {
    const marca = chaveMarca(p.marca);
    if (marca && quantidadeValida(p.qte)) mapa[marca] = (mapa[marca] || 0) + Number(p.qte);
  }
  return mapa;
}

export function pecasDoRelatorio(rel, quantidadesLista = {}) {
  const salvas = Array.isArray(rel.resultados?.pecasInformadas) ? rel.resultados.pecasInformadas : [];
  const snapshot = rel.resultados?.qtdPeca || {};
  return (Array.isArray(rel.marcas) ? rel.marcas : []).map(marca => {
    const chave = chaveMarca(marca);
    const valor = [salvas.find(p => chaveMarca(p.marca) === chave)?.quantidade, snapshot[chave], quantidadesLista[chave]].find(quantidadeValida);
    return { marca, quantidade: valor === undefined ? "" : Number(valor) };
  });
}
export const textoPeca = p => `${p.marca} (${p.quantidade} un.)`;
