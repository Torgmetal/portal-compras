// Monta o FORM 08 (PDF) da Análise Crítica de uma OP a partir do banco — usado pela rota do PDF
// e pelo envio ao SharePoint, para os dois emitirem exatamente o mesmo documento.
import { prisma } from "@/lib/prisma";
import { gerarAnaliseCriticaPDF } from "@/lib/analise-critica-pdf";
import { verificacoesAutomaticas, resumo } from "@/lib/analise-critica";

export async function montarForm08(opId) {
  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true, itens: { select: { descricao: true, unidade: true, qtdContratada: true, categoria: true } } } });
  if (!op) return { erro: "OP não encontrada", status: 404 };
  const registro = await prisma.analiseCriticaProjeto.findUnique({ where: { opId: op.id } });
  if (!registro) return { erro: "Salve a análise crítica antes de emitir o FORM 08.", status: 400 };
  const pecas = await prisma.pecaConjunto.findMany({ where: { opId: op.id }, select: { marca: true, fonte: true, tipoPeca: true, pesoTotalKg: true, areaPinturaM2: true, comprimentoMm: true } });
  const { bytes, filename } = await gerarAnaliseCriticaPDF({ op, registro, verificacoes: verificacoesAutomaticas({ itens: op.itens, pecas }), resumo: resumo(registro) });
  return { op, registro, bytes, filename };
}
