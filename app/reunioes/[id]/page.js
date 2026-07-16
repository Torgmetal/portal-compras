import { requireAcesso } from "@/lib/session";
import { TIPOS_REUNIOES } from "@/lib/reunioes-acesso";
import AtaDetalheClient from "./AtaDetalheClient";

export const dynamic = "force-dynamic";

export default async function AtaDetalhePage({ params }) {
  await requireAcesso({ tipos: TIPOS_REUNIOES });
  return <AtaDetalheClient id={params.id} />;
}
