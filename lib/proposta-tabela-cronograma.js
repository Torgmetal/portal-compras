import "server-only";
import { celula, linha, montarTabela } from "./docx-tabela";

// ─── O CRONOGRAMA DENTRO DA PROPOSTA ──────────────────────────────────────────────────────────
//
// Vitor (05/09/2026), sobre a primeira prova em PDF: "não bem assim que eu queria mostrar para o
// cliente, pois não tem nada a haver com o estilo da nossa proposta".
//
// ⚠⚠ ELE TEM RAZÃO, E O ERRO FOI DE ENDEREÇO. Eu desenhei uma folha no estilo do PORTAL do cliente
// — navy, tiles, barras coloridas. Só que a proposta da Torg não é o portal: é um documento do
// Word que o Comercial escreve, com Arial 10, seções numeradas e tabelas de borda simples. Um
// anexo colorido no meio dela denuncia "isto foi gerado por outro sistema" na hora em que o
// cliente compara com a proposta anterior.
//
// Então o cronograma deixa de ser folha separada e vira SEÇÃO da proposta, montada com as mesmas
// primitivas da tabela de preço (lib/docx-tabela). O item "Prazo de execução" já existe no modelo;
// o que faltava era o quadro por etapa e a régua de entregas embaixo dele.

const COL_ETAPA = [
  { w: 700, r: "Item", al: "center" },
  { w: 4100, r: "Etapa", al: "left" },
  { w: 1500, r: "Duração", al: "center" },
  { w: 1740, r: "Início", al: "center" },
  { w: 1741, r: "Término", al: "center" },
];

const COL_ENTREGA = [
  { w: 900, r: "Carga", al: "center" },
  { w: 5000, r: "Evento", al: "left" },
  { w: 1900, r: "Prazo (dias)", al: "center" },
  { w: 1981, r: "Peso previsto", al: "right" },
];

const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const dataBR = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "-");
const corridos = (diasUteis) => Math.round((Number(diasUteis) || 0) * 7 / 5);

/**
 * Quadro das etapas — o "de quando a quando" de cada fase.
 *
 * ⚠ EM DIAS CORRIDOS, sempre. A fábrica trabalha em dias úteis e o estudo calcula assim, mas
 * contrato se lê em dias corridos: publicar "56 dias" úteis e o cliente contar no calendário é
 * criar uma discussão de prazo que não precisa existir.
 */
export function tabelaDeEtapas(cron) {
  if (!cron?.fases?.length) return null;
  const comData = !!cron.resumo?.dataInicio;
  const linhas = [linha(COL_ETAPA.map((c) => celula({ w: c.w, texto: c.r, al: "center", negrito: true })))];

  cron.fases.forEach((f, i) => {
    linhas.push(linha([
      celula({ w: COL_ETAPA[0].w, texto: `${i + 1}`, al: "center" }),
      celula({ w: COL_ETAPA[1].w, texto: `${f.nome} - ${f.detalhe}` }),
      celula({ w: COL_ETAPA[2].w, texto: `${inteiro(corridos(f.dias))} dias`, al: "center" }),
      celula({ w: COL_ETAPA[3].w, texto: comData ? dataBR(f.dataInicio) : `dia ${inteiro(corridos(f.inicio))}`, al: "center" }),
      celula({ w: COL_ETAPA[4].w, texto: comData ? dataBR(f.dataFim) : `dia ${inteiro(corridos(f.fim))}`, al: "center" }),
    ]));
  });

  // ⚠ o total NÃO é a soma da coluna: as etapas se sobrepõem (a compra do aço corre junto do
  // detalhamento). Somar daria um prazo maior do que o real e a proposta sairia cara em prazo.
  linhas.push(linha([
    celula({ w: COL_ETAPA[0].w, texto: "", al: "center" }),
    celula({ w: COL_ETAPA[1].w, texto: "PRAZO TOTAL (as etapas se sobrepõem)", negrito: true }),
    celula({ w: COL_ETAPA[2].w, texto: `${inteiro(cron.resumo.totalCorridos)} dias`, al: "center", negrito: true }),
    celula({ w: COL_ETAPA[3].w, texto: comData ? dataBR(cron.resumo.dataInicio) : "-", al: "center", negrito: true }),
    celula({ w: COL_ETAPA[4].w, texto: comData ? dataBR(cron.resumo.dataFim) : "-", al: "center", negrito: true }),
  ]));

  return montarTabela(COL_ETAPA, linhas);
}

/**
 * Régua de entregas — de quantos em quantos dias chega uma carreta.
 *
 * ⚠ NÃO LISTA CARGA POR CARGA. Numa obra de 46 cargas isso vira três páginas de tabela dentro da
 * proposta, e ninguém lê. O que o cliente precisa para planejar a montagem dele são três linhas:
 * quando chega a primeira, de quanto em quanto tempo chegam as demais e quando chega a última.
 */
export function tabelaDeEntregas(cron) {
  const r = cron?.resumo;
  if (!r?.cargas) return null;
  const ent = cron.entregas || [];
  const comData = !!r.dataInicio;
  const quando = (e) => (comData ? dataBR(e.data) : `dia ${inteiro(corridos(e.diaUtil))}`);

  const eventos = [
    ["1", `Primeira carga${comData ? ` (${quando(ent[0])})` : ""}`, inteiro(r.primeiraEntregaCorridos), ent[0]?.kg],
  ];
  if (r.cargas > 1) {
    eventos.push(["2", `Demais cargas, uma a cada ${inteiro(r.intervaloEntregasCorridos)} dias`, `+${inteiro(r.intervaloEntregasCorridos)}`, r.pesoPorCarga]);
    eventos.push(["3", `Última carga${comData ? ` (${quando(ent[ent.length - 1])})` : ""}`, inteiro(corridos(ent[ent.length - 1].diaUtil)), ent[ent.length - 1]?.kg]);
  }

  const linhas = [linha(COL_ENTREGA.map((c) => celula({ w: c.w, texto: c.r, al: "center", negrito: true })))];
  for (const [n, ev, prazo, kg] of eventos) {
    linhas.push(linha([
      celula({ w: COL_ENTREGA[0].w, texto: n, al: "center" }),
      celula({ w: COL_ENTREGA[1].w, texto: ev }),
      celula({ w: COL_ENTREGA[2].w, texto: String(prazo), al: "center" }),
      celula({ w: COL_ENTREGA[3].w, texto: `${inteiro(kg)} kg`, al: "right" }),
    ]));
  }
  linhas.push(linha([
    celula({ w: COL_ENTREGA[0].w, texto: "", al: "center" }),
    celula({ w: COL_ENTREGA[1].w, texto: `TOTAL - ${inteiro(r.cargas)} ${r.cargas === 1 ? "carga" : "cargas"}`, negrito: true }),
    celula({ w: COL_ENTREGA[2].w, texto: `${inteiro(r.totalCorridos)} dias`, al: "center", negrito: true }),
    celula({ w: COL_ENTREGA[3].w, texto: `${inteiro(r.pesoKg)} kg`, al: "right", negrito: true }),
  ]));

  return montarTabela(COL_ENTREGA, linhas);
}
