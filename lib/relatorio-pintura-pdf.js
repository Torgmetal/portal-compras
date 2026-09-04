import "server-only";
import { rgb } from "pdf-lib";
import { mediaRugosidade, condicoesPermitemPintar } from "./pintura-campos";
import { FOTOS_POR_FOLHA } from "./relatorio-evs-pdf";
import {
  abrirDocumento, novaFolha, embutirFotos, M, san,
  DARK, GRAY, LINE, SOFT, GREEN, RED,
} from "./relatorio-form-pdf";
import { evidenciasDoTipo, rotuloEvidencia } from "./fotos-evidencia";

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
// ⚠ os rótulos das seis molduras vivem em lib/fotos-evidencia.js — são os MESMOS blocos de anexo
// da tela de preenchimento. Duplicar a lista aqui foi o que deixou a folha e o formulário falarem
// línguas diferentes.

// As quatro condições ambientais que a demão herda do relatório quando não tem leitura própria.
const HERDA_AMBIENTE = { umidade: "prepUmidade", tAmb: "prepTAmb", tSup: "prepTSup", orvalho: "prepOrvalho" };

// Quanto cabe numa folha de anexo: 6 colunas × 50 linhas. Fixo de propósito — o total de folhas
// tem de ser conhecido antes de desenhar a primeira, e uma capacidade medida só na hora obrigaria a
// numerar o documento depois de montá-lo.
const ANEXO_COLS = 6;
const ANEXO_LINHAS = 50;

export async function gerarPinturaPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  // ── AS FOTOS, POR ÁREA DE ENSAIO ─────────────────────────────────────────────────────────────
  // A folha 2 tem seis molduras rotuladas (uma por ensaio); cada uma leva a PRIMEIRA foto daquela
  // área. O resto — 2ª foto em diante e o que está sem área — vai na folha extra de fotos.
  const listaFotos = (Array.isArray(fotos) ? fotos : []).filter(Boolean);
  const areas = evidenciasDoTipo("PINTURA");
  const naGrade = new Set();
  for (const a of areas) {
    const primeira = listaFotos.find((f) => (f.evidencia || null) === a.k);
    if (primeira) naGrade.add(primeira);
  }
  const sobras = listaFotos.filter((f) => !naGrade.has(f)).map((f) => ({
    ...f,
    // ⚠ com o nome do ensaio na legenda, senão a folha extra volta a ser um monte de imagem solta
    observacao: [rotuloEvidencia("PINTURA", f.evidencia), f.observacao].filter(Boolean).join(" · ") || null,
  }));
  // ⚠ com foto o PDF tem TRÊS folhas — as duas fixas mais o registro fotográfico. As folhas 1 e 2
  // traziam "total: 2" fixo e a terceira dizia "3 DE 3": o mesmo documento se contradizia.
  // ⚠ AS SOBRAS SAEM AGRUPADAS POR ENSAIO. Vitor (04/09/2026): "você não separa as fotos de acordo
  // com cada tipo de teste". Na ordem de upload, as fotos de espessura ficavam espalhadas entre as
  // de rugosidade e quem confere tinha de adivinhar pela imagem. Agora vêm na ordem dos ensaios, e
  // as sem área por último — com o nome do ensaio na legenda de cada uma.
  const ordemArea = new Map(areas.map((a, i) => [a.k, i]));
  sobras.sort((x, y) => (ordemArea.get(x.evidencia) ?? 99) - (ordemArea.get(y.evidencia) ?? 99));
  const res = rel.resultados || {};
  const dem = res.demaos || {};      // { "1": {produto,...}, "2": {...}, "3": {...} }
  const esp = res.espessuras || {};  // { "1": [l1..l5], "2": [...], "3": [...] }

  // ── FOLHA 1 ──────────────────────────────────────────────────────────────────────────────────
  const f = novaFolha(doc);
  const { page, font, bold, W } = f;

  // ⚠⚠ A RELAÇÃO DE PEÇAS SAI INTEIRA. Vitor (04/09/2026): "quando informamos as peças precisa que
  // sejam listadas todas elas, você não pode deixar ela com '…', precisa sair 100%". A linha de
  // identificação encolhe a fonte e corta o que não cabe — numa obra com 60 marcas o relatório
  // dizia "P1, P2, P3…" e o cliente não tinha como saber o que foi pintado.
  //
  // Cabe em até 3 linhas na folha 1; passou disso, a folha 1 diz quantas são e onde estão, e a
  // relação completa vira ANEXO. O total de folhas precisa ser conhecido aqui, antes do primeiro
  // cabeçalho — por isso a conta é feita agora, com capacidade fixa por folha.
  const marcas = (Array.isArray(rel.marcas) ? rel.marcas : []).filter(Boolean);
  const textoPecas = res.pecas || marcas.join(", ");
  const largPecas = W * 0.72 - (bold.widthOfTextAtSize(san("PEÇAS PINTADAS:"), 6.4) + 12) - 8;
  const cabeNaLinha = f.quebrar(textoPecas, bold, 8, largPecas).length <= 3;
  const itensAnexo = cabeNaLinha ? [] : (marcas.length ? marcas : textoPecas.split(/[,;]/).map((t) => t.trim()).filter(Boolean));
  const folhasAnexo = Math.ceil(itensAnexo.length / (ANEXO_COLS * ANEXO_LINHAS));
  // ⚠ o registro fotográfico pode ter MAIS DE UMA folha (8 fotos por folha) — contar sempre 1 fazia
  // as folhas 1 e 2 dizerem "de 3" num documento de 4.
  // ⚠ conta as SOBRAS: a primeira foto de cada ensaio fica na moldura da folha 2 e não repete aqui
  const folhasFotos = Math.ceil(sobras.length / FOTOS_POR_FOLHA);
  // ⚠⚠ MOLDURA VAZIA NÃO SE IMPRIME. Vitor (04/09/2026): "caso não sejam importadas fotos dessas
  // áreas você não precisa mostrar elas, já demos N/A para alguns casos". Seis quadros em branco
  // não são registro fotográfico: parecem ensaio que faltou fazer, num relatório em que o ensaio
  // foi dispensado de propósito. Só entram os ensaios que TÊM foto — e, se nenhum tem, a folha do
  // registro fotográfico nem existe.
  const areasComFoto = areas.filter((a) => listaFotos.some((ft) => (ft.evidencia || null) === a.k));
  const temFolha2 = areasComFoto.length > 0;
  const totalFolhas = 1 + (temFolha2 ? 1 : 0) + folhasAnexo + folhasFotos;

  f.cabecalho({ titulo: "RELATÓRIO DE INSPEÇÃO DE PINTURA", codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm, folha: 1, total: totalFolhas });

  f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
  f.linhaInfoAuto([["OP:", `OP-${rel.opNumero}`], ["OBRA / CONTRATO:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]);
  f.linhaInfo([
    ["DESCRIÇÃO:", res.descricao || "", 0.62],
    ["PROCEDIMENTO / REV.:", res.procedimento || "", 0.38],
  ]);
  f.linhaInfoCresce([
    ["PEÇAS PINTADAS:", cabeNaLinha ? textoPecas : `${itensAnexo.length} peças — relação completa na folha ${1 + (temFolha2 ? 1 : 0) + 1}`, 0.72],
    ["QUANTIDADE:", res.quantidade ?? "", 0.28],
  ], { maxLinhas: 3 });

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
  // ⚠ o PULL-OFF NÃO SAÍA NO DOCUMENTO. O formulário passou a ter os campos (com N/A), mas o PDF
  // só tinha a moldura de foto do ensaio — o valor medido ficava no banco e o cliente recebia um
  // relatório que não dizia se a aderência foi ensaiada.
  f.linhaInfo([
    ["ADERÊNCIA PULL-OFF — EQUIP.:", res.pullOffEquip || "", 0.34],
    ["OBTIDO (MPa):", res.pullOffValor || "", 0.22],
    ["MÍNIMO (MPa):", res.pullOffMin || "", 0.22],
    ["RUPTURA:", res.pullOffRuptura || "", 0.22],
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
      // ⚠⚠ A CONDIÇÃO AMBIENTAL DO RELATÓRIO VALE PARA A DEMÃO QUE NÃO TEM A SUA.
      // Vitor (04/09/2026): "não está salvando umidade e temperatura no relatório". Estava salvo —
      // no bloco "Condições ambientais" (prepUmidade, prepTAmb, prepTSup, prepOrvalho), que é o
      // único lugar onde o portal de campo pede esses valores. Só que ESTA tabela lê a leitura POR
      // DEMÃO (dem[n].umidade…), que a tela do celular nem oferece: as quatro linhas saíam em branco
      // e o relatório parecia não ter guardado o que a inspetora digitou.
      //
      // ⚠ herda SÓ em demão que existe: preencher a coluna de uma demão que ninguém aplicou seria
      // inventar registro de ensaio.
      const bloco = dem[String(d + 1)];
      const temDemao = bloco && Object.values(bloco).some((x) => x != null && x !== "");
      const v = bloco?.[k] ?? (temDemao && HERDA_AMBIENTE[k] ? res[HERDA_AMBIENTE[k]] : null);
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

  // ── FOLHA 2: registro fotográfico (só quando algum ensaio tem foto) ─────────────────────────
  //
  // Embute só a PRIMEIRA de cada área — as demais vão na folha de fotos, e embutir a mesma imagem
  // duas vezes engorda o PDF à toa.
  if (temFolha2) {
  const fotosGrade = await embutirFotos(doc.pdf, [...naGrade]);
  const f2 = novaFolha(doc);
  f2.cabecalho({ titulo: "RELATÓRIO DE INSPEÇÃO DE PINTURA", codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm, folha: 2, total: totalFolhas });
  f2.linhaInfo([["OP:", `OP-${rel.opNumero}`, 0.34], ["CLIENTE:", cliente || "", 0.33], ["Nº:", rel.codigo, 0.33]]);

  const t2 = f2.bloco(13, SOFT);
  f2.page.drawText("REGISTRO FOTOGRÁFICO", { x: M + (f2.W - bold.widthOfTextAtSize("REGISTRO FOTOGRÁFICO", 7)) / 2, y: t2 - 9.5, size: 7, font: bold, color: GRAY });

  // grade 2 × 3, como no modelo — CADA MOLDURA É UM ENSAIO, e recebe a foto anexada naquela área
  //
  // ⚠⚠ AS SEIS MOLDURAS SAÍAM SEMPRE VAZIAS. Este trecho lia `foto.imagem`, propriedade que não
  // existe — `embutirFotos` devolve `img` — e ainda pegava a foto pela ORDEM DE UPLOAD (`fotos[i]`),
  // então nem por acaso a imagem cairia no ensaio certo. O documento saía com seis quadros em
  // branco e todas as fotos amontoadas na folha extra, sem dizer de que teste era cada uma.
  const daArea = (k) => listaFotos.filter((f) => (f.evidencia || null) === k);
  // ⚠ a grade cresce com o que existe: uma linha para cada dois ensaios com foto, nunca as três
  // fixas do modelo — o resto da folha fica para as observações e as assinaturas.
  const wCel = f2.W / 2, hCel = 148;
  const linhasG = Math.ceil(areasComFoto.length / 2);
  const topoG = f2.bloco(hCel * linhasG);
  for (let i = 0; i < areasComFoto.length; i++) {
    const col = i % 2, lin = Math.floor(i / 2);
    const x = M + col * wCel, yTopo = topoG - lin * hCel;
    f2.caixa(x, yTopo, wCel, hCel);
    f2.page.drawRectangle({ x, y: yTopo - 14, width: wCel, height: 14, color: SOFT });
    f2.page.drawRectangle({ x, y: yTopo - 14, width: wCel, height: 14, borderColor: LINE, borderWidth: 0.7 });
    const doEnsaio = daArea(areasComFoto[i].k);
    // "· 2 de 3": quem lê a folha sabe que existem outras daquele mesmo ensaio, na folha seguinte
    const rot = doEnsaio.length > 1 ? `${areasComFoto[i].rot} · 1 de ${doEnsaio.length}` : areasComFoto[i].rot;
    f2.rotulo(x + 7, yTopo - 10, rot, 6.4);
    const img = fotosGrade.find((f) => (f.evidencia || null) === areasComFoto[i].k)?.img;
    if (img) {
      const dispW = wCel - 12, dispH = hCel - 26;
      const escala = Math.min(dispW / img.width, dispH / img.height);
      f2.page.drawImage(img, {
        x: x + 6 + (dispW - img.width * escala) / 2,
        y: yTopo - 20 - dispH + (dispH - img.height * escala) / 2,
        width: img.width * escala, height: img.height * escala,
      });
    }
  }
  f2.blocoTexto("OBS.:", res.obsFotos || "", { alt: 30, linhas: 2 });
  await f2.blocoAssinaturas(assinaturas, ["Inspetor de Qualidade", "Qualidade / Documentação", "Cliente / Fiscalização"]);
  }

  // ── ANEXO: A RELAÇÃO DE PEÇAS, INTEIRA ──────────────────────────────────────────────────────
  //
  // Só existe quando a lista não coube na folha 1. Em colunas porque marca é texto curto: 6 por
  // linha põe 300 peças numa folha, e o cliente confere correndo o dedo pela coluna.
  for (let pg = 0; pg < folhasAnexo; pg++) {
    const fa = novaFolha(doc);
    fa.cabecalho({
      titulo: "RELATÓRIO DE INSPEÇÃO DE PINTURA", codigo: rel.codigo,
      revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null,
      emitidoEm: rel.emitidoEm, folha: 1 + (temFolha2 ? 1 : 0) + 1 + pg, total: totalFolhas,
    });
    fa.linhaInfo([["OP:", `OP-${rel.opNumero}`, 0.34], ["CLIENTE:", cliente || "", 0.33], ["Nº:", rel.codigo, 0.33]]);

    const rot = folhasAnexo > 1
      ? `RELAÇÃO DE PEÇAS PINTADAS (${pg + 1} de ${folhasAnexo}) — ${itensAnexo.length} peças`
      : `RELAÇÃO DE PEÇAS PINTADAS — ${itensAnexo.length} peças`;
    const tA = fa.bloco(13, SOFT);
    fa.page.drawText(san(rot), { x: M + (fa.W - bold.widthOfTextAtSize(san(rot), 7)) / 2, y: tA - 9.5, size: 7, font: bold, color: GRAY });

    const doPg = itensAnexo.slice(pg * ANEXO_COLS * ANEXO_LINHAS, (pg + 1) * ANEXO_COLS * ANEXO_LINHAS);
    const linhasPg = Math.ceil(doPg.length / ANEXO_COLS);
    const hLin = 11, wCol = fa.W / ANEXO_COLS;
    const topoA = fa.bloco(linhasPg * hLin);
    doPg.forEach((m, i) => {
      // ⚠ preenche por COLUNA: a marca P10 fica embaixo da P9, como na lista de expedição — por
      // linha, a sequência atravessaria a folha e ninguém acha nada.
      const col = Math.floor(i / linhasPg), lin = i % linhasPg;
      const x = M + col * wCol, y = topoA - lin * hLin - 8;
      fa.page.drawText(fa.fit(m, font, 7, wCol - 10), { x: x + 5, y, size: 7, font, color: DARK });
    });
    await fa.blocoAssinaturas(assinaturas, ["Inspetor de Qualidade", "Qualidade / Documentação", "Cliente / Fiscalização"]);
  }

  // ── FOTOS: FOLHA A MAIS, MESMO FORMATO ──────────────────────────────────────────────────────
  //
  // Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos testes, tanto
  // para o computador quanto para o celular; posso colocar foto em qualquer relatório — alguns têm
  // campos específicos, e para os que não têm você cria uma página para anexar essas imagens".
  //
  // ⚠ Reusa a folha do EVS de propósito: é literalmente o mesmo formato, e duas implementações da
  // mesma página divergiriam na primeira correção.
  // ⚠ o que sobra: a 2ª foto em diante de cada ensaio, mais as que estão sem área (o acervo antigo)
  if (sobras.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    // ⚠⚠ `paginas` NÃO EXISTIA NESTE ARQUIVO — era `ReferenceError` em toda emissão com foto.
    // O trecho foi copiado do EVS, onde `const paginas` é calculado a partir das linhas; aqui o
    // relatório tem folha fixa, e a variável veio junto sem a declaração. Como está guardado por
    // `fotos.length`, só quebrava com foto — e os dois chamadores (a rota do PDF e a de envio para
    // assinatura) não capturam, então virava 500 e o e-mail de assinatura nem saía.
    //
    // ⚠ o relatório de pintura tem DUAS folhas fixas (1 de 2 e 2 de 2, linhas 62 e 207), então a
    // folha de fotos é a terceira. Passar 1 aqui numeraria "folha 2 de 2" com três folhas no PDF.
    // ⚠ a folha de fotos vem DEPOIS do anexo de peças, quando ele existe — senão ela se numeraria
    // por cima dele. E leva só as SOBRAS: a primeira foto de cada ensaio já está na moldura dela.
    await paginaDeFotos(doc, rel, sobras, { cliente, obra, assinaturas, paginas: 1 + (temFolha2 ? 1 : 0) + folhasAnexo });
  }

  return doc.pdf.save();
}
