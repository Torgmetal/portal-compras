import { numeroBR } from "@/lib/numero-br";
// ─── ENSAIO POR LÍQUIDO PENETRANTE ────────────────────────────────────────────
// Vitor (22/08/2026): "vamos para o relatório de LP agora... precisa seguir a mesma
// linha, como Excel, porém trazer as informações pertinentes do procedimento e do
// relatório que coloquei de amostra".
//
// Amostra: FORM. SGQ - 012 "REGISTRO DE ENSAIO POR LÍQUIDO PENETRANTE (LPR)", o
// LP_269_26_T70 da OP-070 — bilíngue, como o de ultrassom.
// Procedimento: PO-15 R1 (08/08/2026), "Ensaio por Líquidos Penetrantes".
//
// ⚠ O QUE ESTE ENSAIO TEM DE PRÓPRIO É O TEMPO. Penetração, secagem e revelação têm
// mínimos e máximos, e furar qualquer um invalida o ensaio sem deixar marca no
// resultado: o líquido não teve tempo de entrar, ou entrou e secou. Por isso os tempos
// aparecem com a faixa do procedimento ao lado, e não como campo livre.

/** Tipo do penetrante — item 4 do PO-15 (nomenclatura ASTM). */
export const TIPOS_PENETRANTE = [
  { id: "II", nome: "Tipo II — Visível (colorido)", fluorescente: false },
  { id: "I", nome: "Tipo I — Fluorescente", fluorescente: true },
];

/** Técnica de remoção do excesso — itens 4 e 9. */
export const METODOS = [
  { id: "A", nome: "A — removível com água" },
  { id: "C", nome: "C — removível com solvente" },
  { id: "B", nome: "B — pós-emulsificável (lipofílico)" },
  { id: "D", nome: "D — pós-emulsificável (hidrofílico)" },
];

/** Conjuntos aprovados no item 4. O da amostra é o Metal-Chek. */
export const MARCAS = ["Metal-Chek", "Magnaflux", "Ardrox", "Chemetall"];

/** Removedores citados nos itens 5 e 9.2. "Água" é o do método A. */
export const REMOVEDORES = ["Água", "Thinner Audi 2800", "TMC-10", "R 501", "E-59", "SKC-S", "Pano seco e limpo"];

/** Como o produto é aplicado — item 8. */
export const APLICACOES = ["Aerossol", "Pincelamento", "Imersão", "Pistola (granel)"];

/** Condição da superfície antes do ensaio — o campo existe na amostra. */
export const CONDICOES_SUPERFICIE = ["Escovada", "Esmerilhada", "Como soldada", "Jateada", "Usinada", "Lixada"];

// ── OS TEMPOS DO PROCEDIMENTO ───────────────────────────────────────────────
// item 8: penetração de 10 a 60 min
// item 10: secagem natural, mínimo 5 min antes do revelador
// item 11: revelador aplicado logo após a secagem, nunca além de 30 min
// item 13: interpretação começa logo após a secagem do revelador
export const PENETRACAO_MIN = 10;
export const PENETRACAO_MAX = 60;
export const SECAGEM_MIN = 5;
export const REVELADOR_MAX = 30;

// ── ILUMINAÇÃO — item 12 ────────────────────────────────────────────────────
// 12.1 colorida: no mínimo 1076 lux, medido com luxímetro calibrado
// 12.2 fluorescente: ambiente com no MÁXIMO 10 lux e UV de no mínimo 1000 µW/cm²
export const LUX_MINIMO_COLORIDA = 1076;
export const LUX_MAXIMO_FLUORESCENTE = 10;
export const UV_MINIMO = 1000;

// ── TEMPERATURA — item 7 ────────────────────────────────────────────────────
// superfície: 10 a 52 °C no Tipo II, 10 a 38 °C no Tipo I
// o penetrante, em todo o ensaio: 10 a 38 °C
export const TEMP_SUPERFICIE = { II: [10, 52], I: [10, 38] };
export const TEMP_PENETRANTE = [10, 38];

/** Classificação da indicação — item 14.1.1, e a legenda da amostra. */
export const TIPOS_INDICACAO = [
  { id: "IL", nome: "IL — indicação linear", desc: "comprimento maior que três vezes a largura" },
  { id: "IA", nome: "IA — indicação arredondada", desc: "circular ou elíptica, comprimento até três vezes a largura" },
  { id: "INR", nome: "INR — indicação não relevante", desc: "menor que 1,5 mm (1/16\")" },
];

/** Abaixo disto a indicação não é relevante — item 14.1.1. */
export const RELEVANTE_MIN_MM = 1.5;

/** Critérios de aceitação previstos no item 14. AWS D1.1 é o de estrutura. */
export const CRITERIOS = [
  "AWS D1.1",
  "ASME VIII Div. 1 e 2",
  "API 650 / API 620",
  "ASME B31.1 / B31.3",
  "API 1104 / ASME B31.4 / B31.8",
  "PETROBRAS N-1596",
];

export const CRITERIO_PADRAO = "AWS D1.1 — item 14.2 do PO-15";
export const PROCEDIMENTO_PADRAO = "PO-15 Rev. 1";

const n = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const x = numeroBR(v, NaN);
  return Number.isFinite(x) ? x : null;
};

/**
 * O ensaio respeitou o procedimento?
 *
 * Mesma ideia da verificação ambiental da pintura: cada regra do PO-15 é verificável, e
 * ensaio feito fora dela não tem valor — só que aqui o erro não deixa rastro no
 * resultado, o que o torna mais perigoso. Devolve os impedimentos com o item citado.
 */
export function conferirEnsaio({ tipo, lux, uv, tempSuperficie, penetracao, secagem, revelador }) {
  const fluor = tipo === "I";
  const v = { lux: n(lux), uv: n(uv), sup: n(tempSuperficie), pen: n(penetracao), sec: n(secagem), rev: n(revelador) };
  const avaliado = Object.values(v).some((x) => x != null);
  const problemas = [];

  if (fluor) {
    if (v.lux != null && v.lux > LUX_MAXIMO_FLUORESCENTE) problemas.push(`Ambiente com ${v.lux} lux — a técnica fluorescente exige no máximo ${LUX_MAXIMO_FLUORESCENTE} (PO-15, item 12.2).`);
    if (v.uv != null && v.uv < UV_MINIMO) problemas.push(`Luz negra a ${v.uv} µW/cm² — mínimo ${UV_MINIMO} (PO-15, item 12.2).`);
  } else if (v.lux != null && v.lux < LUX_MINIMO_COLORIDA) {
    problemas.push(`Iluminação de ${v.lux} lux — a técnica colorida exige no mínimo ${LUX_MINIMO_COLORIDA} (PO-15, item 12.1).`);
  }

  const faixa = TEMP_SUPERFICIE[fluor ? "I" : "II"];
  if (v.sup != null && (v.sup < faixa[0] || v.sup > faixa[1])) {
    problemas.push(`Superfície a ${v.sup} °C — fora da faixa de ${faixa[0]} a ${faixa[1]} °C (PO-15, item 7).`);
  }
  if (v.pen != null && (v.pen < PENETRACAO_MIN || v.pen > PENETRACAO_MAX)) {
    problemas.push(`Penetração de ${v.pen} min — o procedimento pede de ${PENETRACAO_MIN} a ${PENETRACAO_MAX} (PO-15, item 8).`);
  }
  if (v.sec != null && v.sec < SECAGEM_MIN) {
    problemas.push(`Secagem de ${v.sec} min antes do revelador — mínimo ${SECAGEM_MIN} (PO-15, item 10).`);
  }
  if (v.rev != null && v.rev > REVELADOR_MAX) {
    problemas.push(`Revelador aplicado ${v.rev} min após a secagem — nunca além de ${REVELADOR_MAX} (PO-15, item 11).`);
  }

  return { avaliado, conforme: avaliado && !problemas.length, problemas };
}

/** Indicação abaixo de 1,5 mm é não relevante — o portal sugere, o inspetor decide. */
export function tipoSugerido(tamanhoMm) {
  const t = n(tamanhoMm);
  if (t == null) return null;
  return t < RELEVANTE_MIN_MM ? "INR" : null;
}
