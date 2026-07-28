// Detalhe da OP DENTRO do Portal de Engenharia (mantém a lateral da Engenharia,
// não migra pro Comercial). Reaproveita o carregamento + a UI do /comercial/[id];
// só o "Voltar" aponta pra lista de OPs da Engenharia.
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { carregarDetalheOP, DetalheOPUI } from "@/app/comercial/[id]/page";

export default async function OPEngenhariaDetalhe({ params }) {
  const user = await requireUser();
  const data = await carregarDetalheOP(params.id, user);
  if (!data) notFound();
  return <DetalheOPUI data={data} user={user} voltarHref="/engenharia/ops" />;
}
