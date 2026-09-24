import Integrado from '@/app/pcp/terceirizados/TerceirosIntegrado';
import Gantt from '@/app/pcp/producao/GanttProgramacao';
export default function Teste(){return <main style={{padding:24}}><Integrado ops={[{id:'op1',numero:'097',obra:'Obra demonstrativa'}]}/><Gantt/></main>}
