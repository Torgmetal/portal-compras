// ─── A PLANILHA QUE O COMERCIAL JÁ MANTÉM ─────────────────────────────────────
// Vitor (29/08/2026): "preciso que atualize no portal as propostas que estão no SharePoint, trata
// todas elas e atualize nossa central de orçamentos".
//
// ⚠⚠ A FONTE É A PLANILHA, NÃO O NOME DA PASTA. O SharePoint tem 298 pastas em ORÇAMENTOS_2026 e
// o portal tinha 155 orçamentos — 126 de diferença. Mas nome de pasta ("024-26-PAULITEC-CICLOVIA")
// só carrega número, cliente e um apelido da obra; 20 pastas nem número têm ("THM",
// "ATERPA-MOTIVA", "02_09 - CLIMA-SPACE-ITAQUERA"). A `RELATÓRIO_PROPOSTAS_<ano>.xlsx`, aba
// "Orçamentos", tem as 16 colunas que o Comercial preenche de verdade — e elas batem 1:1 com o
// modelo `Orcamento`. Ler a pasta seria inventar o que a planilha já afirma.
//
// ⚠ IDEMPOTENTE POR NÚMERO. Rodar de novo atualiza, nunca duplica: o número do orçamento é único
// no portal e na planilha (conferido: zero duplicados em 283 linhas). É o que permite repetir a
// importação toda vez que o Comercial mexer na planilha.
//
// ⚠ E NUNCA APAGA COM VAZIO. Célula em branco na planilha não zera o que já está no portal — o
// portal tem coisa que a planilha não tem (vínculo com a OP, observações), e uma importação que
// limpasse campo por omissão transformaria "não preenchi" em "não existe".

/** Caminho da planilha do ano no SharePoint (mesma pasta que os indicadores ISO já leem). */
export const caminhoRelatorio = (ano) =>
  `/Comercial/1. Orçamento/ORÇAMENTOS_${ano}/RELATÓRIO_PROPOSTAS_${ano}.xlsx`;

const txt = (v) => {
  const s = String(v ?? "").trim();
  // "-" é como a planilha escreve "não se aplica" nas colunas de data e valor
  return s && s !== "-" ? s : null;
};

/**
 * "R$ 1,963,812.35" → 1963812.35
 * ⚠ a planilha está em formato AMERICANO (vírgula = milhar, ponto = decimal). Tratar como pt-BR
 * leria 1.963.812,35 como 1,96 — erro de mil vezes num campo de valor de proposta.
 */
export function moeda(v) {
  const s = txt(v);
  if (!s) return null;
  const n = Number(s.replace(/[R$\s ]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * "6/29/26" → Date (29/06/2026).
 * ⚠ MÊS PRIMEIRO, e ao meio-dia UTC. O formato foi confirmado contra a própria coluna "Mês envio"
 * da planilha (1/1/26→jan, 2/5/26→fev, 6/29/26→jun). Meio-dia porque o servidor roda em UTC: uma
 * data à meia-noite volta um dia ao ser exibida no fuso de Brasília.
 */
export function dataUS(v) {
  const s = txt(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mes, dia, ano] = m;
  const a = Number(ano) < 100 ? 2000 + Number(ano) : Number(ano);
  const d = new Date(Date.UTC(a, Number(mes) - 1, Number(dia), 12));
  return Number.isNaN(+d) ? null : d;
}

const STATUS = {
  "orcamento": "ORCAMENTO", "orçamento": "ORCAMENTO",
  "em negociacao": "EM_NEGOCIACAO", "em negociação": "EM_NEGOCIACAO",
  "fechada": "FECHADA", "perdida": "PERDIDA",
};
const PORTE = [
  [/at[ée]\s*r\$?\s*1[.,]2/i, "ATE_1_2M"],
  [/1[.,]2m?\s*at[ée]\s*r?\$?\s*10/i, "DE_1_2M_A_10M"],
  [/10m?\s*[àa]\s*r?\$?\s*50/i, "DE_10M_A_50M"],
  [/mais\s*de\s*r?\$?\s*50/i, "ACIMA_50M"],
];
const VENDA = {
  "fabricacao": "FABRICACAO",
  "fabricacao e montagem": "FABRICACAO_E_MONTAGEM",
  "montagem": "MONTAGEM",
  "pintura": "PINTURA",
  "mao de obra": "MAO_DE_OBRA",
  "revenda": "REVENDA",
  "laudo": "LAUDO",
};
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const statusDe = (v) => STATUS[semAcento(v)] || STATUS[String(v || "").toLowerCase().trim()] || null;
export const porteDe = (v) => { const s = txt(v); return s ? (PORTE.find(([rx]) => rx.test(s))?.[1] || null) : null; };
export const vendaDe = (v) => VENDA[semAcento(v)] || null;

/**
 * O vendedor como o portal já grava.
 * ⚠ a planilha tem "Vitor " com espaço, "André Metzker " com espaço e "Jorge **" com marcação —
 * três grafias para gente que o portal já conhece por "Vitor", "André Metzker" e "Jorge". Sem
 * normalizar, o filtro por vendedor passaria a listar o mesmo nome duas vezes.
 * ⚠ "VHR" (13 linhas) fica como está: é sigla de alguém, e adivinhar quem seria pior que manter.
 */
export function vendedorDe(v) {
  const s = txt(v);
  if (!s) return null;
  return s.replace(/\s*\*+\s*$/, "").replace(/\s+/g, " ").trim() || null;
}

/**
 * "RV - 02 05/02/2026" · "RV01  -  02/03/2026" · "RV-04  24/03 e RV-05 27/03 - Desconto"
 * → [{ numero, dataEnvio, observacao }]
 *
 * ⚠ TRÊS ARMADILHAS, todas encontradas na planilha de verdade:
 *   · "RV-001" é a revisão 1, não a 0 — capturar só dois dígitos lia "00".
 *   · "24/03" vem SEM ano: o ano é o da planilha. Sem isso, 10 revisões perdiam a data.
 *   · uma célula pode ter DUAS ("RV-04 24/03 e RV-05 27/03"), e o modelo aceita várias.
 *
 * ⚠ E O QUE NÃO É REVISÃO NÃO VIRA REVISÃO. Sete células trazem recado do Comercial ("Perdida -
 * Prazo", "Complemento OP -090", "185"). Sem "RV" não sai revisão nenhuma — inventar a revisão 1
 * ali seria afirmar um reenvio que não houve.
 *
 * ⚠ A data aqui é dd/mm/aaaa (pt-BR), ao contrário das COLUNAS de data da planilha, que são
 * células de Excel em mm/dd/aa. Esta é texto digitado à mão.
 */
export function revisoesDe(v, ano) {
  const s = txt(v);
  if (!s || !/rv/i.test(s)) return [];
  const out = [];
  // cada "RV<n>" abre um trecho; a data que vier antes do próximo RV é dele
  const partes = s.split(/(?=rv\s*-?\s*\d)/i);
  for (const parte of partes) {
    const num = parte.match(/rv\s*-?\s*(\d{1,3})/i);
    if (!num) continue;
    const dt = parte.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    let dataEnvio = null;
    if (dt) {
      const a = dt[3] ? (Number(dt[3]) < 100 ? 2000 + Number(dt[3]) : Number(dt[3])) : ano;
      const d = new Date(Date.UTC(a, Number(dt[2]) - 1, Number(dt[1]), 12));
      if (!Number.isNaN(+d)) dataEnvio = d;
    }
    const obs = parte
      .replace(/rv\s*-?\s*\d{1,3}/i, "")
      .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, "")
      .replace(/[-–—\s]+/g, " ")
      .replace(/^\s*e\s+/i, "")
      .trim();
    out.push({ numero: Number(num[1]), dataEnvio, observacao: obs || null });
  }
  return out;
}

/** Nomes de coluna com espaço sobrando (" Valor ", " Porte ") — a planilha tem, e é assim mesmo. */
const col = (linha, ...nomes) => {
  for (const n of nomes) if (n in linha) return linha[n];
  return null;
};

/**
 * Uma linha da aba "Orçamentos" → o que o portal grava.
 * @returns {object|null} null quando a linha não tem número (linha em branco no fim da planilha)
 */
export function linhaParaOrcamento(linha, ano = new Date().getUTCFullYear()) {
  const numero = txt(col(linha, "Nº Orçamento", "N° Orçamento", "No Orçamento"));
  if (!numero) return null;
  return {
    numero,
    cliente: txt(col(linha, "Cliente")) || "—",
    obra: txt(col(linha, "Obra")),
    responsavel: txt(col(linha, "Responsável", "Responsavel")),
    contato: txt(col(linha, "Contato")),
    orcamentista: txt(col(linha, "Orçamentista", "Orcamentista")),
    tipoVenda: vendaDe(col(linha, "Venda")),
    valor: moeda(col(linha, " Valor ", "Valor")),
    porte: porteDe(col(linha, " Porte ", "Porte")),
    dataEnvio: dataUS(col(linha, "Data envio")),
    dataFechamento: dataUS(col(linha, "Data fechamento")),
    status: statusDe(col(linha, "Status")),
    vendedor: vendedorDe(col(linha, "Vendedor")),
    motivoPerda: txt(col(linha, "Motivo | Proposta Perdida")),
    revisoes: revisoesDe(col(linha, "Revisoes|Data envio", "Revisões|Data envio"), ano),
  };
}

/** Só os campos preenchidos — é o que garante que vazio na planilha não apague o portal. */
export function semVazios(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "revisoes" || k === "numero") continue;
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/** O que mudaria em cada orçamento — usado tanto pela simulação quanto pela gravação. */
export function compararOrcamento(novo, atual) {
  const dados = semVazios(novo);
  if (!atual) return { acao: "criar", dados, mudancas: Object.keys(dados) };
  const mudancas = [];
  for (const [k, v] of Object.entries(dados)) {
    const antes = atual[k];
    const igual =
      v instanceof Date ? antes && +new Date(antes) === +v
      : typeof v === "number" ? Math.abs((antes ?? 0) - v) < 0.01
      : String(antes ?? "") === String(v ?? "");
    if (!igual) mudancas.push(k);
  }
  return { acao: mudancas.length ? "atualizar" : "igual", dados, mudancas };
}
