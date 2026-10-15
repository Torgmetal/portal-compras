// Os pedaços do corpo do aditivo que a criação (app/api/comercial/op/[id]/aditivo) e a edição
// (app/api/comercial/aditivo/[id]) aceitam do mesmo jeito.
import { z } from "zod";

// A receita digitada à mão na abertura do aditivo (lib/receita-aditivo → linhasParaEnvio).
// Vitor (17/09/2026): "para o caso de ter que digitar na mão precisamos de algumas coisas,
// informar o peso, unitário e a descrição". O `id` só vem na edição (a linha já gravada).
export const receitaSchema = z.object({
  id: z.string().max(40).optional().nullable(),
  categoria: z.string().min(1).max(40),
  descricao: z.string().trim().min(1).max(200),
  tipoPreco: z.enum(["VALOR", "POR_UNIDADE"]),
  unidade: z.string().trim().max(20).optional().nullable(),
  quantidade: z.number().min(0).optional().nullable(),
  valorUnitario: z.number().min(0).optional().nullable(),
  valor: z.number().min(0),
});

// ⚠⚠ ADITIVO É UM PEDIDO NOVO DO CLIENTE (Vitor, 16/09/2026): a OC/AF/PC dele, com itens e TAGs, nas
// palavras do cliente (lib/referencias-cliente), e um valor contratado próprio.
export const pedidoSchema = z.object({
  codigo: z.string().trim().max(120).optional().nullable(),
  descricao: z.string().trim().max(300).optional().nullable(),
  valor: z.union([z.number(), z.string()]).optional().nullable(),
  data: z.string().optional().nullable(),
  revisao: z.string().trim().max(40).optional().nullable(),
  itens: z.union([z.array(z.any()), z.string()]).optional().nullable(),
  tags: z.union([z.array(z.any()), z.string()]).optional().nullable(),
});

// Aditivo tem prazo e orçamento PRÓPRIOS — Vitor (19/08): "quando criamos um aditivo precisa ser
// divulgado a todos os setores as informações desse aditivo… importar proposta e planilha de
// estudo… importante ter data de início e fim também".
export const cabecalhoAditivo = {
  descricao: z.string().trim().min(1, "Descreva o que muda com este aditivo"),
  dataInicio: z.string().nullable().optional(),
  dataFimPrevista: z.string().nullable().optional(),
  orcamentoPasta: z.string().nullable().optional(),
  orcamentoRef: z.string().nullable().optional(),
  propostas: z.any().nullable().optional(),
  estudoArquivo: z.any().nullable().optional(),
  estudoDados: z.any().nullable().optional(),
  pedido: pedidoSchema.optional().nullable(),
  receitas: z.array(receitaSchema).max(50).optional().nullable(),
  valor: z.number().min(0).optional().nullable(),
};
