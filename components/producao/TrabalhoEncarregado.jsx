"use client";
import {
  ChevronRight,
  FileText,
  Flag,
  CalendarDays,
  ArrowLeftRight,
  AlertTriangle,
} from "lucide-react";
import { temPrioridade } from "@/lib/fila-operador";
import { rotuloPosto } from "@/lib/postos-operador";
import RemanejarBancada from "./RemanejarBancada";
import { botao, fmt, data } from "./ConsultaOperacional";

const VERBOS = {
  CORTE: "Cortar",
  MONTAGEM: "Montar",
  SOLDA: "Soldar",
  ACABAMENTO: "Dar acabamento",
  JATO: "Jatear",
  PINTURA: "Pintar",
};

export default function TrabalhoEncarregado({
  lote: l,
  tipo = "hoje",
  hoje,
  aberto,
  onAbrir,
  onDesenho,
  onFicha,
  remanejar,
  onRemanejar,
  onSalvo,
  atualizando,
  proximo,
}) {
  const feito = l.itens.reduce(
    (s, i) => s + Math.min(Number(i.q) || 0, Number(i.f) || 0),
    0,
  );
  const total = feito + l.saldo;
  const pendente = tipo === "pendencia";
  const programar = tipo === "programar";
  const prioritario = l.saldoPrioritario > 0;
  const vencidos = [
    ...new Set(
      l.itens
        .flatMap((i) => i.faixas.map((f) => f.diaOrigem))
        .filter((d) => d && d < hoje),
    ),
  ].sort();
  return (
    <article
      aria-label={`OP ${l.op} · ${rotuloPosto(l.recurso)}`}
      className={`bg-white border rounded-xl min-w-0 overflow-hidden ${prioritario ? "border-l-4 border-l-orange-500" : "border-gray-200"}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-2 items-center text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold ${pendente || prioritario ? "bg-orange-50 text-orange-900" : "bg-blue-50 text-torg-blue"}`}
          >
            {pendente ? (
              <AlertTriangle size={14} />
            ) : prioritario ? (
              <Flag size={14} />
            ) : (
              <CalendarDays size={14} />
            )}
            {pendente
              ? "Depende de liberação"
              : programar
                ? "Definir programação"
                : tipo === "futuro"
                  ? "Programado"
                  : prioritario
                    ? "Prioridade · fazer primeiro"
                    : feito > 0
                      ? "Apontamento parcial"
                      : "Para fazer"}
          </span>
          {!pendente && !programar && (
            <span className="text-torg-gray">
              {tipo === "futuro"
                ? data(l.dia)
                : vencidos.length
                  ? `Saldo desde ${data(vencidos[0])}`
                  : "Programado para hoje"}
            </span>
          )}
        </div>
        <h3 className="font-bold text-lg sm:text-xl text-torg-dark mt-3 break-words">
          {rotuloPosto(l.recurso)}
        </h3>
        <p className="font-semibold text-torg-dark mt-1">
          {VERBOS[l.setor]} · OP {l.op}
        </p>
        <p className="text-sm text-torg-gray mt-1 break-words">
          {l.obra || "Obra sem descrição"}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2 mt-3">
          <strong className="text-2xl font-bold text-torg-dark">
            {fmt(l.saldo)} peças
          </strong>
          <span className="text-sm text-torg-gray">
            {pendente
              ? "aguardando liberação"
              : programar
                ? "para distribuir"
                : "para terminar"}
          </span>
        </div>
        {!pendente && !programar && (
          <>
            <p className="text-xs text-torg-gray mt-1">
              {fmt(feito)} de {fmt(total)} apontadas nesta seleção
            </p>
            <div
              role="progressbar"
              aria-label={`Apontamento da OP ${l.op} nesta seleção`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={feito}
              className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2"
            >
              <div
                className="h-full bg-torg-blue"
                style={{ width: `${total ? (100 * feito) / total : 0}%` }}
              />
            </div>
          </>
        )}
        {prioritario && (
          <p className="text-xs font-semibold text-orange-900 mt-3">
            Prioridade · {fmt(l.saldoPrioritario)} peças
          </p>
        )}
        {pendente ? (
          <div className="text-sm bg-amber-50 text-amber-900 p-3 rounded-lg mt-3 space-y-1">
            {[...new Set(l.itens.map((i) => i.motivo))].map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-torg-gray mt-3 break-words">
            {l.itens
              .slice(0, 3)
              .map((i) => `${i.m} (${fmt(i.saldo)})`)
              .join(" · ")}
            {l.itens.length > 3 ? ` · +${l.itens.length - 3} marcas` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            className={`${botao} flex-1 inline-flex items-center justify-center gap-2 !text-torg-blue`}
            aria-expanded={aberto === l.id}
            onClick={() => onAbrir(aberto === l.id ? null : l.id)}
          >
            {aberto === l.id
              ? "Recolher peças"
              : tipo === "hoje"
                ? "Ver peças e desenhos"
                : "Ver peças"}
            <ChevronRight
              size={16}
              className={`shrink-0 ${aberto === l.id ? "rotate-90" : ""}`}
            />
          </button>
          {l.setor === "MONTAGEM" &&
            !pendente &&
            !programar &&
            l.recurso &&
            !l.terceiroRecebido &&
            !l.terceiroPrevisto && (
              <button
                className={`${botao} inline-flex flex-1 items-center justify-center gap-2`}
                disabled={atualizando || !!remanejar}
                onClick={() => onRemanejar(l)}
              >
                <ArrowLeftRight size={16} className="shrink-0" />
                Trocar bancada / data
              </button>
            )}
        </div>
        {remanejar?.id === l.id && (
          <RemanejarBancada
            trabalho={remanejar}
            hoje={hoje}
            onClose={() => onRemanejar(null)}
            onSalvo={onSalvo}
          />
        )}
        {proximo && (
          <div className="border-t mt-4 pt-3 text-sm">
            <p className="text-xs text-torg-gray">
              Próximo lote programado · {data(proximo.dia)}
            </p>
            <p className="font-medium text-torg-dark mt-1">
              OP {proximo.op} · {fmt(proximo.saldo)} peças
            </p>
          </div>
        )}
      </div>
      {aberto === l.id && (
        <div className="border-t divide-y">
          {l.itens.map((i, k) => (
            <div key={`${i.id}-${k}`} className="p-4 sm:px-5">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-torg-dark break-all">{i.m}</p>
                  {temPrioridade(i) && (
                    <p className="text-xs font-bold text-orange-800 mt-1">
                      Prioridade {i.prioridade} nesta OP
                    </p>
                  )}
                  {i.pf && (
                    <p className="text-xs text-torg-gray mt-1">{i.pf}</p>
                  )}
                  <p className="text-xs text-torg-gray mt-1">
                    {fmt(i.f)} de {fmt(i.q)} apontadas nesta seleção
                  </p>
                </div>
                <strong className="shrink-0 text-lg">{fmt(i.saldo)} un.</strong>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  disabled={!l.opId}
                  className={`${botao} !text-torg-blue flex justify-center items-center gap-2`}
                  onClick={() =>
                    onDesenho({ opId: l.opId, opNumero: l.op, marca: i.m })
                  }
                >
                  <FileText size={16} className="shrink-0" />
                  Desenho
                </button>
                <button
                  disabled={!l.opId}
                  className={botao}
                  onClick={() => onFicha({ opId: l.opId, marca: i.m })}
                >
                  Ficha e material
                </button>
              </div>
              {i.motivo && (
                <p className="text-xs text-amber-900 mt-2">{i.motivo}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
