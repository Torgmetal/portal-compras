"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, GanttChart, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { CronogramaCard } from "./_componentes/CronogramaCard";
import { HistoricoEncerrados } from "./_componentes/HistoricoEncerrados";
import { NovoCronogramaModal } from "./_componentes/NovoCronogramaModal";
import { SoloView } from "./_componentes/SoloView";

export default function CronogramasClient({ soloId }) {
  const router = useRouter();
  const [cronogramas, setCronogramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [expandedId, setExpandedId] = useState(soloId || null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showNovoModal, setShowNovoModal] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState("ativos"); // "ativos" | "historico"
  const [encerrados, setEncerrados] = useState([]);
  const [loadingEncerrados, setLoadingEncerrados] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/planejamento/cronogramas");
      if (!res.ok) throw new Error("Erro ao carregar");
      setCronogramas(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarEncerrados = useCallback(async () => {
    setLoadingEncerrados(true);
    try {
      const res = await fetch("/api/planejamento/cronogramas?ativo=false");
      if (!res.ok) throw new Error("Erro ao carregar histórico");
      setEncerrados(await res.json());
    } catch {
      setEncerrados([]);
    } finally {
      setLoadingEncerrados(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (abaAtiva === "historico") carregarEncerrados(); }, [abaAtiva, carregarEncerrados]);

  const expandir = async (id) => {
    // Em modo lista, navega pra página exclusiva da OP
    if (!soloId) {
      router.push(`/planejamento/cronogramas/${id}`);
      return;
    }
    // Em modo solo (já na página da OP), toggle de seções funciona normal
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    await recarregarDetail(id);
  };

  const recarregarDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${id}`);
      if (!res.ok) throw new Error("Erro ao carregar detalhe");
      setDetail(await res.json());
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Modo solo: auto-carrega detalhe do cronograma
  useEffect(() => {
    if (soloId) {
      recarregarDetail(soloId);
    }
  }, [soloId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-torg-blue" size={28} />
        <span className="ml-3 text-torg-gray">Carregando cronogramas...</span>
      </div>
    );
  }

  if (erro && cronogramas.length === 0) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-2" />
        <p className="text-sm text-red-600 mb-3">{erro}</p>
        <button onClick={carregar} className="text-sm text-torg-blue hover:underline flex items-center gap-1 mx-auto">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  // ─── Modo Solo (página exclusiva de uma OP) ─────────────
  if (soloId) {
    const soloCrono = cronogramas.find((c) => c.id === soloId);
    return (
      <SoloView
        soloCrono={soloCrono}
        soloId={soloId}
        detail={detail}
        loadingDetail={loadingDetail}
        onBack={() => router.push("/planejamento/cronogramas")}
        onRefresh={() => recarregarDetail(soloId)}
        onRenamed={carregar}
      />
    );
  }

  const normalizar = valor => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const corresponde = c => termos.every(termo => normalizar(`${c.opNumero} ${c.titulo} ${c.op?.cliente || ""} ${c.op?.obra || ""}`).includes(termo));
  const visiveis = cronogramas.filter(corresponde);
  const historicoVisivel = encerrados.filter(corresponde);

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-torg-dark tracking-tight">Cronogramas</h2>
          <p className="text-sm text-torg-gray mt-1">Programação das obras e avanço por setor.</p>
        </div>
        <button onClick={() => setShowNovoModal(true)} className="self-start sm:self-auto inline-flex items-center justify-center gap-2 rounded-lg bg-torg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-torg-dark transition-colors">
          <Plus size={16} /> Novo cronograma
        </button>
      </header>

      {erro && <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">{erro}</div>}

      <section className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden" aria-label="Lista de cronogramas">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-200/80 px-4 sm:px-5 py-4">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start" role="tablist" aria-label="Situação dos cronogramas">
            {[{id:"ativos",nome:"Ativos",Icon:GanttChart,quantidade:cronogramas.length},{id:"historico",nome:"Histórico",Icon:Archive}].map(({id,nome,Icon,quantidade}) => (
              <button key={id} role="tab" id={`aba-cronogramas-${id}`} aria-selected={abaAtiva === id} aria-controls={`painel-cronogramas-${id}`} onClick={() => setAbaAtiva(id)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${abaAtiva === id ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
                <Icon size={15} /> {nome}{quantidade !== undefined && <span className="text-xs tabular-nums rounded bg-slate-100 px-1.5 py-0.5">{quantidade}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
              <input aria-label="Buscar por OP, obra ou cliente" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OP, obra ou cliente" className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-torg-blue focus:ring-1 focus:ring-torg-blue" />
              {busca && <button aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-torg-gray hover:text-torg-blue"><X size={14}/></button>}
            </div>
            <button onClick={abaAtiva === "historico" ? carregarEncerrados : carregar} aria-label="Atualizar cronogramas" title="Atualizar cronogramas" className="shrink-0 rounded-lg border border-gray-200 p-2.5 text-torg-gray hover:bg-slate-50 hover:text-torg-blue"><RefreshCw size={17}/></button>
          </div>
        </div>

        {abaAtiva === "ativos" && <div role="tabpanel" id="painel-cronogramas-ativos" aria-labelledby="aba-cronogramas-ativos">
          {visiveis.length === 0 ? <div className="px-6 py-16 text-center">
            <GanttChart size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium text-torg-dark">{cronogramas.length ? "Nenhum cronograma encontrado." : "Nenhum cronograma ativo."}</p>
            <p className="mt-1 text-sm text-torg-gray">{cronogramas.length ? "Tente outro número de OP, obra ou cliente." : "Crie o primeiro cronograma para organizar as atividades da obra."}</p>
            {cronogramas.length ? <button onClick={() => setBusca("")} className="mt-4 text-sm font-medium text-torg-blue">Limpar busca</button> : <button onClick={() => setShowNovoModal(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-torg-blue px-4 py-2 text-sm font-medium text-white hover:bg-torg-dark"><Plus size={15}/> Criar cronograma</button>}
          </div> : <div className="divide-y divide-gray-200/70">
            {visiveis.map(c => <CronogramaCard key={c.id} cronograma={c} onToggle={() => expandir(c.id)} />)}
          </div>}
          {!!visiveis.length && <p className="border-t border-gray-200/70 bg-slate-50/60 px-5 py-3 text-xs text-torg-gray">{busca ? `${visiveis.length} de ${cronogramas.length} cronogramas` : `${cronogramas.length} cronograma${cronogramas.length === 1 ? "" : "s"} ativo${cronogramas.length === 1 ? "" : "s"}`} · Selecione uma obra para abrir a programação.</p>}
        </div>}
      {abaAtiva === "historico" && <div role="tabpanel" id="painel-cronogramas-historico" aria-labelledby="aba-cronogramas-historico" className="p-4 sm:p-5">
        {busca && !loadingEncerrados && !historicoVisivel.length ? <div className="py-12 text-center text-sm text-torg-gray">Nenhum cronograma encontrado no histórico.<button onClick={() => setBusca("")} className="block mx-auto mt-3 text-torg-blue font-medium">Limpar busca</button></div> : <HistoricoEncerrados
          encerrados={historicoVisivel}
          loading={loadingEncerrados}
          onReabrir={async (id) => {
            try {
              const res = await fetch(`/api/planejamento/cronogramas/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ativo: true }),
              });
              if (!res.ok) throw new Error("Erro ao reabrir");
              carregarEncerrados();
              carregar();
            } catch (e) {
              alert(e.message);
            }
          }}
          expandedId={expandedId}
          onToggle={expandir}
          detail={detail}
          loadingDetail={loadingDetail}
          onRefreshDetail={recarregarDetail}
        />}
      </div>}
      </section>

      {showNovoModal && (
        <NovoCronogramaModal
          onClose={() => setShowNovoModal(false)}
          onCreated={(id) => {
            setShowNovoModal(false);
            carregar().then(() => expandir(id));
          }}
        />
      )}
    </div>
  );
}
