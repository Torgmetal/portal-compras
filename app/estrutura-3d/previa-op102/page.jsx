import {notFound} from 'next/navigation';
import Previa from './Previa';
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <Previa/>;}
