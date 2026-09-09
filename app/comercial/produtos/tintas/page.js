import { requireRole } from '@/lib/session';
import BoletinsClient from './BoletinsClient';
export const dynamic='force-dynamic';
export const metadata={title:'Produtos e boletins de tintas — Torg Metal'};
export default async function Page(){
  await requireRole(['ADMIN','COMERCIAL','COMPRAS','QUALIDADE']);
  return <BoletinsClient/>;
}
