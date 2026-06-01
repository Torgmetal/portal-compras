"use client";
import { useState } from "react";
import Link from "next/link";
import { PackageSearch, CheckCircle2, Clock, AlertTriangle, XCircle, Inbox } from "lucide-react";

export default function ConsultaEstoqueListClient({ consultas }) {
  const [filtro, setFiltro] = useState("TODAS");

  const filtradas = filtro === "TODAS"
    ? consultas
    : consultas.filter((c) => c.status === filtro);

  const qtdEnviadas = consultas.filter((c) => c.status === "ENVIADA").length;
  const qtdRespondidas = consultas.filter((c) => c.status === "RESPONDIDA").length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <PackageSearch size={24} className="text-torg-blue" />
          Consultas de Estoque
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Solicitações de verificação de estoque enviadas pelo setor de Compras.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { valor: "TODAS", label: "Todas", count: consultas.length },
          { valor: "ENVIADA", label: "Pendentes", count: qtdEnviadas },
          { valor: "RESPONDIDA", label: "Respondidas", count: qtdRespondidas },
        ].map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.valor
                ? "bg-torg-blue text-white"
                : "bg-gray-100 text-torg-gray hover:bg-gray-200"
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Inbox size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma consulta encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((c) => {
            const isEnviada = c.status === "ENVIADA";
            const qtdItens = c.itens.length;
            const resumo = c.itens.reduce((acc, it) => {
              if (it.resposta) acc[it.resposta] = (acc[it.resposta] || 0) + 1;
              return acc;
            }, {});
            const opLabel = c.rm.op ? `OP ${c.rm.op.numero}` : "Sem OP";

            return (
              <Link
                key={c.id}
                href={`/producao/consulta-estoque/${c.id}`}
                className={`block bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow ${
                  isEnviada ? "border-amber-200" : "border-gray-100"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isEnviada ? (
                        <Clock size={16} className="text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      )}
                      <span className="font-semibold text-torg-dark text-sm">
                        RM {c.rm.numero}
                      </span>
                      <span className="text-xs text-torg-gray">{opLabel}</span>
                      {isEnviada && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                          Pendente
                        </span>
                      )}
                    </div>
                    {c.rm.descricao && (
                      <p className="text-xs text-torg-gray mt-1 truncate">{c.rm.descricao}</p>
                    )}
                    <p className="text-xs text-torg-gray mt-1">
                      {qtdItens} iten{qtdItens === 1 ? "" : "s"} · Solicitado por {c.createdBy?.name} em{" "}
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>

                  {!isEnviada && (
                    <div className="flex gap-1 shrink-0">
                      {resumo.DISPONIVEL > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700">
                          <CheckCircle2 size={10} /> {resumo.DISPONIVEL}
                        </span>
                      )}
                      {resumo.PARCIAL > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700">
                          <AlertTriangle size={10} /> {resumo.PARCIAL}
                        </span>
                      )}
                      {resumo.INDISPONIVEL > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700">
                          <XCircle size={10} /> {resumo.INDISPONIVEL}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
