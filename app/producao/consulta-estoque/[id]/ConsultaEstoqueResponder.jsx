"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, PackageSearch, CheckCircle2, AlertTriangle,
  XCircle, Loader2, MessageSquare, User, Calendar,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";

const OPCOES_RESPOSTA = [
  { valor: "DISPONIVEL", label: "Disponível", cor: "border-emerald-400 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  { valor: "PARCIAL", label: "Parcial", cor: "border-amber-400 bg-amber-50 text-amber-700", icon: AlertTriangle },
  { valor: "INDISPONIVEL", label: "Indisponível", cor: "border-red-400 bg-red-50 text-red-700", icon: XCircle },
];

export default function ConsultaEstoqueResponder({ consulta, userName }) {
  const router = useRouter();
  const jaRespondida = consulta.status === "RESPONDIDA";

  const [respostas, setRespostas] = useState(() =>
    consulta.itens.map((item) => ({
      consultaItemId: item.id,
      resposta: item.resposta || null,
      qtdDisponivel: item.qtdDisponivel ?? "",
      observacao: item.observacao || "",
    }))
  );
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const atualizar = (idx, campo, valor) => {
    setRespostas((prev) => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  };

  const todosRespondidos = respostas.every((r) => r.resposta !== null);

  const enviar = async () => {
    if (!todosRespondidos) return;
    setEnviando(true);
    try {
      const payload = {
        consultaId: consulta.id,
        itens: respostas.map((r) => ({
          consultaItemId: r.consultaItemId,
          resposta: r.resposta,
          qtdDisponivel: r.resposta === "PARCIAL" && r.qtdDisponivel !== ""
            ? Number(r.qtdDisponivel) : null,
          observacao: r.observacao.trim() || undefined,
        })),
      };
      const res = await fetch(`/api/rm/${consulta.rm.id}/consulta-estoque/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSucesso(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const opLabel = consulta.rm.op ? `${fmtOP(consulta.rm.op.numero)} — ${consulta.rm.op.cliente}` : "Sem OP vinculada";

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/producao" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar ao Painel
      </Link>

      {/* Cabeçalho */}
      <div>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <PackageSearch size={24} className="text-torg-blue" />
          Consulta de Estoque — RM {consulta.rm.numero}
        </h2>
        <p className="text-sm text-torg-gray mt-1">{opLabel}</p>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2 text-torg-gray">
            <User size={14} />
            <span>Solicitado por <strong className="text-torg-dark">{consulta.createdBy?.name}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-torg-gray">
            <Calendar size={14} />
            <span>{new Date(consulta.createdAt).toLocaleDateString("pt-BR")} às {new Date(consulta.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {consulta.status === "RESPONDIDA" && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">Respondida</span>
          )}
          {consulta.status === "ENVIADA" && (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Aguardando resposta</span>
          )}
        </div>
        {consulta.mensagem && (
          <div className="mt-3 flex items-start gap-2 text-sm text-torg-gray bg-gray-50 rounded-lg p-3">
            <MessageSquare size={14} className="mt-0.5 shrink-0" />
            <span>{consulta.mensagem}</span>
          </div>
        )}
        {consulta.rm.descricao && (
          <p className="mt-2 text-xs text-torg-gray">
            <strong>Descrição da RM:</strong> {consulta.rm.descricao}
          </p>
        )}
      </div>

      {/* Sucesso */}
      {sucesso && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <h3 className="text-lg font-semibold text-torg-dark mb-1">Resposta enviada!</h3>
          <p className="text-sm text-torg-gray mb-4">O setor de Compras foi notificado sobre a disponibilidade.</p>
          <Link href="/producao" className="text-sm text-torg-blue hover:underline font-medium">
            Voltar ao Painel de Produção
          </Link>
        </div>
      )}

      {/* Tabela de itens */}
      {!sucesso && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-torg-dark text-sm">
              Itens para avaliar ({consulta.itens.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-50">
            {consulta.itens.map((item, idx) => {
              const resp = respostas[idx];
              const qtdLabel = (item.rmItem?.peso || 0) > 0
                ? `${item.rmItem.peso} KG`
                : `${item.rmItem?.qtd} ${item.rmItem?.unidade}`;
              const detalhesParts = [
                item.rmItem?.material,
                item.rmItem?.comprimento && `C: ${item.rmItem.comprimento}`,
                item.rmItem?.largura && `L: ${item.rmItem.largura}`,
              ].filter(Boolean);

              return (
                <div key={item.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-torg-dark">{item.rmItem?.descricao}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-torg-gray">
                        <span className="font-medium">{qtdLabel}</span>
                        {detalhesParts.length > 0 && (
                          <span>{detalhesParts.join(" · ")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!jaRespondida ? (
                    <div className="space-y-2">
                      {/* Botões de resposta */}
                      <div className="flex flex-wrap gap-2">
                        {OPCOES_RESPOSTA.map((op) => {
                          const Icon = op.icon;
                          const selecionado = resp.resposta === op.valor;
                          return (
                            <button
                              key={op.valor}
                              onClick={() => atualizar(idx, "resposta", op.valor)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                                selecionado ? op.cor : "border-gray-200 text-torg-gray hover:border-gray-300"
                              }`}
                            >
                              <Icon size={14} /> {op.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Campo de qtd disponível (aparece quando PARCIAL) */}
                      {resp.resposta === "PARCIAL" && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-torg-gray whitespace-nowrap">Qtd disponível:</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={resp.qtdDisponivel}
                            onChange={(e) => atualizar(idx, "qtdDisponivel", e.target.value)}
                            className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                            placeholder="0"
                          />
                        </div>
                      )}

                      {/* Observação */}
                      <input
                        type="text"
                        value={resp.observacao}
                        onChange={(e) => atualizar(idx, "observacao", e.target.value)}
                        placeholder="Observação (opcional)"
                        maxLength={500}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                      />
                    </div>
                  ) : (
                    /* Visualização quando já respondida */
                    <div className="flex items-center gap-3">
                      {item.resposta && (() => {
                        const cfg = OPCOES_RESPOSTA.find((o) => o.valor === item.resposta);
                        const Icon = cfg?.icon;
                        return cfg ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 text-sm font-medium ${cfg.cor}`}>
                            <Icon size={14} /> {cfg.label}
                          </span>
                        ) : null;
                      })()}
                      {item.qtdDisponivel != null && (
                        <span className="text-sm text-torg-gray">Qtd disp.: {item.qtdDisponivel}</span>
                      )}
                      {item.observacao && (
                        <span className="text-sm text-torg-gray italic">{item.observacao}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botão enviar */}
          {!jaRespondida && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-torg-gray">
                {todosRespondidos
                  ? "Todos os itens foram avaliados. Confirme para notificar o setor de Compras."
                  : `Faltam ${respostas.filter((r) => !r.resposta).length} iten(s) para avaliar.`}
              </p>
              <button
                onClick={enviar}
                disabled={!todosRespondidos || enviando}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-torg-blue text-white text-sm font-semibold rounded-lg hover:bg-torg-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {enviando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {enviando ? "Enviando..." : "Confirmar Resposta"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
