import { redirect } from "next/navigation";

// A programação antiga foi inativada no PCP; links salvos seguem para a tela de trabalho.
export default function PcpPecasCorte() {
  redirect("/pcp/producao");
}
