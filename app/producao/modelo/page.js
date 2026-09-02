import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ModeloClient from "./ModeloClient";

export const metadata = { title: "Workspace Torg — Obra em 3D" };
export const dynamic = "force-dynamic";

export default async function PaginaModelo() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA", "QUALIDADE"]);

  // ⚠ só obras vivas: o modelo de obra encerrada não ajuda ninguém a decidir nada, e a lista com
  // todas empurraria a de hoje para o fim do seletor.
  const ops = (await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
  })).sort((a, b) => (b.numero || "").localeCompare(a.numero || "", undefined, { numeric: true }));

  // ⚠ sem cabeçalho nem moldura: o componente ocupa a janela inteira (ver ModeloClient). Título e
  // explicação viviam aqui e empurravam o modelo para meia tela — numa tela de visualizador, o
  // texto é o que sobra, não o que abre.
  return <ModeloClient ops={ops} />;
}
