// A tela "Rastreabilidade" saiu da barra lateral em 30/08/2026 e virou a aba "Certificados" do
// Recebimento CMR. Quem tiver o link antigo salvo cai lá, em vez de num 404.
import { redirect } from "next/navigation";

export default function RastreabilidadePage() {
  redirect("/qualidade/recebimento-cmr");
}
