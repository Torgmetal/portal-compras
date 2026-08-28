import "server-only";
import { rgb } from "pdf-lib";
import { mediaRugosidade, condicoesPermitemPintar } from "./pintura-campos";
import {
  abrirDocumento, novaFolha, M, san,
  DARK, GRAY, LINE, SOFT, GREEN, RED,
} from "./relatorio-form-pdf";

// RELATÓRIO DE INSPEÇÃO DE PINTURA (RIP).
//
// Modelo da aba "Pintura" de "Modelos de relatorios de qualidade torg.xlsx" — o maior dos quatro.
//
// São DUAS FOLHAS, como no modelo: a primeira com preparação de superfície, aplicação das tintas e
// medição de espessuras; a segunda com o registro fotográfico. Cada uma fecha com as três
// assinaturas — no modelo do Vitor os blocos de assinatura aparecem duas vezes pelo mesmo motivo:
// as folhas circulam separadas.
//
// ⚠ AS TRÊS DEMÃOS SÃO COLUNAS, não linhas. Cada propriedade (lote, validade, horário, umidade,
// temperatura…) é uma linha da tabela, e as demãos se comparam lado a lado. Trocar isso obrigaria
// quem confere a caçar a mesma informação em três lugares distantes.

/** As linhas do quadro de aplicação, na ordem do modelo. */
const APLICACAO = [
  ["Nome ou Norma do Produto", "produto"],
  ["Fabricante", "fabricante"],
  ["Lote — Componente A", "loteA"],
  ["Lote — Componente B", "loteB"],
  ["Lote — Diluente", "loteD"],
  ["Validade — Componente A", "valA"],
  ["Validade — Componente B", "valB"],
  ["Validade — Diluente", "valD"],
  ["Data de Aplicação", "data"],
  ["Horário — Inicial", "hIni"],
  ["Horário — Final", "hFim"],
  ["Umidade Relativa (%)", "umidade"],
  ["Temperatura Ambiente (ºC)", "tAmb"],
  ["Temperatura Superfície (ºC)", "tSup"],
  ["Ponto de Orvalho (ºC)", "orvalho"],
  ["Método de Aplicação", "metodo"],
  ["Inspeção Visual", "visual"],
  ["Aderência", "aderencia"],
];

const GRAUS_INTEMPERISMO = ["A", "B", "C", "D"];
const GRAUS_LIMPEZA = ["WJ1", "WJ2", "WJ3", "ST2", "SA2½", "SA3"];

// ⚠⚠ "SA2.5" NUNCA CASAVA COM "SA2½" — e é o grau usado em 90% das obras, segundo o próprio PO-05.
// O formulário grava `"SA2.5"` (lib/pintura-campos.js) e o PLP tem esse mesmo default; a lista aqui
// usa a fração tipográfica, e a comparação era `===` depois de `toUpperCase()`. A caixa do grau mais
// comum simplesmente nunca marcava, e o relatório saía sem indicar preparação de superfície nenhuma.
// O repo já sabia da tradução: `lib/plp.js:182` faz `.replace("SA2.5", "SA2½")` — só que para a tela.
const normGrau = (v) => String(v || "").toUpperCase().replace(/\s|-/g, "").replace(/SA2[.,]5|SA21\/2/g, "SA2½");
const FOTOS = [
  "Rugosidade / Jateamento", "Teste de Salinidade - BRESLE",
  "Medição de Espessura", "Aderência - Teste X",
  "Aderência - Pull Off", "Outros / Observações",
];

export async function gerarPinturaPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  // ⚠ com foto o PDF tem TRÊS folhas — as duas fixas mais o registro fotográfico. As folhas 1 e 2
  // traziam "total: 2" fixo e a terceira dizia "3 DE 3": o mesmo documento se contradizia.
  const temFotos = Array.isArray(fotos) && fotos.length > 0;
  const res = rel.resultados || {};
  const dem = res.demaos || {};      // { "1": {produto,...}, "2": {...}, "3": {...} }
  const esp = res.espessuras || {};  // { "1": [l1..l5], "2": [...], "3": [...] }

  // ── FOLHA 1 ──────────────────────────────────────────────────────────────────────────────────
  const f = novaFolha(doc);
  const { page, font, bold, W } = f;

  f.cabecalho({ titulo: "RELATÓRIO DE INSPEÇÃO DE PINTURA", codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm, folha: 1, total: temFotos ? 3 : 2 });

  f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
  f.linhaInfoAuto([["OP:", `OP-${rel.opNumero}`], ["OBRA / CONTRATO:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]);
  f.linhaInfo([
    ["DESCRIÇÃO:", res.descricao || "", 0.62],
    ["PROCEDIMENTO / REV.:", res.procedimento || "", 0.38],
  ]);
  f.linhaInfo([
    ["PEÇAS PINTADAS:", res.pecas || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : ""), 0.72],
    ["QUANTIDADE:", res.quantidade ?? "", 0.28],
  ]);

  // ── preparação de superfície ──
  const titulo = (t, alt = 13) => {
    const topo = f.bloco(alt, SOFT);
    page.drawText(san(t), { x: M + (W - bold.widthOfTextAtSize(san(t), 7)) / 2, y: topo - 9.5, size: 7, font: bold, color: GRAY });
  };
  titulo("PREPARAÇÃO DA SUPERFÍCIE");
  f.linhaInfo([
    ["PROCEDIMENTO:", res.prepProcedimento || "", 0.4],
    ["DATA:", res.prepData || "", 0.2],
    ["HORÁRIO INICIAL:", res.prepIni || "", 0.2],
    ["HORÁRIO FINAL:", res.prepFim || "", 0.2],
  ]);
  f.linhaInfo([
    ["UMIDADE (URA):", res.prepUmidade || "", 0.25],
    ["TEMP. AMBIENTE:", res.prepTAmb || "", 0.25],
    ["TEMP. SUPERFÍCIE:", res.prepTSup || "", 0.25],
    ["PONTO DE ORVALHO:", res.prepOrvalho || "", 0.25],
  ]);
  // ⚠ o perfil obtido é a MÉDIA DAS CINCO MEDIÇÕES (PO-05, item 5.5.1.1) — calculada, não digitada
  const rugMedia = mediaRugosidade(res.rugLeituras);
  f.linhaInfo([
    ["RUGOSIDADE ESPEC.:", res.rugEspec || "", 0.28],
    ["OBTIDO (média de 5):", rugMedia != null ? `${rugMedia} µm` : (res.rugObtido || ""), 0.22],
    ["TIPO DE ABRASIVO:", res.abrasivo || "", 0.5],
  ]);
  f.linhaInfo([
    ["POEIRA (ISO 8502-3):", res.poeira || "", 0.5],
    ["SALINIDADE (ISO 8502-6 / 9):", res.salinidade || "", 0.5],
  ]);

  // graus: marcados com caixinha, como no modelo
  const grau = (rot, opcoes, escolhido) => {
    const topo = f.bloco(15);
    f.rotulo(M + 7, topo - 10, rot, 6);
    const x0 = M + 150;
    const passo = Math.min(52, (W - 160) / opcoes.length);
    opcoes.forEach((o, i) => {
      const x = x0 + i * passo;
      f.marcar(x, topo - 3.5, normGrau(escolhido) === normGrau(o), GREEN);
      page.drawText(san(o), { x: x + 10, y: topo - 10, size: 6.4, font, color: DARK });
    });
  };
  grau("GRAU DE INTEMPERISMO:", GRAUS_INTEMPERISMO, res.intemperismo);
  grau("GRAU DE LIMPEZA:", GRAUS_LIMPEZA, res.limpeza);

  // ── aplicação de tintas: propriedades em linhas, demãos em colunas ──
  titulo("APLICAÇÃO DE TINTAS");
  const wRot = W * 0.34, wDem = (W - wRot) / 3;
  const hL = 12.4;
  const altAp = 13 + APLICACAO.length * hL;
  const topoAp = f.bloco(altAp);
  ["1ª DEMÃO", "2ª DEMÃO", "3ª DEMÃO"].forEach((t, i) => {
    const x = M + wRot + i * wDem;
    page.drawLine({ start: { x, y: topoAp }, end: { x, y: topoAp - altAp }, thickness: 0.7, color: LINE });
    page.drawText(t, { x: x + (wDem - bold.widthOfTextAtSize(t, 6.4)) / 2, y: topoAp - 9, size: 6.4, font: bold, color: GRAY });
  });
  page.drawText("DEMÃOS", { x: M + 7, y: topoAp - 9, size: 6.4, font: bold, color: GRAY });
  page.drawLine({ start: { x: M, y: topoAp - 13 }, end: { x: M + W, y: topoAp - 13 }, thickness: 0.7, color: LINE });
  APLICACAO.forEach(([rot, k], i) => {
    const ly = topoAp - 13 - i * hL;
    page.drawLine({ start: { x: M, y: ly - hL }, end: { x: M + W, y: ly - hL }, thickness: 0.35, color: rgb(0.88, 0.90, 0.92) });
    page.drawText(f.fit(rot, font, 6.4, wRot - 12), { x: M + 7, y: ly - 8.6, size: 6.4, font, color: GRAY });
    for (let d = 0; d < 3; d++) {
      const v = dem[String(d + 1)]?.[k];
      if (v == null || v === "") continue;
      const x = M + wRot + d * wDem;
      const txt = f.fit(String(v), bold, 6.6, wDem - 8);
      page.drawText(txt, { x: x + (wDem - bold.widthOfTextAtSize(txt, 6.6)) / 2, y: ly - 8.6, size: 6.6, font: bold, color: DARK });
    }
  });

  // ── espessuras: 5 leituras + média, por demão ──
  titulo("MEDIÇÕES DE ESPESSURA (µm)");
  const altEs = 13 + 6 * hL;
  const topoEs = f.bloco(altEs);
  ["1ª DEMÃO", "2ª DEMÃO", "3ª DEMÃO"].forEach((t, i) => {
    const x = M + wRot + i * wDem;
    page.drawLine({ start: { x, y: topoEs }, end: { x, y: topoEs - altEs }, thickness: 0.7, color: LINE });
    page.drawText(t, { x: x + (wDem - bold.widthOfTextAtSize(t, 6.4)) / 2, y: topoEs - 9, size: 6.4, font: bold, color: GRAY });
  });
  page.drawText("LEITURAS", { x: M + 7, y: topoEs - 9, size: 6.4, font: bold, color: GRAY });
  page.drawLine({ start: { x: M, y: topoEs - 13 }, end: { x: M + W, y: topoEs - 13 }, thickness: 0.7, color: LINE });
  for (let i = 0; i < 6; i++) {
    const ly = topoEs - 13 - i * hL;
    const ehMedia = i === 5;
    page.drawLine({ start: { x: M, y: ly - hL }, end: { x: M + W, y: ly - hL }, thickness: ehMedia ? 0.7 : 0.35, color: ehMedia ? LINE : rgb(0.88, 0.90, 0.92) });
    page.drawText(ehMedia ? "Média geral" : `Leitura ${i + 1}`, { x: M + 7, y: ly - 8.6, size: 6.4, font: ehMedia ? bold : font, color: GRAY });
    for (let d = 0; d < 3; d++) {
      const lista = Array.isArray(esp[String(d + 1)]) ? esp[String(d + 1)] : [];
      // ⚠ a MÉDIA é calculada, não digitada: valor que se digita à mão é valor que se erra, e aqui
      // ela é o número que decide se a demão passa.
      const nums = lista.map(Number).filter((n) => Number.isFinite(n));
      const v = ehMedia
        ? (nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "")
        : (lista[i] ?? "");
      if (v === "" || v == null) continue;
      const x = M + wRot + d * wDem;
      const txt = String(v);
      page.drawText(txt, { x: x + (wDem - bold.widthOfTextAtSize(txt, 6.8)) / 2, y: ly - 8.6, size: 6.8, font: bold, color: DARK });
    }
  }

  // ── laudo + observações ──
  const hLau = 24;
  const topoLau = f.bloco(hLau);
  page.drawText("LAUDO FINAL:", { x: M + 7, y: topoLau - 15, size: 7, font: bold, color: DARK });
  ["Aprovado", "Reprovado"].forEach((o, i) => {
    const x = M + 90 + i * 90;
    const on = String(res.laudo || "").toUpperCase() === o.toUpperCase();
    f.marcar(x, topoLau - 8, on, o === "Aprovado" ? GREEN : RED);
    page.drawText(o, { x: x + 11, y: topoLau - 15, size: 7, font: on ? bold : font, color: DARK });
  });
  // ⚠ CONDIÇÃO AMBIENTAL FORA DO PO-05 SAI IMPRESSA, junto do laudo. Se a aplicação não era
  // permitida, isso tem de estar no documento — é a causa mais comum de falha de revestimento, e
  // esconder no PDF o que a tela apontou seria emitir um registro que contradiz a inspeção.
  const cond = condicoesPermitemPintar({
    tAmbiente: res.prepTAmb, tSuperficie: res.prepTSup,
    pontoOrvalho: res.prepOrvalho, umidade: res.prepUmidade, tempo: res.tempo,
  });
  if (cond.avaliado && !cond.permitido) {
    page.drawText(san(`⚠ Condições fora do PO-05 (5.4): ${cond.impedimentos.join(" ")}`).slice(0, 150),
      { x: M + 7, y: topoLau - 6, size: 6, font, color: RED });
  }
  if (res.espessuraMinima) {
    page.drawText(san(`Espessura mínima especificada: ${res.espessuraMinima}`), { x: M + 300, y: topoLau - 15, size: 6.4, font, color: GRAY });
  }
  f.blocoTexto("OBSERVAÇÕES:", rel.observacoes || "", { alt: 30, linhas: 2 });
  f.blocoInstrumentos(rel.equipamentos);
  await f.blocoAssinaturas(assinaturas, ["Inspetor de Qualidade", "Qualidade / Documentação", "Cliente / Fiscalização"]);

  // ── FOLHA 2: registro fotográfico ────────────────────────────────────────────────────────────
  const f2 = novaFolha(doc);
  f2.cabecalho({ titulo: "RELATÓRIO DE INSPEÇÃO DE PINTURA", codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm, folha: 2, total: temFotos ? 3 : 2 });
  f2.linhaInfo([["OP:", `OP-${rel.opNumero}`, 0.34], ["CLIENTE:", cliente || "", 0.33], ["Nº:", rel.codigo, 0.33]]);

  const t2 = f2.bloco(13, SOFT);
  f2.page.drawText("REGISTRO FOTOGRÁFICO", { x: M + (f2.W - bold.widthOfTextAtSize("REGISTRO FOTOGRÁFICO", 7)) / 2, y: t2 - 9.5, size: 7, font: bold, color: GRAY });

  // grade 2 × 3, como no modelo
  const wCel = f2.W / 2, hCel = 148;
  const topoG = f2.bloco(hCel * 3);
  for (let i = 0; i < 6; i++) {
    const col = i % 2, lin = Math.floor(i / 2);
    const x = M + col * wCel, yTopo = topoG - lin * hCel;
    f2.caixa(x, yTopo, wCel, hCel);
    f2.page.drawRectangle({ x, y: yTopo - 14, width: wCel, height: 14, color: SOFT });
    f2.page.drawRectangle({ x, y: yTopo - 14, width: wCel, height: 14, borderColor: LINE, borderWidth: 0.7 });
    f2.rotulo(x + 7, yTopo - 10, FOTOS[i], 6.4);
    const foto = fotos[i];
    if (foto?.imagem) {
      const dispW = wCel - 12, dispH = hCel - 26;
      const escala = Math.min(dispW / foto.imagem.width, dispH / foto.imagem.height);
      f2.page.drawImage(foto.imagem, {
        x: x + 6 + (dispW - foto.imagem.width * escala) / 2,
        y: yTopo - 20 - dispH + (dispH - foto.imagem.height * escala) / 2,
        width: foto.imagem.width * escala, height: foto.imagem.height * escala,
      });
    }
  }
  f2.blocoTexto("OBS.:", res.obsFotos || "", { alt: 30, linhas: 2 });
  await f2.blocoAssinaturas(assinaturas, ["Inspetor de Qualidade", "Qualidade / Documentação", "Cliente / Fiscalização"]);

  // ── FOTOS: FOLHA A MAIS, MESMO FORMATO ──────────────────────────────────────────────────────
  //
  // Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos testes, tanto
  // para o computador quanto para o celular; posso colocar foto em qualquer relatório — alguns têm
  // campos específicos, e para os que não têm você cria uma página para anexar essas imagens".
  //
  // ⚠ Reusa a folha do EVS de propósito: é literalmente o mesmo formato, e duas implementações da
  // mesma página divergiriam na primeira correção.
  if (Array.isArray(fotos) && fotos.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    // ⚠⚠ `paginas` NÃO EXISTIA NESTE ARQUIVO — era `ReferenceError` em toda emissão com foto.
    // O trecho foi copiado do EVS, onde `const paginas` é calculado a partir das linhas; aqui o
    // relatório tem folha fixa, e a variável veio junto sem a declaração. Como está guardado por
    // `fotos.length`, só quebrava com foto — e os dois chamadores (a rota do PDF e a de envio para
    // assinatura) não capturam, então virava 500 e o e-mail de assinatura nem saía.
    //
    // ⚠ o relatório de pintura tem DUAS folhas fixas (1 de 2 e 2 de 2, linhas 62 e 207), então a
    // folha de fotos é a terceira. Passar 1 aqui numeraria "folha 2 de 2" com três folhas no PDF.
    await paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas: 2 });
  }

  return doc.pdf.save();
}
