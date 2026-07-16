import { requireAcesso } from "@/lib/session";
import { TIPOS_REUNIOES } from "@/lib/reunioes-acesso";
import ReunioesClient from "./ReunioesClient";

export const dynamic = "force-dynamic";

// Aberto a qualquer usuário do portal: os envolvidos precisam voltar na ata pra
// responder as atividades. Criar/editar/enviar é gated por podeGerenciar na API.
export default async function ReunioesPage() {
  await requireAcesso({ tipos: TIPOS_REUNIOES });
  return <ReunioesClient />;
}
