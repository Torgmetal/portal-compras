"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, FileDown, CheckCircle2, Clock, PenLine, RotateCcw, X } from "lucide-react";

const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function AssinarClient({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  // ⚠ pedir revisão é caminho à parte da assinatura: nome e motivo próprios, para ninguém recusar
  // por engano no campo que existe para assinar.
  const [revisando, setRevisando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [nomeRev, setNomeRev] = useState("");
  const [enviandoRev, setEnviandoRev] = useState(false);
  const [feito, setFeito] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/qualidade/data-books/assinar/${token}`);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Link inválido");
      setData(j.data);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  const ehCliente = data?.etapa?.papel === "CLIENTE";

  async function confirmar() {
    if (nome.trim().length < 3) { alert("Informe seu nome completo."); return; }
    if (!confirm(ehCliente ? "Confirmar o recebimento e o aceite deste Data Book? Registra a entrega da obra." : "Confirmar sua assinatura digital neste Data Book?")) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/qualidade/data-books/assinar/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim() }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao registrar");
      setData(j.data);
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  // ⚠⚠ PEDIR REVISÃO EM VEZ DE ASSINAR.
  // Vitor (24/08/2026): "um dos assinantes pediu uma revisão, mas não conseguimos, pois ele deve
  // assinar para depois começar novamente". Sem este caminho, quem achava erro tinha de ASSINAR —
  // atestar com nome, data e IP um documento que sabia estar errado — só para o fluxo andar até dar
  // para abrir revisão. Qualquer um da cadeia pode, a qualquer momento, tenha assinado ou não.
  async function pedirRevisao() {
    if (nomeRev.trim().length < 3) { alert("Informe seu nome completo."); return; }
    if (motivo.trim().length < 5) { alert("Descreva o que precisa ser corrigido."); return; }
    if (!confirm("Pedir revisão deste Data Book?\n\nO fluxo volta ao início: TODAS as assinaturas já dadas deixam de valer e o dossiê sobe de revisão. A Qualidade corrige e reinicia.")) return;
    setEnviandoRev(true);
    try {
      const r = await fetch(`/api/qualidade/data-books/assinar/${token}/revisao`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeRev.trim(), motivo: motivo.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao pedir revisão");
      setFeito(j);
      setRevisando(false);
      await carregar();
    } catch (e) { alert(e.message); } finally { setEnviandoRev(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-torg-blue" size={28} /></div>;
  if (erro) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
        <AlertCircle size={28} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-gray-700">{erro}</p>
      </div>
    </div>
  );

  const { etapa, etapas, suaVez, jaAssinado } = data;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-torg-dark text-white rounded-t-xl px-6 py-5">
          <div className="text-lg font-extrabold tracking-tight">TORG METAL</div>
          <div className="text-[12px] text-white/70">Data Book da Qualidade · {data.op}{data.obra ? ` — ${data.obra}` : ""}</div>
        </div>
        <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 shadow-sm p-6 space-y-5">
          {/* Trilha de assinaturas */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-torg-gray font-semibold mb-2">Fluxo de assinaturas</p>
            <div className="space-y-1.5">
              {etapas.map((e) => {
                const assinada = e.status === "ASSINADO";
                const atual = e.ordem === etapa.ordem;
                return (
                  <div key={e.ordem} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${atual ? "border-torg-blue bg-torg-blue-50/40" : "border-gray-100"}`}>
                    {assinada ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <Clock size={16} className="text-torg-gray shrink-0" />}
                    <span className="font-medium text-torg-dark">{e.label}</span>
                    <span className="text-torg-gray truncate flex-1">{assinada ? `· ${e.assinadoNome}` : e.nome ? `· ${e.nome}` : ""}</span>
                    <span className="text-[11px] text-torg-gray whitespace-nowrap">{assinada ? fmtDataHora(e.assinadoEm) : atual ? "agora" : "aguardando"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <a href={data.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-torg-blue hover:underline font-medium">
            <FileDown size={16} /> Abrir / baixar o Data Book (PDF)
          </a>

          {feito && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold flex items-center gap-2"><RotateCcw size={16} /> Revisão pedida — o dossiê passou para a {feito.revisao}.</p>
              <p className="text-[12px] mt-1">
                {feito.assinaturasZeradas > 0 ? `${feito.assinaturasZeradas} assinatura(s) do fluxo foram zeradas. ` : ""}
                {feito.avisados > 0 ? `${feito.avisados} pessoa(s) da cadeia foram avisadas por e-mail. ` : ""}
                A Qualidade vai corrigir o que você apontou e reiniciar o fluxo.
              </p>
            </div>
          )}

          {/* Ação da etapa */}
          {jaAssinado ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={18} /> {ehCliente ? "Aceite registrado" : "Assinatura registrada"} por <b>{etapa.assinadoNome}</b> em {fmtDataHora(etapa.assinadoEm)}.
            </div>
          ) : suaVez ? (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm text-torg-dark font-medium mb-1 flex items-center gap-2"><PenLine size={16} className="text-torg-blue" /> {ehCliente ? "Recebimento e aceite" : `Assinatura — ${etapa.label}`}</p>
              <p className="text-[12px] text-torg-gray mb-3">Confira o Data Book acima. {ehCliente ? "Não havendo ressalvas, confirme o recebimento e o aceite da obra." : "Para assinar digitalmente, informe seu nome completo e confirme."}</p>
              <label className="block text-xs font-medium text-torg-gray mb-1">Seu nome completo</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
              <button onClick={confirmar} disabled={enviando || nome.trim().length < 3}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white text-sm font-semibold rounded-lg hover:bg-torg-blue-700 disabled:opacity-50">
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} {ehCliente ? "Confirmar recebimento e aceite" : "Assinar digitalmente"}
              </button>
              <p className="text-[10px] text-torg-gray mt-2">Ao confirmar, registramos seu nome, data/hora e IP como assinatura digital desta etapa.</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <Clock size={18} /> Aguardando a etapa anterior do fluxo ser assinada. Você receberá um e-mail quando for a sua vez.
            </div>
          )}

          {/* ⚠ SEMPRE DISPONÍVEL, inclusive para quem já assinou e para quem ainda não é a vez.
              Erro visto depois continua sendo erro, e quem recebeu o dossiê não precisa esperar a
              fila chegar para avisar. Fica discreto, embaixo e em texto: é a saída de exceção do
              fluxo, não uma alternativa de mesmo peso ao "assinar". */}
          {!feito && (
            <div className="border-t border-gray-100 pt-4">
              {!revisando ? (
                <button onClick={() => { setRevisando(true); setNomeRev(nome); }}
                  className="text-[13px] text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1.5 font-medium">
                  <RotateCcw size={14} /> Encontrei algo errado — pedir revisão
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><RotateCcw size={16} /> Pedir revisão</p>
                    <button onClick={() => setRevisando(false)} className="text-amber-700 hover:text-amber-900"><X size={15} /></button>
                  </div>
                  <p className="text-[12px] text-amber-800 mt-1 mb-3">
                    O fluxo volta ao início: <b>todas as assinaturas já dadas deixam de valer</b> e o dossiê sobe de revisão.
                    A Qualidade corrige o que você apontar e reinicia.
                  </p>
                  <label className="block text-xs font-medium text-amber-900 mb-1">Seu nome completo</label>
                  <input value={nomeRev} onChange={(e) => setNomeRev(e.target.value)} placeholder="Nome completo"
                    className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-300/40 focus:border-amber-400 outline-none" />
                  <label className="block text-xs font-medium text-amber-900 mt-3 mb-1">O que precisa ser corrigido</label>
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
                    placeholder="Ex.: falta o certificado da corrida 12345 na seção 02; a ART está vencida."
                    className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-300/40 focus:border-amber-400 outline-none resize-y" />
                  {/* ⚠ o motivo é o que a Qualidade vai ler para saber o que refazer — vago aqui
                      significa uma volta a mais depois. */}
                  <p className="text-[10px] text-amber-700 mt-1">Escreva o suficiente para quem for corrigir não precisar te procurar.</p>
                  <button onClick={pedirRevisao} disabled={enviandoRev || nomeRev.trim().length < 3 || motivo.trim().length < 5}
                    className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50">
                    {enviandoRev ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Pedir revisão e voltar o fluxo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">Documento controlado — Torg Metal · Estruturas Metálicas</p>
      </div>
    </div>
  );
}
