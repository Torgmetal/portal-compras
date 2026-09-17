"use client";

// ─── A BARRA DE FILTROS DOS PRAZOS ───────────────────────────────────────────
//
// ⚠ Em arquivo próprio desde 17/09/2026: obra, fornecedor e os chips de situação somados passaram
// o `PrazosRMClient` do teto de 150 linhas por função. O corte é por responsabilidade — aqui os
// CONTROLES, lá a busca e o estado.
import { useEffect } from "react";
import { SITUACAO, rotuloSituacao } from "@/lib/painel-prazos-rm";
import { CHIP } from "./CartaoRM";

const ORDEM_CHIPS = ["ATRASADO", "PARCIAL", "VENCE_HOJE", "PROXIMO", "NO_PRAZO", "SEM_PRAZO", "ENCERRADO", "CHEGOU"];

export default function BarraFiltros({ r, obras, obra, setObra, fornecedores, fornecedor, setFornecedor, filtro, setFiltro }) {
  // ⚠⚠ O FORNECEDOR ESCOLHIDO NÃO SOBREVIVE À TROCA DE OBRA (achado do Codex, 17/09/2026). As
  // opções passam a ser só as da obra nova; o valor antigo continua no estado, some do `<select>`
  // — que então exibe o primeiro item — e a lista vem vazia: um filtro invisível filtrando.
  //
  // ⚠ Mora aqui, e não na tela, porque quem sabe quais opções existem é quem as desenha.
  useEffect(() => {
    if (fornecedor && !fornecedores.some((f) => f.chave === fornecedor)) setFornecedor("");
  }, [fornecedor, fornecedores, setFornecedor]);

  // ⚠ Os contadores FILTRAM, não são enfeite: quem chega para cobrar fornecedor clica em
  // "Atrasado" e trabalha só naquilo. Clicar de novo volta para a lista inteira.
  return (
  <div className="flex items-center gap-2 flex-wrap">
    {obras.length > 0 && (
      <select
        value={obra}
        onChange={(e) => setObra(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-torg-dark"
        title="Ver os prazos de uma obra só"
      >
        <option value="">Todas as obras</option>
        {obras.map((o) => (
          <option key={o.numero} value={o.numero}>
            OP-{String(o.numero).padStart(3, "0")}{o.cliente ? ` — ${o.cliente}` : ""} ({o.quantidade})
          </option>
        ))}
      </select>
    )}
    {fornecedores.length > 0 && (
      <select
        value={fornecedor}
        onChange={(e) => setFornecedor(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-torg-dark max-w-[16rem]"
        title="Ver os prazos de um fornecedor só"
      >
        <option value="">Todos os fornecedores</option>
        {fornecedores.map((f) => (
          <option key={f.chave} value={f.chave}>{f.nome} ({f.quantidade})</option>
        ))}
      </select>
    )}
    <button type="button" onClick={() => setFiltro("PENDENTES")}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-torg-dark ${
        filtro === "PENDENTES" ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"}`}>
      A chegar <b className="ml-1 tabular-nums">{r.rms - r.CHEGOU - r.ENCERRADO}</b>
    </button>
    {ORDEM_CHIPS.filter((k) => r[k] > 0).map((k) => (
      <button key={k} type="button" onClick={() => setFiltro(filtro === k ? "PENDENTES" : k)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          filtro === k ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"} ${CHIP[SITUACAO[k].cor]}`}>
        {rotuloSituacao(k)} <b className="ml-1 tabular-nums">{r[k]}</b>
      </button>
    ))}
    {/* ⚠ "Todas" existe porque o pedido foi ver TODAS as RMs de uma vez — o padrão só escolhe
        por onde começar, não decide o que você pode ver. */}
    <button type="button" onClick={() => setFiltro("TODAS")}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-torg-gray ${
        filtro === "TODAS" ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"}`}>
      Todas <b className="ml-1 tabular-nums">{r.rms}</b>
    </button>
    <span className="text-xs text-torg-gray ml-auto">
      {/* ⚠ "cobram prazo", não "não chegaram": o encerrado também não chegou, mas saiu da conta
          de propósito — a frase antiga passaria a discordar do número ao lado dela. */}
      {r.rms} {r.rms === 1 ? "RM" : "RMs"} · {r.pedidos} pedidos · <b className="text-torg-dark">{r.pendentes}</b> ainda cobram prazo
    </span>
  </div>
  );
}
