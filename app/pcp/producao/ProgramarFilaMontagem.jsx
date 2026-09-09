"use client";
import { useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function ProgramarFilaMontagem({ ids, ocupado, onProgramado }) {
  const [dia, setDia] = useState(() => new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const { showToast } = useStore();
  async function programar() {
    if (!dia || !ids.length) return;
    setSalvando(true); setErro('');
    try {
      const r = await fetch('/api/pcp/gantt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocos: [{ setor: 'MONTAGEM', ids, recurso: null, dia }] }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Não foi possível programar.');
      showToast(`${j.total} conjunto(s) programado(s) na fila sem bancada.`, 'success');
      onProgramado();
    } catch (e) { setErro(e.message || 'Não foi possível programar. Tente novamente.'); }
    finally { setSalvando(false); }
  }
  return <section className="mx-3 mb-3 rounded-lg border border-torg-blue-100 bg-torg-blue-50/50 px-3 py-3 space-y-2" aria-label="Programar montagem sem bancada">
    <div className="flex items-end gap-3 flex-wrap">
      <label className="text-xs text-torg-dark flex flex-col gap-1">Data prevista
        <input type="date" aria-label="Data prevista da montagem" value={dia} onChange={e=>setDia(e.target.value)} disabled={salvando || ocupado} className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white" />
      </label>
      <button type="button" onClick={programar} disabled={salvando || ocupado || !dia} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-torg-blue text-white text-xs font-semibold disabled:opacity-50">
        {salvando ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
        {salvando ? 'Programando…' : `Programar sem bancada (${ids.length})`}
      </button>
      <span className="text-xs text-torg-gray">Mesmo com croquis pendentes. A bancada será liberada após o corte.</span>
    </div>
    {erro && <div role="alert" className="text-xs text-red-700">{erro} <button type="button" onClick={programar} disabled={salvando || ocupado} className="underline disabled:opacity-50">Tentar novamente</button></div>}
  </section>;
}
