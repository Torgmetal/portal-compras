"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Plus, Search, X } from "lucide-react";
import { DEPT_COLORS, DEPT_LABEL, DEPT_ORDER } from "../_lib/rotulos";

// ─── Seletor de Antecessoras (agrupado por departamento + busca) ──────
export function AntecessorasPicker({ tarefaId, allTarefas, selecionadas, onChange, compact, areaAtual }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [soArea, setSoArea] = useState(true); // qd a tarefa tem área: mostra só a mesma área (menos confuso)
  const [pos, setPos] = useState(null); // posição fixa do menu (portal), ancorada no botão
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const areaTrim = (areaAtual || "").trim();

  // Abre calculando a posição a partir do botão: se falta espaço embaixo (perto do
  // fim da página) o menu VIRA pra cima. É renderizado num portal (fixed) pra não
  // ser cortado por ancestrais com overflow-hidden.
  const LARGURA = compact ? 288 : 384; // w-72 / max-w-sm
  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8));
      const espacoAbaixo = window.innerHeight - r.bottom;
      const dropUp = espacoAbaixo < 300 && r.top > espacoAbaixo;
      setPos(dropUp
        ? { left, bottom: window.innerHeight - r.top + 4, width: LARGURA }
        : { left, top: r.bottom + 4, width: LARGURA });
    }
    setBusca("");
    setAberto(true);
  };

  // Fecha ao clicar fora (botão OU menu, que está em portal) e some ao rolar/redimensionar.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const fechar = () => setAberto(false);
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  const disponiveis = (allTarefas || []).filter(
    (x) => x.id !== tarefaId && !x.isSummary && x.outlineLevel > 1 && !selecionadas.includes(x.id)
      // Se a tarefa atual tem área, por padrão só lista as da MESMA área (menos confusão).
      && (!areaTrim || !soArea || (x.area || "").trim() === areaTrim)
  );

  const filtradas = busca.trim()
    ? disponiveis.filter((x) => {
        const term = busca.toLowerCase();
        return x.nome.toLowerCase().includes(term) ||
          (DEPT_LABEL[x.departamento] || x.departamento || "").toLowerCase().includes(term);
      })
    : disponiveis;

  // Agrupar por departamento
  const grupos = {};
  for (const t of filtradas) {
    const dept = t.departamento || "OUTROS";
    if (!grupos[dept]) grupos[dept] = [];
    grupos[dept].push(t);
  }

  const addAnt = (id) => {
    if (!selecionadas.includes(id)) onChange([...selecionadas, id]);
  };

  const removeAnt = (id) => {
    onChange(selecionadas.filter((x) => x !== id));
  };

  return (
    <div className={`space-y-1.5 ${compact ? "" : ""}`}>
      {!compact && (
        <div className="flex items-center gap-1.5">
          <Link2 size={11} className="text-purple-500" />
          <span className="text-[10px] text-torg-gray font-medium">Antecessoras (depende de):</span>
        </div>
      )}

      {/* Tags selecionadas */}
      {selecionadas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selecionadas.map((aid) => {
            const ant = (allTarefas || []).find((x) => x.id === aid);
            const deptColor = ant?.departamento ? (DEPT_COLORS[ant.departamento] || "bg-gray-50 text-torg-gray border-gray-200") : "bg-purple-50 text-purple-700 border-purple-200";
            return (
              <span key={aid} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ${deptColor}`}>
                {ant ? `${DEPT_LABEL[ant.departamento] || ant.departamento}: ${ant.nome}` : aid.slice(0, 8)}
                <button onClick={() => removeAnt(aid)} className="hover:text-red-500 ml-0.5">
                  <X size={8} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Botão de abrir / Input de busca */}
      <div className="relative">
        <button
          ref={btnRef}
          onClick={() => (aberto ? setAberto(false) : abrir())}
          className={`flex items-center gap-1.5 text-[10px] px-2 py-1 border border-gray-200 rounded bg-white hover:bg-gray-50 text-torg-gray ${compact ? "w-auto" : "w-full max-w-xs"}`}
        >
          <Link2 size={10} className="text-purple-400" />
          {compact ? "Antecessoras" : (selecionadas.length > 0 ? "+ Adicionar outra antecessora..." : "+ Adicionar antecessora (pode mais de uma)...")}
          {selecionadas.length > 0 && !compact && (
            <span className="ml-auto text-[9px] text-purple-600 font-semibold">{selecionadas.length}</span>
          )}
        </button>
        {aberto && pos && createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
            className="border border-purple-300 rounded-lg bg-white shadow-xl z-[9999]"
          >
            {/* Barra de busca */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-100">
              <Search size={12} className="text-torg-gray shrink-0" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar tarefa..."
                className="flex-1 text-[11px] outline-none bg-transparent"
                autoFocus
              />
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            </div>

            {/* Filtro por área — só aparece quando a tarefa atual tem área */}
            {areaTrim && (
              <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-100 bg-purple-50/40">
                <span className="text-[9px] text-torg-gray shrink-0">Mostrar:</span>
                <button onClick={() => setSoArea(true)} className={`text-[9px] px-1.5 py-0.5 rounded ${soArea ? "bg-purple-600 text-white font-semibold" : "text-purple-700 hover:bg-purple-100"}`}>Só a área {areaTrim}</button>
                <button onClick={() => setSoArea(false)} className={`text-[9px] px-1.5 py-0.5 rounded ${!soArea ? "bg-purple-600 text-white font-semibold" : "text-purple-700 hover:bg-purple-100"}`}>Todas</button>
              </div>
            )}

            {/* Lista agrupada */}
            <div className="max-h-48 overflow-y-auto">
              {Object.keys(grupos).length === 0 ? (
                <p className="text-[10px] text-torg-gray text-center py-3 italic">
                  {busca ? "Nenhuma tarefa encontrada" : (areaTrim && soArea ? `Nenhuma tarefa na área "${areaTrim}". Clique em "Todas" pra ver as outras.` : "Sem tarefas disponíveis")}
                </p>
              ) : (
                DEPT_ORDER.filter((d) => grupos[d]).map((dept) => (
                  <div key={dept}>
                    <div className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider sticky top-0 border-b border-gray-50 ${
                      DEPT_COLORS[dept]?.replace("border-", "bg-").split(" ")[1] || "text-torg-gray"
                    } bg-gray-50/80`}>
                      {DEPT_LABEL[dept] || dept}
                    </div>
                    {grupos[dept].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { addAnt(t.id); }}
                        className="w-full text-left px-3 py-1.5 text-[10px] text-torg-dark hover:bg-purple-50 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={9} className="text-purple-400 shrink-0" />
                        <span className="truncate">{t.nome}</span>
                        {t.percentualRealizado > 0 && (
                          <span className={`ml-auto text-[8px] font-bold shrink-0 ${t.percentualRealizado >= 100 ? "text-emerald-600" : "text-torg-gray"}`}>
                            {t.percentualRealizado}%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
              {/* Departamentos fora da ordem padrão */}
              {Object.keys(grupos).filter((d) => !DEPT_ORDER.includes(d)).map((dept) => (
                <div key={dept}>
                  <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-torg-gray bg-gray-50/80 sticky top-0 border-b border-gray-50">
                    {DEPT_LABEL[dept] || dept}
                  </div>
                  {grupos[dept].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { addAnt(t.id); }}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-torg-dark hover:bg-purple-50 transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={9} className="text-purple-400 shrink-0" />
                      <span className="truncate">{t.nome}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
