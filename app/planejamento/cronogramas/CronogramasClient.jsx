"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, Download, GanttChart, List, Loader2, Plus, RefreshCw } from "lucide-react";
import { CronogramaCard } from "./_componentes/CronogramaCard";
import { HistoricoEncerrados } from "./_componentes/HistoricoEncerrados";
import { NovoCronogramaModal } from "./_componentes/NovoCronogramaModal";
import { SoloView } from "./_componentes/SoloView";

export default function CronogramasClient({ soloId }) {
  const router = useRouter();
  const [cronogramas, setCronogramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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

  const sincronizar = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/planejamento/cronogramas", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao sincronizar");
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSyncing(false);
    }
  };

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

  // ─── Modo Lista (todas as OPs) ─────────────
  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Cronogramas</h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Acompanhamento de cronogramas por OP e departamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNovoModal(true)}
            className="px-4 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5"
          >
            <Plus size={14} /> Novo Cronograma
          </button>
          <button
            onClick={sincronizar}
            disabled={syncing}
            className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {syncing ? "Sincronizando..." : "Sincronizar SharePoint"}
          </button>
          <a href="/planejamento/config-expedicao" title="Itens que NÃO contam como estrutura no % de expedição (grade de piso, telha, steel deck…)"
            className="px-3 py-2 text-torg-gray hover:text-torg-blue text-xs rounded-lg hover:bg-gray-100 font-medium flex items-center gap-1.5 border border-gray-200">
            <List size={14} /> Itens fora da estrutura
          </a>
          <button onClick={carregar} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg">
          {erro}
        </div>
      )}

      {/* Abas Ativos / Histórico */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setAbaAtiva("ativos")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            abaAtiva === "ativos" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <GanttChart size={13} /> Ativos ({cronogramas.length})
        </button>
        <button
          onClick={() => setAbaAtiva("historico")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            abaAtiva === "historico" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <Archive size={13} /> Histórico {encerrados.length > 0 && `(${encerrados.length})`}
        </button>
      </div>

      {abaAtiva === "ativos" && (
        <>
          {cronogramas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <GanttChart size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-torg-gray mb-4">Nenhum cronograma ativo.</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowNovoModal(true)}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1.5"
                >
                  <Plus size={14} /> Criar Cronograma
                </button>
                <button
                  onClick={sincronizar}
                  disabled={syncing}
                  className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5"
                >
                  <Download size={14} /> Importar do SharePoint
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {cronogramas.map((c) => (
                <CronogramaCard
                  key={c.id}
                  cronograma={c}
                  onToggle={() => expandir(c.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {abaAtiva === "historico" && (
        <HistoricoEncerrados
          encerrados={encerrados}
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
        />
      )}

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
