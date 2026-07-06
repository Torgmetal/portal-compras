"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import {
  Receipt, Upload, Loader2, CheckCircle2, AlertCircle, Send, KeyRound,
  MessageCircle, RefreshCw, Inbox, X, Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";

const TIPOS = [
  { v: "MENSAL", label: "Mensal" },
  { v: "DECIMO_TERCEIRO", label: "13º salário" },
  { v: "FERIAS", label: "Férias" },
  { v: "RESCISAO", label: "Rescisão" },
];

// Ordem p/ diferenciar tipos quando o MESMO funcionário tem 2+ holerites na
// competência (ex.: mensal + férias). O par (funcionário, competência, tipo) é
// único no banco — dois holerites do mesmo funcionário PRECISAM de tipos
// distintos para coexistirem, senão um sobrescreve o outro.
const ORDEM_TIPOS = ["MENSAL", "FERIAS", "DECIMO_TERCEIRO", "RESCISAO"];
function distinguirTipos(itens) {
  const usados = new Map(); // funcionarioId -> Set(tipos já atribuídos)
  return itens.map((it) => {
    if (!it.funcionarioId) return it;
    const set = usados.get(it.funcionarioId) || new Set();
    let tipo = it.tipo || "MENSAL";
    if (set.has(tipo)) tipo = ORDEM_TIPOS.find((t) => !set.has(t)) || tipo;
    set.add(tipo);
    usados.set(it.funcionarioId, set);
    return { ...it, tipo };
  });
}

const STATUS_BADGE = {
  PENDENTE: "bg-gray-100 text-gray-600",
  ENVIADO: "bg-amber-100 text-amber-700",
  VISUALIZADO: "bg-blue-100 text-blue-700",
  CONFIRMADO: "bg-green-100 text-green-700",
};

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function competenciaExtenso(c) {
  if (!c) return "";
  const [ano, mes] = c.split("-");
  const nomes = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[Number(mes)] || mes}/${ano}`;
}

// Lê a resposta com tolerância: se o corpo vier vazio (timeout/504) ou não-JSON,
// devolve um erro legível em vez de estourar "Unexpected end of JSON input".
async function lerResposta(r) {
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch {
    return {
      success: false,
      error: !txt || r.status === 504
        ? "O servidor demorou demais para responder (PDF muito grande?). Tente de novo."
        : `Erro ${r.status}: ${txt.slice(0, 120)}`,
    };
  }
}

export default function HoleriteClient() {
  const { showToast } = useStore();
  const [competencia, setCompetencia] = useState(mesAtual());
  const [competencias, setCompetencias] = useState([]);
  const [holerites, setHolerites] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Importação
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);
  const [pct, setPct] = useState(0);
  const [revisao, setRevisao] = useState(null); // { itens, funcionarios, arquivoOriginalUrl, arquivoOriginalNome, empresa }
  const [salvando, setSalvando] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [anexarPdf, setAnexarPdf] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/rh/holerite?competencia=${competencia}`);
      const d = await lerResposta(r);
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setHolerites(d.holerites || []);
      setCompetencias(d.competencias || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const onArquivo = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") { showToast("Selecione um PDF", "error"); return; }
    setImportando(true); setPct(0); setRevisao(null);
    try {
      const safe = String(file.name || "holerites.pdf").replace(/[^\w.\- ]/g, "_").slice(0, 100);
      const blob = await upload(`holerites-lote/${Date.now()}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/rh/holerite/upload-token",
        onUploadProgress: (p) => setPct(Math.round(p.percentage)),
      });
      const r = await fetch("/api/rh/holerite/preparar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, competencia }),
      });
      const d = await lerResposta(r);
      if (!r.ok) throw new Error(d.error || "Falha ao preparar o lote");
      const empresa = d.itens.find((i) => i.parse?.empresa)?.parse.empresa || null;
      const itens = distinguirTipos(d.itens.map((i) => ({ ...i, tipo: "MENSAL" })));
      const cont = {};
      itens.forEach((i) => { if (i.funcionarioId) cont[i.funcionarioId] = (cont[i.funcionarioId] || 0) + 1; });
      const nDup = Object.values(cont).filter((n) => n > 1).length;
      setRevisao({
        itens,
        funcionarios: d.funcionarios || [],
        arquivoOriginalUrl: blob.url, arquivoOriginalNome: file.name, empresa,
      });
      showToast(
        `${d.totalPaginas} páginas lidas${nDup ? ` · ${nDup} funcionário(s) com 2+ holerites (tipos ajustados)` : ""} — revise os vínculos`,
        "success"
      );
    } catch (e) {
      showToast(e.message || "Erro ao importar", "error");
    } finally {
      setImportando(false);
    }
  };

  const editarItem = (idx, campo, valor) =>
    setRevisao((r) => ({ ...r, itens: r.itens.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)) }));
  const removerItem = (idx) =>
    setRevisao((r) => ({ ...r, itens: r.itens.filter((_, i) => i !== idx) }));

  const confirmarImportacao = async () => {
    const validos = revisao.itens.filter((i) => i.funcionarioId);
    if (validos.length === 0) { showToast("Vincule ao menos um holerite a um funcionário", "error"); return; }
    const semVinculo = revisao.itens.length - validos.length;
    setSalvando(true);
    try {
      const r = await fetch("/api/rh/holerite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competencia, empresa: revisao.empresa,
          arquivoOriginalUrl: revisao.arquivoOriginalUrl, arquivoOriginalNome: revisao.arquivoOriginalNome,
          itens: validos.map((i) => ({
            funcionarioId: i.funcionarioId, arquivoUrl: i.arquivoUrl, arquivoNome: i.arquivoNome,
            arquivoTamanho: i.arquivoTamanho, tipo: i.tipo, empresa: i.parse?.empresa || revisao.empresa,
            valorLiquido: i.parse?.valorLiquido ?? null,
          })),
        }),
      });
      const d = await lerResposta(r);
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      showToast(`${d.total} holerites importados${semVinculo ? ` (${semVinculo} sem vínculo ignorados)` : ""}`, "success");
      setRevisao(null);
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const disparar = async (soParaMim) => {
    if (!soParaMim && !confirm(`Enviar e-mail de holerite para todos os pendentes de ${competenciaExtenso(competencia)}?`)) return;
    setDisparando(true);
    try {
      const r = await fetch("/api/rh/holerite/disparar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, soParaMim, anexarPdf }),
      });
      const d = await lerResposta(r);
      if (!r.ok) throw new Error(d.error || "Falha no disparo");
      if (soParaMim) showToast(`Amostra enviada para ${d.para}`, "success");
      else {
        showToast(`${d.enviados} enviados${d.semEmail?.length ? ` · ${d.semEmail.length} sem e-mail` : ""}${d.falhas?.length ? ` · ${d.falhas.length} falhas` : ""}`, d.falhas?.length ? "error" : "success");
        await carregar();
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setDisparando(false);
    }
  };

  const cancelarImportacao = async () => {
    if (!confirm(`Excluir TODOS os holerites importados de ${competenciaExtenso(competencia)}? Isso apaga a importação para você subir o arquivo de novo.`)) return;
    setCancelando(true);
    try {
      const r = await fetch(`/api/rh/holerite?competencia=${competencia}`, { method: "DELETE" });
      const d = await lerResposta(r);
      if (!r.ok) throw new Error(d.error || "Falha ao cancelar");
      showToast(`Importação cancelada — ${d.apagados} holerites removidos`, "success");
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setCancelando(false);
    }
  };

  const habilitarAcesso = async (funcionarioId) => {
    try {
      const r = await fetch(`/api/rh/funcionarios/${funcionarioId}/acesso`, { method: "POST" });
      const d = await lerResposta(r);
      if (!r.ok) throw new Error(d.error || "Falha ao habilitar acesso");
      // Mostra a senha temporária num prompt copiável (aparece só aqui).
      window.prompt(`Acesso ${d.modo === "reset" ? "resetado" : "criado"} para ${d.email}. Senha temporária (copie e entregue ao funcionário):`, d.senhaTemporaria);
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const waLink = (telefone, nome) => {
    const num = (telefone || "").replace(/\D/g, "");
    if (!num) return null;
    const full = num.length <= 11 ? `55${num}` : num;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/meu-rh`;
    const txt = encodeURIComponent(
      `Olá, ${nome}! Seu holerite de ${competenciaExtenso(competencia)} já está disponível no portal da Torg.\n\n` +
      `Acesse com seu CPF e senha para visualizar e confirmar o recebimento:\n${link}`
    );
    return `https://wa.me/${full}?text=${txt}`;
  };

  // Colisão remanescente: mesmo funcionário + mesmo tipo em 2+ páginas (não
  // coexistem no banco). Trava o Confirmar até o RH dar tipos diferentes.
  const chaveCont = {};
  if (revisao) for (const it of revisao.itens) {
    if (it.funcionarioId) { const k = `${it.funcionarioId}|${it.tipo}`; chaveCont[k] = (chaveCont[k] || 0) + 1; }
  }
  const colisoes = revisao
    ? [...new Set(revisao.itens
        .filter((it) => it.funcionarioId && chaveCont[`${it.funcionarioId}|${it.tipo}`] > 1)
        .map((it) => revisao.funcionarios.find((f) => f.id === it.funcionarioId)?.nome || it.parse?.nome || "funcionário"))]
    : [];
  const temColisao = colisoes.length > 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Receipt className="text-torg-blue" /> Holerite
          </h2>
          <p className="text-sm text-torg-gray mt-1">Importe o PDF da contabilidade, vincule por funcionário e dispare com confirmação de recebimento.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-torg-gray">Competência</label>
          <input
            type="month" value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
      </div>

      {/* Importação */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark">Importar holerites de {competenciaExtenso(competencia)}</h3>
            <p className="text-sm text-torg-gray mt-1">PDF com 1 holerite por página. As páginas são divididas e vinculadas automaticamente (você revisa antes de salvar).</p>
          </div>
          <button
            type="button" onClick={() => fileRef.current?.click()} disabled={importando}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importando ? (pct < 100 ? `Enviando ${pct}%` : "Lendo PDF...") : "Selecionar PDF"}
          </button>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { onArquivo(e.target.files[0]); e.target.value = ""; }} />
        </div>

        {/* Revisão de matching */}
        {revisao && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-torg-dark">Revise os vínculos ({revisao.itens.length} páginas) — empresa: {revisao.empresa || "—"}</p>
              <button onClick={() => setRevisao(null)} className="text-gray-400 hover:text-red-500" title="Cancelar"><X size={18} /></button>
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase w-10">Pág.</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Nome no PDF</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase min-w-[240px]">Funcionário</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Confiança</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {revisao.itens.map((it, i) => (
                    <tr key={i} className={it.funcionarioId ? "" : "bg-amber-50/40"}>
                      <td className="px-2 py-1.5 text-gray-400">{it.pagina}</td>
                      <td className="px-2 py-1.5 text-torg-dark">{it.parse?.nome || <span className="text-amber-600">não identificado</span>}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={it.funcionarioId || ""} onChange={(e) => editarItem(i, "funcionarioId", e.target.value || null)}
                          className={`w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue ${it.funcionarioId ? "border-gray-200" : "border-amber-300"}`}
                        >
                          <option value="">— selecione —</option>
                          {revisao.funcionarios.map((f) => (
                            <option key={f.id} value={f.id}>{f.nome}{f.matricula ? ` (${f.matricula})` : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={it.tipo} onChange={(e) => editarItem(i, "tipo", e.target.value)}
                          className={`rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue bg-white border ${it.funcionarioId && chaveCont[`${it.funcionarioId}|${it.tipo}`] > 1 ? "border-amber-400 ring-1 ring-amber-300" : "border-gray-200"}`}>
                          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${it.confianca >= 0.6 ? "bg-green-100 text-green-700" : it.confianca > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                          {Math.round((it.confianca || 0) * 100)}% · {it.motivo}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => removerItem(i)} className="text-red-400 hover:text-red-600" title="Remover"><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {temColisao && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                <strong>{colisoes.join(", ")}</strong> {colisoes.length > 1 ? "aparecem" : "aparece"} em 2+ páginas com o <strong>mesmo tipo</strong>. Dois holerites do mesmo funcionário precisam de <strong>tipos diferentes</strong> (ex.: um Mensal e um Férias) — ajuste na coluna <strong>Tipo</strong> para liberar a importação.
              </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-3">
              <button onClick={() => setRevisao(null)} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
              <button onClick={confirmarImportacao} disabled={salvando || temColisao}
                className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirmar importação
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Acompanhamento */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-lg font-semibold text-torg-dark">Acompanhamento — {competenciaExtenso(competencia)}</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-torg-gray inline-flex items-center gap-1.5 mr-1 select-none cursor-pointer" title="Anexa o PDF do holerite no e-mail">
              <input type="checkbox" checked={anexarPdf} onChange={(e) => setAnexarPdf(e.target.checked)} className="accent-torg-blue" />
              Anexar PDF
            </label>
            <button onClick={() => disparar(true)} disabled={disparando}
              className="px-3 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50">
              <Send size={15} /> Disparar só pra mim
            </button>
            <button onClick={() => disparar(false)} disabled={disparando || holerites.length === 0}
              className="px-3 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50">
              {disparando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Disparar pendentes
            </button>
            {holerites.length > 0 && (
              <button onClick={cancelarImportacao} disabled={cancelando}
                className="px-3 py-2 bg-white border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 font-medium flex items-center gap-2 disabled:opacity-50"
                title="Excluir a importação desta competência para reimportar">
                {cancelando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Cancelar importação
              </button>
            )}
          </div>
        </div>

        {carregando ? (
          <div className="py-12 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
        ) : erro ? (
          <div className="py-12 text-center">
            <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erro}</p>
            <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : holerites.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray text-sm">Nenhum holerite importado para esta competência.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Funcionário</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Confirmado em</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {holerites.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="text-torg-dark font-medium">{h.funcionario?.nome}</div>
                      <div className="text-[11px] text-torg-gray">{h.funcionario?.email || "sem e-mail"}{h.funcionario?.usuario ? "" : " · sem acesso"}</div>
                    </td>
                    <td className="px-3 py-2 text-torg-gray">{TIPOS.find((t) => t.v === h.tipo)?.label || h.tipo}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[h.status] || "bg-gray-100"}`}>{h.status}</span></td>
                    <td className="px-3 py-2 text-torg-gray">{h.confirmadoEm ? new Date(h.confirmadoEm).toLocaleString("pt-BR") : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {!h.funcionario?.usuario && (
                          <button onClick={() => habilitarAcesso(h.funcionario.id)} title="Habilitar acesso (login)"
                            className="text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1"><KeyRound size={14} /> Acesso</button>
                        )}
                        {waLink(h.funcionario?.telefone, h.funcionario?.nome) && (
                          <a href={waLink(h.funcionario.telefone, h.funcionario.nome)} target="_blank" rel="noreferrer"
                            title="Avisar por WhatsApp" className="text-green-600 hover:text-green-700 inline-flex items-center gap-1"><MessageCircle size={14} /> WhatsApp</a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
