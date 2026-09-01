// PCP › Solda — o que saiu da montagem e ainda não foi soldado.
//
// Vitor (01/09/2026): "depois que sair da montagem que foi dado o lançamento de concluído na
// montagem deve ficar uma fila para podermos selecionar o que será feito na solda em cada bancada".
//
// ⚠ NÃO CONFUNDIR COM /pcp/solda, que é a "Programação de Solda" (SetorClient: quem ESTÁ no setor,
// com apontamento e furos). Esta é a FILA DE ENTRADA — quem terminou a montagem e ainda não entrou.
// O nome espelha /pcp/fila-corte de propósito: é o mesmo papel, um setor adiante.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { produzidoPorMarca } from "@/lib/conjuntos-setor";
import { OP_VIVA } from "@/lib/op-viva";
import SoldaClient from "./SoldaClient";
import { CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";

export const metadata = { title: "Workspace Torg — PCP · Solda" };
export const dynamic = "force-dynamic";

export default async function PcpFilaSolda() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);

  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { ...CONJUNTO_MONTAVEL, ...OP_VIVA },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, status: true,
      montagemDiaProgramado: true,
      soldaBancada: true, soldaBancadaEm: true, soldaBancadaPor: true,
      op: { select: { cliente: true, obra: true } },
    },
    take: 4000,
  });
  const marcas = conjuntos.map((c) => c.marca);

  const [montados, soldados, bancadasRaw] = await Promise.all([
    produzidoPorMarca("Montagem", marcas),
    produzidoPorMarca("Solda", marcas),
    // ⚠ AS BANCADAS SAEM DO SYNECO, não de um cadastro novo. SOLDA 1..10 já são o que a fábrica
    // aponta todo dia; inventar uma lista aqui criaria dois nomes para a mesma bancada.
    prisma.mesOrdem.findMany({ where: { setor: "Solda" }, select: { maquina: true }, distinct: ["maquina"] }),
  ]);

  const bancadas = [...new Set(bancadasRaw.map((b) => String(b.maquina || "").trim()))]
    .filter((b) => b && /\d/.test(b)) // descarta o "---" que vem do Syneco
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

  return (
    <SoldaClient
      conjuntosIniciais={JSON.parse(JSON.stringify(conjuntos))}
      montados={montados}
      soldados={soldados}
      bancadas={bancadas}
    />
  );
}
