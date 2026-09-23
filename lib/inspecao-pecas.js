import { pecasReais } from "./peso-op";
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

/**
 * Quantas peças de cada marca a OP tem — pela LISTA CANÔNICA, nunca pela tabela crua.
 *
 * ⚠⚠ LE E LPC SÃO A MESMA ESTRUTURA. Agente da OP-84 (23/09/2026): os RID-084 saíram com 8/2/2/4/2
 * peças para 4/1/1/2/1 — cada marca tem uma linha `LE_IMPORT` e outra `LPC_IMPORT`, e a soma crua
 * contava as duas. `pecasReais` (lib/peso-op.js) é a régua do portal inteiro: a LE quando existe;
 * sem ela, a LPC sem croqui. Quem chama precisa trazer { fonte, naLE, tipoPeca, pesoTotalKg }.
 */
export function quantidadesPorMarca(pecas) {
  const mapa = Object.create(null);
  for (const p of pecasReais(pecas)) {
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

export const usaQuantidadeInspecao = tipo => tipo === "PINTURA" || tipo === "VISUAL_SOLDA";
export function resultadosComPecas(resultados, pecas) {
  return { ...resultados, pecasInformadas: pecas, qtdPeca: Object.fromEntries(pecas.map(p => [p.marca, p.quantidade])),
    quantidade: String(pecas.reduce((s, p) => s + p.quantidade, 0)), pecas: pecas.map(textoPeca).join(", ") };
}
