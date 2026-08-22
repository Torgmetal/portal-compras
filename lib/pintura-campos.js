// INSPEÇÃO DE PINTURA — o que a tela pede, e o que o procedimento manda conferir.
//
// Tudo aqui sai do PO-05 Rev.3 (09/02/2026) — "Preparação de Superfície e Pintura".
//
// ⚠ O ESQUEMA DE PINTURA NÃO ESTÁ AQUI, E NEM PODERIA. O item 3 do procedimento define que o PLP —
// Plano de Pintura, emitido por obra — é quem diz o sistema, o preparo, os tipos de tinta, o número
// de demãos, as espessuras e as cores. Produto, fabricante e espessura especificada são campos
// preenchidos a partir do PLP daquela obra; fixá-los no código seria inventar um esquema.

/** Graus de limpeza descritos no item 5.4 do PO-05. */
export const GRAUS_LIMPEZA = [
  { id: "ST2", nome: "ST2 — limpeza manual/mecânica" },
  { id: "ST3", nome: "ST3 — limpeza manual/mecânica rigorosa" },
  { id: "SA1", nome: "SA1 — jateamento ligeiro (brush-off)" },
  { id: "SA2", nome: "SA2 — jateamento comercial" },
  { id: "SA2.5", nome: "SA2½ — remove +95% das contaminações (cinza claro)" },
  { id: "SA3", nome: "SA3 — ao metal branco (100%)" },
];

/** Grau de intemperismo (norma ISO 8501-1), como no formulário. */
export const GRAUS_INTEMPERISMO = ["A", "B", "C", "D"];

export const METODOS_APLICACAO = ["Airless", "Convencional (ar comprimido)", "Trincha", "Rolo"];

/**
 * Perfil de rugosidade — item 5.5.1.1.
 *
 * "Utilizar medidor de perfil de rugosidade do tipo agulha deslizante com precisão de pelo menos
 * 5 µm; o valor deve ser obtido pela MÉDIA DE CINCO MEDIÇÕES; o jateamento deve desenvolver um
 * perfil entre 50 e 90 µm ou conforme o PLP."
 */
export const RUGOSIDADE_MIN = 50;
export const RUGOSIDADE_MAX = 90;

/** A média das cinco medições, como o procedimento manda. */
export function mediaRugosidade(leituras) {
  const n = (Array.isArray(leituras) ? leituras : []).map(Number).filter(Number.isFinite);
  if (!n.length) return null;
  return +(n.reduce((a, b) => a + b, 0) / n.length).toFixed(1);
}

/**
 * AS CONDIÇÕES AMBIENTAIS PERMITEM PINTAR?  (item 5.4)
 *
 * O procedimento é explícito e cada regra é verificável:
 *
 *   · temperatura ambiente não inferior a 5 °C;
 *   · temperatura da superfície pelo menos 3 °C ACIMA do ponto de orvalho;
 *   · temperatura da superfície não superior a 52 °C;
 *   · umidade relativa do ar não superior a 85%;
 *   · nada de chuva, nevoeiro ou bruma.
 *
 * ⚠ ESTA É A VERIFICAÇÃO QUE MAIS VALE NESTE RELATÓRIO. Pintar fora dessas condições é a causa
 * clássica de falha de revestimento — a tinta parece boa no dia e descola meses depois, já na obra
 * do cliente. E é a primeira coisa que a fiscalização confere no documento.
 *
 * ⚠ A regra do orvalho é a que se erra: não basta a superfície estar acima do ponto de orvalho, tem
 * de estar 3 °C acima. Uma superfície a 18 °C com orvalho a 16 °C reprova, e ninguém percebe de
 * cabeça.
 */
export function condicoesPermitemPintar({ tAmbiente, tSuperficie, pontoOrvalho, umidade, tempo = null }) {
  const n = (v) => (v == null || v === "" ? null : Number(v));
  const ta = n(tAmbiente), ts = n(tSuperficie), po = n(pontoOrvalho), ur = n(umidade);
  const impedimentos = [];

  if (ta != null && Number.isFinite(ta) && ta < 5) impedimentos.push("Temperatura ambiente abaixo de 5 °C.");
  if (ur != null && Number.isFinite(ur) && ur > 85) impedimentos.push("Umidade relativa acima de 85%.");
  if (ts != null && Number.isFinite(ts) && ts > 52) impedimentos.push("Temperatura da superfície acima de 52 °C.");
  if (ts != null && po != null && Number.isFinite(ts) && Number.isFinite(po) && ts < po + 3) {
    impedimentos.push(`Superfície a ${ts} °C, menos de 3 °C acima do ponto de orvalho (${po} °C).`);
  }
  if (tempo && /chuva|nevoeiro|bruma/i.test(tempo)) impedimentos.push(`Tempo impeditivo: ${tempo}.`);

  const faltam = [ta, ts, po, ur].some((v) => v == null || !Number.isFinite(v));
  return {
    // ⚠ sem os quatro números não se afirma nada: "pode pintar" com dado faltando é pior que o
    // silêncio, porque vira registro de conformidade que ninguém verificou.
    avaliado: !faltam,
    permitido: !faltam && impedimentos.length === 0,
    impedimentos,
  };
}

export const TEMPO = ["Bom", "Nublado", "Chuva", "Nevoeiro", "Bruma"];

/** A média das leituras de espessura de uma demão. */
export function mediaEspessura(leituras) {
  const n = (Array.isArray(leituras) ? leituras : []).map(Number).filter(Number.isFinite);
  if (!n.length) return null;
  return +(n.reduce((a, b) => a + b, 0) / n.length).toFixed(1);
}

/** As propriedades de cada demão, na ordem do formulário da Torg. */
export const CAMPOS_DEMAO = [
  { k: "produto", rot: "Produto / norma" },
  { k: "fabricante", rot: "Fabricante" },
  // a cor é ESCOLHIDA: a mesma obra pinta peças de cores diferentes com o mesmo sistema
  { k: "cor", rot: "Cor aplicada" },
  { k: "loteA", rot: "Lote — comp. A" },
  { k: "loteB", rot: "Lote — comp. B" },
  { k: "loteD", rot: "Lote — diluente" },
  { k: "valA", rot: "Validade — comp. A" },
  { k: "valB", rot: "Validade — comp. B" },
  { k: "valD", rot: "Validade — diluente" },
  { k: "data", rot: "Data de aplicação", tipo: "date" },
  { k: "hIni", rot: "Horário inicial", tipo: "time" },
  { k: "hFim", rot: "Horário final", tipo: "time" },
  { k: "umidade", rot: "Umidade relativa (%)", tipo: "number" },
  { k: "tAmb", rot: "Temp. ambiente (°C)", tipo: "number" },
  { k: "tSup", rot: "Temp. superfície (°C)", tipo: "number" },
  { k: "orvalho", rot: "Ponto de orvalho (°C)", tipo: "number" },
  { k: "metodo", rot: "Método de aplicação", opcoes: METODOS_APLICACAO },
  { k: "visual", rot: "Inspeção visual" },
  { k: "aderencia", rot: "Aderência (ensaio X)" },
];
