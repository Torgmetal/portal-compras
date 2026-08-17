"use client";
// Envio a TERCEIRO — aberto pelo painel de Liberar ao escolher "Terceiro". Escolhe o fornecedor
// (categoria "Prestadores de Serviços Terceirizados" do Vendor List), o setor de RETORNO e a data
// prevista; cria o RomaneioTerceiro (série RT-##, À PARTE do romaneio de obra) com as peças
// selecionadas e baixa o Excel. Reusa /api/fornecedores, /api/expedicao/terceiros e /api/pcp/despacho.
import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Truck, FileSpreadsheet } from "lucide-react";

const VOLTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const SETOR_LABEL = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };
const CAT_PRESTADOR = "PRESTADORES_DE_SERVICOS_TERCEIRIZADOS";
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;

export default function TerceiroModal({ obra, opId, setor, pecas, onClose, onDone }) {
  const [forns, setForns] = useState(null);
  const [fornId, setFornId] = useState("");
  const [servico, setServico] = useState("");
  const [volta, setVolta] = useState("MONTAGEM");
  const [dataRetorno, setDataRetorno] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/fornecedores?ativos=1&categoria=${CAT_PRESTADOR}`)
      .then((r) => r.json())
      .then((j) => setForns(j.fornecedores || []))
      .catch(() => setForns([]));
  }, []);

  const pesoTotal = useMemo(() => pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0), [pecas]);

  async function confirmar() {
    const forn = (forns || []).find((f) => f.id === fornId);
    if (!forn) return setErro("Escolha o terceiro (Prestador de Serviço).");
    if (!pecas.length) return setErro("Nenhuma peça selecionada.");
    setEnviando(true); setErro("");
    try {
      const itens = pecas.map((p) => ({ marca: p.marca, descricao: p.descricao || null, qte: p.qte ?? null, pesoUn: p.pesoUnitKg ?? null, pesoTotal: p.pesoTotalKg ?? null }));
      // 1) cria o romaneio do terceiro (RT-##)
      const rc = await fetch("/api/expedicao/terceiros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: forn.id, terceiroNome: forn.nomeFantasia || forn.razaoSocial, servico: servico.trim() || null,
          opRefId: opId || null, opRefNumero: String(obra), itens, dataEnvio: new Date().toISOString(),
          dataPrevRetorno: dataRetorno || null,
          observacao: `Enviado da etapa ${SETOR_LABEL[setor] || setor || "—"} · retorna para ${SETOR_LABEL[volta] || volta}`,
        }),
      });
      const rj = await rc.json();
      if (!rc.ok) throw new Error(rj.error || "Erro ao criar o romaneio do terceiro");
      const rom = rj.romaneio;
      // 2) despacha as peças (marca terceirizado + setor de retorno)
      const dc = await fetch("/api/pcp/despacho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pecas.map((p) => p.id), destino: "TERCEIRO", destinoTerceirizado: volta }),
      });
      const dj = await dc.json();
      if (!dc.ok) throw new Error(dj.error || "Romaneio criado, mas falhou ao despachar as peças.");
      // 3) baixa o Excel do romaneio
      if (rom?.id) window.open(`/api/expedicao/terceiros/${rom.id}/romaneio`, "_blank");
      onDone?.(rom, dj.atualizados);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold inline-flex items-center gap-2"><Truck size={18} className="text-indigo-600" /> Enviar para terceiro</h2>
          <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[13px] text-torg-gray">{pecas.length} peça(s) · {fmtKg(pesoTotal)} · OP {obra}{setor ? ` · ${SETOR_LABEL[setor] || setor}` : ""}</p>
          <div>
            <label className="text-[12px] font-semibold text-torg-gray">Terceiro (Prestador de Serviço)</label>
            {forns === null ? <div className="py-2 text-torg-gray"><Loader2 size={16} className="animate-spin" /></div> : (
              <select value={fornId} onChange={(e) => setFornId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] mt-1">
                <option value="">— escolha o terceiro —</option>
                {forns.map((f) => <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>)}
              </select>
            )}
            {forns && forns.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Nenhum fornecedor na categoria "Prestadores de Serviços Terceirizados" — cadastre no Vendor List.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-torg-gray">Setor de retorno</label>
              <select value={volta} onChange={(e) => setVolta(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] mt-1">
                {VOLTA.map((v) => <option key={v} value={v}>{SETOR_LABEL[v] || v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-torg-gray">Retorno previsto</label>
              <input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] mt-1" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-torg-gray">Serviço (opcional)</label>
            <input value={servico} onChange={(e) => setServico(e.target.value)} placeholder="ex.: galvanização, usinagem, corte…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] mt-1" />
          </div>
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] text-torg-gray">Gera o romaneio RT-## (à parte da obra) e baixa o Excel.</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] font-semibold text-torg-gray px-3 py-2">Cancelar</button>
            <button onClick={confirmar} disabled={enviando || !fornId} className="text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-40">
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Criar romaneio + enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
