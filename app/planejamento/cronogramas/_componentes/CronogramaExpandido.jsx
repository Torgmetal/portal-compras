"use client";
import { useState } from "react";
import ModalEnviarCronograma from "@/components/planejamento/ModalEnviarCronograma";
import { GanttChart, History, Loader2, Package, Weight } from "lucide-react";
import { CabecalhoCronograma } from "./CabecalhoCronograma";
import { CronogramaDetail } from "./CronogramaDetail";
import { HistoricoTab } from "./HistoricoTab";
import { ProducaoTab } from "./ProducaoTab";
import { SuprimentosTab } from "./SuprimentosTab";

export function CronogramaExpandido({ detail, loadingDetail, onRefreshDetail, cronogramaId, onDeleted, onEncerrado, opStatus: _opStatus, readOnly }) {
  const [tab, setTab] = useState("cronograma");
  const [settingBase, setSettingBase] = useState(false);
  const [enviandoTarefas, setEnviandoTarefas] = useState(false);

  // ENVIAR TAREFAS PROS SETORES — ato deliberado, depois que o cronograma está fechado.
  // Vitor (19/08/2026): "não deve ser preenchido automático, pois algumas estruturas mudam de obra
  // para obra". Enquanto não é enviado, as linhas são rascunho e não aparecem na Sequência de
  // ninguém. Recolher devolve pro rascunho — melhor sumir do que deixar o setor seguindo data que
  // já não vale.
  const enviarTarefas = async (recolher = false) => {
    if (recolher && !window.confirm("Recolher as tarefas?\n\nElas somem da Sequência dos setores até serem enviadas de novo.")) return;
    if (!recolher && !window.confirm("Enviar as tarefas deste cronograma aos setores?\n\nElas passam a aparecer na aba Sequência de cada setor.")) return;
    setEnviandoTarefas(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${detail.id}/enviar-tarefas`, { method: recolher ? "DELETE" : "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (!recolher) {
        const setores = Object.entries(j.porSetor || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
        alert(`${j.tarefas} tarefa(s) enviada(s).\n${setores}` + (j.semData ? `\n\n${j.semData} sem data ficaram de fora.` : ""));
      }
      onRefreshDetail?.(cronogramaId);
    } catch (e) {
      alert(`Não consegui: ${e.message}`);
    } finally {
      setEnviandoTarefas(false);
    }
  };
  const [deleting, setDeleting] = useState(false);
  const [savingTipoDias, setSavingTipoDias] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);

  const definirDataBase = async () => {
    const hoje = new Date().toISOString().split("T")[0];
    const input = prompt("Data base do cronograma (AAAA-MM-DD):", hoje);
    if (!input) return;
    const d = new Date(input + "T12:00:00Z");
    if (isNaN(d.getTime())) return alert("Data inválida");
    setSettingBase(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase: d.toISOString() }),
      });
      if (!res.ok) throw new Error("Erro ao definir data base");
      onRefreshDetail();
    } catch (e) {
      alert(e.message);
    } finally {
      setSettingBase(false);
    }
  };

  const alterarTipoDias = async (novoTipo) => {
    setSavingTipoDias(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoDias: novoTipo }),
      });
      if (!res.ok) throw new Error("Erro ao alterar tipo de dias");
      onRefreshDetail();
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingTipoDias(false);
    }
  };

  const excluirCronograma = async () => {
    if (!confirm("Tem certeza que deseja excluir este cronograma? Todas as tarefas e registros serão perdidos.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao excluir");
      }
      onDeleted();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const encerrarCronograma = async () => {
    if (!confirm("Encerrar este cronograma? Ele será movido para o histórico e poderá ser consultado ou reaberto a qualquer momento.")) return;
    setEncerrando(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao encerrar");
      }
      if (onEncerrado) onEncerrado();
    } catch (e) {
      alert(e.message);
    } finally {
      setEncerrando(false);
    }
  };


  const tabs = [
    { key: "cronograma", label: "Cronograma", icon: GanttChart },
    { key: "producao", label: "Produção / Peso", icon: Weight },
    { key: "suprimentos", label: "RMs / Pedidos / NFs", icon: Package },
    { key: "historico", label: "Linha de Controle", icon: History },
  ];

  return (
    <div className="border-t border-gray-100">
      {detail && <CabecalhoCronograma detail={detail} readOnly={readOnly} cronogramaId={cronogramaId}
        definirDataBase={definirDataBase} settingBase={settingBase} alterarTipoDias={alterarTipoDias} savingTipoDias={savingTipoDias}
        enviarTarefas={enviarTarefas} enviandoTarefas={enviandoTarefas} abrirEnvio={() => setModalEnviar(true)}
        encerrarCronograma={encerrarCronograma} encerrando={encerrando} excluirCronograma={excluirCronograma} deleting={deleting}
      />}

      {modalEnviar && (
        <ModalEnviarCronograma cronogramaId={cronogramaId} onClose={() => setModalEnviar(false)} />
      )}

      <div className="border-b border-gray-200/70 overflow-x-auto">
        <div className="flex min-w-max px-2 sm:px-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 sm:px-4 py-3.5 whitespace-nowrap text-xs font-medium flex items-center gap-2 border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-torg-blue text-torg-blue"
                    : "border-transparent text-torg-gray hover:text-torg-dark"
                }`}
              >
                <Icon size={13} /> {t.label}
                {t.key === "historico" && detail?.revisoes?.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-torg-gray text-[9px] rounded-full font-bold">{detail.revisoes.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "cronograma" && (
        loadingDetail ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-torg-blue" />
            <span className="ml-2 text-sm text-torg-gray">Carregando tarefas...</span>
          </div>
        ) : detail ? (
          <CronogramaDetail detail={detail} onRefresh={onRefreshDetail} cronogramaId={cronogramaId} readOnly={readOnly} />
        ) : (
          <div className="py-6 text-center text-sm text-torg-gray">Erro ao carregar detalhe.</div>
        )
      )}

      {tab === "producao" && (
        <ProducaoTab cronogramaId={cronogramaId} />
      )}

      {tab === "suprimentos" && (
        <SuprimentosTab cronogramaId={cronogramaId} />
      )}

      {tab === "historico" && detail && (
        <HistoricoTab revisoes={detail.revisoes || []} />
      )}
    </div>
  );
}
