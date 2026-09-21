"use client";
import BlocoObservacao from "@/components/BlocoObservacao";
import { parseObservacaoCotacao, condicaoPagamentoDe } from "@/lib/cotacao-observacao";
import { freteDe, acaoFrete } from "@/lib/frete-cotacao";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2, Check, Mail, Edit3, Plus, MessageSquareText } from "lucide-react";
import { CotacaoAnexoChip } from "./CotacaoAnexoChip";
import { ModalLancarManual } from "./ModalLancarManual";
import { ModalVincularRM } from "./ModalVincularRM";
import { fmtData, fmtMoeda } from "../_lib/formatos";

export function CotacoesList({ rm, outrasRMs = [] }) {
  const router = useRouter();
  const [modalVincular, setModalVincular] = useState(null); // cotação selecionada
  const [copiado, setCopiado] = useState(null);
  const [modalManual, setModalManual] = useState(null);
  const [emailToast, setEmailToast] = useState(null);
  const [emailsCache, setEmailsCache] = useState({}); // cotId -> { html, text, to, subject }
  const [cancelando, setCancelando] = useState(null);
  const [confirmCancelar, setConfirmCancelar] = useState(null);
  const [enviandoEmail, setEnviandoEmail] = useState(null); // cotId em envio direto
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleCancelarCotacao = async (cotId) => {
    setCancelando(cotId);
    setConfirmCancelar(null);
    try {
      const res = await fetch(`/api/cotacao/${cotId}/cancelar`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      setEmailToast({ id: cotId, ok: false, msg: `Erro ao cancelar: ${e.message}` });
      setTimeout(() => setEmailToast(null), 5000);
    } finally {
      setCancelando(null);
    }
  };

  // Pre-fetch dos emails das cotacoes ativas. Cacheia no state pra que o
  // clipboard.write seja sincrono no clique (sem perder user gesture).
  useEffect(() => {
    const ativas = (rm.cotacoes || []).filter((c) => c.status !== "CANCELADA" && c.status !== "DECLINADA");
    ativas.forEach((c) => {
      if (emailsCache[c.id]) return;
      fetch(`/api/cotacao/${c.id}/preview-email?format=json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setEmailsCache((prev) => ({ ...prev, [c.id]: data }));
        })
        .catch(() => { /* silencioso */ });
    });
  }, [rm.cotacoes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reenvia a cotação por e-mail DIRETO pela plataforma (Resend) — não copia
  // mais pro clipboard nem abre o Outlook. Se o Resend não estiver configurado,
  // o endpoint devolve 503 com instrução pra usar "Copiar link".
  const handleEnviarEmail = async (cot) => {
    setEmailToast(null);
    setEnviandoEmail(cot.id);
    try {
      const res = await fetch(`/api/cotacao/${cot.id}/enviar-email`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao enviar e-mail");
      setEmailToast({ id: cot.id, ok: true, msg: `E-mail enviado para ${data.emailEnviadoPara || cot.fornecedorEmail || "o fornecedor"}` });
      setTimeout(() => setEmailToast(null), 6000);
    } catch (e) {
      setEmailToast({ id: cot.id, ok: false, msg: e.message });
    } finally {
      setEnviandoEmail(null);
    }
  };

  const copiarLink = async (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    await navigator.clipboard.writeText(link);
    setCopiado(cot.id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const STATUS_COT = {
    PENDENTE: { label: "Aguardando", className: "bg-torg-blue-50 text-torg-blue" },
    RECEBIDA: { label: "Recebida",   className: "bg-torg-orange-50 text-torg-orange-700" },
    VENCIDA:  { label: "Vencida",    className: "bg-red-50 text-red-700" },
    CANCELADA:{ label: "Cancelada",  className: "bg-gray-100 text-gray-500" },
    DECLINADA:{ label: "Declinada",  className: "bg-gray-100 text-gray-500" },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark">Cotações ({rm.cotacoes.length})</h3>
        <p className="text-xs text-torg-gray mt-1">
          Use os botões pra reenviar o link ao fornecedor (mesmo após ele responder).
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {rm.cotacoes.map((c) => {
          const s = STATUS_COT[c.status] || STATUS_COT.PENDENTE;
          const vencida = c.prazoResposta && new Date(c.prazoResposta) < new Date() && c.status === "PENDENTE";
          return (
            <li key={c.id} className="px-6 py-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-torg-dark font-medium">{c.fornecedorNome}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                    {s.label}
                  </span>
                  {vencida && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                      vencida
                    </span>
                  )}
                  {c.numeroRevisao > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-100 text-torg-blue-800 font-medium">
                      rev {c.numeroRevisao}
                    </span>
                  )}
                  {c.ehPrimaria === false && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-torg-orange-50 text-torg-orange-700 font-medium" title="Esta RM é apenas uma das incluídas — a cotação foi criada a partir de outra RM principal">
                      RM extra
                    </span>
                  )}
                </div>
                {c.rmsVinculadas && c.rmsVinculadas.length > 1 && (
                  <p className="text-[10px] text-torg-gray mt-1">
                    Consolidada com {c.rmsVinculadas.length} RMs:{" "}
                    {c.rmsVinculadas.map((r) => r.numero).join(" + ")}
                  </p>
                )}
                <p className="text-xs text-torg-gray truncate mt-0.5">
                  {c.fornecedorEmail}
                  {" · enviada em "}{fmtData(c.createdAt)}
                  {c.recebidaEm && ` · respondida em ${fmtData(c.recebidaEm)}`}
                  {c.prazoResposta && ` · prazo ${fmtData(c.prazoResposta)}`}
                </p>
                {/* ⚠⚠ O QUE O FORNECEDOR ESCREVEU — E QUE A TELA ENGOLIA. Matheus (16/09/2026):
                    "quando um fornecedor responde as solicitações preciso ver o campo Observações
                    que eles escrevem". Medido no mesmo dia: 447 cotações e 1.266 itens de cotação
                    com texto gravado, invisível aqui. É onde a SOUFER escreveu "SEM
                    DISPONIBILIDADE" — a informação que decide a compra, guardada no banco.

                    ⚠ `Cotacao.observacao` empilha prazo, pagamento e o texto livre num campo só;
                    `parseObservacaoCotacao` separa. Prazo de entrega e condição de pagamento saem
                    aqui porque não têm campo próprio NA TELA.

                    ⚠⚠ O PAGAMENTO ESTAVA FALTANDO, E O COMENTÁRIO ANTERIOR DISFARÇAVA ISSO. Ele
                    dizia "o pagamento já sai no mapa comparativo" — sai, no EXCEL do mapa, que
                    alguém precisa baixar e abrir. Na tela não aparecia em canto nenhum. Matheus
                    (16/09/2026): "quando o fornecedor preenche forma de pagamento devia aparecer
                    também na tela pra gente avaliar igual o prazo de entrega". Comparar uma
                    proposta em 28 dias com outra à vista sem ver isso é comparar só o preço. */}
                {(() => {
                  const { prazoEntrega, observacao } = parseObservacaoCotacao(c.observacao);
                  const pagamento = condicaoPagamentoDe(c);
                  const frete = freteDe(c);
                  // ⚠ `observacoesItens`, não `c.itens`: a página apaga os itens do payload e a
                  // lista que sobra só tem item em status cotável — numa RM já fechada, vazia.
                  const porItem = c.observacoesItens || [];
                  if (!observacao && !prazoEntrega && !pagamento && !frete && !porItem.length) return null;
                  return (
                    <div className="mt-1.5 space-y-1">
                      {/* ⚠ Os dois na MESMA linha quando cabem: são as duas condições comerciais
                          da proposta e quem compara lê as duas juntas. Empilhados, viram duas
                          linhas de 11px que o olho passa batido. */}
                      {(prazoEntrega || pagamento || frete) && (
                        <p className="text-[11px] text-torg-gray flex flex-wrap gap-x-3 gap-y-0.5">
                          {prazoEntrega && (
                            <span><b className="font-semibold text-torg-dark">Prazo de entrega:</b> {prazoEntrega}</span>
                          )}
                          {pagamento && (
                            <span><b className="font-semibold text-torg-dark">Pagamento:</b> {pagamento}</span>
                          )}
                          {/* ⚠ A SIGLA VEM COM A AÇÃO JUNTO ("FOB · Coletar"), como no resto do
                              portal: sozinha, ela obriga quem lê a lembrar a convenção — e quem
                              lê esta linha está decidindo se precisa mandar o caminhão. */}
                          {frete && (
                            <span><b className="font-semibold text-torg-dark">Frete:</b> {frete} · {acaoFrete(frete)}</span>
                          )}
                        </p>
                      )}
                      {/* ⚠ A resposta GERAL fica sempre à vista: é a que o fornecedor digitou
                          pensando na proposta inteira ("sem disponibilidade", "frete por conta
                          da Torg"), e é a que decide a compra. */}
                      <BlocoObservacao texto={observacao} rotulo="Resposta do fornecedor" compacto />

                      {/* ⚠⚠ AS DE ITEM VÊM FECHADAS, E ISSO É DESENHO, NÃO PREGUIÇA. Uma cotação
                          de 7 itens vira sete tarjas âmbar empilhadas e empurra preço e botões
                          para fora da vista — testado na RI-0007. Boa parte desse texto é o que o
                          leitor de PDF extraiu ("CST 060 - ICMS ST: 0,00"), útil quando se procura,
                          ruído quando se está conferindo a lista. O resumo diz QUANTAS são, então
                          ninguém precisa abrir para saber que existem.

                          ⚠ Com o nome do item na frente: saber QUE há observação sem saber DE QUAL
                          item não ajuda ninguém. */}
                      {porItem.length > 0 && (
                        <details className="mt-1">
                          <summary className="text-[11px] text-amber-800 cursor-pointer select-none hover:underline inline-flex items-center gap-1">
                            <MessageSquareText size={12} className="text-amber-600" />
                            {/* ⚠ "observação" perde o ~ no plural: emendar "ões" no fim dava
                                "observaçãoões". A palavra troca inteira. */}
                            {porItem.length} {porItem.length > 1 ? "observações" : "observação"} nos itens
                          </summary>
                          <div className="mt-0.5">
                            {porItem.map((i) => (
                              <BlocoObservacao key={i.id} compacto rotulo={i.descricao} texto={i.observacao} />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })()}

                {/* Anexos da cotacao (PDF/imagens da proposta) */}
                {(c.anexos || []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.anexos.map((a) => (
                      <CotacaoAnexoChip key={a.id} anexo={a} cotacaoId={c.id} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {c.total > 0 && (
                  <span className="text-torg-orange-700 font-semibold tabular-nums text-sm">
                    {fmtMoeda(c.total)}
                  </span>
                )}
                <button
                  onClick={() => setModalManual(c)}
                  className="px-3 py-1.5 text-xs bg-white border border-torg-orange-200 text-torg-orange-700 rounded-lg hover:bg-torg-orange-50 font-medium inline-flex items-center gap-1"
                  title="Lançar a proposta manualmente (quando recebida fora do portal)"
                >
                  <Edit3 size={12} /> {c.recebidaEm ? "Editar" : "Lançar manual"}
                </button>
                <button
                  onClick={() => copiarLink(c)}
                  className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 font-medium"
                  title="Copiar o link único do fornecedor"
                >
                  {copiado === c.id ? "✓ copiado" : "Copiar link"}
                </button>
                {outrasRMs.length > 0 && c.status !== "CANCELADA" && (
                  <button
                    onClick={() => setModalVincular(c)}
                    className="px-3 py-1.5 text-xs bg-white border border-torg-blue-200 text-torg-blue rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1"
                    title="Vincular outra RM nessa cotação (esqueceu de incluir antes)"
                  >
                    <Plus size={12} /> Vincular RM
                  </button>
                )}
                {c.status !== "CANCELADA" && (
                  <>
                    {confirmCancelar === c.id ? (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-red-700 font-medium">
                          Cancelar cotação{c.status === "RECEBIDA" ? " e reverter pedido" : ""}?
                        </span>
                        <button
                          onClick={() => handleCancelarCotacao(c.id)}
                          disabled={cancelando === c.id}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {cancelando === c.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmCancelar(null)}
                          className="px-2 py-1 text-xs text-torg-gray hover:text-torg-dark font-medium"
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancelar(c.id)}
                        disabled={cancelando === c.id}
                        className="px-3 py-1.5 text-xs bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        title="Cancelar esta cotação — reverte pedidos e itens voltam para cotação"
                      >
                        {cancelando === c.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Cancelar
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => handleEnviarEmail(c)}
                  disabled={enviandoEmail === c.id}
                  className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1 disabled:opacity-60"
                  title="Envia o e-mail com o link da cotação direto pelo sistema (Resend) — não precisa colar no Outlook"
                >
                  {enviandoEmail === c.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                  {enviandoEmail === c.id ? "Enviando…" : (c.recebidaEm ? "Reenviar email" : "Enviar email")}
                </button>
              </div>
              {emailToast?.id === c.id && (
                <div className={`w-full mt-2 text-xs rounded px-3 py-2 ${
                  emailToast.ok
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1">
                      {emailToast.ok ? "✓ " : "✗ "}{emailToast.msg}
                    </span>
                    <button onClick={() => setEmailToast(null)} className="opacity-60 hover:opacity-100">×</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {modalManual && (
        <ModalLancarManual cotacao={modalManual} rm={rm} onClose={() => setModalManual(null)} />
      )}
      {modalVincular && (
        <ModalVincularRM
          cotacao={modalVincular}
          outrasRMs={outrasRMs}
          onClose={() => setModalVincular(null)}
        />
      )}
    </div>
  );
}
