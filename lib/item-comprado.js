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

// FIXAÇÃO COMPRADA PRONTA — ignora TENHA OU NÃO peso. Parafuso/porca/arruela normalmente vêm sem
// peso e já caíam no ramo de baixo, mas o parabolt da OP-067 veio com 16 kg e por isso apareceu na
// fila do corte. Vitor (19/08/2026): "a parabolt entra na regra dos parafusos também, não deve
// aparecer nas listas da produção".
//
// ⚠ REGEX ESTREITA DE PROPÓSITO. Vários nomes que parecem fixação nós FABRICAMOS: "ARRUELA CHAPA"
// é arruela cortada de chapa, TIRANTE e PINO ARTICULADOR saem com perfil, CHUMBADOR aparece como
// CONJUNTO de 1.746 kg. Esconder peça fabricada é o erro caro — some do setor e o conjunto não
// monta. Só entra aqui marca de item que se compra pronto.
const RX_FIXACAO_COMPRADA = /\bpara[\s._-]?bolt/i;

// Item a IGNORAR no fluxo de produção.
export function ehItemComprado(p) {
  if (ehGradeDePiso(p)) return true; // grade/degrau: comprado pronto, não passa pela fábrica
  if (RX_FIXACAO_COMPRADA.test(`${p?.descricao || ""} ${p?.marca || ""}`)) return true;
  const peso = Number(p?.pesoTotalKg) || Number(p?.pesoUnitKg) || 0;
  const d = norm(p?.descricao);
  if (peso > 0) return RX_COBERTURA.test(d) && !d.includes("suporte"); // com peso: só cobertura/piso comprado
  // Sem peso → comprado (esconde), a não ser que seja corte real (perfil de aço ou croqui) sem peso.
  const temPerfil = !!(p?.perfil && String(p.perfil).trim());
  return !(temPerfil || p?.tipoPeca === "CROQUI");
}

// ─── A ORDEM QUE O CLIENTE LÊ A LISTA DE COMPRAS ──────────────────────────────
// Vitor (26/08/2026): "deixe a lista dos materiais os perfis nas primeiras linhas, para depois os
// acessórios como telhas, calhas, rufos, depois o lanternim e por último os parafusos".
//
// ⚠ NÃO É ALFABÉTICA, É A ORDEM DA OBRA. Em ordem alfabética a lista abre com ARRUELA e
// AUTOBROCANTE — o cliente vê três telas de parafuso antes do primeiro perfil, e a impressão é de
// uma obra feita de fixador. A estrutura vem primeiro porque é ela que a obra é.
const ORDEM_COMPRA = [
  { g: 1, rx: /\b(perfil|viga|coluna|chapa|cantoneira|barra|tubo|u\s?laminad|w\d|hp\d|ue?\s?dobrad|metalon|treli)/i },
  { g: 2, rx: /\b(telha|calha|rufo|cumeeira|tapa[\s-]?vista|policarbonato|galvalume)/i },
  { g: 3, rx: /\b(lanternim|exaustor|aerador)/i },
  { g: 4, rx: /\b(parafuso|porca|arruela|chumbador|para[\s._-]?bolt|autobrocante|autoperfurante|rebite|pino|prisioneiro)/i },
];

/** 1 perfis · 2 acessórios de cobertura · 3 lanternim · 4 fixação · 9 o resto (antes da fixação) */
export function grupoDeCompra(descricao) {
  const t = String(descricao || "");
  for (const { g, rx } of ORDEM_COMPRA) if (rx.test(t)) return g;
  // ⚠ o que não se reconhece vai ANTES dos parafusos, não depois: material desconhecido é mais
  // provável ser insumo de obra (tinta, consumível, serviço) do que fixador, e enterrar no fim é
  // como ele deixa de ser visto.
  return 3.5;
}

export const ordenarCompras = (a, b) =>
  grupoDeCompra(a) - grupoDeCompra(b) || String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
