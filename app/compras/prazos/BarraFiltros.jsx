"use client";

// ─── A BARRA DE FILTROS DOS PRAZOS ───────────────────────────────────────────
//
// ⚠ Em arquivo próprio desde 17/09/2026: obra, fornecedor e os chips de situação somados passaram
// o `PrazosRMClient` do teto de 150 linhas por função. O corte é por responsabilidade — aqui os
// CONTROLES, lá a busca e o estado.
import { useEffect } from "react";
import { SITUACAO, rotuloSituacao } from "@/lib/painel-prazos-rm";
import { CHIP } from "./CartaoRM";

const ORDEM_CHIPS = ["ATRASADO", "PARCIAL", "VENCE_HOJE", "PROXIMO", "NO_PRAZO", "SEM_PRAZO", "CHEGOU"];

export default function BarraFiltros({ r, obras, obra, setObra, fornecedores, fornecedor, setFornecedor, filtro, setFiltro }) {
  // ⚠⚠ O FORNECEDOR ESCOLHIDO NÃO SOBREVIVE À TROCA DE OBRA (achado do Codex, 17/09/2026). As
  // opções passam a ser só as da obra nova; o valor antigo continua no estado, some do `<select>`
  // — que então exibe o primeiro item — e a lista vem vazia: um filtro invisível filtrando.
  //
  // ⚠ Mora aqui, e não na tela, porque quem sabe quais opções existem é quem as desenha.
  useEffect(() => {
    if (fornecedor && !fornecedores.some((f) => f.chave === fornecedor)) setFornecedor("");
  }, [fornecedor, fornecedores, setFornecedor]);

  // ⚠⚠ DUAS FILEIRAS, PORQUE SÃO DUAS PERGUNTAS DIFERENTES (Matheus, 17/09/2026: "melhore um pouco
  // esses filtros"). Em cima, ONDE olhar — obra e fornecedor, que recortam o acervo. Embaixo, O QUE
  // olhar — o escopo e a situação. Numa fileira só, dois `<select>` e oito botões viravam uma
  // parede em que a pessoa procurava o controle em vez de usar.
  //
  // ⚠ "A chegar" e "Todas" não são situações: são ESCOPO. Ficam juntos, à esquerda e separados dos
  // chips por um traço — misturados, pareciam mais duas cores de situação e a pessoa clicava neles
  // achando que filtrava por alguma coisa.
  const escopo = (chave, rotulo, valor, titulo) => (
    <button type="button" onClick={() => setFiltro(chave)} title={titulo}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white ${
        filtro === chave
          ? "border-torg-blue ring-1 ring-torg-blue text-torg-dark"
          : "border-gray-200 text-torg-gray hover:bg-gray-50"}`}>
      {rotulo} <b className="ml-1 tabular-nums text-torg-dark">{valor}</b>
    </button>
  );

  return (
  <div className="space-y-2">
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
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-torg-dark max-w-[18rem]"
          title="Ver os prazos de um fornecedor só"
        >
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => (
            <option key={f.chave} value={f.chave}>{f.nome} ({f.quantidade})</option>
          ))}
        </select>
      )}
      {/* ⚠⚠ LIMPAR SÓ APARECE QUANDO HÁ O QUE LIMPAR. Com obra e fornecedor podendo estar ativos ao
          mesmo tempo, a saída tem de ser um clique — antes era preciso reabrir os dois seletores e
          escolher "todas" em cada um, e quem não percebia o segundo via lista vazia sem entender. */}
      {(obra || fornecedor) && (
        <button type="button" onClick={() => { setObra(""); setFornecedor(""); }}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-torg-blue hover:bg-torg-blue-50 border border-transparent">
          limpar filtros
        </button>
      )}
      <span className="text-xs text-torg-gray ml-auto">
        {r.rms} {r.rms === 1 ? "RM" : "RMs"} · {r.pedidos} pedidos · <b className="text-torg-dark">{r.pendentes}</b> ainda cobram prazo
      </span>
    </div>

    {/* ⚠ Os contadores FILTRAM, não são enfeite: quem chega para cobrar fornecedor clica em
        "Atrasado" e trabalha só naquilo. Clicar de novo volta para "A chegar". */}
    <div className="flex items-center gap-2 flex-wrap">
      {escopo("PENDENTES", "A chegar", r.rms - r.CHEGOU, "As RMs que ainda esperam material")}
      {escopo("TODAS", "Todas", r.rms, "Inclui o que já chegou")}
      <span className="h-5 w-px bg-gray-200 mx-1" aria-hidden="true" />
      {ORDEM_CHIPS.filter((k) => r[k] > 0).map((k) => (
        <button key={k} type="button" onClick={() => setFiltro(filtro === k ? "PENDENTES" : k)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filtro === k ? "border-torg-blue ring-1 ring-torg-blue" : "border-transparent hover:brightness-95"} ${CHIP[SITUACAO[k].cor]}`}>
          {rotuloSituacao(k)} <b className="ml-1 tabular-nums">{r[k]}</b>
        </button>
      ))}
    </div>
  </div>
  );
}
