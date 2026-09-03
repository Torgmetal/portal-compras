// GET /api/comercial/op/{opNumero}/listas-status — a LPC e a LE desta obra têm itens importados?
//
// ⚠ EXISTE PARA UM AVISO, e o aviso existe por um caso real: a OP-112 publicava "LPC · 0 itens"
// com botão de baixar. Sem saber que a lista não foi importada, quem monta o portal recorre a
// publicar o xlsx cru da pasta — que é exatamente como o peso item a item vaza para o cliente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO", "ENGENHARIA"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const num = String((await params)?.id || "").replace(/\D/g, "").padStart(3, "0");
  const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true } });
  if (!op) return NextResponse.json({ lpc: 0, le: 0 });

  // ⚠⚠ A LE SE CONTA NAS PEÇAS, NÃO NA `ListaExpedicao`. São coisas diferentes: `ListaExpedicao` é o
  // registro da Lista Avançada (peso contratado, controle de embarque) e pode não existir; o que o
  // portal PUBLICA são as peças com `fonte: "LE_IMPORT"` — é o que `pecasDaLista` lê.
  //
  // Contando a tabela errada, a OP-112 acusava "Lista de Expedição sem itens importados" com 46
  // peças importadas e a seção funcionando no portal. Aviso que mente sobre um dado correto é pior
  // que aviso nenhum: manda procurar problema onde não há, e a saída "óbvia" é publicar o xlsx cru
  // da pasta — que é exatamente o que este aviso existe para evitar.
  // ⚠⚠ CERTIFICADO LISTADO SEM ARQUIVO ATRÁS. Vitor (03/09/2026), sobre o portal do Davi (OP-089):
  // "ele não está conseguindo acessar os certificados para fazer o download".
  //
  // Medido em 03/09/2026: a OP-089 lista 41 certificados e 19 não têm PDF nenhum vinculado — e não
  // era só ela (114, 094, 113 e 112 estavam em 100%). A linha vem do CMR (importação de planilha),
  // que traz material, corrida e número do certificado; o PDF é casado depois, e o que não casou
  // fica sem arquivo. No portal isso não dá erro: a linha aparece e o botão de baixar simplesmente
  // não é desenhado — o cliente vê o certificado existir e não consegue pegá-lo.
  //
  // ⚠ O AVISO É INTERNO, de propósito. No portal a regra é não declarar furo nosso (a linha fica
  // sem botão e pronto); aqui, na tela de quem publica, o número tem de aparecer antes do envio.
  const [lpc, le, certs, certsSemArquivo] = await Promise.all([
    prisma.pecaConjunto.count({ where: { opId: op.id, fonte: "LPC_IMPORT" } }),
    prisma.pecaConjunto.count({ where: { opId: op.id, fonte: "LE_IMPORT" } }),
    prisma.documentoQualidade.count({ where: { opNumero: num, ativo: true, categoria: "MATERIAL" } }),
    prisma.documentoQualidade.count({
      where: { opNumero: num, ativo: true, categoria: "MATERIAL", sharepointItemId: null, arquivoUrl: null },
    }),
  ]);
  return NextResponse.json({ lpc, le, certs, certsSemArquivo });
}
