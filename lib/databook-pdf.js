import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, degrees } from "pdf-lib";
import { prisma } from "./prisma";
import { GRUPOS_DATABOOK, grupoDaSecao } from "./databook-secoes";
import { TIPO_DATABOOK_LABEL } from "./op-opcoes";
import { montarSecaoLpc } from "./databook-lpc";
import { fichasPorR, comFicha } from "./databook-ficha-r";
import { imagemAssinada } from "./relatorio-form-pdf";
import { baixarDocumento, resolverDriveServidor } from "./databook-arquivo";
import { abrirAnexoComoPdf, ehAnexavelNoLivro } from "./databook-anexo";
import { estaFechado, rotuloRevisao } from "./databook-revisao";
import { fmtOP } from "@/lib/utils";

// Geração server-side do PDF do Data Book (PQ-00 §9): capa TORG + lista mestra
// + as 20 seções, com merge dos PDFs dos certificados (M1) anexados.
// pdf-lib (JS puro) — gera páginas e copia páginas de PDFs existentes.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const NAVY2 = rgb(31 / 255, 56 / 255, 100 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const LIGHTBLUE = rgb(0.62, 0.74, 0.9);
const DARK = rgb(0.16, 0.20, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LIGHT = rgb(0.94, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);
// Teto do ARQUIVO ÚNICO (pré-visualização / data book pequeno). Passou disto, o
// caminho é gerar em volumes — um PDF de milhares de páginas não fecha dentro de uma
// função serverless nem abre no leitor do cliente.
// ⚠ Antes isto era 200 e o excedente era descartado EM SILÊNCIO: o livro dizia ter
// 1.336 desenhos e levava 200 páginas deles. Agora o excesso interrompe a mesclagem,
// vira pendência e sai escrito na última página. (Vitor, 22/08/2026)
const MAX_MERGE_PAGES = 1500;
const CNPJ_TORG = "53.694.442/0001-41";
const RESPONSAVEL_TECNICO = "Guilherme A. Corte Campos";

const fmtKg = (v) => (v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");


// `anexos: false` gera só O LIVRO — capa, sumário, divisórias, listas mestras e
// assinaturas — sem mesclar os PDFs anexados. É assim que nasce o Volume 1 quando o
// data book é grande demais para um arquivo só: os anexos vão nos volumes seguintes
// (lib/databook-volumes.js). Com `anexos: true` (padrão) sai o livro completo num
// arquivo, que continua sendo o certo para data book pequeno e para pré-visualizar.
export async function gerarDataBookPDF(dataBookId, opts = {}) {
  const comAnexos = opts.anexos !== false;
  // mapa secaoId → { volumeIni, volumeFim, paginas, docs } para o livro apontar onde
  // os anexos daquela seção foram parar. Só existe no fluxo de volumes.
  const mapaAnexos = opts.mapaAnexos || null;
  // o que não pôde ser anexado (arquivo corrompido, download falhou) sai listado no
  // fim do livro — nunca em silêncio.
  const pendencias = [];
  const mapaDocs = mapaAnexos?.docs && Object.keys(mapaAnexos.docs).length ? mapaAnexos.docs : null;
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: dataBookId },
    include: { secoes: { orderBy: { ordem: "asc" }, include: { documentos: true } }, assinaturas: { orderBy: { ordem: "asc" } } },
  });
  if (!book) throw new Error("Data book não encontrado");

  // resolve documentos vinculados
  const ids = [...new Set(book.secoes.flatMap((s) => s.documentos.map((d) => d.documentoId)))];
  const docs = ids.length ? await prisma.documentoQualidade.findMany({ where: { id: { in: ids } } }) : [];
  const docById = new Map(docs.map((d) => [d.id, d]));

  // O certificado é anexado com o nome do arquivo ("R 260620.pdf") e nasce sem material, corrida
  // nem nº de certificado — a §04 saía como linhas de "R 260620 | — | — |". A ficha do CMR tem
  // tudo isso indexado pelo mesmo R. Ver lib/databook-ficha-r.js.
  const fichas = await fichasPorR(docs, book.opNumero);
  const comFichaDoc = (d) => comFicha(d, fichas);

  // Desenhos as-built (§02) apontam pro drive SERVIDOR — resolve o drive só se houver.
  const servidorDriveId = await resolverDriveServidor(docs);

  // §02 Desenhos as-built: monta a LPC na hora (se a seção não tiver conteúdo
  // salvo/gerado), pra a página NUNCA sair em branco. Só busca se a §02 existe e
  // não é N/A. A geração manual ("Gerar da LPC") continua salvando em conteudoJson,
  // que tem prioridade quando existe (versão "congelada").
  // ⚠ A CAPA FALA A LÍNGUA DA OP. Vitor (22/08/2026): "gostaria que trouxesse as
  // informações da forma que criamos as OP". O data book guarda cliente e obra, mas não
  // a referência do cliente — e documento que vai PARA o cliente tem que trazer o código
  // com que ele chama a obra, senão ele não reconhece o próprio serviço.
  const opCapa = await prisma.oP
    .findFirst({
      where: book.opId ? { id: book.opId } : { numero: book.opNumero },
      select: { refCliente: true },
    })
    .catch(() => null);

  const sec02 = book.secoes.find((s) => s.numero === "02");
  const lpcLive = sec02 && sec02.estado !== "NA" ? await montarSecaoLpc(book.opNumero) : { conjuntos: [] };

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logos: branco (sobre faixa navy, na capa) e escuro (sobre branco, nas divisórias).
  const embedLogo = async (nome) => { try { return await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", nome))); } catch { return null; } };
  const logoWhiteImg = await embedLogo("torg-logo-white.png");
  const logoDarkImg = (await embedLogo("torg-logo.png")) || null;
  // Selo de certificação (Bureau Veritas / ISO 9001) — só se o arquivo existir no repo.
  const bvImg = await embedLogo("bureau-veritas.png");

  const codigo = `PQ-DB-${String(book.opNumero).padStart(3, "0")}`;
  // ⚠ EMITIDO não é só o status "EMITIDO". Um data book ENVIADO_CLIENTE ou ACEITO já saiu daqui —
  // testar só `=== "EMITIDO"` fazia o livro que o cliente ACEITOU sair com "RASCUNHO" na capa e
  // baixar como "(rascunho)". Vitor: "uma vez esse documento emitido, ele valerá para sempre".
  const emitido = estaFechado(book);
  const rev = rotuloRevisao(book.revisao);
  // A emissão é a data em que o livro foi EMITIDO — não a data em que o arquivo foi gerado.
  // Rascunho ainda não tem emissão; aí mostra o dia da geração, que é o que ele é.
  const dataEmissao = book.emitidoEm ? fmtData(book.emitidoEm) : fmtData(new Date());

  // largura útil
  const W = A4[0] - 2 * M;
  const fit = (str, f, size, maxW) => {
    let s = String(str ?? "");
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  let page, y;
  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - M; return page; };
  const espaco = (h) => { if (y - h < M + 28) novaPagina(); };

  // Tabela: cabeçalho (faixa navy) + linhas zebra + borda inferior. Quebra de
  // página repete o cabeçalho. Cada célula = string ou { text, color, bold }.
  // colunas = [{ t, w, align?, bold?, color? }] — w somando a W (largura útil).
  // ─── LINK ENTRE VOLUMES ─────────────────────────────────────────────────────
  // Vitor (22/08/2026): "no índice consegue deixar clicável para mover para a página
  // desejada?".
  //
  // Com o data book em volumes, o destino está em OUTRO arquivo — é o que o PDF chama
  // de GoToR: aponta nome do arquivo + número da página. Funciona quando os volumes
  // estão na mesma pasta, que é como o cliente baixa, e o nome é o mesmo que a rota de
  // download entrega. O visualizador do Chrome ignora GoToR; por isso cada volume
  // ainda carrega o próprio índice interno, que funciona em todo leitor.
  const nomeVolume = (v) => `Data Book ${fmtOP(book.opNumero)} ${rev} - Vol ${String(v).padStart(2, "0")}.pdf`;
  const anotar = (pg, obj) => {
    const ref = pdf.context.register(pdf.context.obj(obj));
    const cur = pg.node.get(PDFName.of("Annots"));
    const antes = cur && typeof cur.asArray === "function" ? cur.asArray() : [];
    pg.node.set(PDFName.of("Annots"), pdf.context.obj([...antes, ref]));
  };
  // a célula que diz onde o documento está — azul e clicável quando há destino
  const celulaVolume = (onde) =>
    onde ? { text: `${String(onde.v).padStart(2, "0")} · ${onde.p}`, color: BLUE, link: { volume: onde.v, pagina: onde.p } } : "—";
  const linkVolume = (pg, rect, volume, pagina) => {
    anotar(pg, {
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      A: { S: PDFName.of("GoToR"), F: PDFString.of(nomeVolume(volume)), D: [Math.max(0, (pagina || 1) - 1), PDFName.of("Fit")] },
    });
  };

  // Índice de MUITOS documentos em pouca folha: três colunas, linha fina, cada uma
  // clicando no volume e na página. 1.336 desenhos cabem em ~8 folhas em vez de 30.
  const indiceCompacto = (docs) => {
    if (!docs.length) return;
    const COLS = 3, LARG = W / COLS, ALT = 10.5;
    // começar o índice a três linhas do pé da folha daria uma primeira página de sobra;
    // abre folha nova quando não há altura para valer a pena.
    if (y < M + 160) novaPagina();
    page.drawText(`Índice dos anexos — ${docs.length.toLocaleString("pt-BR")} ${docs.length === 1 ? "documento" : "documentos"}`,
      { x: M, y, size: 9, font: bold, color: NAVY2 });
    y -= 13;
    let col = 0;
    let yTopo = y;
    for (const d of docs) {
      if (col === 0 && y - ALT < M + 34) { novaPagina(); yTopo = y; }
      const x = M + col * LARG;
      const onde = mapaDocs[d.id];
      const marca = onde ? `${String(onde.v).padStart(2, "0")}·${onde.p}` : "—";
      const wMarca = font.widthOfTextAtSize(marca, 6.5);
      page.drawText(fit(d.nome, font, 6.5, LARG - wMarca - 12), { x, y, size: 6.5, font, color: onde ? BLUE : GRAY });
      page.drawText(marca, { x: x + LARG - wMarca - 6, y, size: 6.5, font, color: GRAY });
      if (onde) linkVolume(page, [x - 2, y - 2, x + LARG - 4, y + 7], onde.v, onde.p);
      // enche a folha coluna a coluna: desce até o pé, volta ao topo na coluna seguinte
      y -= ALT;
      if (y - ALT < M + 34) {
        col++;
        if (col < COLS) y = yTopo; else { col = 0; novaPagina(); yTopo = y; }
      }
    }
    y -= 6;
  };

  const drawTabela = (colunas, linhas, opts = {}) => {
    const fs = opts.fontSize || 8.5;
    const rowH = opts.rowH || 16;
    const cab = () => {
      espaco(rowH + 6);
      page.drawRectangle({ x: M, y: y - rowH + 3, width: W, height: rowH, color: NAVY2 });
      let x = M + 5;
      for (const c of colunas) {
        const txt = fit(c.t, bold, fs, c.w - 8);
        const tx = c.align === "right" ? x + c.w - 8 - bold.widthOfTextAtSize(txt, fs) : x;
        page.drawText(txt, { x: tx, y: y - rowH + 8, size: fs, font: bold, color: WHITE });
        x += c.w;
      }
      y -= rowH;
    };
    cab();
    linhas.forEach((row, ri) => {
      // ── ALTURA VARIÁVEL: a linha cresce pro texto caber ────────────────────────────────────
      //
      // Vitor (19/08/2026): "melhore o layout das páginas, principalmente onde você lista os
      // certificados; deixe mais bem distribuídos, dê uma cara fina para esse documento". E antes:
      // "consegue trazer todas as informações escritas, pois abreviar pode nos atrapalhar".
      //
      // A tabela cortava com "…" o que não coubesse — num data book isso apaga justamente o que
      // identifica o certificado ("CHAPA ACO CARBONO LAMINADO A-36 ESPESS…"). Coluna marcada com
      // `wrap` agora quebra em até 3 linhas e a linha inteira cresce junto.
      const celulas = colunas.map((c, ci) => {
        const cell = row[ci];
        const obj = cell && typeof cell === "object";
        const val = String(obj ? (cell.text ?? "—") : (cell ?? "—"));
        const f = ((obj && cell.bold) || c.bold) ? bold : font;
        const linhasTxt = c.wrap ? wrapCell(val, f, fs, c.w - 10).slice(0, 3) : [fit(val, f, fs, c.w - 8)];
        return { linhasTxt, f, cor: (obj && cell.color) || c.color || DARK, c, link: obj ? cell.link : null };
      });
      const alt = Math.max(rowH, 6 + celulas.reduce((mx, cel) => Math.max(mx, cel.linhasTxt.length), 1) * (fs + 3.5));

      if (y - alt < M + 44) { novaPagina(); cab(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - alt + 3, width: W, height: alt, color: LIGHT });

      let x = M + 5;
      for (const cel of celulas) {
        let ty = y - fs - 4;
        for (const txt of cel.linhasTxt) {
          const tx = cel.c.align === "right" ? x + cel.c.w - 8 - cel.f.widthOfTextAtSize(txt, fs) : x;
          page.drawText(txt, { x: tx, y: ty, size: fs, font: cel.f, color: cel.cor });
          ty -= fs + 3.5;
        }
        // a célula é a área clicável — a tabela quebra de página, então o link tem que
        // ir na folha em que ESTA linha foi desenhada, não na última
        if (cel.link) linkVolume(page, [x - 4, y - alt + 4, x + cel.c.w - 8, y + 2], cel.link.volume, cel.link.pagina);
        x += cel.c.w;
      }

      // filete vertical discreto entre colunas — dá coluna sem pesar a página
      let xs = M + 5;
      for (let i = 0; i < colunas.length - 1; i++) {
        xs += colunas[i].w;
        page.drawLine({ start: { x: xs - 6, y: y + 2 }, end: { x: xs - 6, y: y - alt + 3 }, thickness: 0.4, color: rgb(0.87, 0.89, 0.92) });
      }
      y -= alt;
    });
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.87) });
  };

  // Quebra um texto em linhas que cabem em maxW (palavra a palavra; quebra dura
  // palavras muito longas). Usado nas células do PIT (§10), que têm texto longo.
  const wrapCell = (str, f, size, maxW) => {
    const out = [];
    let cur = "";
    for (const w of String(str ?? "—").split(/\s+/)) {
      const t = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(t, size) <= maxW) { cur = t; continue; }
      if (cur) out.push(cur);
      cur = w;
      while (f.widthOfTextAtSize(cur, size) > maxW && cur.length > 1) {
        let k = cur.length;
        while (k > 1 && f.widthOfTextAtSize(cur.slice(0, k), size) > maxW) k--;
        out.push(cur.slice(0, k));
        cur = cur.slice(k);
      }
    }
    if (cur) out.push(cur);
    return out.length ? out : ["—"];
  };

  // Tabela do PIT (§10) — células com QUEBRA de linha (altura variável), sem cortar
  // o texto. Cabeçalho navy repetido a cada página; zebra.
  const drawPitTabela = (itens) => {
    const fs = 7.5, lineH = 9, padV = 5, cabH = 16;
    const cols = [
      { t: "Etapa / Atividade", w: 84, key: "etapa", bold: true },
      { t: "Característica", w: 88, key: "caracteristica" },
      { t: "Método", w: 74, key: "metodo" },
      { t: "Critério de aceitação", w: 92, key: "criterio" },
      { t: "Frequência", w: 46, key: "frequencia" },
      { t: "Registro", w: 70, key: "registro" },
      { t: "Resp.", w: 57, key: "responsavel" },
    ]; // soma = 511 = W
    const cab = () => {
      espaco(cabH + 16);
      page.drawRectangle({ x: M, y: y - cabH + 3, width: W, height: cabH, color: NAVY2 });
      let x = M + 4;
      for (const c of cols) { page.drawText(fit(c.t, bold, fs, c.w - 6), { x, y: y - cabH + 8, size: fs, font: bold, color: WHITE }); x += c.w; }
      y -= cabH;
    };
    cab();
    itens.forEach((it, ri) => {
      const cells = cols.map((c) => wrapCell(it[c.key], font, fs, c.w - 6));
      const nLines = Math.max(...cells.map((l) => l.length));
      const rowH = nLines * lineH + padV;
      if (y - rowH < M + 40) { novaPagina(); cab(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 3, width: W, height: rowH, color: LIGHT });
      let x = M + 4;
      cols.forEach((c, ci) => {
        const f = c.bold ? bold : font;
        cells[ci].forEach((ln, li) => page.drawText(ln, { x, y: y - 8 - li * lineH, size: fs, font: f, color: DARK }));
        x += c.w;
      });
      y -= rowH;
    });
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.87) });
  };

  // §02 Desenhos as-built — tabela LPC agrupada por conjunto: cada conjunto vira
  // uma faixa e suas POSIÇÕES (croquis) listam material, qtd no conjunto,
  // rastreabilidade (nº da corrida) e nº do certificado. Várias corridas de um
  // material empilham na mesma linha (altura variável). Sem campo de validade.
  const drawLpcSecao = (conjuntos) => {
    const fs = 7.5, lineH = 9, padV = 4, cabH = 15, grpH = 14;
    const cols = [
      { t: "Posição", w: 60, bold: true },
      { t: "Material / Perfil", w: 104 },
      { t: "Qtd", w: 24, align: "right" },
      { t: "Rastreab. (R)", w: 62 },
      { t: "Nº Certificado", w: 130 },
      { t: "Corrida", w: 131 },
    ]; // soma = 511 = W
    const cab = () => {
      espaco(cabH + 16);
      page.drawRectangle({ x: M, y: y - cabH + 3, width: W, height: cabH, color: NAVY2 });
      let x = M + 4;
      for (const c of cols) {
        const txt = fit(c.t, bold, fs, c.w - 6);
        const tx = c.align === "right" ? x + c.w - 6 - bold.widthOfTextAtSize(txt, fs) : x;
        page.drawText(txt, { x: tx, y: y - cabH + 8, size: fs, font: bold, color: WHITE });
        x += c.w;
      }
      y -= cabH;
    };
    cab();
    for (const cj of conjuntos) {
      // ⚠ reserva a faixa + UMA LINHA INTEIRA. A linha tem 2 alturas quando o material vai na
      // segunda linha (quase sempre), então reservar `lineH` deixava a faixa do conjunto sozinha no
      // pé da página e as peças na seguinte — quem vira a folha perde de quem elas são.
      if (y - (grpH + 2 * lineH + padV) < M + 40) { novaPagina(); cab(); }
      // ── O ARAME DO CONJUNTO NA FAIXA DO GRUPO ───────────────────────────────────────────────
      //
      // Vitor (20/08/2026): "nos conjuntos trazer o R do arame de solda". É o consumível que o
      // carimbo do desenho desse conjunto declara — o lote vigente na data em que ELE foi soldado.
      // Fica na faixa do conjunto (e não numa coluna) porque é do conjunto inteiro, não da posição:
      // as posições são cortadas, quem solda é o conjunto.
      const arame = cj.consumivel;
      const txtArame = arame?.indiceR
        ? `arame R ${arame.indiceR}${arame.lote ? ` · lote ${arame.lote}` : ""}${arame.previsto ? " (a soldar)" : ""}${arame.janela?.length ? ` +${arame.janela.length}` : ""}`
        : null;
      const wArame = txtArame ? bold.widthOfTextAtSize(txtArame, fs - 0.5) : 0;
      page.drawRectangle({ x: M, y: y - grpH + 3, width: W, height: grpH, color: LIGHT });
      const titulo = cj.avulsas
        // peça que não entra em conjunto: vai do corte pro acabamento, não solda — sem arame
        ? `Peças avulsas (fora de conjunto) — ${cj.posicoes.length}`
        : `Conjunto ${cj.marca}${cj.descricao ? " — " + cj.descricao : ""}   ·   ${cj.qte}x`;
      page.drawText(fit(titulo, bold, fs, W - 14 - wArame), { x: M + 4, y: y - grpH + 7, size: fs, font: bold, color: NAVY });
      if (txtArame) {
        page.drawText(txtArame, {
          x: M + W - 6 - wArame, y: y - grpH + 7, size: fs - 0.5, font: bold,
          // previsto ≠ apontado: o conjunto ainda não soldou e este é o lote que está na máquina
          color: arame.previsto ? GRAY : BLUE,
        });
      }
      y -= grpH;
      (cj.posicoes || []).forEach((p, ri) => {
        const cs = p.certificados || [];
        const principal = p.perfil || p.material || "—";                 // descrição = o perfil
        const subMaterial = p.perfil && p.material ? p.material : "";     // tipo do material embaixo
        const rowH = Math.max(cs.length, subMaterial ? 2 : 1) * lineH + padV;
        if (y - rowH < M + 40) { novaPagina(); cab(); }
        if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 3, width: W, height: rowH, color: rgb(0.97, 0.98, 0.99) });
        let x = M + 4;
        page.drawText(fit(p.marca || "—", bold, fs, cols[0].w - 6), { x, y: y - 8, size: fs, font: bold, color: DARK }); x += cols[0].w;
        // Perfil (descrição) + tipo do material (2ª linha, cinza)
        page.drawText(fit(principal, font, fs, cols[1].w - 6), { x, y: y - 8, size: fs, font, color: DARK });
        if (subMaterial) page.drawText(fit(subMaterial, font, 6.8, cols[1].w - 6), { x, y: y - 8 - lineH, size: 6.8, font, color: GRAY });
        x += cols[1].w;
        const q = String(p.qtd ?? "—");
        page.drawText(q, { x: x + cols[2].w - 6 - font.widthOfTextAtSize(q, fs), y: y - 8, size: fs, font, color: DARK }); x += cols[2].w;
        const xR = x, xCert = x + cols[3].w, xCorr = x + cols[3].w + cols[4].w;
        if (!cs.length) {
          // ⚠ AQUI NÃO SE ESCREVE O MOTIVO. Vitor (22/08/2026), sobre o data book da OP-067: "lá
          // tinha vários materiais que estava escrito material cortado sem recebimento, coisa do
          // tipo, onde é melhor não informar nada do que informar isso".
          //
          // Ele está certo, e a razão é a mesma do vocabulário da conferência: este PDF é lido
          // por cliente e por auditor. "Cortada antes da entrega" e "sem material no CMR" não são
          // observações técnicas — são confissões de que a peça não tem rastreio, escritas pela
          // própria Torg no documento que deveria PROVAR o rastreio. Célula vazia é um dado que
          // falta; frase é uma declaração contra nós.
          //
          // O motivo continua existindo, e continua visível para quem precisa dele: a tela do
          // data book e a Conferência de Rastreabilidade (/qualidade/recebimento-cmr, aba Certificados) mostram
          // peça por peça. O que muda é que ele não viaja no documento do cliente.
          const traco = "—";
          for (const xc of [xR, xCert, xCorr]) {
            page.drawText(traco, { x: xc, y: y - 8, size: fs, font, color: GRAY });
          }
        } else {
          cs.forEach((c, li) => {
            const yy = y - 8 - li * lineH;
            page.drawText(fit(c.indiceR ? `R ${c.indiceR}` : "—", bold, fs, cols[3].w - 6), { x: xR, y: yy, size: fs, font: bold, color: BLUE });
            page.drawText(fit(c.certificado || "—", font, fs, cols[4].w - 6), { x: xCert, y: yy, size: fs, font, color: DARK });
            page.drawText(fit(c.corrida || "—", font, fs, cols[5].w - 6), { x: xCorr, y: yy, size: fs, font, color: NAVY2 });
            // ⚠ "TROCA REGISTRADA" SAIU DAQUI (31/08/2026). Ficava sob a corrida quando o
            // Almoxarifado declarou ter separado outro fardo. A justificativa era "quem lê o data
            // book precisa saber que veio de lá" — e ela contraria a regra que está trinta linhas
            // acima, do próprio Vitor (22/08): neste PDF, célula vazia é dado que falta, frase é
            // declaração contra nós.
            //
            // A prova de que não comunicava: o Vitor abriu o data book, viu a frase e perguntou "o
            // que seria isso?". Se o diretor que criou o registro não decifra, cliente e auditor
            // também não — e o que sobra para eles é a leitura de que a rastreabilidade desta peça
            // foi mexida. Um dado que não informa, mas levanta pergunta, é pior que nenhum.
            //
            // ⚠⚠ NADA SE PERDE NO NÚMERO. O R e a corrida impressos JÁ SÃO os do fardo trocado —
            // a troca é justamente o que os define. O que sai é só o rótulo.
            //
            // Onde o fato continua visível, para quem precisa: o modal de Separação ("troca
            // registrada ✓ · indicado era R ...") e a tabela TrocaRastreabilidade, com perfil, R
            // indicado, R usado, escopo, quem trocou e quando.
          });
        }
        y -= rowH;
      });
      y -= 3;
    }
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.87) });
  };

  // Cabeçalho de seção COMPACTO (faixa navy boxed) — as seções fluem na página
  // (várias por folha) em vez de uma por página, eliminando o espaço em branco.

  // Parágrafo com quebra de linha automática na largura útil.
  const paragrafo = (texto, size = 9.5, cor = DARK) => {
    let linha = "";
    const flush = () => { if (linha) { espaco(size + 5); page.drawText(linha, { x: M, y, size, font, color: cor }); y -= size + 4; linha = ""; } };
    for (const p of String(texto).split(/\s+/)) {
      const t = linha ? linha + " " + p : p;
      if (font.widthOfTextAtSize(t, size) > W) { flush(); linha = p; } else linha = t;
    }
    flush();
  };

  // Texto com tracking (espaçamento entre letras) — para rótulos em caixa-alta.
  const tracked = (txt, x, ty, size, f, color, track = 1.5) => {
    let cx = x;
    for (const ch of String(txt)) { page.drawText(ch, { x: cx, y: ty, size, font: f, color }); cx += f.widthOfTextAtSize(ch, size) + track; }
    return cx - x;
  };
  const centerX = (txt, size, f) => (A4[0] - f.widthOfTextAtSize(txt, size)) / 2;
  const quebrar = (txt, f, size, maxW) => {
    const out = []; let l = "";
    for (const wd of String(txt ?? "—").split(/\s+/)) { const t = l ? l + " " + wd : wd; if (f.widthOfTextAtSize(t, size) <= maxW) l = t; else { if (l) out.push(l); l = wd; } }
    if (l) out.push(l); return out.length ? out : ["—"];
  };

  // Página separadora de subseção (estilo dossiê): logo escuro no topo + "I-3) Título"
  // no centro vertical, régua laranja. Cada subseção abre numa página própria.
  const dividerPagina = (id, titulo, norma) => {
    novaPagina();
    if (logoDarkImg) {
      const lw = 150, lh = (logoDarkImg.height / logoDarkImg.width) * lw;
      page.drawImage(logoDarkImg, { x: (A4[0] - lw) / 2, y: A4[1] - 110 - lh, width: lw, height: lh });
    } else {
      const t = "TORG METAL"; page.drawText(t, { x: centerX(t, 20, bold), y: A4[1] - 120, size: 20, font: bold, color: NAVY });
    }
    const linhas = quebrar(`${id})  ${titulo}`, bold, 17, W - 80);
    let ty = A4[1] / 2 + (linhas.length - 1) * 12;
    for (const ln of linhas) { page.drawText(ln, { x: centerX(ln, 17, bold), y: ty, size: 17, font: bold, color: NAVY }); ty -= 24; }
    page.drawRectangle({ x: (A4[0] - 90) / 2, y: ty - 4, width: 90, height: 2.5, color: ORANGE });
    if (norma) page.drawText(norma, { x: centerX(norma, 10, font), y: ty - 22, size: 10, font, color: GRAY });
  };

  // ─── CAPA (Faixa institucional) ─────────────────────────
  novaPagina();
  const bandH = 236;
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: bandH, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: 4, color: ORANGE });
  if (logoWhiteImg) {
    const lw = 150, lh = (logoWhiteImg.height / logoWhiteImg.width) * lw;
    page.drawImage(logoWhiteImg, { x: M, y: A4[1] - 44 - lh, width: lw, height: lh });
  } else {
    page.drawText("TORG METAL", { x: M, y: A4[1] - 70, size: 22, font: bold, color: WHITE });
  }
  tracked("DOSSIÊ DA QUALIDADE", M, A4[1] - 150, 11, bold, LIGHTBLUE, 3);
  page.drawText("DATA BOOK", { x: M, y: A4[1] - 196, size: 42, font: bold, color: WHITE });
  page.drawText("Documentos de Engenharia e Fabricação", { x: M, y: A4[1] - bandH + 26, size: 12.5, font, color: rgb(0.8, 0.86, 0.95) });

  // ─── BLOCO DE IDENTIFICAÇÃO ───────────────────────────────────────────────────
  // Os mesmos campos, com os mesmos nomes, da abertura da OP — "EMPREENDIMENTO" era um
  // rótulo que só existia aqui e não correspondia a campo nenhum do portal. E a OP vem
  // logo abaixo do fabricante: é a chave com que a Torg encontra a obra.
  // O responsável técnico saiu daqui para o pé da capa, junto do bloco de controle:
  // ele assina o documento, não identifica a obra.
  const linhasCapa = [
    ["CLIENTE", book.cliente || "—"],
    ["OBRA", book.obra || "—"],
    ...(opCapa?.refCliente ? [["REF. DO CLIENTE", opCapa.refCliente]] : []),
    ["FABRICANTE", "TORG METAL"],
    ["OP", fmtOP(book.opNumero)],
  ];

  // ⚠ o bloco tem que caber ENTRE a faixa e o pé, com obra de nome comprido quebrando em
  // duas linhas. Mede antes e aperta o respiro em vez de invadir o rodapé.
  let by = A4[1] - bandH - 64;
  const disponivel = by - (88 + 92);
  const quebras = linhasCapa.map(([, v]) => quebrar(v, bold, 16, W).length);
  const alturaCom = (gap) => quebras.reduce((t, n) => t + 19 + 19 * n + 8 + gap, 0);
  const gapCapa = alturaCom(26) <= disponivel ? 26 : alturaCom(14) <= disponivel ? 14 : 8;

  for (const [label, val] of linhasCapa) {
    tracked(label, M, by, 9, bold, GRAY, 2); by -= 19;
    for (const ln of quebrar(val, bold, 16, W)) { page.drawText(ln, { x: M, y: by, size: 16, font: bold, color: NAVY }); by -= 19; }
    by -= 8;
    page.drawLine({ start: { x: M, y: by }, end: { x: A4[0] - M, y: by }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    by -= gapCapa;
  }

  // responsável técnico, no pé da capa, logo acima da faixa de controle
  tracked("RESPONSÁVEL TÉCNICO", M, 88 + 52, 8, bold, GRAY, 2);
  page.drawText(RESPONSAVEL_TECNICO, { x: M, y: 88 + 32, size: 12, font: bold, color: NAVY });

  // rodapé de controle — 4 colunas alinhadas (mesma linha-base p/ rótulo e valor)
  const fH = 88;
  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: fH, color: LIGHT });
  page.drawRectangle({ x: 0, y: fH, width: A4[0], height: 3, color: NAVY });
  const cwCapa = (A4[0] - 2 * M) / 4;
  const corStatus = emitido ? rgb(0.06, 0.5, 0.3) : rgb(0.7, 0.45, 0);
  [
    ["CÓDIGO", codigo, NAVY],
    ["REVISÃO", rev, NAVY],
    ["EMISSÃO", dataEmissao, NAVY],
    ["STATUS", emitido ? "EMITIDO" : "RASCUNHO", corStatus],
  ].forEach(([l, v, cor], i) => {
    const cx = M + i * cwCapa;
    tracked(l, cx, fH - 34, 8, bold, GRAY, 1.5);
    page.drawText(fit(v, bold, 12.5, cwCapa - 8), { x: cx, y: fH - 56, size: 12.5, font: bold, color: cor });
  });

  // ─── SUMÁRIO (índice do dossiê: I / II / III / IV) ──────
  // Agrupa as seções que compõem o data book (não-N/A, exceto a §01 índice) na
  // taxonomia do dossiê e numera as subseções I-1, I-2, … II-1, …
  // Só entram no PDF as seções com conteúdo real: docs anexados, ou o termo (§20),
  // ou o PIT (§10) preenchido — seção sem nada não vira página em branco.
  const temConteudo = (s) =>
    s.documentos.length > 0 ||
    s.numero === "20" ||
    (s.numero === "10" && Array.isArray(s.conteudoJson?.itens) && s.conteudoJson.itens.length > 0) ||
    (s.numero === "02" && lpcLive.conjuntos.length > 0);
  const incluidas = book.secoes.filter((s) => s.estado !== "NA" && s.numero !== "01" && temConteudo(s));
  const grupos = GRUPOS_DATABOOK
    .map((g) => ({
      ...g,
      itens: incluidas
        .filter((s) => grupoDaSecao(s.numero) === g.romano)
        .map((s, i) => ({ secao: s, id: `${g.romano}-${i + 1}` })),
    }))
    .filter((g) => g.itens.length);

  // Sumário: reservamos a página agora (fica logo após a capa) e a desenhamos
  // DEPOIS do conteúdo — aí já sabemos a página-destino de cada seção, pra criar
  // os links clicáveis (clicar na linha do índice leva até a seção).
  const sumarioPage = pdf.addPage(A4);
  const destByItemId = {};

  // ─── CONTEÚDO — cada subseção abre em página separadora + conteúdo + merge ───
  let mergedPages = 0;
  for (const g of grupos) {
   for (const it of g.itens) {
    const s = it.secao;
    dividerPagina(it.id, s.titulo, s.norma);
    destByItemId[it.id] = page; // página separadora = destino do link no sumário
    novaPagina();
    const docsSecao = s.documentos.map((ld) => docById.get(ld.documentoId)).filter(Boolean).map(comFichaDoc);
    let listouDocs = false;

    // cabeçalho compacto da subseção no topo da página de conteúdo
    tracked(it.id, M, y - 2, 9, bold, BLUE, 1);
    page.drawText(fit(s.titulo, bold, 10.5, W - 60), { x: M + 40, y: y - 2, size: 10.5, font: bold, color: NAVY });
    y -= 16;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4[0] - M, y: y + 4 }, thickness: 0.5, color: rgb(0.86, 0.88, 0.91) });
    y -= 6;

    if (s.numero === "20") {
      // ── Termo de Encerramento e Declaração de Conformidade ──
      page.drawText("TERMO DE ENCERRAMENTO E DECLARAÇÃO DE CONFORMIDADE", { x: M, y, size: 12, font: bold, color: NAVY }); y -= 9;
      page.drawRectangle({ x: M, y, width: 96, height: 2.5, color: ORANGE }); y -= 18;
      paragrafo(
        `A TORG METAL, inscrita no CNPJ sob o nº ${CNPJ_TORG}, fabricante de estruturas metálicas, ` +
        `DECLARA que o fornecimento referente à ${fmtOP(book.opNumero)}${book.obra ? " — " + book.obra : ""}` +
        `${book.cliente ? ", destinado ao cliente " + book.cliente : ""}, ` +
        `${book.pesoTotalKg ? "com peso total aproximado de " + fmtKg(book.pesoTotalKg) + (book.pecas ? " e " + book.pecas + " peças, " : ", ") : ""}` +
        `foi integralmente fabricado, inspecionado e liberado para embarque em conformidade com os requisitos a seguir:`,
        10,
      );
      y -= 8;
      const itensDecl = [
        "Fabricação executada de acordo com os projetos aprovados e suas revisões vigentes, atendendo à norma ABNT NBR 8800.",
        "Rastreabilidade integral dos materiais, comprovada pelos certificados de usina (MTC) com nº de corrida, conforme ABNT NBR 8800 (Anexo A).",
        "Soldagem realizada com procedimentos (EPS/WPS) qualificados e por soldadores certificados, conforme AWS D1.1.",
        "Ensaios visuais (EVS) e não destrutivos — líquido penetrante (LP) e ultrassom (US) — executados por inspetores qualificados (SNQC/ABENDI), atendendo aos critérios de aceitação da AWS D1.1.",
        "Inspeção dimensional realizada conforme as tolerâncias da ABNT NBR 8800 e dos desenhos de fabricação.",
        "Tratamento de superfície e pintura executados conforme o esquema especificado em projeto (ISO 8501-1, ISO 8503 e ISO 2808), com controle da espessura de película seca (DFT).",
        "Atividades conduzidas sob o Sistema de Gestão da Qualidade da TORG METAL, certificado conforme ABNT NBR ISO 9001.",
      ];
      itensDecl.forEach((txt, i) => {
        const lines = quebrar(txt, font, 9.5, W - 20);
        espaco(lines.length * 13 + 6);
        page.drawText(`${i + 1}.`, { x: M + 1, y, size: 9.5, font: bold, color: ORANGE });
        for (const ln of lines) { page.drawText(ln, { x: M + 18, y, size: 9.5, font, color: DARK }); y -= 13; }
        y -= 4;
      });
      y -= 6;
      paragrafo(
        "Declaramos, para os devidos fins, que foram atendidos os requisitos contratuais e normativos aplicáveis, " +
        "atestando a conformidade do produto entregue. As evidências objetivas — certificados, relatórios de inspeção e " +
        "ensaios, qualificações e demais registros — encontram-se compiladas nas seções deste Data Book, que integra a " +
        "documentação da qualidade do empreendimento e deve acompanhar a entrega da obra.",
        10,
      );
      // Selo de certificação ISO 9001 (Bureau Veritas) — imagem se houver; senão, marca textual.
      y -= 14; espaco(70);
      if (bvImg) {
        const bw = 96, bh = (bvImg.height / bvImg.width) * bw;
        page.drawImage(bvImg, { x: M, y: y - bh, width: bw, height: bh });
        page.drawText("Sistema de Gestão da Qualidade certificado", { x: M + bw + 14, y: y - bh / 2 + 4, size: 9, font: bold, color: NAVY });
        page.drawText("ABNT NBR ISO 9001 — Bureau Veritas Certification", { x: M + bw + 14, y: y - bh / 2 - 9, size: 9, font, color: GRAY });
      } else {
        page.drawRectangle({ x: M, y: y - 34, width: 250, height: 34, color: LIGHT });
        page.drawRectangle({ x: M, y: y - 34, width: 3, height: 34, color: ORANGE });
        page.drawText("ABNT NBR ISO 9001", { x: M + 14, y: y - 15, size: 11, font: bold, color: NAVY });
        page.drawText("Sistema de Gestão da Qualidade certificado por Bureau Veritas", { x: M + 14, y: y - 28, size: 8, font, color: GRAY });
      }
    } else if (s.numero === "10") {
      // Plano de Inspeção e Testes montado no portal (§10) — tabela com quebra de linha
      const itens = Array.isArray(s.conteudoJson?.itens) ? s.conteudoJson.itens : [];
      if (itens.length) {
        page.drawText(`Plano de Inspeção e Testes — ${itens.length} ${itens.length === 1 ? "etapa" : "etapas"}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 15;
        drawPitTabela(itens);
        y -= 8;
      } else {
        page.drawText("PIT não preenchido — monte a tabela na seção 10 do portal.", { x: M, y, size: 8.5, font, color: GRAY }); y -= 12;
      }
    } else if (s.numero === "02") {
      // Desenhos as-built — lista LPC (conjunto → posições) + certificado por material.
      // SEMPRE gera na hora (lpcLive): a versão salva (conteudoJson) desatualiza quando
      // a estrutura muda (ex.: passou a ter Índice R). O conteudoJson salvo é só a prévia.
      const conjuntos = lpcLive.conjuntos || [];
      if (conjuntos.length) {
        const nCj = conjuntos.filter((c) => !c.avulsas).length;
        page.drawText(`Rastreabilidade dos desenhos (LPC) — ${nCj} conjuntos · ${lpcLive.totalPosicoes || 0} posições${lpcLive.avulsas ? ` · ${lpcLive.avulsas} peças avulsas` : ""}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 12;
        // ⚠ o quadro por situação saiu daqui pelo mesmo motivo do "—" na tabela: "401 cortadas
        // antes da entrega · 63 sem material no CMR" é o resumo do nosso furo, impresso no
        // documento do cliente. Quem precisa desse número o tem na tela do data book e na
        // Conferência de Rastreabilidade.
        y -= 3;
        drawLpcSecao(conjuntos);
        y -= 8;
      }
      // Sem LPC mas com desenhos anexados → eles entram pelo merge dos PDFs abaixo.
    } else if (docsSecao.length) {
      // ⚠ a partir daqui a seção lista os próprios documentos, e a coluna "Vol. · pág."
      // já dá o endereço de cada um. Seção que NÃO passa por aqui (a §02, que lista a
      // LPC, e a §10, que lista o PIT) precisa do índice compacto lá embaixo.
      listouDocs = true;
      // com R (do CMR ou do nome do anexo) a listagem é de RASTREABILIDADE, não de "documentos"
      const isMaterial = docsSecao.some((d) => d.categoria === "MATERIAL" || d.importRef || d.indiceR);
      if (isMaterial) {
        page.drawText(`Rastreabilidade — ${docsSecao.length} ${docsSecao.length === 1 ? "item" : "itens"}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 15;
        drawTabela(
          // `wrap` no material e no nº do certificado: eles não cabem numa linha e são
          // justamente o que identifica a peça de aço e o documento da usina. Cortar com "…"
          // ("PERFIL W ACO CARBONO LAMINAD…") apaga a bitola, que é a informação.
          // ⚠ Com volumes entra a coluna "Vol. · pág." — as demais cedem os 59 pt dela,
          // porque a soma das larguras TEM que fechar a largura útil.
          mapaDocs
            ? [
                // ⚠ os 59 pt da coluna nova saem de MATERIAL e FORNECEDOR, que têm `wrap`
                // e quebram linha. Norma e Nº Certificado ficam como estavam: eles CORTAM
                // com "…", e "ASTM A…" não identifica norma nenhuma.
                { t: "Índice R", w: 52, bold: true, color: BLUE },
                { t: "Material", w: 128, wrap: true },
                { t: "Corrida", w: 62, color: NAVY2 },
                { t: "Nº Certificado", w: 92, wrap: true },
                { t: "Norma", w: 59, wrap: true },
                { t: "Fornecedor", w: 59, wrap: true },
                { t: "Vol. · pág.", w: 59 },
              ]
            : [
                { t: "Índice R", w: 52, bold: true, color: BLUE },
                { t: "Material", w: 176, wrap: true },
                { t: "Corrida", w: 62, color: NAVY2 },
                { t: "Nº Certificado", w: 92, wrap: true },
                { t: "Norma", w: 59 },
                { t: "Fornecedor", w: 70, wrap: true },
              ],
          docsSecao.map((d) => {
            const linha = [
              (d.importRef || d.indiceR) ? `R ${d.importRef || d.indiceR}` : "—", d.nome, d.numeroCorrida || "—",
              d.numeroDocumento || "—", d.norma || "—", d.fornecedor || "—",
            ];
            if (mapaDocs) linha.push(celulaVolume(mapaDocs[d.id]));
            return linha;
          }),
        );
      } else {
        page.drawText(`Documentos — ${docsSecao.length}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 15;
        drawTabela(
          // larguras redistribuídas: o NOME é o que identifica o documento, então leva o espaço.
          // Emissão e validade são datas de tamanho fixo e não precisam de 76/100 pt.
          // ⚠ COM VOLUMES, a lista mestra ganha a coluna que diz ONDE o documento está.
          // É ela que mantém o conjunto sendo um documento só em vez de uma pasta de PDFs.
          mapaDocs
            ? [
                { t: "Documento", w: 230, wrap: true },
                { t: "Nº / Certificado", w: 104, wrap: true },
                { t: "Emissão", w: 58 },
                { t: "Validade", w: 60 },
                { t: "Vol. · pág.", w: 59 },
              ]
            : [
                { t: "Documento", w: 268, wrap: true },
                { t: "Nº / Certificado", w: 116, wrap: true },
                { t: "Emissão", w: 62 },
                { t: "Validade", w: 65 },
              ],
          docsSecao.map((d) => {
            // ── A COLUNA VALIDADE MOSTRA A DATA. Sempre. ────────────────────────────────────
            //
            // Vitor (19/08/2026): "quando emitimos um data book, a validade dos instrumentos de
            // calibração, ou certificado de algum inspetor ou soldador — qualquer documento que
            // seja — deve permanecer na data de validade que foi anexada. Você menciona alguns
            // aparelhos no data book da OP-70 onde coloca vencimento 11 dias; isso não pode
            // aparecer, tem que ser a data de validade".
            //
            // Estava saindo "Vence em 11d" / "Vencido há 30d" — uma CONTAGEM contra o dia em que
            // o PDF foi gerado. Num documento controlado isso é errado duas vezes: não informa a
            // validade (que é o que o cliente e o auditor precisam ler) e muda de valor a cada
            // vez que o arquivo é gerado.
            //
            // 🚫 E, uma vez EMITIDO, o data book não volta atrás. Vitor: "uma vez esse documento
            // emitido, ele valerá para sempre". Ele é a FOTOGRAFIA do que estava válido naquele
            // dia — o certificado vencer depois não torna o data book errado. Por isso, depois de
            // emitido, nada de vermelho nem de laranja: só a data, preta, como no papel.
            //
            // Enquanto está EM MONTAGEM o alerta continua valendo, e é aí que ele serve: avisar
            // ANTES de emitir que um instrumento está para vencer.
            //
            // 🚫 E NÃO SE ESCREVE "SEM VALIDADE". Vitor (23/08/2026): "na listagem dos certificados
            // não precisa conter a data de validade, pois tem alguns listados lá e você me colocou
            // sem validade e isso não pode — ou você coloca a real validade, pois tem isso informado
            // no certificado, ou tira".
            //
            // Ele está certo por dois motivos. O primeiro é técnico: certificado de material (MTC)
            // não vence — ele registra a corrida de uma chapa, não uma calibração. Escrever "sem
            // validade" numa linha dessas não é informação, é ruído. O segundo é o que importa:
            // num documento que o CLIENTE e o AUDITOR leem, "sem validade" se lê como certificado
            // sem controle — a Torg declarando por escrito uma falta que nem existe. Célula vazia é
            // dado que não se aplica; frase é confissão.
            //
            // ⚠⚠ O AVISO DE VENCIMENTO NÃO SAI NO PDF. Vitor (28/08/2026): "quando algum certificado
            // está prestes a vencer ele fica com o informativo em amarelo, o que não deve aparecer na
            // exportação do PDF do data book". O amarelo é ferramenta de quem MONTA — na folha que vai
            // ao cliente e ao auditor ele vira a Torg apontando um problema no próprio dossiê, e num
            // documento controlado ninguém lê "atenção" como lembrete: lê como ressalva.
            //
            // A data continua impressa, inteira. O alerta segue na TELA, onde serve para agir.
            const validade = d.dataValidade ? fmtData(d.dataValidade) : "—";
            const linha = [d.nome, d.numeroDocumento || "—", fmtData(d.dataEmissao), validade];
            if (mapaDocs) linha.push(celulaVolume(mapaDocs[d.id]));
            return linha;
          }),
        );
      }
      y -= 8;
    } else {
      page.drawText("Sem documentos vinculados.", { x: M, y, size: 8.5, font, color: GRAY }); y -= 12;
    }
    if (/entrada_a|misto/.test(s.fonte)) {
      page.drawText("Evidências fotográficas: captura em campo (fase futura).", { x: M, y, size: 8, font, color: GRAY }); y -= 11;
    }

    // ─── ANEXOS ───────────────────────────────────────────────────────────────
    // dedup por arquivo: o mesmo certificado pode estar vinculado duas vezes.
    const anexaveis = [];
    {
      const vistos = new Set();
      for (const d of docsSecao) {
        const chave = d.sharepointItemId || d.arquivoUrl;
        if (!chave || vistos.has(chave)) continue;
        // ⚠ .dwg NÃO É PENDÊNCIA, é arquivo que não devia estar aqui. Na OP-085 o mesmo desenho
        // estava anexado como .pdf e como .dwg; o livro tentava mesclar o CAD, falhava, e listava
        // "IPPE1088P1-LD — Failed to parse PDF document" (o nome vai sem extensão, então parecia
        // que o PDF do desenho tinha ficado de fora). Ver lib/databook-anexo.
        if (!ehAnexavelNoLivro(d)) continue;
        vistos.add(chave);
        anexaveis.push(d);
      }
    }
    // Livro sem anexos: no lugar deles fica o PONTEIRO para o volume. Quem lê o
    // sumário precisa saber onde o documento está — é o que faz o conjunto de
    // volumes continuar sendo um documento só.
    if (!comAnexos) {
      if (anexaveis.length) {
        espaco(26);
        const info = mapaAnexos?.secoes?.[s.id];
        const onde = info
          ? (info.volumeIni === info.volumeFim ? `Volume ${info.volumeIni}` : `Volumes ${info.volumeIni} a ${info.volumeFim}`)
          : "volumes de anexos";
        const pags = info?.paginas ? ` · ${info.paginas.toLocaleString("pt-BR")} páginas` : "";
        page.drawRectangle({ x: M, y: y - 15, width: W, height: 20, color: LIGHT });
        const nDocs = anexaveis.length;
        page.drawText(`Anexos desta seção: ${nDocs} ${nDocs === 1 ? "documento" : "documentos"}${pags} — ${onde}.`,
          { x: M + 6, y: y - 9, size: 8.5, font: bold, color: info ? BLUE : NAVY });
        // Um documento só: o ponteiro leva direto à página dele — índice de uma linha
        // seria burocracia. Vários: o ponteiro abre o primeiro volume e o índice abaixo
        // dá o endereço de cada um.
        const unico = nDocs === 1 ? mapaDocs?.[anexaveis[0].id] : null;
        if (unico) linkVolume(page, [M, y - 15, M + W, y + 5], unico.v, unico.p);
        else if (info) linkVolume(page, [M, y - 15, M + W, y + 5], info.volumeIni, 2);
        y -= 26;
        // ⚠ A §02 LISTA A LPC, NÃO OS DESENHOS — e são 1.336 deles, espalhados por
        // dezessete volumes. Sem endereço por desenho, "Volumes 2 a 18" obriga o leitor a
        // abrir volume por volume até achar o T67A417. O índice compacto resolve: três
        // colunas por folha, cada linha clicando direto na página do desenho.
        if (!listouDocs && mapaDocs && nDocs > 1) indiceCompacto(anexaveis);
      }
    } else {
    const antesPag = pdf.getPages().length;
    for (const d of anexaveis) {
      if (mergedPages >= MAX_MERGE_PAGES) {
        pendencias.push({ secao: s.numero, nome: d.nome, motivo: "excede o limite do arquivo único — gere em volumes" });
        continue;
      }
      try {
        const buf = await baixarDocumento(d, servidorDriveId);
        const ext = await abrirAnexoComoPdf(buf, d);
        const idxs = ext.getPageIndices();
        const copiadas = await pdf.copyPages(ext, idxs);
        copiadas.forEach((p) => {
          // Padroniza tudo em RETRATO: certificado efetivamente em paisagem gira 90°
          // (o conteúdo fica em pé na página vertical, como em data book impresso).
          const { width, height } = p.getSize();
          const rot = p.getRotation().angle || 0;
          const ehPaisagem = rot % 180 === 0 ? width > height : height > width;
          if (ehPaisagem) p.setRotation(degrees((rot + 90) % 360));
          pdf.addPage(p);
          mergedPages++;
        });
      } catch (e) {
        // ⚠ nunca sumir com o anexo em silêncio: registra e continua.
        pendencias.push({ secao: s.numero, nome: d.nome, motivo: e?.message || "falha ao anexar" });
        novaPagina();
        page.drawText(`Não foi possível anexar automaticamente o certificado:`, { x: M, y, size: 10, font: bold, color: rgb(0.7, 0.2, 0.2) }); y -= 16;
        page.drawText(fit(d.nome, font, 10, W), { x: M, y, size: 10, font, color: DARK });
      }
    }
    void antesPag; // cada subseção já abre na própria página separadora
    }
   }
  }

  // ─── SUMÁRIO (desenhado agora, com links clicáveis: clicar na linha leva à seção) ───
  page = sumarioPage;
  page.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
  page.drawText("SUMÁRIO", { x: M, y: A4[1] - 42, size: 18, font: bold, color: WHITE });
  const subCap = `${book.cliente || ""}${book.obra ? "  ·  " + book.obra : ""}  ·  ${fmtOP(book.opNumero)}`;
  page.drawText(fit(subCap, font, 9, W), { x: M, y: A4[1] - 56, size: 9, font, color: LIGHTBLUE });
  y = A4[1] - 98;
  const sumarioLinks = [];
  for (const g of grupos) {
    tracked(`${g.romano}.`, M, y, 12, bold, ORANGE, 1);
    page.drawText(g.titulo, { x: M + 28, y, size: 12, font: bold, color: NAVY });
    y -= 7;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: NAVY2 });
    y -= 18;
    for (const it of g.itens) {
      const nDocs = it.secao.documentos.length;
      page.drawText(it.id, { x: M + 12, y, size: 9.5, font: bold, color: BLUE });
      // título em azul = pista visual de que a linha é clicável
      page.drawText(fit(it.secao.titulo, font, 9.5, W - 170), { x: M + 58, y, size: 9.5, font, color: BLUE });
      const meta = it.secao.numero === "10" ? "PIT" : it.secao.numero === "02" ? "LPC" : (nDocs ? `${nDocs} doc${nDocs > 1 ? "s" : ""}` : "—");
      page.drawText(meta, { x: A4[0] - M - font.widthOfTextAtSize(meta, 8.5), y, size: 8.5, font, color: GRAY });
      const dest = destByItemId[it.id];
      if (dest) {
        const annot = pdf.context.obj({
          Type: "Annot", Subtype: "Link",
          Rect: [M, y - 4, A4[0] - M, y + 12],
          Border: [0, 0, 0],
          Dest: [dest.ref, PDFName.of("Fit")],
        });
        sumarioLinks.push(pdf.context.register(annot));
      }
      y -= 16;
    }
    y -= 14;
  }
  if (sumarioLinks.length) sumarioPage.node.set(PDFName.of("Annots"), pdf.context.obj(sumarioLinks));

  // ─── RESPONSABILIDADE TÉCNICA E ASSINATURAS ─────────────
  // A linha do inspetor varia pelo tipo do data book (importa só p/ a assinatura):
  // SNQC exige inspetor qualificado SNQC/ABENDI; Padrão Torg / Relatório usam o
  // responsável de qualidade da Torg.
  novaPagina();
  page.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
  page.drawText("RESPONSABILIDADE TÉCNICA E ASSINATURAS", { x: M, y: A4[1] - 40, size: 15, font: bold, color: WHITE });
  y = A4[1] - 110;

  const inspetor = {
    SNQC: { titulo: "Inspetor de Ensaios (Soldagem / END)", sub: "Qualificação SNQC / ABENDI nº __________________________" },
    PADRAO_TORG: { titulo: "Inspetor / Responsável de Qualidade", sub: "Torg Metal" },
    RELATORIO_ACOMPANHAMENTO: { titulo: "Responsável pelo Acompanhamento", sub: "Torg Metal" },
  }[book.tipo] || { titulo: "Inspetor / Responsável de Qualidade", sub: "Torg Metal" };

  // timestamp real (instante) → sempre no fuso de Brasília; o PDF roda no servidor (UTC) sem isso
  const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : null);

  if (book.assinaturas && book.assinaturas.length) {
    // Cadeia de assinaturas DIGITAIS (Elaborador → Inspetor → RT → Cliente),
    // coletadas por link seguro (nome + data/hora + IP).
    const TIT = { ELABORADOR: "Elaborado por", INSPETOR: inspetor.titulo, RESP_TECNICO: "Aprovado por (Responsável Técnico)", CLIENTE: "Recebido / Aceite — Cliente" };
    const SUB = { ELABORADOR: "Torg Metal", INSPETOR: inspetor.sub, RESP_TECNICO: "Torg Metal", CLIENTE: book.cliente || "" };
    page.drawText("Assinaturas digitais coletadas por link seguro (registram nome, data/hora e IP).", { x: M, y, size: 8.5, font, color: GRAY });
    y -= 24;
    for (const a of book.assinaturas) {
      espaco(78);
      const assinado = a.status === "ASSINADO";
      // ⚠ ASSINATURA DESENHADA, quando a pessoa tem uma cadastrada no portal. Vitor (28/08/2026):
      // essa assinatura vale para "relatórios de qualidade, Data Books e documentos pertinentes à
      // obra". Fica ACIMA da linha, que é onde se assina no papel.
      if (assinado) {
        const img = await imagemAssinada(pdf, a);
        if (img) {
          espaco(78 + 46);
          const esc = Math.min(300 / img.width, 46 / img.height);
          page.drawImage(img, { x: M, y: y + 4, width: img.width * esc, height: img.height * esc });
          y -= img.height * esc + 2;
        }
      }
      if (assinado && a.assinadoNome) page.drawText(a.assinadoNome, { x: M, y, size: 13, font: bold, color: NAVY });
      else page.drawText(a.nome ? `${a.nome} — pendente` : "(pendente)", { x: M, y, size: 10, font, color: GRAY });
      y -= 6;
      page.drawLine({ start: { x: M, y }, end: { x: M + 320, y }, thickness: 0.8, color: DARK });
      page.drawText(TIT[a.papel] || a.papel, { x: M, y: y - 13, size: 10, font: bold, color: DARK });
      if (SUB[a.papel]) page.drawText(SUB[a.papel], { x: M, y: y - 25, size: 8.5, font, color: GRAY });
      page.drawText(assinado ? `Assinado digitalmente em ${fmtDH(a.assinadoEm)}${a.ip ? " · IP " + a.ip : ""}` : "Aguardando assinatura", { x: M, y: y - 36, size: 8, font, color: assinado ? DARK : GRAY });
      y -= 54;
    }
  } else {
    // Legado (sem cadeia): linhas em branco para assinatura manual.
    const assinaturas = [
      { titulo: "Elaborado por", sub: "Qualidade — Torg Metal" },
      inspetor,
      { titulo: "Aprovado por (Responsável Técnico)", sub: "Torg Metal" },
      { titulo: "Recebido / Aceite — Cliente", sub: book.cliente || "" },
    ];
    for (const a of assinaturas) {
      espaco(80);
      y -= 34; // espaço para a assinatura acima da linha
      page.drawLine({ start: { x: M, y }, end: { x: M + 300, y }, thickness: 0.8, color: DARK });
      page.drawText(a.titulo, { x: M, y: y - 14, size: 10, font: bold, color: DARK });
      if (a.sub) page.drawText(a.sub, { x: M, y: y - 26, size: 8.5, font, color: GRAY });
      y -= 46;
    }
  }
  if (book.tipo) {
    espaco(20);
    page.drawText(`Data book no padrão: ${TIPO_DATABOOK_LABEL[book.tipo] || book.tipo}.`, { x: M, y, size: 8.5, font, color: GRAY });
  }

  // ─── PENDÊNCIAS ───────────────────────────────────────────────────────────────
  // Documento que consta da lista mestra mas NÃO entrou no arquivo tem que aparecer.
  // Data book é documento controlado: um anexo que sumiu sem aviso faz o livro mentir.
  if (pendencias.length) {
    novaPagina();
    tituloSecao(page, bold, font, "—", "Pendências desta geração", null);
    y = A4[1] - 92;
    page.drawText("Os documentos abaixo constam da lista mestra e NÃO foram anexados a este arquivo:",
      { x: M, y, size: 9, font, color: DARK }); y -= 18;
    drawTabela(
      [{ t: "Seção", w: 50 }, { t: "Documento", w: W - 230 }, { t: "Motivo", w: 180 }],
      pendencias.slice(0, 400).map((p2) => [p2.secao, p2.nome, p2.motivo]),
    );
    if (pendencias.length > 400) {
      y -= 4;
      page.drawText(`… e mais ${pendencias.length - 400} documento(s).`, { x: M, y, size: 8.5, font, color: GRAY });
    }
  }

  // ─── RODAPÉ + PAGINAÇÃO (todas as páginas) ──────────────
  // Selo Bureau Veritas (ISO 9001) centralizado no rodapé se houver o arquivo;
  // senão, marca textual da certificação (sem reproduzir o logo de terceiros).
  const paginas = pdf.getPages();
  const total = paginas.length;
  paginas.forEach((p, i) => {
    // Certificado girado p/ retrato: o rodapé sairia de lado — pula nessas páginas.
    if ((p.getRotation().angle || 0) % 360 !== 0) return;
    // A CAPA tem faixa de controle própria (código/revisão/emissão/status) ocupando os 88pt de
    // baixo; carimbar o rodapé por cima empilha duas vezes a mesma informação e fica sujo.
    if (i === 0) return;
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
    // ⚠ curto de propósito: o selo de certificação fica CENTRALIZADO nesta mesma linha, e um
    // rodapé comprido passa por cima dele. A data de emissão já está na capa.
    // ⚠ CURTO. O selo de certificação fica CENTRALIZADO nesta linha; qualquer sufixo a mais passa
    // por cima dele. "RASCUNHO" já aparece na capa (bloco STATUS) e no nome do arquivo.
    p.drawText(`TORG METAL · Documento controlado · ${codigo} · ${rev}`, { x: M, y: 20, size: 7, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 20, size: 7, font, color: GRAY });
    if (bvImg) {
      const bw = 24, bh = (bvImg.height / bvImg.width) * bw;
      p.drawImage(bvImg, { x: A4[0] / 2 - bw / 2, y: 4, width: bw, height: bh });
    } else {
      const cert = "ISO 9001 · Bureau Veritas Certification";
      p.drawText(cert, { x: A4[0] / 2 - font.widthOfTextAtSize(cert, 7) / 2, y: 20, size: 7, font, color: GRAY });
    }
  });

  const bytes = await pdf.save();
  // ⚠ a revisão vai NO NOME: baixar a R01 não pode substituir a R00 na pasta de quem já tinha a
  // anterior — são documentos distintos, e o histórico da revisão só serve se as duas coexistirem.
  return {
    bytes,
    filename: `Data Book ${fmtOP(book.opNumero)}${emitido ? ` ${rev}` : " (rascunho)"}.pdf`,
    paginas: pdf.getPages().length,
    pendencias,
  };

  // ── helper de título de seção (cabeçalho navy) ──
  function tituloSecao(pg, fb, fr, numero, titulo, norma) {
    pg.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
    pg.drawText(`SEÇÃO ${numero}`, { x: M, y: A4[1] - 27, size: 10, font: fb, color: rgb(0.62, 0.74, 0.9) });
    if (norma) {
      const nt = fit(norma, fr, 9, 250);
      pg.drawText(nt, { x: A4[0] - M - fr.widthOfTextAtSize(nt, 9), y: A4[1] - 27, size: 9, font: fr, color: rgb(0.8, 0.86, 0.95) });
    }
    pg.drawText(fit(titulo, fb, 16, W - 12), { x: M, y: A4[1] - 50, size: 16, font: fb, color: WHITE });
  }
}
