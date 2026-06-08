"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, CheckCircle2, Circle, Calendar,
  ClipboardCheck, Filter, Clock,
} from "lucide-react";

const SETOR_LABEL = {
  PRODUCAO: "Produção", PINTURA: "Pintura", PCP: "PCP",
  EXPEDICAO: "Expedição", COMERCIAL: "Comercial", ENGENHARIA: "Engenharia",
  COMPRAS: "Compras", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro",
  RH: "Recursos Humanos", PLANEJAMENTO: "Planejamento",
};

const PRIORIDADE_COR = {
  ALTA: "bg-red-50 text-red-700 border-red-200",
  MEDIA: "bg-amber-50 text-amber-700 border-amber-200",
  BAIXA: "bg-gray-50 text-gray-500 border-gray-200",
};

const fmtData = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const fmtDataCompleta = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
};

function agruparPorData(compromissos) {
  const grupos = {};
  for (const c of compromissos) {
    const key = new Date(c.data).toISOString().slice(0, 10);
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(c);
  }
  return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
}

export default function CompromissosClient() {
  const [compromissos, setCompromissos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("pendentes");
  const [toggling, setToggling] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/planejamento/compromissos?filtro=${filtro}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setCompromissos(data.compromissos);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleConcluido(id, concluido) {
    setToggling(id);
    try {
      const res = await fetch(`/api/planejamento/compromissos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concluido }),
      });
      if (!res.ok) throw new Error("Erro");
      setCompromissos((prev) =>
        prev.map((c) => c.id === id ? { ...c, concluido, concluidoEm: concluido ? new Date().toISOString() : null } : c)
      );
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setToggling(null);
    }
  }

  const pendentes = compromissos.filter((c) => !c.concluido).length;
  const concluidos = compromissos.filter((c) => c.concluido).length;
  const grupos = agruparPorData(compromissos);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <ClipboardCheck size={24} className="text-torg-blue" />
            Meus Compromissos
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Tarefas atribuídas ao seu setor — To-Do e agenda
          </p>
        </div>
        <button onClick={carregar} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs + filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <div className="flex gap-1">
          {[
            { key: "pendentes", label: `Pendentes (${filtro === "pendentes" ? pendentes : "..."})` },
            { key: "todos", label: "Todos" },
            { key: "concluidos", label: "Concluídos" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                filtro === f.key
                  ? "bg-torg-blue text-white"
                  : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filtro === "pendentes" && pendentes > 0 && (
          <span className="ml-auto text-xs text-torg-gray">
            {pendentes} pendente{pendentes !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-torg-blue" size={24} />
        </div>
      ) : erro ? (
        <div className="text-center py-10">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline mt-2 flex items-center gap-1 mx-auto">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : compromissos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <ClipboardCheck size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">
            {filtro === "pendentes"
              ? "Nenhum compromisso pendente. Tudo em dia!"
              : filtro === "concluidos"
              ? "Nenhum compromisso concluído ainda."
              : "Nenhum compromisso encontrado."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(([dataKey, items]) => {
            const hoje = new Date().toISOString().slice(0, 10);
            const isHoje = dataKey === hoje;
            const isPassado = dataKey < hoje;
            return (
              <div key={dataKey}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={13} className={isHoje ? "text-torg-blue" : isPassado ? "text-red-400" : "text-torg-gray"} />
                  <h4 className={`text-xs font-semibold uppercase tracking-wide ${
                    isHoje ? "text-torg-blue" : isPassado ? "text-red-500" : "text-torg-dark"
                  }`}>
                    {isHoje ? "Hoje — " : isPassado ? "Atrasado — " : ""}
                    {fmtDataCompleta(dataKey)}
                  </h4>
                </div>
                <div className="space-y-1">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className={`bg-white rounded-lg border px-4 py-3 flex items-center gap-3 transition-opacity ${
                        c.concluido ? "opacity-50 border-gray-100" : isPassado ? "border-red-200" : "border-gray-100"
                      }`}
                    >
                      <button
                        onClick={() => toggleConcluido(c.id, !c.concluido)}
                        disabled={toggling === c.id}
                        className={`flex-shrink-0 transition-colors ${
                          c.concluido ? "text-emerald-500" : "text-gray-300 hover:text-torg-blue"
                        }`}
                        title={c.concluido ? "Marcar como pendente" : "Concluir"}
                      >
                        {toggling === c.id ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : c.concluido ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <Circle size={18} />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${c.concluido ? "line-through text-torg-gray" : "text-torg-dark"}`}>
                          {c.titulo}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {c.setor && (
                            <span className="text-[10px] bg-gray-100 text-torg-gray px-1.5 py-0.5 rounded">
                              {SETOR_LABEL[c.setor] || c.setor}
                            </span>
                          )}
                          {c.opNumero && (
                            <span className="text-[10px] text-torg-blue font-mono">{fmtOP(c.opNumero)}</span>
                          )}
                          {c.criadoPor?.name && (
                            <span className="text-[10px] text-torg-gray">
                              por {c.criadoPor.name}
                            </span>
                          )}
                          {c.descricao && (
                            <span className="text-[10px] text-torg-gray italic truncate max-w-[250px]">
                              {c.descricao}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${PRIORIDADE_COR[c.prioridade] || PRIORIDADE_COR.MEDIA}`}>
                        {c.prioridade}
                      </span>

                      {c.tarefa && (
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                          c.tarefa.status === "CONCLUIDA" ? "bg-emerald-50 text-emerald-600" :
                          c.tarefa.status === "EM_ANDAMENTO" ? "bg-amber-50 text-amber-600" :
                          "bg-gray-50 text-torg-gray"
                        }`}>
                          {c.tarefa.status === "CONCLUIDA" ? "Tarefa concluída" :
                           c.tarefa.status === "EM_ANDAMENTO" ? "Em andamento" : "Pendente"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
