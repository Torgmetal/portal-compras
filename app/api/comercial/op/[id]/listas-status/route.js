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
  const [lpc, le] = await Promise.all([
    prisma.pecaConjunto.count({ where: { opId: op.id, fonte: "LPC_IMPORT" } }),
    prisma.pecaConjunto.count({ where: { opId: op.id, fonte: "LE_IMPORT" } }),
  ]);
  return NextResponse.json({ lpc, le });
}
