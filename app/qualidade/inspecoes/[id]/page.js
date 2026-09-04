import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import RelatorioDetalheClient from "./RelatorioDetalheClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório de inspeção — Qualidade" };

// ⚠ ver o comentário da lista: o perfil de campo entra aqui para PREENCHER. Esta tela só preenche
// (o PATCH do relatório) — emitir, enviar para assinatura e excluir estão na lista, e lá o botão
// só aparece para quem responde pelo documento.
export default async function RelatorioPage({ params }) {
  await requireRole(PERFIS_CAMPO);
  const { id } = await params;
  return <RelatorioDetalheClient id={id} />;
}
