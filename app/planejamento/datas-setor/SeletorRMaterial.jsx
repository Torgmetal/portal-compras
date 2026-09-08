"use client";
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const kg = valor => Number(valor).toLocaleString('pt-BR', {maximumFractionDigits: 2}) + ' kg';

export default function SeletorRMaterial({material, opNumero, onClose, onSaved}) {
  const [fardos, setFardos] = useState([]);
  const [busca, setBusca] = useState('');
  const [r, setR] = useState(material.rInformado || '');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true); setErro('');
    (async () => {
      try {
        const res = await fetch(`/api/pcp/liberacao-material?perfil=${encodeURIComponent(material.perfil)}`, {cache: 'no-store', signal: controller.signal});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Não foi possível consultar os Rs.');
        if (!controller.signal.aborted) setFardos(data.fardos || []);
      } catch(e) { if (!controller.signal.aborted) setErro(e.message); }
      finally { if (!controller.signal.aborted) setCarregando(false); }
    })();
    return () => controller.abort();
  }, [material.perfil, tentativa]);
  const visiveis = useMemo(() => {
    const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
    return fardos.filter(f => termos.every(t => normalizar(`R ${f.r} OP ${f.opNumero || ''} ${f.descricao || ''} ${f.corrida || ''}`).includes(t)));
  }, [fardos, busca]);
  const escolhido = fardos.find(f => f.r === r);
  async function salvar() {
    if (!escolhido || salvando) return;
    setSalvando(true); setErro('');
    try {
      const res = await fetch('/api/pcp/liberacao-material', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({opNumero, perfil: material.perfil, rUsado: r, motivo: motivo.trim() || 'material de estoque'}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível gravar o R.');
      await onSaved();
    } catch(e) { setErro(e.message); }
    finally { setSalvando(false); }
  }
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !salvando && onClose()}>
    <section role="dialog" aria-modal="true" aria-labelledby="titulo-seletor-r" className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <header className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
        <div>
          <h3 id="titulo-seletor-r" className="font-bold text-torg-dark">Selecionar R · {material.perfil}</h3>
          <p className="text-xs text-torg-gray mt-1">Escolha o recebimento desta ou de outra OP. O R será aplicado às {material.marcas} marca(s) deste perfil ({kg(material.pesoKg)}).</p>
        </div>
        <button type="button" aria-label="Fechar" disabled={salvando} onClick={onClose} className="ml-auto p-1"><X size={18}/></button>
      </header>
      <div className="px-5 pt-4">
        <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2"><Search size={16} className="text-torg-gray"/><input autoFocus aria-label="Buscar R, OP ou descrição" placeholder="Buscar R, OP, descrição ou corrida" value={busca} onChange={e => setBusca(e.target.value)} className="min-w-0 w-full text-sm outline-none"/></label>
        <p className="text-xs text-torg-gray py-2">{carregando ? 'Consultando recebimentos…' : `${visiveis.length} de ${fardos.length} recebimentos compatíveis · mais antigos primeiro`}</p>
      </div>
      <div className="px-5 overflow-y-auto min-h-0 space-y-2 pb-4">
        {carregando && <Loader2 className="animate-spin mx-auto my-6" aria-label="Carregando"/>}
        {!carregando && !erro && !visiveis.length && <p className="text-sm text-torg-gray py-6">{busca ? 'Nenhum R encontrado para esta busca.' : 'Nenhum recebimento compatível com este perfil no CMR.'}</p>}
        {!carregando && visiveis.map(f => <button key={f.id || f.r} type="button" disabled={salvando} aria-pressed={r === f.r} onClick={() => setR(f.r)} className={`w-full text-left rounded-lg border px-3 py-3 ${r === f.r ? 'border-torg-blue bg-torg-blue-50 ring-1 ring-torg-blue' : 'border-gray-200 hover:border-torg-blue'}`}>
          <span className="flex items-center flex-wrap gap-x-3 gap-y-1"><strong className="text-sm text-torg-dark">R {f.r}</strong><span className="text-xs text-torg-gray">OP {f.opNumero || '—'}</span>{r === f.r && <Check size={15} className="text-torg-blue ml-auto"/>}</span>
          <span className="block text-xs text-torg-gray mt-1">{f.descricao}</span>
          <span className="flex flex-wrap gap-x-3 text-xs text-torg-gray mt-2"><span>Recebido em {f.recebidoEm ? new Date(f.recebidoEm).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : '—'}</span>{f.pesoKg != null && <span>Peso recebido: {kg(f.pesoKg)}</span>}{f.corrida && <span>Corrida {f.corrida}</span>}</span>
        </button>)}
      </div>
      <footer className="px-5 py-4 border-t border-gray-100 space-y-3">
        {erro && <div role="alert" className="text-sm text-red-700">{erro} {!fardos.length && <button type="button" className="underline ml-2" onClick={() => setTentativa(t => t+1)}>Tentar novamente</button>}</div>}
        <p className="text-xs text-torg-gray">O peso é o registrado no recebimento; não representa o saldo atual disponível. Confirme a disponibilidade na separação.</p>
        <label className="block text-xs text-torg-gray">Motivo da escolha (opcional)<input maxLength={300} disabled={salvando} value={motivo} onChange={e => setMotivo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"/></label>
        <div className="flex items-center flex-wrap gap-3"><button type="button" onClick={salvar} disabled={carregando || !escolhido || salvando} className="rounded-lg bg-torg-blue text-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{salvando ? 'Salvando…' : 'Usar este R'}</button><span className="text-xs text-torg-gray">{escolhido ? `Selecionado: R ${r} · OP ${escolhido.opNumero || '—'}` : 'Selecione um recebimento'}</span></div>
      </footer>
    </section>
  </div>;
}
