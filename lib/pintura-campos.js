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

/**
 * O grau de limpeza como a NORMA escreve, para sair em documento.
 *
 * ⚠ "SA2.5" É O NOSSO ID, NÃO A NOTAÇÃO. A ISO 8501-1 escreve Sa 2½ — e é isso que o inspetor do
 * cliente procura na folha. Vitor (27/08/2026), sobre o PLP: "aqui precisa estar como 2.1/2".
 */
const NOTACAO_GRAU = {
  ST2: "St 2", ST3: "St 3",
  SA1: "Sa 1", SA2: "Sa 2", "SA2.5": "Sa 2½", SA3: "Sa 3",
  QUIMICO: "Limpeza química",
};
export const grauNaNorma = (id) => NOTACAO_GRAU[String(id || "").toUpperCase()] || (id ? String(id) : null);

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

// ─── A CONDIÇÃO AMBIENTAL É POR ETAPA ────────────────────────────────────────────────────────
//
// ⚠⚠ ERA UMA LEITURA SÓ, REPETIDA COMO SE FOSSEM TRÊS. Vitor (22/09/2026): "nas informações de
// temperatura e umidade que seriam as condições ambientais, precisas que tenha o campo para
// informarmos tanto no jato, quanto no fundo quanto nas demais demãos". O portal pedia um bloco
// (prepUmidade/prepTAmb/prepTSup/prepOrvalho) e o PDF o copiava em todas as colunas: o RIP-102-002
// declarava as mesmas 41% / 24 °C / 23 °C no jateamento do dia 17 de manhã, no fundo do dia 17 à
// tarde e na 2ª demão do dia 18 — três medições que ninguém fez.
//
// ⚠ E a etapa MUDA a decisão: o item 5.4 é conferido contra a leitura de QUEM ESTAVA APLICANDO.
// Um fundo aplicado com 92% de umidade reprova, mesmo que o jato tenha sido num dia perfeito.
export const ETAPAS_AMBIENTE = [
  { id: "jato", rot: "Jateamento / preparação de superfície", curto: "jateamento" },
  // ⚠ a 1ª demão é o FUNDO — é como a fábrica e o PLP falam dela, e foi assim que o pedido veio.
  { id: "1", rot: "1ª demão — fundo", curto: "1ª demão (fundo)" },
  { id: "2", rot: "2ª demão", curto: "2ª demão" },
  { id: "3", rot: "3ª demão", curto: "3ª demão" },
];

/** Os quatro números da condição ambiental, e onde o jateamento guarda cada um. */
export const CAMPOS_AMBIENTE = ["umidade", "tAmb", "tSup", "orvalho"];
export const CAMPO_DO_JATO = { umidade: "prepUmidade", tAmb: "prepTAmb", tSup: "prepTSup", orvalho: "prepOrvalho" };

const semValor = (v) => v == null || v === "";

/**
 * A leitura ambiental de uma etapa: a própria, ou a do jateamento quando a demão não tem a sua.
 *
 * ⚠⚠ A DEMÃO SEM LEITURA HERDA A DO JATEAMENTO. Vitor (04/09/2026): "não está salvando umidade e
 * temperatura no relatório" — estava, no bloco único, e a coluna da demão saía em branco. Herdar
 * mantém o documento legível; `herdado` é o que permite à tela pedir a leitura de verdade.
 *
 * ⚠ SÓ HERDA DEMÃO QUE EXISTE: preencher a coluna de uma demão que ninguém aplicou seria inventar
 * registro de ensaio.
 */
export function leiturasAmbientais(res = {}, etapaId = "jato") {
  if (String(etapaId) === "jato") {
    const out = { herdado: false, existe: true, tempo: res.tempo ?? null };
    for (const k of CAMPOS_AMBIENTE) out[k] = semValor(res[CAMPO_DO_JATO[k]]) ? null : res[CAMPO_DO_JATO[k]];
    return out;
  }
  const bloco = (res.demaos || {})[String(etapaId)] || null;
  const existe = !!bloco && Object.values(bloco).some((x) => !semValor(x));
  const out = { herdado: false, existe, tempo: existe ? (res.tempo ?? null) : null };
  for (const k of CAMPOS_AMBIENTE) {
    if (!semValor(bloco?.[k])) { out[k] = bloco[k]; continue; }
    const doJato = res[CAMPO_DO_JATO[k]];
    if (existe && !semValor(doJato)) { out[k] = doJato; out.herdado = true; } else out[k] = null;
  }
  return out;
}

/** As etapas que EXISTEM neste relatório, cada uma julgada pelo item 5.4 com a leitura dela. */
export function ambientePorEtapa(res = {}) {
  return ETAPAS_AMBIENTE
    .map((e) => {
      const leituras = leiturasAmbientais(res, e.id);
      return {
        ...e,
        leituras,
        herdado: leituras.herdado,
        existe: leituras.existe,
        avaliacao: condicoesPermitemPintar({
          tAmbiente: leituras.tAmb, tSuperficie: leituras.tSup,
          pontoOrvalho: leituras.orvalho, umidade: leituras.umidade, tempo: leituras.tempo,
        }),
      };
    })
    .filter((e) => e.existe);
}

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
