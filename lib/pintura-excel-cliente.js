"use client";
import { criarRelatorioTorg, adicionarFolhaTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";

// ─── O CADERNO DE PINTURA, EM EXCEL ────────────────────
//
// Vitor (07/09/2026): "precisa ter 3 planilhas, uma com a quantidade, uma com as informações de
// qual tinta usar e a outra a especificação para colocar na mão do pintor" — e, sobre o gatilho:
// "todas as folhas sairão da OP selecionada na barra do Gantt de cada OP".
//
// ⚠ NO CLIENTE, como todo Excel do portal: `lib/excel-relatorio` monta o cabeçalho ISO com o logo e
// só roda no navegador. O servidor devolve os dados (/api/pcp/pintura); a planilha nasce aqui.
//
// ⚠ SEM ASSINATURA DO PINTOR. Decidido por Vitor em 07/09/2026 — a folha 3 é instrução de trabalho,
// não registro de conformidade. Se um dia virar documento que volta assinado, muda o desenho: passa
// a precisar de revisão, FORM do SGQ e guarda.

const nb = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const dbr = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

/* ─── OS CAMPOS QUE FALTAM VIRAM CÉLULA AMARELA, E O RESTO VIRA FÓRMULA ─────────
   ⚠⚠ Vitor (07/09/2026): "você já deixa a planilha com as fórmulas corretas e somente informamos as
   quantidades na hora de exportar (…) deixe em amarelo claro os campos que devemos preencher para
   chamar a atenção da pessoa".
   É melhor do que perguntar antes de gerar: a planilha sai sempre, e quem tem o boletim do
   fabricante na mão completa ali mesmo — o litro, o galão, o diluente e a camada úmida se recalculam
   sozinhos. Enquanto o campo está vazio, as fórmulas devolvem "" em vez de erro ou zero. */
const AMARELO_CLARO = "FFFDF3D0";

/** Célula que a pessoa preenche: amarelo claro, borda, e o valor quando o portal já sabe. */
function paraPreencher(ws, ref, valor) {
  const c = ws.getCell(ref);
  if (valor != null) c.value = valor;
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO_CLARO } };
  c.border = { top: { style: "thin", color: { argb: "FFB0BEC5" } }, left: { style: "thin", color: { argb: "FFB0BEC5" } },
               bottom: { style: "thin", color: { argb: "FFB0BEC5" } }, right: { style: "thin", color: { argb: "FFB0BEC5" } } };
  c.alignment = { horizontal: "center", vertical: "middle" };
  return c;
}

/** Célula calculada — fórmula de verdade, para recalcular quando a amarela for preenchida. */
function formula(ws, ref, f, fmt) {
  const c = ws.getCell(ref);
  c.value = { formula: f };
  if (fmt) c.numFmt = fmt;
  c.alignment = { horizontal: "center", vertical: "middle" };
  return c;
}

/* ⚠⚠ O QUE DÁ E O QUE NÃO DÁ PARA AFIRMAR SOBRE A FALTA. O CMR conta EMBALAGENS; o tamanho de cada
   uma só aparece quando o fornecedor escreve na descrição — 112 de 486 entradas de tinta, e varia
   (18 L, 20 L, 16 L). Com uma embalagem sequer sem tamanho, o recebido em litros é um PISO, e dizer
   "faltam X" a partir de um piso é afirmar o que não se sabe. Então a frase muda conforme o caso, e
   nunca inventa o que falta. */
function situacaoDoRecebido(q) {
  if (q.litros == null) return "Necessario: nao calculado (falta dado no PLP).";
  if (q.faltaL != null) {
    return q.faltaL > 0
      ? `⚠ FALTAM ${nb(q.faltaL, 2)} L — necessario ${nb(q.litros, 2)} L, recebido ${nb(q.recebidoL, 2)} L.`
      : `Tinta suficiente: necessario ${nb(q.litros, 2)} L, recebido ${nb(q.recebidoL, 2)} L.`;
  }
  const base = `Necessario ${nb(q.litros, 2)} L — ${q.galoes} galao(oes) de 3,6 L ou ${q.baldes} balde(s) de 18 L. ` +
    `Recebido: ${q.recebidoEmbalagens} embalagem(ns) no CMR`;
  return q.embalagensSemTamanho === q.recebidoEmbalagens || !q.recebidoL
    ? `${base} — a nota nao diz o tamanho de nenhuma, entao nao da para comparar.`
    : `${base}, das quais ${q.embalagensSemTamanho} sem tamanho na nota (${nb(q.recebidoL, 2)} L confirmados) — comparacao incompleta.`;
}

/**
 * Gera e baixa o caderno de pintura de uma OP.
 *
 * @param {string} opNumero
 * @param {string[]} [ids] peças do lote da barra; sem elas, a OP inteira
 */
export async function baixarCadernoPintura(opNumero, ids) {
  const qs = new URLSearchParams({ op: opNumero });
  if (ids?.length) qs.set("ids", ids.join(","));
  const res = await fetch(`/api/pcp/pintura?${qs}`, { cache: "no-store" });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Falha ao montar o caderno de pintura");

  const q = d.quantidade;
  /* ⚠⚠ TINTA QUE ENTROU PELO PEDIDO DE OUTRA OBRA APARECE AQUI, EM CIMA. Vitor (07/09/2026): "tem
     tinta da Induscolor na rastreabilidade da OP 105 e não temos tinta Induscolor para essa obra" —
     eram três R do pedido 1871, da OP-064. Ele pegou lendo; a folha tem de dizer.

     ⚠ PERGUNTA, NÃO ACUSA. Ele mesmo apontou o outro lado: "pode ter sido usado de estoque, isso
     você já sabe que não é regra". Tinta de uma obra pode ir para outra desde que bata a
     especificação e a cor, e esse consumo não fica registrado em lugar nenhum. Quem lê a folha é
     que sabe; a folha só levanta a dúvida antes de a tinta ir para a pistola. */
  const alertaObra = (d.obraDivergente || []).map((x) =>
    `⚠ R ${x.R} (${x.produto}) entrou pelo pedido ${x.pedido}, da OP-${x.obraPedido}${x.obraNome ? ` — ${x.obraNome}` : ""}. Confirme se é consumo de estoque ou obra trocada no lançamento do CMR.`);

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "Pintura — Quantidade",
    subtitulo: `OP-${d.op.numero} · ${d.op.obra || ""}${d.op.cliente ? ` · ${d.op.cliente}` : ""}`,
    kpis: [
      `${q.pecas} peças · ${nb(q.kg)} kg · ${nb(q.m2, 2)} m²` +
      `  |  ${q.demaos ?? "?"} demão(s) → ${nb(q.m2Aplicar, 2)} m² a aplicar` +
      `  |  Tinta: ${nb(q.litros, 2)} L · ${q.galoes ?? "—"} galões de 3,6 L ou ${q.baldes ?? "—"} baldes de 18 L`,
      ...(d.falta.length ? [`⚠ Sem ${d.falta.join(" e ")} — preencha as células AMARELAS da folha 2 e tudo se calcula.`] : []),
      ...alertaObra,
      situacaoDoRecebido(q),
    ],
    totalColunas: 7,
    nomePlanilha: "1. Quantidade",
    codigoDoc: "REL-PRD-005",
  });

  // ── FOLHA 1: quantidade, peça a peça ──
  ws.columns = [{ width: 18 }, { width: 34 }, { width: 20 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 22 }];
  let l = linhaInicio;
  adicionarHeaderTabela(ws, l, ["Marca", "Descricao", "Perfil", "Qte", "Peso (kg)", "Area (m2)", "Cor"]);
  l++;
  for (const p of d.pecas) {
    adicionarLinhaTabela(ws, l, [p.marca, p.descricao || "", p.perfil || "", p.qte, p.kg,
      // ⚠ peça sem área na LPC entra no peso e fica fora do m² — dizer isso é melhor que somar zero
      p.m2 == null ? "sem area" : p.m2,
      // ⚠ "definir" em vez de uma cor chutada: a descrição não disse a qual tipo de estrutura a
      // peça pertence, e pintar da cor errada é retrabalho que só aparece depois de curar.
      p.cor || `definir (${p.origemCor})`]);
    l++;
  }
  adicionarLinhaTotais(ws, l, ["TOTAL", `${d.pecas.length} marcas`, "",
    d.pecas.reduce((s, p) => s + p.qte, 0), q.kg, q.m2, ""]);
  // ── m² POR COR: é o que dimensiona a compra de cada uma ──
  l += 2;
  adicionarHeaderTabela(ws, l, ["Cor", "Tipo de estrutura", "De onde veio", "Pecas", "Peso (kg)", "Area (m2)", "Sem area"]);
  l++;
  for (const c of d.porCor) {
    adicionarLinhaTabela(ws, l, [c.cor || "⚠ DEFINIR", c.estrutura || "—", c.origem,
      c.pecas, Math.round(c.kg), c.m2, c.semArea || "—"]);
    l++;
  }

  // ── FOLHA 2: qual tinta usar — o R manda, em ordem FEFO ──
  const { sheet: w2, linhaInicio: i2 } = await adicionarFolhaTorg(workbook, {
    titulo: "Pintura — Qual tinta usar",
    subtitulo: `OP-${d.op.numero} · ${d.op.obra || ""} · rastreabilidade pelo R do CMR, em ordem de vencimento (FEFO)`,
    kpis: [
      ...alertaObra,
      situacaoDoRecebido(q),
    ],
    totalColunas: 13,
    nomePlanilha: "2. Qual tinta usar",
    codigoDoc: "REL-PRD-005",
  });
  w2.columns = [{ width: 11 }, { width: 38 }, { width: 12 }, { width: 11 }, { width: 16 },
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 11 },
    { width: 13 }, { width: 13 }, { width: 12 }];
  adicionarHeaderTabela(w2, i2, ["R do CMR", "Produto recebido (nota)", "Lote", "NF", "Fornecedor",
    "Qtd (emb.)", "L por emb.", "Validade", "Recebido em", "Certificado"]);
  let l2 = i2 + 1;
  for (const c of d.cmr) {
    adicionarLinhaTabela(w2, l2, [c.R, c.produto || "", c.lote || "—", c.nf || "—",
      c.fornecedor || "—", c.qtd ?? "—",
      // ⚠ "nao informado" e nao zero: a embalagem existe, a nota e que nao disse o tamanho
      c.litrosEmbalagem ?? "nao informado",
      dbr(c.validade), dbr(c.recebido), c.temCertificado ? "sim" : "nao"]);
    l2++;
  }
  if (!d.cmr.length) { adicionarLinhaTabela(w2, l2, ["—", "Nenhuma tinta lancada no CMR desta OP", "", "", "", "", "", "", "", "", "", "", ""]); l2++; }
  l2 += 1;
  /* ── O QUE O PLANO PEDE, COM AS FÓRMULAS VIVAS ─────────────────────────────
     As três colunas amarelas (esp. seca, sólidos por volume, diluição) são o que falta quando o PLP
     não trouxe. Preenchidas, tudo à direita se recalcula sozinho — inclusive a camada úmida da
     folha do pintor, que referencia esta.
     ⚠ As colunas são A..L e a ORDEM IMPORTA: as fórmulas usam o endereço, não o rótulo. Mexer numa
     coluna aqui quebra tudo à direita e a folha 3 junto. */
  l2 += 1;
  w2.getCell(`A${l2}`).value = "PREENCHA AS CELULAS AMARELAS — o resto se calcula sozinho";
  w2.getCell(`A${l2}`).font = { bold: true, color: { argb: "FF8A5600" } };
  l2++;
  const hCab = l2;
  /* ⚠⚠ AS DUAS EMBALAGENS, LADO A LADO. Vitor (07/09/2026): "precisa colocar a opção de galão de
     3,6 L e 18 L, isso é importante para trazer as quantidades". O fornecedor vende num ou noutro —
     e o CMR já recebeu as duas coisas (18 L do Industhane, 20 L do Jotun thinner, 16 L do Penguard).
     Quem compra escolhe a coluna que corresponde ao que vai pedir; as duas saem da MESMA conta em
     litros, que é a grandeza real. */
  adicionarHeaderTabela(w2, hCab, ["Demao", "Produto do PLP", "Cor", "Esp. seca (um)", "Solidos vol. (%)",
    "Diluicao (%)", "Area (m2)", "Rendimento (m2/L)", "Tinta (L)",
    "Galoes (3,6 L)", "Baldes (18 L)", "Diluente (L)", "Umida (um)"]);
  l2++;
  for (const c of d.camadas) {
    const r = l2;
    adicionarLinhaTabela(w2, r, [c.ordem ?? "", c.produto || "", c.cor || "—", "", "", "", "", "", "", "", "", "", ""]);
    paraPreencher(w2, `D${r}`, c.seca ?? null);
    paraPreencher(w2, `E${r}`, c.sv ?? null);
    paraPreencher(w2, `F${r}`, c.diluicaoPct ?? null);
    // ⚠ a área é do LOTE selecionado na barra, não da obra — não é campo de preencher.
    w2.getCell(`G${r}`).value = q.m2;
    w2.getCell(`G${r}`).alignment = { horizontal: "center", vertical: "middle" };
    // rendimento prático = SV × 10 ÷ espessura, com 15% de perda (mesmo padrão do estudo de pintura)
    formula(w2, `H${r}`, `IF(OR(D${r}="",E${r}=""),"",E${r}*10/D${r}*0.85)`, "#,##0.00");
    formula(w2, `I${r}`, `IF(H${r}="","",G${r}/H${r})`, "#,##0.00");
    formula(w2, `J${r}`, `IF(I${r}="","",ROUNDUP(I${r}/3.6,0))`, "#,##0");
    formula(w2, `K${r}`, `IF(I${r}="","",ROUNDUP(I${r}/18,0))`, "#,##0");
    formula(w2, `L${r}`, `IF(OR(I${r}="",F${r}=""),"",I${r}*F${r}/100)`, "#,##0.00");
    // ⚠ úmida = seca × (100 + %diluição) ÷ SV — a mesma fórmula da planilha da Qualidade
    formula(w2, `M${r}`, `IF(OR(D${r}="",E${r}="",F${r}=""),"",ROUND(D${r}*(100+F${r})/E${r},0))`, "#,##0");
    l2++;
  }
  const primeiraDemao = hCab + 1;
  l2++;
  w2.getCell(`A${l2}`).value =
    "Amarelo = preencher. Esp. seca e diluicao saem do PLP; solidos por volume, do boletim tecnico do fabricante.";
  w2.getCell(`A${l2}`).font = { italic: true, size: 9, color: { argb: "FF5B6A7E" } };
  // ⚠ o aviso de falta fica no fim, onde quem lê para de rolar
  l2++;
  w2.getCell(`A${l2}`).value = situacaoDoRecebido(q);
  w2.getCell(`A${l2}`).font = { bold: true, color: { argb: q.faltaL > 0 ? "FFC62828" : "FF002945" } };

  // ── FOLHA 3: para o pintor ──
  const { sheet: w3, linhaInicio: i3 } = await adicionarFolhaTorg(workbook, {
    titulo: "Pintura — Especificacao para o pintor",
    subtitulo: `OP-${d.op.numero} · ${d.op.obra || ""} · ${nb(q.m2, 2)} m² · ${q.demaos ?? "?"} demao(s)`,
    /* ⚠ o KPI desta folha é a instrução, não o número: quem lê está com a pistola na mão. */
    kpis: ["A ESPESSURA UMIDA e o que o pente deve marcar na hora — a seca so se mede depois de curar."],
    totalColunas: 3,
    nomePlanilha: "3. Para o pintor",
    codigoDoc: "REL-PRD-005",
  });
  w3.columns = [{ width: 26 }, { width: 42 }, { width: 42 }];
  // ⚠ `addRow` empilha a partir da última linha escrita — o cabeçalho já ocupou até `i3 - 1`.
  let l3 = i3;
  const put = (a, b, c, opt = {}) => {
    const r = w3.getRow(l3++);
    r.values = [a, b, c];
    if (opt.tit) { r.font = { bold: true, size: 12 }; }
    if (opt.forte) { r.font = { bold: true }; }
    r.commit?.();
    return r;
  };
  const pular = () => { l3++; };
  put(`OP-${d.op.numero}`, d.op.obra || "", d.op.cliente || "", { tit: true });
  put("Area a pintar", `${nb(q.m2, 2)} m²`, `${q.demaos ?? "?"} demão(s) · ${nb(q.m2Aplicar, 2)} m² a aplicar`, { forte: true });
  pular();
  /* ⚠⚠ TRÊS LINHAS POR DEMÃO, E MAIS NENHUMA. Vitor (07/09/2026): "na informação para o pintor só
     deveria aparecer a % de diluente, e quantas micras úmida deve ser aplicado e tempo de secagem,
     só isso nada a mais".
     Saíram daqui a mistura/componentes, o pot life e a ESPESSURA SECA — esta última porque o pintor
     não tem como medi-la na hora (só depois de curar), então na mão dele ela é ruído que compete
     com a úmida, que é a que ele mede. Quem precisa da seca é o inspetor, e ela está na folha 2. */
  /* ⚠⚠ AS DUAS LINHAS DE NÚMERO APONTAM PARA A FOLHA 2, não repetem o valor. Assim, preenchendo as
     células amarelas lá, a folha do pintor se atualiza sozinha — que é o ponto da ideia do Vitor.
     Repetir o número aqui criaria duas verdades, e a folha impressa sairia velha. */
  d.demaos.forEach((m, i) => {
    const r = primeiraDemao + i;
    const ref = (col) => `'2. Qual tinta usar'!${col}${r}`;
    put(`Demao ${m.ordem} — ${m.camada || ""}`, m.produto || "⚠ preencher no PLP", m.cor ? `Cor: ${m.cor}` : "", { forte: true });

    const lD = l3;
    put("  Diluente", "", "preencher na folha 2 se estiver em branco");
    w3.getCell(`B${lD}`).value = { formula: `IF(${ref("F")}="","⚠ preencher na folha 2",${ref("F")}&"%")` };

    const lU = l3;
    put("  ESPESSURA UMIDA", "", "é o que o pente deve marcar na hora", { forte: true });
    w3.getCell(`B${lU}`).value = { formula: `IF(${ref("M")}="","⚠ preencher na folha 2",${ref("M")}&" µm")` };
    w3.getCell(`B${lU}`).font = { bold: true };

    put("  Secagem", m.secagem || "⚠ preencher no PLP", "antes da próxima demão");
    pular();
  });
  /* ⚠ A COR FICA, mesmo com o "só isso nada a mais": na OP-067 o mesmo sistema pinta plataforma de
     PRETO N1 e guarda-corpo de AMARELO 5Y 8/12 — sem esta lista a folha estaria errada em metade
     das peças daquela obra. Agora vem com o m² de cada cor, que é o que a pistola vai cobrir. */
  if (d.porCor.length) {
    put("COR POR TIPO DE ESTRUTURA", "", "", { forte: true });
    for (const c of d.porCor) {
      put(`  ${c.cor || "⚠ DEFINIR"}`, c.estrutura || "—",
        `${c.pecas} peça(s) · ${nb(c.m2, 2)} m²${c.semArea ? ` · ${c.semArea} sem área` : ""}`);
    }
    pular();
  }
  // ⚠ a lista de R saiu daqui: rastreabilidade é assunto da folha 2, e na mão do pintor ela só
  // competiria com as três linhas que importam.

  await downloadWorkbook(workbook, `Pintura-OP-${d.op.numero}.xlsx`);
  return d;
}
