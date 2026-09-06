// PCP › Fila da Pintura — o que terminou o jato e ainda não foi pintado.
//
// ⚠ É A ÚLTIMA FILA DO PCP. Vitor (06/09/2026): "após passar pela pintura essas peças não devem
// nem aparecer em fila alguma mais, isso já cai para fora da tela do portal do PCP". Peça pintada
// some daqui e de todas as outras filas — a regra mora em lib/fila-setor.js.
//
// ⚠ A BANCADA AQUI É O GALPÃO: Galpão 1 (estruturas, na Torg) e Galpão 2 (apoio, peças leves).
import { requireRole } from "@/lib/session";
import FilaSetorClient from "@/app/pcp/fila-setor/FilaSetorClient";

export const metadata = { title: "Workspace Torg — PCP · Fila da Pintura" };
export const dynamic = "force-dynamic";

export default async function PcpFilaPintura() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-torg-dark">Fila da Pintura</h1>
        <p className="text-xs text-torg-gray mt-0.5">
          Entra sozinho o que termina o jato — escolha a obra e mande para o galpão.
        </p>
      </div>
      <FilaSetorClient setor="PINTURA" />
    </div>
  );
}
