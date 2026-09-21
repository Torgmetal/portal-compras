"use client";

// ─── OS FILTROS DA TELA DE PRAZOS, EM UM LUGAR SÓ ────────────────────────────
//
// Obra, fornecedor e situação, com as derivações que dependem deles. Em hook próprio desde
// 18/09/2026, quando o botão de cobrança entrou e o `PrazosRMClient` passou do teto de instruções
// por função — o corte é por responsabilidade: aqui o RECORTE dos dados, lá a busca e o desenho.
import { useMemo, useState } from "react";
import {
  filtrarLinhas, resumoPorSituacao, fornecedoresDasLinhas, filtrarPorFornecedor, obrasDasLinhas,
} from "@/lib/painel-prazos-rm";

export function usarFiltrosPrazos(dados) {
  // ⚠ Abre em "pendentes" porque 71% do acervo já chegou (168 de 236 RMs, medido em 16/09/2026):
  // aberta em "todas", a tela saía com 31 mil pixels e escondia as 53 RMs que apertam atrás das
  // que já foram resolvidas.
  const [filtro, setFiltro] = useState("PENDENTES");
  const [obra, setObra] = useState(""); // OP.numero ("" = todas)
  const [fornecedor, setFornecedor] = useState(""); // chave do fornecedor ("" = todos)

  const linhas = dados?.linhas;

  // ⚠⚠ A OBRA FILTRA ANTES DE TUDO — cartões, contadores e lista. Matheus (16/09/2026): "adicionar
  // filtros por obra se eu quiser ver RMs somente de uma obra os prazos".
  //
  // ⚠ Aqui o filtro pode ser do NAVEGADOR sem mentir, porque a rota não corta nada: ela devolve
  // todos os pedidos CRIADOS, sem `take`. Nas RMs de material o mesmo desenho escondeu 111 linhas
  // justamente porque lá havia um `take: 100` antes do filtro. Se um dia esta rota ganhar teto, o
  // filtro tem que subir para o servidor junto — senão o defeito volta igual.
  const daObra = useMemo(
    () => (obra ? (linhas || []).filter((l) => String(l.op?.numero || "") === obra) : (linhas || [])),
    [linhas, obra]
  );

  // ⚠⚠ O FORNECEDOR FILTRA DEPOIS DA OBRA, e refaz a conta de cada RM (ver `filtrarPorFornecedor`).
  //
  // ⚠ A ordem importa: obra → fornecedor. Ao contrário, as opções de fornecedor teriam de sair do
  // acervo inteiro e a pessoa escolheria um que não tem pedido nenhum naquela obra.
  const daFornecedor = useMemo(() => filtrarPorFornecedor(daObra, fornecedor), [daObra, fornecedor]);
  const fornecedores = useMemo(() => fornecedoresDasLinhas(daObra), [daObra]);
  const obras = useMemo(() => obrasDasLinhas(linhas), [linhas]);

  // ⚠⚠ OS CONTADORES SEGUEM A OBRA. Deixá-los no resumo do servidor faria o cabeçalho dizer
  // "Atrasado 37" enquanto a lista da obra mostra 2 — número que não corresponde ao que está na
  // tela é pior que número nenhum.
  const resumo = useMemo(
    () => (obra || fornecedor ? resumoPorSituacao(daFornecedor) : dados?.resumo),
    [obra, fornecedor, daFornecedor, dados]
  );

  const visiveis = useMemo(() => filtrarLinhas(daFornecedor, filtro), [daFornecedor, filtro]);

  const limpar = () => { setFiltro("TODAS"); setObra(""); setFornecedor(""); };

  return { filtro, setFiltro, obra, setObra, fornecedor, setFornecedor,
    fornecedores, obras, resumo, visiveis, limpar };
}
