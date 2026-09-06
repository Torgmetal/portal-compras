// PCP › Fila do Acabamento — o que terminou o setor anterior e ainda não passou por aqui.
//
// ⚠ NÃO CONFUNDIR COM /pcp/acabamento, que é a Programação (SetorClient: quem ESTÁ no setor, com
// apontamento e furos). Esta é a FILA DE ENTRADA, e o nome espelha /pcp/fila-corte e
// /pcp/fila-solda de propósito: mesmo papel, um setor adiante.
import { requireRole } from "@/lib/session";
import FilaSetorClient from "@/app/pcp/fila-setor/FilaSetorClient";

export const metadata = { title: "Workspace Torg — PCP · Fila do Acabamento" };
export const dynamic = "force-dynamic";

export default async function PcpFilaAcabamento() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-torg-dark">Fila do Acabamento</h1>
        <p className="text-xs text-torg-gray mt-0.5">
          Entra sozinho o que termina a solda — escolha a obra e mande para a bancada.
        </p>
      </div>
      <FilaSetorClient setor="ACABAMENTO" />
    </div>
  );
}
