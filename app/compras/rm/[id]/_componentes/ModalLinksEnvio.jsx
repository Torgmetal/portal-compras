"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle, Mail } from "lucide-react";
import { Modal } from "./Modal";

export function ModalLinksEnvio({ rm: _rm, links, onClose }) {
  // links agora é { cotacoes: [...], emails: [...], estoque: {abatidos, excluidos} | null }
  const cotacoes = links?.cotacoes || links || [];
  const emailResults = links?.emails || [];
  const estoque = links?.estoque || null;
  const [copiado, setCopiado] = useState(null);
  const [reenvioStatus, setReenvioStatus] = useState({});
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Mapa email -> resultado do envio automático
  const emailPorFornecedor = {};
  emailResults.forEach((e) => { emailPorFornecedor[e.email] = e; });

  const todosEnviados = emailResults.length > 0 && emailResults.every((e) => e.ok);
  const algumFalhou = emailResults.some((e) => !e.ok);
  const nenhumEnviado = emailResults.length === 0;

  const copiarLink = async (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    await navigator.clipboard.writeText(link);
    setCopiado(cot.id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const reenviarEmail = async (cot) => {
    setReenvioStatus((prev) => ({ ...prev, [cot.id]: "enviando" }));
    try {
      const res = await fetch(`/api/cotacao/${cot.id}/enviar-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setReenvioStatus((prev) => ({ ...prev, [cot.id]: "ok" }));
    } catch {
      setReenvioStatus((prev) => ({ ...prev, [cot.id]: "erro" }));
    }
  };

  return (
    <Modal titulo={`Cotações criadas (${cotacoes.length})`} onClose={onClose}>
      <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
        {/* Abatimento por estoque (consulta respondida pela Produção) */}
        {estoque && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-3 py-2.5 space-y-1">
            <p className="font-semibold text-xs uppercase tracking-wide">Estoque abatido da cotação</p>
            {estoque.abatidos?.map((a, i) => (
              <p key={`a${i}`} className="text-xs">
                • {a.descricao}: {a.barrasDisponiveis} {a.unidade} em estoque — cotado só {a.barrasACotar} {a.unidade}.
              </p>
            ))}
            {estoque.excluidos?.map((e, i) => (
              <p key={`e${i}`} className="text-xs">
                • {e.descricao}: {e.barrasDisponiveis} {e.unidade} em estoque (100%) — <strong>fora da cotação</strong>. Use &quot;Atender estoque&quot; no item.
              </p>
            ))}
          </div>
        )}
        {/* Status geral */}
        {todosEnviados && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
            <p className="font-medium flex items-center gap-1.5">
              <CheckCircle size={15} /> Emails enviados automaticamente
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Você recebeu cópia em CC de cada email. O fornecedor já pode acessar o link e enviar a proposta.
            </p>
          </div>
        )}
        {algumFalhou && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium flex items-center gap-1.5">
              <AlertCircle size={15} /> Alguns emails falharam
            </p>
            <p className="text-xs text-amber-700 mt-1">
              As cotações foram criadas, mas nem todos os emails puderam ser enviados. Use "Reenviar" ou "Copiar link" e envie manualmente.
            </p>
          </div>
        )}
        {nenhumEnviado && (
          <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg p-3 text-sm text-torg-dark">
            <p className="font-medium">✓ Cotações criadas com sucesso</p>
            <p className="text-xs text-torg-gray mt-1">
              O serviço de email não está configurado. Copie o link e envie manualmente por email ou WhatsApp.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {cotacoes.map((cot) => {
            const emailStatus = emailPorFornecedor[cot.fornecedorEmail];
            const enviado = emailStatus?.ok;
            const reenvio = reenvioStatus[cot.id];

            return (
              <li key={cot.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-torg-dark flex items-center gap-2">
                      {cot.fornecedorNome}
                      {(enviado || reenvio === "ok") && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                          ✓ email enviado
                        </span>
                      )}
                      {emailStatus && !enviado && reenvio !== "ok" && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                          ✗ falhou
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-torg-gray truncate">{cot.fornecedorEmail}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copiarLink(cot)}
                      className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 font-medium"
                    >
                      {copiado === cot.id ? "✓ copiado" : "Copiar link"}
                    </button>
                    {/* Reenviar — mostra quando falhou ou como opção sempre */}
                    {(!enviado || reenvio === "erro") && (
                      <button
                        onClick={() => reenviarEmail(cot)}
                        disabled={reenvio === "enviando"}
                        className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Mail size={12} />
                        {reenvio === "enviando" ? "Enviando..." : "Enviar email"}
                      </button>
                    )}
                    {reenvio === "ok" && (
                      <span className="px-3 py-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-lg font-medium inline-flex items-center gap-1">
                        <CheckCircle size={12} /> Enviado
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button onClick={onClose} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium">
          Fechar
        </button>
      </div>
    </Modal>
  );
}
