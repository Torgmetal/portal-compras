// Itens que NÃO fazem parte da PRODUÇÃO (não são fabricados por nós). No fluxo de fábrica
// (Corte/Montagem/Solda/…, TV de prioridades, painel de Liberar/Baixa) eles são IGNORADOS. Mas
// continuam valendo p/ Engenharia, Compras, Planejamento e Expedição, e a LE segue com 100% dos
// itens (LE ≠ LPC). Regra do Vitor (08/2026), baseada no PESO:
//   • TEM peso → considera na produção (mostra) — EXCETO cobertura/piso comprado (telha, rufo,
//     calha, grade de piso) que vêm com peso na lista mas não são fabricados aqui.
//   • "SUPORTE de calha" tem peso e É fabricado → mostra (não entra na exceção).
//   • SEM peso → não é produção (parafuso/porca/arruela/chumbador/cola/… vêm sem peso) — ESCONDE,
//     a não ser que seja uma peça de corte real (tem `perfil` de aço ou é CROQUI) só sem o peso
//     preenchido (falha de dado — ex.: chapas "CH9.50X203" sem peso) — essas ficam.

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Cobertura/piso COMPRADO — tem peso mas não fabricamos (Vitor: "apenas telhas, rufos e calhas"
// + grade de piso). "SUPORTE ..." não entra (é fabricado).
const RX_COBERTURA = /\b(?:telha|rufo|calha|grade\s+de\s+piso|grelha|degrau|gradil|grating)/;

// GRADE DE PISO / DEGRAU pelo MATERIAL da LPC. O Tekla marca a grade com material "GS_A4_304"
// (GS_A2_304 em alguns projetos) e escreve um perfil FALSO de chapa — "CH30.00X1292" é o painel
// de grade, não uma chapa de 30 mm. Sem isso a peça entrava no corte, ficava eternamente "sem
// material no CMR" (nunca compramos essa chapa) e inflava o peso do setor.
//
// ⚠ O sinal é o MATERIAL, não a marca: o Vitor apontou pelo "AG" da OP-089 (T89AG1…), e está
// certo — mas isso é convenção DAQUELA OP. As 132 peças de grade da base têm material GS_*, e só
// 36 têm "AG" na marca (a T64T usa T64T715, T64T725…). Pelo material pega todas; a marca
// T<op>AG<n> fica como reforço, pra quando a LPC vier sem material. (Vitor 19/08/2026.)
const RX_GRADE_MATERIAL = /^GS(?:[_\-\s]|$)/i;
const RX_MARCA_GRADE = /^T?\d+AG(\d|[^A-Z]|$)/;

export function ehGradeDePiso(p) {
  if (RX_GRADE_MATERIAL.test(String(p?.material || "").trim())) return true;
  return RX_MARCA_GRADE.test(String(p?.marca || "").toUpperCase().replace(/\s+/g, ""));
}

// Item a IGNORAR no fluxo de produção.
export function ehItemComprado(p) {
  if (ehGradeDePiso(p)) return true; // grade/degrau: comprado pronto, não passa pela fábrica
  const peso = Number(p?.pesoTotalKg) || Number(p?.pesoUnitKg) || 0;
  const d = norm(p?.descricao);
  if (peso > 0) return RX_COBERTURA.test(d) && !d.includes("suporte"); // com peso: só cobertura/piso comprado
  // Sem peso → comprado (esconde), a não ser que seja corte real (perfil de aço ou croqui) sem peso.
  const temPerfil = !!(p?.perfil && String(p.perfil).trim());
  return !(temPerfil || p?.tipoPeca === "CROQUI");
}
