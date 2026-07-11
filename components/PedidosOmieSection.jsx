"use client";
import { useState } from "react";
import { Truck, ExternalLink, AlertCircle, FileText, Loader2 } from "lucide-react";
import { omiePedidoCompraUrl } from "@/lib/omie-urls";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Numero do pedido = link que abre o PDF do Omie em nova aba.
// Por baixo, chama /api/omie/pedido-compra-pdf/[codigoPedido] que pede pra API
// do Omie gerar o link temporario e redireciona pro PDF.
function PedidoNumeroCell({ pedido }) {
  const numero = pedido.numeroPedido || pedido.codigoPedido || "";
  const podeAbrir = pedido.status === "CRIADO" && pedido.codigoPedido;

  if (!podeAbrir) {
    return <span className="font-mono text-torg-gray">{numero || "—"}</span>;
  }

  const url = `/api/omie/pedido-compra-pdf/${pedido.codigoPedido}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir PDF do pedido no Omie"
      className="inline-flex items-center gap-1 font-mono font-semibold text-torg-blue hover:text-torg-blue-700 hover:underline"
    >
      {numero}
      <FileText size={12} />
    </a>
  );
}

// Recebe lista de pedidos achatada (ja com cotacao/rm em cada pedido pra contexto).
// Cada pedido: { id, numeroPedido, codigoPedido, total, status, faturamentoDireto,
//                fornecedorNome, createdAt, rmNumero, cotacaoId, erroOmie }
export default function PedidosOmieSection({ pedidos }) {
  if (!pedidos || pedidos.length === 0) {
    return (
      <div id="pedidos-omie" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 scroll-mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Truck size={18} className="text-torg-blue" />
          <h3 className="text-lg font-semibold text-torg-dark">Pedidos no Omie</h3>
        </div>
        <p className="text-sm text-torg-gray">
          Nenhum pedido foi gerado no Omie ainda pra essa OP. Os pedidos aparecem aqui assim que forem criados pelo Compras.
        </p>
      </div>
    );
  }

  const totalCriados = pedidos.filter((p) => p.status === "CRIADO").reduce((s, p) => s + (p.total || 0), 0);
  const qtdCriados = pedidos.filter((p) => p.status === "CRIADO").length;
  // Conta erros REAIS — FDs avulsos pendentes nao sao "erro", sao FD valido.
  // REVERTIDO nao e erro — nao deveria chegar aqui (filtrado no server),
  // mas se chegar, ignora pra nao poluir contagem.
  const qtdErros = pedidos.filter((p) => p.status !== "CRIADO" && p.status !== "REVERTIDO" && !p.criadoManualmente).length;
  const qtdFD = pedidos.filter((p) => p.status !== "CRIADO" && p.status !== "REVERTIDO" && p.criadoManualmente).length;

  return (
    <div id="pedidos-omie" className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden scroll-mt-4">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Truck size={18} className="text-torg-blue" />
          <h3 className="text-lg font-semibold text-torg-dark">Pedidos no Omie</h3>
          <span className="text-xs bg-torg-blue-50 text-torg-blue px-2 py-0.5 rounded-full font-medium">
            {qtdCriados} criado{qtdCriados !== 1 ? "s" : ""}
          </span>
          {qtdFD > 0 && (
            <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium border border-amber-200">
              {qtdFD} FD pendente{qtdFD !== 1 ? "s" : ""}
            </span>
          )}
          {qtdErros > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {qtdErros} com erro
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={omiePedidoCompraUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1 font-medium"
          >
            Abrir Omie <ExternalLink size={11} />
          </a>
          <div className="text-right">
            <p className="text-xs text-torg-gray">Total criado</p>
            <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtMoeda(totalCriados)}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-2 bg-torg-blue-50/40 border-b border-torg-blue-100 text-xs text-torg-dark">
        💡 Clique no <strong>número do pedido</strong> pra abrir no Omie. Se a API gerar o PDF, abre direto;
        senão, abre o módulo Compras pra você localizar pelo número.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Nº Pedido</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">RM</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Data</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">NF entrada</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pedidos.filter((p) => p.status !== "REVERTIDO").map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <PedidoNumeroCell pedido={p} />
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-torg-dark">{p.rmNumero || "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-torg-dark text-xs max-w-[200px] truncate">
                  {p.fornecedorNome}
                </td>
                <td className="px-4 py-2.5 text-right text-torg-dark font-medium tabular-nums">
                  {fmtMoeda(p.total)}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {p.faturamentoDireto ? (
                    <span className="px-2 py-0.5 bg-torg-orange-50 text-torg-orange-700 rounded-full font-medium">
                      FD
                    </span>
                  ) : (
                    <span className="text-torg-gray">Normal</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-torg-gray text-xs whitespace-nowrap">{fmtData(p.createdAt)}</td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                  {p.nfLista && p.nfLista.length > 0 ? (
                    <span className="font-mono text-torg-dark" title={p.nfLista.map((nf) => `NF ${nf.numero}${nf.serie ? `/${nf.serie}` : ""}${nf.chave ? ` · chave ${nf.chave}` : ""}`).join("\n")}>
                      {p.nfLista.map((nf) => nf.numero).join(", ")}
                    </span>
                  ) : (
                    <span className="text-torg-gray" title="Sem NF de entrada registrada ainda">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {p.status === "CRIADO" ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-torg-blue text-white">
                      Criado
                    </span>
                  ) : p.criadoManualmente ? (
                    // FD avulso pendente/erro: mostra como "FD" amber (registro
                    // valido, ja consome verba) em vez de "Erro" vermelho.
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-200"
                      title={p.erroOmie ? `Tentativa de envio ao Omie falhou: ${p.erroOmie}` : "FD registrado, pendente de criação no Omie"}
                    >
                      FD
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-700" title={p.erroOmie || "Erro ao criar"}>
                      <AlertCircle size={12} />
                      Erro
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
