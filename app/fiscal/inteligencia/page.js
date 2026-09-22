import { requireAcesso } from "@/lib/session";
import { referenciaAtiva } from "@/lib/fiscal/consulta";
import { CFOPS, OPERACOES, CST_IPI, FAMILIA } from "@/lib/fiscal/cfop";
import InteligenciaFiscalClient from "./InteligenciaFiscalClient";

export const metadata = {
  title: "Workspace Torg — Inteligência Fiscal",
  description: "Consulta de NCM, CFOP e tributos aplicáveis às operações da TORG METAL.",
};

export default async function InteligenciaFiscalPage() {
  await requireAcesso({ modulos: ["FISCAL"] });
  // ⚠ A referência vem do SERVIDOR já na primeira pintura: a tela nunca pode aparecer sem dizer de
  // quando é o dado que ela está servindo.
  const referencia = await referenciaAtiva();
  return (
    <InteligenciaFiscalClient
      referencia={referencia}
      cfops={CFOPS}
      operacoes={OPERACOES}
      cstIpi={CST_IPI}
      familias={Object.values(FAMILIA)}
    />
  );
}
