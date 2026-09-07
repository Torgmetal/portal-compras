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
  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "Pintura — Quantidade",
    subtitulo: `OP-${d.op.numero} · ${d.op.obra || ""}${d.op.cliente ? ` · ${d.op.cliente}` : ""}`,
    kpis: [
      `${q.pecas} peças · ${nb(q.kg)} kg · ${nb(q.m2, 2)} m²` +
      `  |  ${q.demaos ?? "?"} demão(s) → ${nb(q.m2Aplicar, 2)} m² a aplicar` +
      `  |  Tinta: ${nb(q.litros, 2)} L · ${q.galoes ?? "—"} galões`,
      ...(d.falta.length ? [`⚠ Sem ${d.falta.join(" e ")} — a conta de tinta não fecha.`] : []),
      ...(q.faltaGaloes > 0 ? [`⚠ FALTAM ${q.faltaGaloes} galão(ões): recebido ${q.recebidoGaloes}, necessário ${q.galoes}.`] : []),
    ],
    totalColunas: 6,
    nomePlanilha: "1. Quantidade",
    codigoDoc: "REL-PRD-005",
  });

  // ── FOLHA 1: quantidade, peça a peça ──
  ws.columns = [{ width: 18 }, { width: 34 }, { width: 20 }, { width: 8 }, { width: 12 }, { width: 12 }];
  let l = linhaInicio;
  adicionarHeaderTabela(ws, l, ["Marca", "Descricao", "Perfil", "Qte", "Peso (kg)", "Area (m2)"]);
  l++;
  for (const p of d.pecas) {
    adicionarLinhaTabela(ws, l, [p.marca, p.descricao || "", p.perfil || "", p.qte, p.kg,
      // ⚠ peça sem área na LPC entra no peso e fica fora do m² — dizer isso é melhor que somar zero
      p.m2 == null ? "sem area" : p.m2]);
    l++;
  }
  adicionarLinhaTotais(ws, l, ["TOTAL", `${d.pecas.length} marcas`, "",
    d.pecas.reduce((s, p) => s + p.qte, 0), q.kg, q.m2]);

  // ── FOLHA 2: qual tinta usar — o R manda, em ordem FEFO ──
  const { sheet: w2, linhaInicio: i2 } = await adicionarFolhaTorg(workbook, {
    titulo: "Pintura — Qual tinta usar",
    subtitulo: `OP-${d.op.numero} · ${d.op.obra || ""} · rastreabilidade pelo R do CMR, em ordem de vencimento (FEFO)`,
    kpis: [
      `Recebido: ${q.recebidoGaloes} galao(oes) em ${d.cmr.length} lancamento(s) do CMR` +
      (q.galoes != null ? `  |  Necessario: ${q.galoes}` : "  |  Necessario: nao calculado"),
      ...(q.faltaGaloes > 0 ? [`⚠ FALTAM ${q.faltaGaloes} galao(oes) para este lote.`] : []),
    ],
    totalColunas: 9,
    nomePlanilha: "2. Qual tinta usar",
    codigoDoc: "REL-PRD-005",
  });
  w2.columns = [{ width: 11 }, { width: 38 }, { width: 12 }, { width: 11 }, { width: 16 },
    { width: 7 }, { width: 12 }, { width: 12 }, { width: 11 }];
  adicionarHeaderTabela(w2, i2, ["R do CMR", "Produto recebido (nota)", "Lote", "NF", "Fornecedor",
    "Qtd", "Validade", "Recebido em", "Certificado"]);
  let l2 = i2 + 1;
  for (const c of d.cmr) {
    adicionarLinhaTabela(w2, l2, [c.R, c.produto || "", c.lote || "—", c.nf || "—",
      c.fornecedor || "—", c.qtd ?? "—", dbr(c.validade), dbr(c.recebido), c.temCertificado ? "sim" : "nao"]);
    l2++;
  }
  if (!d.cmr.length) { adicionarLinhaTabela(w2, l2, ["—", "Nenhuma tinta lancada no CMR desta OP", "", "", "", "", "", "", ""]); l2++; }
  l2 += 1;
  // o que o plano pede, para conferir contra o que chegou
  adicionarHeaderTabela(w2, l2, ["Demao", "Produto do PLP", "Cor", "Esp. seca (um)", "Solidos vol. (%)",
    "Tinta (L)", "Galoes", "Diluente (L)", "Situacao"]);
  l2++;
  for (const c of d.camadas) {
    adicionarLinhaTabela(w2, l2, [c.ordem ?? "", c.produto || "", c.cor || "—", c.seca ?? "—",
      c.sv ?? "falta", c.litros ?? "—", c.galoes ?? "—", c.diluente ?? "—",
      c.falta ? `sem calcular — falta ${c.falta}` : "ok"]);
    l2++;
  }
  // ⚠ o aviso de falta fica no fim, onde quem lê para de rolar
  if (q.faltaGaloes > 0) {
    l2++;
    w2.getCell(`A${l2}`).value = `FALTAM ${q.faltaGaloes} galao(oes) — recebido ${q.recebidoGaloes}, necessario ${q.galoes}.`;
    w2.getCell(`A${l2}`).font = { bold: true, color: { argb: "FFC62828" } };
  }

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
  for (const m of d.demaos) {
    put(`Demao ${m.ordem} — ${m.camada || ""}`, m.produto || "⚠ preencher no PLP", m.cor ? `Cor: ${m.cor}` : "", { forte: true });
    put("  Mistura", m.componentes || "⚠ preencher no PLP", m.potLife ? `Vida útil da mistura: ${m.potLife}` : "");
    put("  Diluicao", m.diluicaoPct != null ? `${m.diluicaoPct}%${m.diluente ? ` · ${m.diluente}` : ""}` : "⚠ preencher no PLP", "");
    put("  Espessura seca", m.seca ? `${m.seca} µm` : "⚠ preencher no PLP", "medida depois de curar");
    /* ⚠⚠ A LINHA MAIS IMPORTANTE DA FOLHA. Vitor (07/09/2026): "a quantidade de espessura úmida é
       muito importante, precisa constar na parte de documento para o funcionário". A seca só se
       mede depois de curar; a úmida é a única verificação possível enquanto ainda dá para corrigir. */
    put("  ESPESSURA UMIDA", m.umida ? `${m.umida} µm` : `⚠ falta ${m.faltaUmida}`,
      m.umida ? "é o que o pente deve marcar na hora" : "sem ela o pintor não tem como conferir", { forte: true });
    put("  Secagem", m.secagem || "⚠ preencher no PLP", "antes da próxima demão");
    pular();
  }
  if (d.cores.length) {
    put("COR POR ESTRUTURA", "", "", { forte: true });
    for (const i of d.cores) {
      put(`  ${i.item || "—"}`, i.cor || "—",
        [i.externo && "externo", i.interno && "interno"].filter(Boolean).join(" / ") || "");
    }
    pular();
  }
  if (d.cmr.length) {
    put("TINTA A USAR (ordem de vencimento)", "", "", { forte: true });
    for (const c of d.cmr.slice(0, 12)) {
      put(`  R ${c.R}`, c.produto || "", `lote ${c.lote || "—"} · validade ${dbr(c.validade)}`);
    }
  }

  await downloadWorkbook(workbook, `Pintura-OP-${d.op.numero}.xlsx`);
  return d;
}
