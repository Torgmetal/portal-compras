"use client";
import { useState, useEffect } from "react";
import { ClipboardList, RefreshCw, Loader2, AlertTriangle, ChevronDown, ChevronRight, Mail, CheckCircle2, AlertCircle } from "lucide-react";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function ListaExpedicaoSection({ opId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [msg, setMsg] = useState("");
  const [aberto, setAberto] = useState({});
  const [ocupado, setOcupado] = useState({});

  const carregar = () => fetch(`/api/comercial/op/${opId}/lista-expedicao`).then((r) => r.json())
    .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro"); }).catch(() => setErro("Erro ao carregar"));
  useEffect(() => { carregar(); }, [opId]);

  async function atualizar() {
    setAtualizando(true); setErro(""); setMsg("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lista-expedicao`, { method: "POST" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setDados(j);
      const novas = (j.resultados || []).filter((x) => x.mudanca).length;
      const primeiras = (j.resultados || []).filter((x) => x.primeiraImportacao).length;
      setMsg(novas ? `${novas} lista(s) com alteração — confira as pendências abaixo.` : primeiras ? `Lista importada da pasta do servidor.` : "Lista já estava atualizada — nenhuma alteração.");
    } catch (e) { setErro(e.message); } finally { setAtualizando(false); }
  }
  async function notificar(rev) {
    if (!confirm(`Enviar aviso da alteração da lista para TODOS os setores da Torg?\n\n${rev.nIncluidas} incluída(s) · ${rev.nExcluidas} excluída(s) · ${rev.nAlteradas} alterada(s).`)) return;
    setOcupado((o) => ({ ...o, [rev.id]: "mail" }));
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lista-expedicao/${rev.id}/notificar`, { method: "POST" });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      setMsg(`Aviso enviado para ${j.enviados} de ${j.total} contato(s) dos setores.`);
      carregar();
    } catch (e) { setErro(e.message); } finally { setOcupado((o) => ({ ...o, [rev.id]: null })); }
  }
  async function resolver(rev) {
    if (!confirm("Marcar como tratada? Use quando as peças já tiverem sido alocadas/retiradas dos lotes.")) return;
    setOcupado((o) => ({ ...o, [rev.id]: "ok" }));
    try {
      await fetch(`/api/comercial/op/${opId}/lista-expedicao/${rev.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolvida: true }) });
      carregar();
    } catch { /* ignora */ } finally { setOcupado((o) => ({ ...o, [rev.id]: null })); }
  }

  const listas = dados?.listas || [];
  const pendentes = dados?.pendentes || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><ClipboardList size={18} className="text-torg-blue" /> Lista de Expedição</h3>
        <button onClick={atualizar} disabled={atualizando} className="text-xs bg-torg-blue text-white rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-dark disabled:opacity-50">{atualizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar da pasta do servidor</button>
      </div>
      <p className="text-sm text-torg-gray mb-3">Puxada da pasta da obra no servidor (<em>2. Engenharia › 2.6 Lista de expedição</em>). A cada revisão nova o portal compara as marcas e mostra o que <strong>entrou</strong> e o que <strong>saiu</strong> — o Planejamento aloca ou retira do lote.</p>

      {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
      {msg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-1"><CheckCircle2 size={13} /> {msg}</p>}

      {/* pendências de revisão */}
      {pendentes.map((rev) => {
        const exp = !!aberto[rev.id];
        return (
          <div key={rev.id} className={`border rounded-lg mb-3 overflow-hidden ${rev.excluidasAlocadas > 0 ? "border-red-200" : "border-amber-200"}`}>
            <div className={`px-3 py-2 ${rev.excluidasAlocadas > 0 ? "bg-red-50" : "bg-amber-50"}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className={`text-[13px] font-semibold inline-flex items-center gap-1.5 ${rev.excluidasAlocadas > 0 ? "text-red-800" : "text-amber-800"}`}>
                  <AlertTriangle size={14} /> Lista alterada — {rev.frente}
                  {rev.revisaoAnterior || rev.revisao ? <span className="font-normal">· rev {rev.revisaoAnterior || "—"} → {rev.revisao || "—"}</span> : null}
                </p>
                <span className="text-[11px] text-torg-gray">{fmtDT(rev.detectadaEm)}{rev.notificadaEm ? " · setores avisados" : ""}</span>
              </div>
              <p className="text-[12px] text-torg-dark mt-0.5"><strong>{rev.nIncluidas}</strong> incluída(s) · <strong>{rev.nExcluidas}</strong> excluída(s) · <strong>{rev.nAlteradas}</strong> alterada(s)</p>
              {rev.excluidasAlocadas > 0 && <p className="text-[12px] text-red-700 mt-1 font-medium">⚠ {rev.excluidasAlocadas} peça(s) saíram da lista mas ainda estão alocadas em lote — retire do lote antes de expedir.</p>}
              {rev.incluidasSemLote > 0 && <p className="text-[12px] text-amber-800 mt-0.5">{rev.incluidasSemLote} peça(s) nova(s) sem lote de entrega — alocar no Planejamento.</p>}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button onClick={() => setAberto((a) => ({ ...a, [rev.id]: !exp }))} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-0.5 font-medium">{exp ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {exp ? "ocultar" : "ver"} peças</button>
                <button onClick={() => notificar(rev)} disabled={!!ocupado[rev.id]} className="text-[12px] border border-torg-blue text-torg-blue rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium hover:bg-torg-blue-50 disabled:opacity-50">{ocupado[rev.id] === "mail" ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Avisar setores</button>
                <button onClick={() => resolver(rev)} disabled={!!ocupado[rev.id]} className="text-[12px] text-torg-gray hover:text-emerald-700 inline-flex items-center gap-1 font-medium disabled:opacity-50">{ocupado[rev.id] === "ok" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Marcar como tratada</button>
              </div>
            </div>
            {exp && (
              <div className="p-3 space-y-3 bg-white">
                <TabelaMarcas titulo="Incluídas" itens={rev.incluidas} cor="text-emerald-700" mostrarLote />
                <TabelaMarcas titulo="Excluídas" itens={rev.excluidas} cor="text-red-700" mostrarLote destacarLote />
                <TabelaMarcas titulo="Alteradas (qtd/peso)" itens={rev.alteradas} cor="text-torg-dark" alteracao />
              </div>
            )}
          </div>
        );
      })}

      {/* listas importadas */}
      {dados === null ? (
        <div className="py-8 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : listas.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center">
          <ClipboardList size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Lista de Expedição ainda não importada</p>
          <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">Clique em <strong>Atualizar da pasta do servidor</strong> — o portal procura a lista em <em>2. Engenharia › 2.6 Lista de expedição</em> da obra.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50">
              <tr className="text-[11px] text-torg-gray uppercase">
                <th className="text-left px-3 py-2 font-medium">Frente</th>
                <th className="text-left px-3 py-2 font-medium">Arquivo</th>
                <th className="text-left px-3 py-2 font-medium w-20">Rev.</th>
                <th className="text-right px-3 py-2 font-medium w-20">Marcas</th>
                <th className="text-right px-3 py-2 font-medium w-28">Contratado</th>
                <th className="text-right px-3 py-2 font-medium w-28">Expedido</th>
                <th className="text-right px-3 py-2 font-medium w-28">Faltante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {listas.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-semibold text-torg-dark">{l.frente}</td>
                  <td className="px-3 py-2 text-torg-gray text-[12px] truncate max-w-[240px]" title={`${l.arquivo} · importado ${fmtDT(l.importadoEm)}`}>{l.arquivo}</td>
                  <td className="px-3 py-2 text-torg-gray">{l.revisao || "—"}</td>
                  <td className="px-3 py-2 text-right text-torg-gray tabular-nums">{l.marcas}</td>
                  <td className="px-3 py-2 text-right text-torg-dark tabular-nums whitespace-nowrap">{fmtKg(l.pesoContratado)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{fmtKg(l.pesoExpedido)}</td>
                  <td className="px-3 py-2 text-right text-torg-gray tabular-nums whitespace-nowrap">{fmtKg(l.pesoFaltante)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabelaMarcas({ titulo, itens, cor, mostrarLote, destacarLote, alteracao }) {
  if (!itens?.length) return null;
  return (
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${cor}`}>{titulo} ({itens.length})</p>
      <div className="border border-gray-100 rounded max-h-56 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 sticky top-0 text-torg-gray">
            <tr>
              <th className="text-left px-2 py-1 font-medium">Marca</th>
              <th className="text-left px-2 py-1 font-medium">Descrição</th>
              <th className="text-right px-2 py-1 font-medium w-24">Qtd</th>
              <th className="text-right px-2 py-1 font-medium w-28">Peso</th>
              {mostrarLote && <th className="text-left px-2 py-1 font-medium w-28">Lote</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {itens.map((m, i) => (
              <tr key={`${m.marca}-${i}`}>
                <td className="px-2 py-1 font-mono text-torg-dark">{m.marca}</td>
                <td className="px-2 py-1 text-torg-gray truncate max-w-[200px]" title={m.descricao || ""}>{m.descricao || "—"}</td>
                <td className="px-2 py-1 text-right text-torg-gray tabular-nums">{alteracao && m.qteAntes != null ? `${m.qteAntes} → ${m.qte ?? "—"}` : (m.qte ?? "—")}</td>
                <td className="px-2 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">{alteracao && m.pesoAntes != null ? `${fmtKg(m.pesoAntes)} → ${fmtKg(m.pesoTotal)}` : (m.pesoTotal != null ? fmtKg(m.pesoTotal) : "—")}</td>
                {mostrarLote && <td className={`px-2 py-1 ${destacarLote && m.lote ? "text-red-700 font-semibold" : "text-torg-gray"}`}>{m.lote || "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
