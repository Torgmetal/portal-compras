"use client";
import { useState, useEffect } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, CalendarDays, Package, Truck, Clock, History, Hourglass,
} from "lucide-react";
import Formulario from "./Formulario";

// ⚠⚠ PRAZO SE FORMATA EM UTC. Ele vem de um `<input type="date">` e é gravado como meia-noite
// UTC; no fuso de São Paulo isso ainda é o dia ANTERIOR, e a página mostrava ao fornecedor uma
// data um dia antes da que ele mesmo digitou (18/09/2026).
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

/** ⚠ Para CARIMBO de quando algo aconteceu — aí o fuso local é o certo, não UTC. */
const fmtQuando = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const fmtQtd = (qtd, unidade) => {
  if (qtd == null) return "—";
  const dec = unidade === "KG" ? 1 : 0;
  return `${Number(qtd).toFixed(dec)} ${unidade || ""}`.trim();
};

export default function EntregaFornecedorForm({ token }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // ⚠⚠ DUAS RESPOSTAS POSSÍVEIS, UMA DE CADA VEZ. Matheus (18/09/2026): "é interessante ter a
  // opção de Pedido Entregue e campo para informar número da NF". Deixar os dois formulários
  // abertos ao mesmo tempo convidaria a preencher os dois e o servidor recusaria — a escolha vem
  // antes, e cada aba mostra só o que ela pede.
  const [aba, setAba] = useState("previsao"); // "previsao" | "entregue"
  const [novoPrazo, setNovoPrazo] = useState("");
  const [nfNumero, setNfNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/fornecedores/entrega/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao carregar");
        setDados(data);
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [token]);

  const entregueAba = aba === "entregue";

  const enviar = async () => {
    if (entregueAba && !nfNumero.trim()) { setErroEnvio("Informe o numero da nota fiscal"); return; }
    if (!entregueAba && !novoPrazo) { setErroEnvio("Selecione a data de previsao"); return; }
    setEnviando(true);
    setErroEnvio("");
    try {
      // ⚠ Manda um OU outro, nunca os dois: o servidor recusa corpo ambíguo de propósito.
      const corpo = entregueAba
        ? { entregue: true, nfNumero: nfNumero.trim(), motivo: motivo.trim() || undefined }
        : { novoPrazo, motivo: motivo.trim() || undefined };
      const res = await fetch(`/api/fornecedores/entrega/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      setSucesso(true);
    } catch (e) {
      setErroEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // Loading
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando dados do pedido...
      </div>
    );
  }

  // Erro ao carregar
  if (erro) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-lg text-red-600 font-medium">{erro}</p>
        <p className="text-sm text-gray-400 mt-2">
          Verifique o link recebido por email ou entre em contato com a equipe de Compras.
        </p>
      </div>
    );
  }

  const d = dados;

  // Pedido ja entregue
  if (d.jaEntregue) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-torg-dark">Pedido ja entregue</h2>
        <p className="text-sm text-torg-gray mt-2">
          O Pedido #{d.numero} ja foi recebido pela Torg Metal. Nenhuma acao necessaria.
        </p>
      </div>
    );
  }

  // Sucesso ao enviar
  if (sucesso) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-torg-dark">
          {entregueAba ? "Entrega informada!" : "Previsao enviada!"}
        </h2>
        {/* ⚠⚠ "INFORMADA", NÃO "CONFIRMADA". O fornecedor precisa saber que a Torg ainda vai
            conferir o recebimento — prometer baixa aqui faria ele parar de acompanhar um pedido
            que talvez não tenha chegado. */}
        <p className="text-sm text-torg-gray mt-2">
          {entregueAba
            ? "Obrigado. A equipe de Compras da Torg Metal foi avisada e vai conferir o recebimento."
            /* ⚠⚠ "ENVIADA PARA ANALISE", NUNCA "REGISTRADA COM SUCESSO". Desde 18/09/2026 a data
               do fornecedor não passa a valer sozinha — ela espera Compras aprovar. Dizer
               "registrada" o faria programar o carregamento para uma data que a Torg ainda não
               aceitou, e ninguém descobriria a divergência até o caminhão. */
            : "A data foi enviada para a equipe de Compras da Torg Metal, que vai confirmar se ela atende a programacao da obra. Voce recebe um retorno por e-mail se ela nao puder ser aceita."}
        </p>
        <p className="text-sm text-torg-gray mt-1">
          Obrigado, <strong>{d.fornecedor}</strong>.
        </p>
      </div>
    );
  }

  const diasAtraso = d.prazoEntregaPrevisto
    ? Math.max(0, Math.ceil((Date.now() - new Date(d.prazoEntregaPrevisto).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const form = { aba, setAba, entregueAba, novoPrazo, setNovoPrazo, nfNumero, setNfNumero,
    motivo, setMotivo, erroEnvio, setErroEnvio, enviando, enviar };

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-torg-blue to-torg-dark px-6 py-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Pedido #{d.numero}</h2>
              <p className="text-white/80 text-sm">{d.fornecedor}</p>
            </div>
          </div>
        </div>

        {/* Info do prazo */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-torg-gray flex items-center gap-1.5">
              <CalendarDays size={14} /> Prazo atual
            </span>
            <span className="font-semibold text-torg-dark">
              {d.prazoEntregaPrevisto ? fmtData(d.prazoEntregaPrevisto) : "Nao definido"}
            </span>
          </div>
          {d.prazoOriginal && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-torg-gray">Prazo original</span>
              <span className="text-gray-500 line-through">{fmtData(d.prazoOriginal)}</span>
            </div>
          )}
          {/* ⚠⚠ A PROPOSTA PENDENTE PRECISA APARECER. Sem isto o fornecedor respondia, voltava ao
              link e via o prazo ANTIGO intacto — parecia que a resposta se perdeu, e ele mandaria
              de novo (e cada reenvio é outro aviso para `compras@`). */}
          {d.propostaEmAnalise && (
            <div className="flex items-start gap-2 text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <Hourglass size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-800">
                Voce informou <b>{fmtData(d.propostaEmAnalise.prazo)}</b> em {fmtQuando(d.propostaEmAnalise.em)}.
                {" "}Esta data esta <b>em analise</b> pela equipe de Compras e ainda nao substituiu o prazo acima.
              </span>
            </div>
          )}
          {diasAtraso > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-torg-gray flex items-center gap-1.5">
                <Clock size={14} /> Alem do prazo
              </span>
              <span className="font-semibold text-red-600">{diasAtraso} dia{diasAtraso !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      </div>

      {/* Itens pendentes */}
      {d.itensPendentes?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
            <Package size={14} className="text-torg-gray" />
            <h3 className="text-sm font-semibold text-torg-dark">
              Itens pendentes de entrega
            </h3>
            <span className="text-xs text-torg-gray">
              ({d.itensPendentes.length} de {d.totalItens})
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {d.itensPendentes.map((it, i) => (
              <div key={i} className="px-6 py-2.5 flex items-center justify-between">
                <span className="text-sm text-torg-dark flex-1 mr-3">{it.descricao}</span>
                <div className="text-right shrink-0">
                  <span className="text-sm font-medium text-red-600 tabular-nums">
                    {fmtQtd(it.qtdPendente, it.unidade)}
                  </span>
                  {it.totalRecebido > 0 && (
                    <p className="text-[10px] text-emerald-600">
                      {fmtQtd(it.totalRecebido, it.unidade)} ja recebido
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historico de prazos */}
      {d.prazoHistorico?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
            <History size={14} className="text-torg-gray" />
            <h3 className="text-sm font-semibold text-torg-dark">Historico de prazos</h3>
          </div>
          <div className="px-6 py-3 space-y-2">
            {d.prazoOriginal && (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                <span className="text-torg-gray">Prazo original:</span>
                <span className="font-medium text-torg-dark">{fmtData(d.prazoOriginal)}</span>
              </div>
            )}
            {d.prazoHistorico.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${
                  i === d.prazoHistorico.length - 1 ? "bg-amber-500" : "bg-amber-300"
                }`} />
                <div>
                  <span className="text-torg-gray">Atualizado para</span>{" "}
                  <span className="font-medium text-amber-700">{fmtData(h.prazoNovo)}</span>
                  <span className="text-gray-400 ml-1.5">em {fmtQuando(h.criadoEm)}</span>
                  {h.motivo && <p className="text-gray-500 italic mt-0.5">{h.motivo}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Formulario estado={form} />

      {/* Nota */}
      <p className="text-[11px] text-center text-gray-400 pb-4">
        Esta pagina e exclusiva para o fornecedor do pedido acima.
        Em caso de duvidas, entre em contato com a equipe de Compras da Torg Metal.
      </p>
    </div>
  );
}
