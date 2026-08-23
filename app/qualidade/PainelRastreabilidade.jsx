"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, RefreshCw, Link2, ChevronDown, ChevronRight, FolderSearch, CheckCircle2, ClipboardCheck, X } from "lucide-react";
import { useStore } from "@/lib/store";

const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

const ROTULO_FALTA = { arquivo: "certificado não digitalizado", certificado: "sem nº de certificado", corrida: "sem corrida" };
const ROTULO_LACUNA = { nf: "NF", pedido: "pedido", data: "data", op: "OP" };

// ⚠ ESTA LISTA É FECHADA. Vitor (22/08/2026): "não podemos em hipótese alguma mencionar que o
// fornecedor não entrega certificado". Toda opção aqui diz ONDE o certificado está, ou que ele
// ainda não chegou — nenhuma registra uma decisão de dispensar certificado, porque isso deixaria
// escrito, num documento que auditor e cliente leem, que recebemos material sem ele. O servidor
// valida a mesma lista e ainda barra a frase no campo livre (lib/rastreio-tratativa.js).
const SITUACOES = [
  { v: "ESTOQUE", r: "Material de estoque", ajuda: "O certificado é o da compra original — informe o R de origem.", exigeR: true },
  { v: "ARQUIVO_FISICO", r: "Certificado em arquivo físico", ajuda: "Existe em papel, falta digitalizar na pasta do Almoxarifado." },
  { v: "AGUARDANDO_CERTIFICADO", r: "Aguardando certificado", ajuda: "Ainda não chegou. Em cobrança." },
];

/**
 * CONFERÊNCIA DE RASTREABILIDADE — todo material da OP está em dia?
 *
 * Vitor (22/08/2026): "o que precisamos garantir é que todos os materiais listados para as ops
 * estejam com as informações em dia".
 *
 * Três estados que exigem gente diferente:
 *   o portal acha    o PDF existe no servidor, só não estava vinculado → um clique
 *   pendente         falta o certificado de verdade → cobrar o Almoxarifado
 *   tratado          alguém já disse onde o certificado está (estoque, arquivo físico)
 *
 * ⚠ e um quarto que NÃO é pendência: material que ainda não chegou. Vitor: "as que está em
 * aberto por conta de estar aguardando chegar ainda... deixe em branco por hora para não fazermos
 * cagada". Cobrar certificado de aço que está na transportadora é alarme falso — e alarme falso é
 * o que faz a equipe parar de olhar a tela.
 */
export default function PainelRastreabilidade() {
  const { showToast } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null);
  const [casando, setCasando] = useState(null);
  const [tratando, setTratando] = useState(null); // item em tratamento

  const carregar = useCallback((recarregar = false) => {
    setLoading(true); setErro("");
    fetch(`/api/qualidade/rastreabilidade/status${recarregar ? "?recarregar=1" : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then(setData).catch((e) => setErro(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const casar = async (opNumero) => {
    setCasando(opNumero || "todas");
    try {
      const res = await fetch("/api/qualidade/rastreabilidade/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opNumero ? { opNumero } : {}),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      showToast(`${j.casados} certificado(s) vinculado(s).`, "success");
      carregar();
    } catch (e) { showToast(e.message, "error"); } finally { setCasando(null); }
  };

  const t = data?.totais;
  const comPendencia = (data?.ops || []).filter((o) => o.pendentes + o.tratados + o.achaveis > 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5">
            <FolderSearch size={15} className="text-torg-blue" /> Conferência de rastreabilidade
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Lida direto do servidor a cada abertura. Varre a pasta de Rastreabilidade inteira —
            todos os anos e subpastas —, não só a do ano corrente.
            {data?.servidor && <> {fmtN(data.servidor.arquivos)} arquivos em {data.servidor.pastas} pastas.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {t?.achaveis > 0 && (
            <button onClick={() => casar(null)} disabled={!!casando}
              className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
              {casando === "todas" ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Vincular os {fmtN(t.achaveis)} encontrados
            </button>
          )}
          <button onClick={() => carregar(true)} disabled={loading}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Revarrer
          </button>
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-gray-100 border-b border-gray-100">
          <Kpi rotulo="No CMR" valor={fmtN(t.documentos)} />
          <Kpi rotulo="Em dia" valor={fmtN(t.emDia)} cor="text-green-700" nota="certificado, nº e corrida" />
          <Kpi rotulo="O portal acha" valor={fmtN(t.achaveis)} cor="text-torg-blue" nota="um clique resolve" />
          <Kpi rotulo="Pendentes" valor={fmtN(t.pendentes)} cor="text-torg-orange-700" nota="precisa de gente" />
          {/* ⚠ neutro de propósito: não é pendência, é material que ainda não chegou. */}
          <Kpi rotulo="A receber" valor={fmtN(t.aguardandoCompra)} nota="fora da conta" />
        </div>
      )}

      <div className="p-4">
        {loading && <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> lendo o servidor…</p>}
        {erro && !loading && <p className="text-[12px] text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={13} /> {erro}</p>}
        {!loading && !erro && comPendencia.length === 0 && (
          <p className="text-[12px] text-green-700 inline-flex items-center gap-1.5"><CheckCircle2 size={13} /> Todo material do CMR está em dia.</p>
        )}

        {!loading && !erro && comPendencia.map((o) => {
          const chave = o.opNumero || "(sem OP)";
          const ab = aberta === chave;
          return (
            <div key={chave} className="border-b border-gray-50 last:border-0">
              <button onClick={() => setAberta(ab ? null : chave)}
                className="w-full text-left py-2 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50 px-1 rounded">
                <span className="text-torg-gray">{ab ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="text-[13px] font-semibold text-torg-dark w-24">{o.opNumero ? `OP-${o.opNumero}` : "sem OP"}</span>
                <span className="text-[11px] text-torg-gray">{fmtN(o.total)} no CMR</span>
                {o.achaveis > 0 && <span className="text-[11px] font-semibold text-torg-blue">{fmtN(o.achaveis)} encontrados</span>}
                {o.pendentes > 0 && <span className="text-[11px] font-semibold text-torg-orange-700">{fmtN(o.pendentes)} pendentes</span>}
                {o.tratados > 0 && <span className="text-[11px] font-semibold text-gray-500">{fmtN(o.tratados)} tratados</span>}
                {o.aguardandoCompra > 0 && (
                  <span className="text-[11px] text-torg-gray">{fmtN(o.aguardandoCompra)} a receber</span>
                )}
                <span className="ml-auto text-[11px] text-torg-gray tabular-nums">{o.pct}% em dia</span>
              </button>

              {ab && (
                <div className="pb-3 pl-7 space-y-1.5">
                  {o.achaveis > 0 && (
                    <button onClick={() => casar(o.opNumero)} disabled={!!casando}
                      className="text-[11px] font-semibold text-torg-blue hover:underline disabled:opacity-50 mb-1">
                      {casando === o.opNumero ? "vinculando…" : `vincular os ${fmtN(o.achaveis)} que o portal achou nesta OP`}
                    </button>
                  )}
                  {o.aguardandoCompra > 0 && (
                    <p className="text-[11px] text-torg-gray bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
                      {fmtN(o.aguardandoCompra)} {o.aguardandoCompra === 1 ? "item de compra ainda sem recebimento" : "itens de compra ainda sem recebimento"} —
                      não entram na conta enquanto o material não chega.
                    </p>
                  )}
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {o.itens.map((i) => <Linha key={i.id} i={i} onTratar={() => setTratando(i)} />)}
                  </div>
                  {o.itens.length >= 250 && (
                    <p className="text-[10px] text-torg-gray">mostrando as 250 primeiras desta OP.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tratando && (
        <ModalTratativa item={tratando} onFechar={() => setTratando(null)}
          onSalvo={() => { setTratando(null); carregar(); }} showToast={showToast} />
      )}
    </div>
  );
}

function Linha({ i, onTratar }) {
  const sit = SITUACOES.find((s) => s.v === i.tratativa?.situacao);
  return (
    <div className="py-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
      <span className="font-semibold text-torg-dark w-16 shrink-0">R {i.r}</span>
      <span className="text-torg-gray truncate max-w-[280px]" title={i.nome}>{i.nome}</span>
      {i.achavel
        ? <span className="text-torg-blue font-semibold shrink-0">no servidor: {i.arquivo?.nome}</span>
        : i.faltas.map((f) => (
            <span key={f} className="text-torg-orange-700 shrink-0">{ROTULO_FALTA[f] || f}</span>
          ))}
      {i.lacunas.length > 0 && (
        <span className="text-gray-400 shrink-0">falta {i.lacunas.map((l) => ROTULO_LACUNA[l] || l).join(", ")}</span>
      )}
      {sit && (
        <span className="shrink-0 text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
          {sit.r}{i.tratativa.rOrigem ? ` · R ${i.tratativa.rOrigem}` : ""}
          {i.tratativa.em ? ` · ${fmtD(i.tratativa.em)}` : ""}
        </span>
      )}
      {!i.achavel && (
        <button onClick={onTratar}
          className="ml-auto shrink-0 text-[10px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
          <ClipboardCheck size={11} /> {sit ? "rever" : "tratar"}
        </button>
      )}
    </div>
  );
}

function ModalTratativa({ item, onFechar, onSalvo, showToast }) {
  const [situacao, setSituacao] = useState(item.tratativa?.situacao || "ESTOQUE");
  const [rOrigem, setROrigem] = useState(item.tratativa?.rOrigem || "");
  const [observacao, setObservacao] = useState(item.tratativa?.observacao || "");
  const [salvando, setSalvando] = useState(false);
  const cfg = SITUACOES.find((s) => s.v === situacao);

  const salvar = async () => {
    setSalvando(true);
    try {
      const res = await fetch("/api/qualidade/rastreabilidade/tratativa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importRef: item.r, situacao, rOrigem, observacao }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      showToast("Tratativa registrada.", "success");
      onSalvo();
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  };

  const remover = async () => {
    setSalvando(true);
    try {
      await fetch(`/api/qualidade/rastreabilidade/tratativa?importRef=${encodeURIComponent(item.r)}`, { method: "DELETE" });
      showToast("Tratativa removida.", "success");
      onSalvo();
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-torg-dark">R {item.r}</p>
            <p className="text-[11px] text-torg-gray truncate">{item.nome}</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-torg-dark"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            {SITUACOES.map((s) => (
              <label key={s.v} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer ${situacao === s.v ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
                <input type="radio" name="sit" checked={situacao === s.v} onChange={() => setSituacao(s.v)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-torg-dark">{s.r}</span>
                  <span className="block text-[11px] text-torg-gray">{s.ajuda}</span>
                </span>
              </label>
            ))}
          </div>

          {cfg?.exigeR && (
            <div>
              <label className="block text-[11px] font-semibold text-torg-dark mb-1">R da compra de origem</label>
              <input value={rOrigem} onChange={(e) => setROrigem(e.target.value)} placeholder="ex.: 251114"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
              <p className="text-[10px] text-torg-gray mt-1">
                É esse R que carrega o certificado do material. O portal confere se ele existe no CMR.
              </p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-torg-dark mb-1">Observação (opcional)</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={500}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
            {/* ⚠ o servidor recusa texto que registre que o fornecedor não entrega certificado. */}
            <p className="text-[10px] text-torg-gray mt-1">
              Descreva onde o certificado está ou como está a cobrança. Não registre que o
              fornecedor não fornece certificado — para isso o caminho é uma RNC.
            </p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
          {item.tratativa
            ? <button onClick={remover} disabled={salvando} className="text-[12px] text-red-600 hover:underline disabled:opacity-50">remover tratativa</button>
            : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onFechar} className="text-[12px] text-torg-gray px-3 py-1.5">Cancelar</button>
            <button onClick={salvar} disabled={salvando}
              className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-4 py-1.5 disabled:opacity-50">
              {salvando ? "salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, cor, nota }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider">{rotulo}</p>
      <p className={`text-lg font-extrabold tabular-nums ${cor || "text-torg-dark"}`}>{valor}</p>
      {nota && <p className="text-[10px] text-torg-gray">{nota}</p>}
    </div>
  );
}
