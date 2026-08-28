"use client";
import { useState, useEffect, useCallback } from "react";
import { FileText, CheckCircle2, Loader2, Lock, PenLine, ShieldCheck, Download, RotateCcw, Clock } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function AssinarClient({ token }) {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [concordo, setConcordo] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const [pedindo, setPedindo] = useState(false);   // formulário de revisão aberto
  const [motivo, setMotivo] = useState("");
  const [enviandoRev, setEnviandoRev] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`/api/assinar/${token}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!ok || j.error) setErro(j.error || "Não foi possível carregar."); else setInfo(j); })
      .catch(() => setErro("Erro de conexão."))
      .finally(() => setCarregando(false));
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  async function assinar() {
    setAssinando(true); setErro("");
    try {
      const r = await fetch(`/api/assinar/${token}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao assinar");
      setInfo((v) => ({ ...v, assinadoEm: j.assinadoEm, ip: j.ip }));
    } catch (e) { setErro(e.message); } finally { setAssinando(false); }
  }

  /** Devolver o documento em vez de assinar — sobe a revisão e recomeça o ciclo. */
  async function pedirRevisao() {
    setEnviandoRev(true); setErro("");
    try {
      const r = await fetch(`/api/assinar/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "REVISAO", motivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao pedir revisão");
      setInfo((v) => ({ ...v, revisaoPedida: true, revisaoPedidaPorMim: true, motivo }));
      setPedindo(false);
    } catch (e) { setErro(e.message); } finally { setEnviandoRev(false); }
  }

  const invalido = erro && !info;
  const assinado = info?.assinadoEm;
  // ⚠ PLP e PIT são ACEITE DO CLIENTE. Quem clica é o inspetor do cliente, não um responsável de
  // setor nosso — a frase que ele confirma tem de dizer o que ele está de fato aprovando.
  const aceite = !!info?.aceiteCliente;
  // ⚠ a verificação interna é OUTRA afirmação: quem assina aqui é da casa, e está dizendo que
  // elaborou ou verificou o documento — não que o aceita como cliente.
  const interna = !!info?.verificacaoInterna;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0D1F3C] text-white">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-4">
          <img src="/torg-logo-white.png" alt="Torg Metal" className="h-9 sm:h-10 shrink-0" />
          <div className="min-w-0 border-l border-white/15 pl-4">
            <p className="text-[11px] uppercase tracking-widest text-white/60">Torg Metal · Assinatura eletrônica</p>
            <h1 className="text-lg font-bold truncate">{info?.titulo || "Documento para assinatura"}</h1>
          </div>
        </div>
        <div className="h-1 bg-[#F4801F]" />
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {carregando ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin" /></div>
        ) : invalido ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <Lock size={30} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-torg-dark">{erro}</p>
            <p className="text-sm text-torg-gray mt-1">Peça um novo link à equipe da Torg Metal.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <p className="text-sm text-torg-gray">Olá <strong className="text-torg-dark">{info.nome}</strong>{info.setor ? ` · ${info.setor}` : ""} — {aceite ? "este documento da sua obra está aguardando o seu aceite." : interna ? `você foi indicado para a ${String(info.setor || "verificação").toLowerCase()} deste documento.` : "você foi indicado para validar este documento."}</p>
              <p className="text-[12px] text-torg-gray mt-1">Revisão <strong className="text-torg-dark">R{String(info.revisao ?? 0).padStart(2, "0")}</strong> · enviado em {fmtDT(info.enviadoEm)}</p>
              {/* ⚠ o PDF é o documento — não há mais versão em planilha. (Vitor, 27/08/2026) */}
              <a href={`/api/assinar/${token}/pdf`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-torg-blue hover:text-torg-dark font-medium">
                <Download size={15} /> Abrir / baixar o documento (PDF)
              </a>
            </div>

            {/* preview do PDF */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <iframe src={`/api/assinar/${token}/pdf`} title="Documento" className="w-full" style={{ height: "70vh", border: "none" }} />
            </div>

            {/* ⚠ DOCUMENTO DEVOLVIDO não se assina: uma nova revisão vai sair e este link morre aqui. */}
            {info.revisaoPedida ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
                <RotateCcw size={22} className="text-amber-600 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-900">{info.revisaoPedidaPorMim ? "Revisão pedida" : "Documento em revisão"}</p>
                  <p className="text-sm text-amber-800 mt-0.5">
                    {info.revisaoPedidaPorMim
                      ? "Registramos o seu pedido e avisamos a equipe da Torg. Uma nova revisão será enviada para assinatura."
                      : "Este documento foi devolvido para revisão. Uma nova versão será enviada para assinatura."}
                  </p>
                  {info.motivo && <p className="text-sm text-amber-900 mt-2 pl-3 border-l-2 border-amber-300">{info.motivo}</p>}
                </div>
              </div>
            ) : assinado ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">{aceite ? "Documento aceito" : "Documento assinado"}</p>
                  <p className="text-sm text-emerald-700 mt-0.5">{aceite ? "Aceite registrado" : "Assinatura registrada"} em <strong>{fmtDT(info.assinadoEm)}</strong>{info.ip ? ` · IP ${info.ip}` : ""}. Obrigado!</p>
                </div>
              </div>
            ) : info.aguardando ? (
              /* ⚠ FORA DA VEZ. O link já existe, mas o documento ainda não chegou nesta pessoa —
                 dizer de quem se espera evita o telefonema "o meu link não funciona". */
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-start gap-3">
                <Clock size={20} className="text-torg-gray shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-torg-dark">Aguardando {info.aguardando.nome}</p>
                  <p className="text-sm text-torg-gray mt-0.5">
                    O documento assina em ordem{info.aguardando.papel ? ` — falta a ${String(info.aguardando.papel).toLowerCase()}` : ""}. Você recebe um aviso quando chegar a sua vez.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-[12px] text-torg-gray mb-3 inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-600" /> Ao {aceite ? "aceitar" : "assinar"}, ficam registrados a sua confirmação, a data/hora e o IP deste acesso.</p>
                <label className="flex items-start gap-2 text-sm text-torg-dark mb-3 cursor-pointer">
                  <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} className="mt-0.5 accent-torg-blue" />
                  <span>{aceite
                    ? <>Confirmo que li o documento acima e <strong>aceito</strong> o plano apresentado para esta obra.</>
                    : interna
                      ? <>Confirmo a <strong>{String(info.setor || "verificação").toLowerCase()}</strong> deste documento e que ele está pronto para seguir ao cliente.</>
                      : <>Confirmo que li o documento acima e <strong>valido</strong> as informações como responsável do meu setor.</>}</span>
                </label>
                {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={assinar} disabled={!concordo || assinando} className="px-5 py-2.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                    {assinando ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} {aceite ? "Registrar aceite" : "Assinar documento"}
                  </button>
                  {/* ⚠ A SAÍDA DE QUEM NÃO CONCORDA. Sem ela, quem vê um erro no plano ou não assina
                      (e o documento fica parado sem ninguém saber por quê) ou assina contrariado. */}
                  {info.podePedirRevisao && !pedindo && (
                    <button onClick={() => setPedindo(true)} className="text-sm font-semibold text-amber-700 hover:underline inline-flex items-center gap-1.5">
                      <RotateCcw size={15} /> Pedir revisão
                    </button>
                  )}
                </div>

                {pedindo && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="text-[13px] font-semibold text-torg-dark mb-1">O que precisa ser revisto?</p>
                    <p className="text-[12px] text-torg-gray mb-2">O documento volta para a Torg, sobe de revisão e o ciclo de assinaturas recomeça. Quem já assinou é avisado.</p>
                    <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
                      placeholder="Ex.: a cor do acabamento do guarda-corpo está diferente do combinado."
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-torg-blue" />
                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={pedirRevisao} disabled={enviandoRev || motivo.trim().length < 5}
                        className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                        {enviandoRev ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Enviar pedido de revisão
                      </button>
                      <button onClick={() => { setPedindo(false); setMotivo(""); }} className="text-sm text-torg-gray hover:underline">cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-torg-gray text-center">Torg Metal · assinatura eletrônica registrada no portal</p>
          </div>
        )}
      </main>
    </div>
  );
}
