import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO, podeFecharRelatorio } from "@/lib/qualidade-campo";
import InspecoesClient from "./InspecoesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspeções — Qualidade" };

// ⚠ O INSPETOR TAMBÉM PREENCHE NO COMPUTADOR. Vitor (04/09/2026): "ela precisa ter a tela do
// computador também para preencher". A Lais tem só o módulo QUALIDADE_CAMPO, e esta tela exigia
// QUALIDADE — o módulo inteiro, que abre data book, controle de documentos, auditorias, calibração
// e CMR. Liberar a Qualidade toda para quem mede era pagar caro por uma tela: aqui entra o perfil
// de campo, e só nas telas de inspeção (ver middleware.js).
//
// ⚠ ENTRAR PARA PREENCHER NÃO É PODER FECHAR: emitir, enviar para assinatura e excluir continuam
// de quem responde pelo documento — `podeFecharRelatorio` decide, e o servidor barra de novo.
export default async function InspecoesPage() {
  const user = await requireRole(PERFIS_CAMPO);
  return <InspecoesClient podeFechar={podeFecharRelatorio(user)} />;
}
