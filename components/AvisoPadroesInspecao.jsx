import { grauNaNorma } from '@/lib/pintura-campos';

const CAMPOS = {
  PINTURA: 'grau de limpeza, abrasivo e escolhas do esquema de pintura',
  VISUAL_SOLDA: 'técnica e critério de inspeção',
  LP: 'tipo de penetrante, método, fabricante, removedor, revelador e critério',
  ULTRASSOM: 'acoplante, bloco padrão, local e critérios',
};
export default function AvisoPadroesInspecao({ tipo, resultados = {} }) {
  if (!CAMPOS[tipo]) return null;
  const plp = resultados.padroesInspecao?.plp;
  const diverge = tipo === 'PINTURA' && plp?.limpeza && resultados.limpeza && plp.limpeza !== resultados.limpeza;
  return <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-torg-dark">
    <p className="font-semibold">Padrões desta OP — você pode alterar</p>
    <p>Suas escolhas salvas serão usadas nos próximos relatórios desta OP. Medições e resultados são individuais.</p>
    <details className="mt-1"><summary className="cursor-pointer">Quais escolhas ficam salvas?</summary><p className="mt-1">{CAMPOS[tipo]}.</p></details>
    {diverge && <p role="status" className="mt-2 font-semibold text-amber-800">Atenção: selecionado {grauNaNorma(resultados.limpeza)}; o PLP deste relatório especifica {grauNaNorma(plp.limpeza)}. Confira essa diferença. O PLP não será alterado.</p>}
  </div>;
}
