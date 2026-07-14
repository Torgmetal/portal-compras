"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Clock, Loader2, AlertCircle, RefreshCw, Inbox, Upload, Download,
  Lock, LockOpen, Trash2, FileText,
} from "lucide-react";
import { useStore } from "@/lib/store";

const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const extenso = (c) => {
  if (!c) return "";
  const [a, m] = c.split("-");
  const N = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${N[Number(m)] || m}/${a}`;
};


export default function PontoClient() {
  const { showToast } = useStore();
  const [competencia, setCompetencia] = useState(mesAtual());
  const [competencias, setCompetencias] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [ponto, setPonto] = useState(null);
  const [itens, setItens] = useState([]);
  const [dirty, setDirty] = useState(new Set()); // mantido só p/ o guard de fechar competência
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(""); setDirty(new Set());
    try {
      const r = await fetch(`/api/rh/ponto?competencia=${competencia}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setCompetencias(d.competencias || []);
      setFuncionarios(d.funcionarios || []);
      setPonto(d.ponto || null);
      setItens(d.ponto?.itens || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const importarPdf = async (file) => {
    if (!file) return;
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/rh/ponto/importar-pdf", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar");
      showToast(`Ponto de ${d.competencia} importado do PDF — ${d.casados} casados, ${d.naoCasados} a vincular`, "success");
      setCompetencia(d.competencia);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setImportando(false);
    }
  };


  const mapear = async (itemId, funcionarioId) => {
    if (!funcionarioId) return;
    try {
      const r = await fetch(`/api/rh/ponto/${ponto.id}/mapear`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, funcionarioId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao vincular");
      setItens((prev) => prev.map((it) => (it.id === itemId ? { ...it, funcionarioId, nome: d.nome } : it)));
      showToast(`Vinculado a ${d.nome}${d.gravouPis ? " (PIS gravado no cadastro)" : ""}`, "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const mudarStatus = async (status) => {
    if (status === "FECHADA" && dirty.size > 0) { showToast("Salve antes de fechar", "error"); return; }
    try {
      const r = await fetch(`/api/rh/ponto/${ponto.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      setPonto((p) => ({ ...p, status }));
      showToast(status === "FECHADA" ? "Competência fechada" : "Competência reaberta", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const excluirImportacao = async () => {
    if (!confirm(`Excluir a importação de ponto de ${extenso(ponto.competencia)}? Isso apaga tudo para você reimportar o arquivo.`)) return;
    try {
      const r = await fetch(`/api/rh/ponto/${ponto.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao excluir");
      showToast("Importação excluída — pode reimportar", "success");
      setPonto(null); setItens([]);
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const fechada = ponto?.status === "FECHADA";
  const naoVinculados = itens.filter((it) => !it.funcionarioId).length;

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Clock className="text-torg-blue" /> Controle de Ponto
          </h2>
          <p className="text-sm text-torg-gray mt-1">Importe o cartão de ponto (PDF Secullum) — totais por faixa e batidas vêm automaticamente, casando por CPF.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-torg-gray">Competência</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
        </div>
      </div>

      {/* Import */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-torg-gray">Cartão de ponto em <strong>PDF (Secullum)</strong> — o mesmo relatório da TORG e da VMI. Casa por CPF; reimportar substitui só a empresa do arquivo.</p>
        <label className={`px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 cursor-pointer ${importando ? "opacity-50 pointer-events-none" : ""}`}
          title="Cartão de ponto Secullum em PDF — traz totais, faixas e batidas automaticamente">
          {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {importando ? "Importando…" : "Importar PDF (Secullum)"}
          <input type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={(e) => { importarPdf(e.target.files[0]); e.target.value = ""; }} />
        </label>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : !ponto ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray mb-1">Nenhum ponto importado para <strong>{extenso(competencia)}</strong>.</p>
          <p className="text-xs text-torg-gray">Importe o cartão de ponto (PDF Secullum) acima para começar.</p>
          {competencias.length > 0 && (
            <div className="mt-5 text-xs text-torg-gray">Histórico: {competencias.map((c) => (
              <button key={c.competencia} onClick={() => setCompetencia(c.competencia)} className="underline hover:text-torg-blue mx-1">{c.competencia}</button>
            ))}</div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-torg-dark">{extenso(ponto.competencia)}</span>
              {ponto.empresa && <span className="text-xs text-torg-gray">{ponto.empresa}</span>}
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${fechada ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"}`}>{ponto.status}</span>
              <span className="text-xs text-torg-gray">{itens.length} funcionários</span>
              {naoVinculados > 0 && <span className="text-xs text-amber-600">{naoVinculados} sem vínculo</span>}
              {dirty.size > 0 && <span className="text-xs text-amber-600">{dirty.size} não salvos</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={excluirImportacao}
                className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5"
                title="Excluir a importação para reimportar o arquivo">
                <Trash2 size={14} /> Excluir importação
              </button>
              <a href={`/api/rh/ponto/${ponto.id}/export`} className="px-3 py-2 text-xs text-torg-dark border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><Download size={14} /> Exportar</a>
              {fechada ? (
                <button onClick={() => mudarStatus("ABERTA")} className="px-3 py-2 text-xs text-torg-blue border border-torg-blue-200 rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5"><LockOpen size={14} /> Reabrir</button>
              ) : (
                <button onClick={() => mudarStatus("FECHADA")} className="px-3 py-2 text-xs text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><Lock size={14} /> Fechar</button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {itens.map((it) => (
              <div key={it.id} className="p-3 flex items-center justify-between flex-wrap gap-2 hover:bg-gray-50/50">
                <div className="min-w-0">
                  {it.funcionarioId ? (
                    <div className="font-medium text-torg-dark">{it.nome}</div>
                  ) : (
                    <select defaultValue="" onChange={(e) => mapear(it.id, e.target.value)}
                      className="border border-amber-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue max-w-[240px]">
                      <option value="">— vincular funcionário —</option>
                      {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.matricula ? ` (${f.matricula})` : ""}</option>)}
                    </select>
                  )}
                  {it.empresa && <div className="text-[11px] text-torg-gray">{it.empresa}</div>}
                  {it.funcionarioId && (
                    <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${it.status === "CONFIRMADO" ? "bg-green-100 text-green-700" : it.status === "VISUALIZADO" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                      {it.status === "CONFIRMADO"
                        ? `Confirmado${it.confirmadoEm ? " · " + new Date(it.confirmadoEm).toLocaleDateString("pt-BR") : ""}`
                        : it.status === "VISUALIZADO" ? "Visualizado" : "Aguardando confirmação"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {it.pdfUrl ? (
                    <>
                      <a href={`/api/rh/ponto/${it.id}/arquivo`} target="_blank" rel="noopener"
                        className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5">
                        <FileText size={14} /> Ver PDF
                      </a>
                      <a href={`/api/rh/ponto/${it.id}/arquivo?download=1`}
                        className="px-3 py-1.5 bg-white border border-gray-200 text-torg-gray text-xs rounded-lg hover:bg-gray-50 font-medium inline-flex items-center gap-1.5" title="Baixar">
                        <Download size={14} /> Baixar
                      </a>
                    </>
                  ) : (
                    <span className="text-[11px] text-torg-gray italic">sem PDF — reimporte o cartão</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
