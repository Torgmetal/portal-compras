"use client";
// Baixa em lote: escolhe a OP, vê o que falta por setor, fecha o setor num clique (com motivo).
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, CheckCheck, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtOP } from "@/lib/utils";
import ConfirmModal from "@/components/admin/ConfirmModal";

const SETORES = [
  ["CORTE", "Preparação"], ["MONTAGEM", "Montagem"], ["SOLDA", "Solda"],
  ["ACABAMENTO", "Acabamento"], ["JATO", "Jato"], ["PINTURA", "Pintura"],
];
const nkg = (v) => Math.round(v || 0).toLocaleString("pt-BR");

export default function BaixaLoteClient({ ops }) {
  const { showToast } = useStore();
  const [opId, setOpId] = useState("");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);      // setor expandido
  const [confirmar, setConfirmar] = useState(null); // setor a baixar
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function carregar(id) {
    if (!id) { setDados(null); return; }
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/baixa-lote?opId=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); setDados(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { carregar(opId); }, [opId]);

  async function baixar() {
    if (!confirmar) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/pcp/baixa-lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, setor: confirmar, motivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao dar baixa");
      showToast(`${j.pecas} peça(s) · ${nkg(j.kg)} kg baixadas em ${rotulo(confirmar)}.`, "sucesso");
      await carregar(opId);
    } catch (e) { showToast(e.message, "erro"); }
    finally { setEnviando(false); setConfirmar(null); }
  }

  const rotulo = (k) => SETORES.find((s) => s[0] === k)?.[1] || k;
  const op = ops.find((o) => o.id === opId);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-[280px]">
          <span className="block text-[11px] font-semibold text-torg-gray mb-1">Obra</span>
          <select value={opId} onChange={(e) => setOpId(e.target.value)} className="inp">
            <option value="">— escolha a OP —</option>
            {ops.map((o) => <option key={o.id} value={o.id}>{fmtOP(o.numero)} · {o.obra || "—"}{o.cliente ? ` (${o.cliente})` : ""}</option>)}
          </select>
        </label>
        {dados && (
          <label className="block flex-1 min-w-[320px]">
            <span className="block text-[11px] font-semibold text-torg-gray mb-1">Motivo da baixa (obrigatório, fica na auditoria)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="inp"
              placeholder="Ex.: conferido no pátio pelo líder — produção sem apontamento no Syneco" />
          </label>
        )}
        {dados && <span className="text-xs text-torg-gray pb-2">{dados.totalPecas} peças de fabricação na LPC</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-torg-gray py-10 justify-center"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-700 flex flex-col items-center gap-2">
          <AlertCircle size={22} /> {erro}
          <button className="text-sm underline" onClick={() => carregar(opId)}>Tentar novamente</button>
        </div>
      ) : !dados ? (
        <p className="text-sm text-torg-gray text-center py-10">Escolha uma obra para ver o que falta em cada setor.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wide text-torg-gray">
              <tr><th className="text-left px-4 py-2">Setor</th><th className="text-right px-4 py-2">Marcas</th><th className="text-right px-4 py-2">Peças</th><th className="text-right px-4 py-2">kg</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {SETORES.map(([k, nome]) => {
                const s = dados.porSetor[k];
                const vazio = !s || s.pecas === 0;
                return (
                  <FragmentoSetor key={k} k={k} nome={nome} s={s} vazio={vazio} aberto={aberto === k}
                    onAbrir={() => setAberto(aberto === k ? null : k)}
                    onBaixar={() => { if (motivo.trim().length < 5) { showToast("Escreva o motivo da baixa (mínimo 5 caracteres).", "erro"); return; } setConfirmar(k); }} />
                );
              })}
            </tbody>
          </table>
          {/* ⚠ dito na tela, não só no código: quem baixa a pintura fecha a rota inteira */}
          <p className="px-4 py-3 text-[11px] text-torg-gray border-t border-gray-100">
            Baixar um setor fecha também os anteriores dele — apontamento na frente dá baixa atrás. Baixar a <b>Pintura</b> fecha a rota inteira.
            Nada disto vai ao Syneco: lá continua valendo a planilha de Baixa Syneco.
          </p>
        </div>
      )}

      <ConfirmModal
        open={!!confirmar} variant="destrutivo" loading={enviando}
        titulo={`Dar baixa em ${rotulo(confirmar)} — ${op ? fmtOP(op.numero) : ""}`}
        labelConfirmar="Dar baixa em tudo"
        onClose={() => setConfirmar(null)} onConfirm={baixar}
        mensagem={confirmar && dados?.porSetor[confirmar]
          ? `${dados.porSetor[confirmar].pecas} peça(s) em ${dados.porSetor[confirmar].itens.length} marca(s), ${nkg(dados.porSetor[confirmar].kg)} kg, vão ficar como feitas em ${rotulo(confirmar)} e em todos os setores anteriores.\n\nMotivo: ${motivo.trim()}\n\nFica gravado quem e quando. Não vai ao Syneco.`
          : ""}
      />
    </div>
  );
}

function FragmentoSetor({ k, nome, s, vazio, aberto, onAbrir, onBaixar }) {
  return (
    <>
      <tr className={vazio ? "text-gray-400" : ""}>
        <td className="px-4 py-2.5 font-semibold text-torg-dark">
          <button type="button" onClick={onAbrir} disabled={vazio} className="inline-flex items-center gap-1.5 disabled:opacity-60">
            <ChevronDown size={14} className={`transition ${aberto ? "rotate-180" : ""}`} /> {nome}
          </button>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">{s?.itens.length ?? 0}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{s?.pecas ?? 0}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{nkg(s?.kg)}</td>
        <td className="px-4 py-2.5 text-right">
          {vazio ? <span className="text-[11px] text-emerald-600 font-semibold">nada pendente</span> : (
            <button type="button" onClick={onBaixar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-torg-blue text-white text-xs font-semibold hover:bg-torg-dark">
              <CheckCheck size={14} /> Dar baixa em tudo
            </button>
          )}
        </td>
      </tr>
      {aberto && !vazio && (
        <tr><td colSpan={5} className="px-4 pb-3 bg-gray-50/40">
          <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60 text-torg-gray"><tr><th className="text-left px-3 py-1.5">Marca</th><th className="text-left px-3 py-1.5">Descrição</th><th className="text-right px-3 py-1.5">Feito / Qte</th><th className="text-right px-3 py-1.5">Falta</th><th className="text-right px-3 py-1.5">kg</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {s.itens.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-1 font-semibold text-torg-dark">{i.marca}</td>
                    <td className="px-3 py-1 text-torg-gray truncate max-w-[280px]">{i.descricao || i.tipoPeca || "—"}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{i.feito} / {i.qte}</td>
                    <td className="px-3 py-1 text-right tabular-nums font-semibold">{i.falta}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{nkg(i.kgFalta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </td></tr>
      )}
    </>
  );
}
