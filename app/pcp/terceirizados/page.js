import { requireRole } from "@/lib/session";
import TerceirizadosClient from "./TerceirosIntegrado";
import {prisma} from "@/lib/prisma";

export const metadata = { title: "Workspace Torg — Serviço Terceirizado" };
export const dynamic = "force-dynamic";

export default async function TerceirizadosPage() {
  await requireRole(["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  const ops = await prisma.oP.findMany({where:{status:{notIn:["ENCERRADA","CANCELADA"]}},select:{id:true,numero:true,cliente:true,obra:true},orderBy:{numero:"desc"}});
  return <TerceirizadosClient ops={ops} />;
}
