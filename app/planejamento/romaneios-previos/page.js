import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import RomaneiosPreviosPlanejamentoClient from "./RomaneiosPreviosPlanejamentoClient";

// Montar romaneio prévio a partir das peças, no Planejamento.
//
// Vitor (24/08/2026): "crie uma forma de selecionar várias peças para compor em um romaneio prévio
// no planejamento".
//
// ⚠⚠ O COMPOSITOR JÁ EXISTIA — SÓ NÃO TINHA PORTA NO PLANEJAMENTO. `ConsultaExpedicao` é a tela de
// marcar peça a peça (ou importar a relação em Excel/PDF) e fechar o romaneio prévio; ela vive na
// aba Expedição da OP, no Comercial. Reescrever aqui daria duas telas montando o MESMO romaneio,
// com numeração compartilhada e regras que divergiriam na primeira correção.
//
// ⚠ As rotas que ela usa já aceitavam PLANEJAMENTO (romaneios-previos, lista-expedicao/marcas,
// baixa-expedicao) — quem estava de fora era a navegação, não a permissão.
export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento — Romaneios prévios" };

export default async function RomaneiosPreviosPlanejamentoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PCP", "EXPEDICAO"]);

  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });

  return <RomaneiosPreviosPlanejamentoClient ops={JSON.parse(JSON.stringify(ops))} />;
}
