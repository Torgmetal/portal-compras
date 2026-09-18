"use client";

// Uma linha da lista de cobrança: o fornecedor, seus pedidos atrasados e o estado do envio.
import { AlertTriangle, CheckCircle2, XCircle, HelpCircle, Clock } from "lucide-react";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const diasDesde = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

/** ⚠ Cada estado tem palavra própria: "erro" para tudo faria a pessoa reenviar o que já saiu. */
const ESTADO = {
  aceito: { Icone: CheckCircle2, cor: "text-emerald-700", texto: "enviado" },
  falhou: { Icone: XCircle, cor: "text-red-700", texto: "não enviado" },
  indeterminado: { Icone: HelpCircle, cor: "text-amber-700", texto: "sem confirmação — não reenvie sem conferir" },
  bloqueado: { Icone: AlertTriangle, cor: "text-amber-700", texto: "bloqueado" },
  recente: { Icone: Clock, cor: "text-amber-700", texto: "cobrado há pouco" },
  ocupado: { Icone: Clock, cor: "text-amber-700", texto: "outra cobrança em andamento" },
  desconhecido: { Icone: XCircle, cor: "text-gray-500", texto: "não está mais atrasado" },
};

/** Um pedido do fornecedor, como a conferência da tela o mostra antes do disparo. */
function LinhaPedido({ l }) {
  return (
    <li className="text-xs text-torg-gray tabular-nums">
      <b className="text-torg-dark">Ped {l.numeroPedido ?? "—"}</b> · RM {l.rmNumero || "—"}
      {l.opNumero ? ` · OP ${String(l.opNumero).padStart(3, "0")}` : ""}
      {l.opCliente ? ` ${l.opCliente}` : ""}
      {" · "}prazo {fmtData(l.previsao)} · {plural(l.diasAtraso, "dia", "dias")}
      {l.parcial ? " · recebido parcial" : ""}
    </li>
  );
}

/** A cor da borda diz em que estado a linha está, antes de qualquer texto. */
function moldura(bloqueado, marcado) {
  if (bloqueado) return "border-amber-200 bg-amber-50/40";
  return marcado ? "border-torg-blue bg-torg-blue/5" : "border-gray-200 bg-white";
}

/**
 * As três frases que podem aparecer sob o fornecedor.
 *
 * ⚠⚠ O MOTIVO DO BLOQUEIO FICA À VISTA. Uma linha desabilitada sem explicação faz a pessoa clicar
 * três vezes e concluir que a tela está quebrada.
 *
 * ⚠ E a data da última cobrança também: cobrança repetida diária é a forma mais rápida de o
 * e-mail da Torg virar ruído na caixa do fornecedor.
 */
function Avisos({ f, bloqueado, recente, est, resultado }) {
  return (
    <>
      {bloqueado && (
        <p className="mt-1.5 text-xs text-amber-800 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-px shrink-0" /> {f.motivoBloqueio}
        </p>
      )}
      {!bloqueado && f.ultimaCobranca && (
        <p className={`mt-1.5 text-xs ${recente ? "text-amber-700" : "text-torg-gray"}`}>
          cobrado em {fmtData(f.ultimaCobranca)}
          {recente ? ` — há ${plural(diasDesde(f.ultimaCobranca), "dia", "dias")}` : ""}
        </p>
      )}
      {est && (
        <p className={`mt-1.5 text-xs flex items-start gap-1.5 ${est.cor}`}>
          <est.Icone size={13} className="mt-px shrink-0" />
          {est.texto}{resultado.motivo ? ` — ${resultado.motivo}` : ""}
        </p>
      )}
    </>
  );
}

export default function LinhaFornecedorCobranca({ f, marcado, onMarcar, resultado, intervaloDias }) {
  const bloqueado = !!f.bloqueio;
  const recente = f.ultimaCobranca && diasDesde(f.ultimaCobranca) < intervaloDias;
  const pior = f.pedidos[0]?.diasAtraso ?? 0;
  const est = resultado ? ESTADO[resultado.estado] : null;

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${moldura(bloqueado, marcado)}`}>
      <label className={`flex items-start gap-3 ${bloqueado ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input type="checkbox" checked={marcado} disabled={bloqueado}
          onChange={(e) => onMarcar(f.chave, e.target.checked)}
          className="mt-1 h-4 w-4 accent-torg-blue disabled:opacity-40" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-sm text-torg-dark">{f.nome}</span>
            <span className="text-xs text-torg-gray">
              {plural(f.pedidos.length, "pedido", "pedidos")} · pior atraso {plural(pior, "dia", "dias")}
            </span>
          </div>
          <div className="text-xs text-torg-gray mt-0.5 truncate">{f.email || "sem e-mail cadastrado"}</div>

          <Avisos f={f} bloqueado={bloqueado} recente={recente} est={est} resultado={resultado} />

          {/* Os pedidos que entram neste e-mail, para conferir antes de disparar. */}
          <details className="mt-1.5">
            <summary className="text-xs text-torg-blue cursor-pointer select-none">ver os pedidos</summary>
            <ul className="mt-1.5 space-y-1">
              {f.pedidos.map((l) => <LinhaPedido key={l.id} l={l} />)}
            </ul>
          </details>
        </div>
      </label>
    </div>
  );
}
