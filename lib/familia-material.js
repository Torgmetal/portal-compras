// FAMÍLIA DO MATERIAL — pra separar as linhas de Suprimentos no cronograma.
//
// Vitor (19/08/2026): "se formos falar de matéria-prima concordo [medir em kg]; em casos de
// parafusos, tinta, grade de piso, telhas, calhas e rufos precisam ter linhas separadas".
//
// Faz sentido além do Gantt: **só o aço se mede em kg**. Medido sobre os 1.029 itens de RM da base:
//   ACO       531 itens · 531 t          → kg
//   FIXACAO   251 itens · ZERO kg        → conta itens (vem em Pç, sem peso)
//   TINTA      81 itens · ZERO kg        → conta itens (GL, BALDE 18L, LATA 2,25L)
//   COBERTURA  11 itens · kg em 6 de 11  → conta itens (mistura M², PÇ e kg)
//   OUTROS    155 itens                  → consumível de oficina e serviço
//
// Somar "3 galões + 2 baldes + 1 lata" não significa nada; **quantos itens já foram atendidos**
// significa. Por isso a unidade é por família, não uma só pro cronograma inteiro.

// minúsculas + sem acento: o cadastro escreve "AÇO" e "ACO", "PARAFUSO" e "parafuso"
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// ⚠ ORDEM IMPORTA: cobertura antes de aço (a telha não é chapa), tinta antes de fixação.
const REGRAS = [
  ["COBERTURA", /\b(telha|calha|rufo|cumeeira|pingadeira|grelha|gradil|grating|degrau)\b|\bgrade\s+de\s+piso\b/],
  // Tinta vem muito por MARCA no cadastro ("WEG - TL EP ZSP", "JOTUN - PENGUARD") — sem elas
  // 8 itens de tinta caíam em OUTROS.
  ["TINTA", /\b(tinta|primer|esmalte|zarcao|galvite|industhane|endurecedor|diluente|thinner|catalisador|penguard|weg|jotun|sherwin|renner|coral|suvinil)\b|\bindusdur\b|\bfundo\s+anticorros/],
  // "PARAF." abreviado é comum no cadastro e escapava do \bparafuso\b
  ["FIXACAO", /\b(parafuso|paraf\.?|porca|arruela|chumbador|prisioneiro|autobrocante|rebite)\b|\bbarra\s*rosc|\bpara[\s._-]?bolt\b/],
  ["ACO", /\b(perfil|chapa|tubo|barra|cantoneira|viga|trilho)\b|^(w|hp|ch|l|u|i|fc|tb|fr|br)\s*\d/],
];

export const FAMILIAS = {
  ACO: { label: "Matéria-prima (aço)", unidade: "kg" },
  FIXACAO: { label: "Parafusos e fixação", unidade: "itens" },
  TINTA: { label: "Tinta", unidade: "itens" },
  COBERTURA: { label: "Cobertura e piso", unidade: "itens" },
  OUTROS: { label: "Consumíveis e serviços", unidade: "itens" },
};

/** @returns {"ACO"|"FIXACAO"|"TINTA"|"COBERTURA"|"OUTROS"} */
export function familiaMaterial(descricao) {
  const d = norm(descricao);
  if (!d) return "OUTROS";
  for (const [nome, rx] of REGRAS) if (rx.test(d)) return nome;
  return "OUTROS";
}

/**
 * Quanto ESTE item vale na conta da família — kg no aço, 1 item nas demais.
 * É o que evita somar galão com barra.
 */
export function pesoNaFamilia(item, familia = null) {
  const f = familia || familiaMaterial(item?.descricao);
  if (f !== "ACO") return 1;
  const kg = Number(item?.peso) || 0;
  return kg > 0 ? kg : 1; // aço sem peso lançado conta como 1 item, pra não sumir da conta
}
