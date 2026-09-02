import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Box } from "lucide-react";
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

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-torg-dark flex items-center gap-2">
          <Box size={20} className="text-torg-blue" /> Obra em 3D
        </h1>
        <p className="text-xs text-torg-gray mt-1 max-w-3xl">
          O modelo que a Engenharia exportou do Tekla, lido direto da pasta da obra. Clique numa peça
          para ver material, croquis do conjunto, o R de cada posição, onde ela está na fábrica e em
          que dia foi liberada.
        </p>
      </div>
      <ModeloClient ops={ops} />
    </div>
  );
}
