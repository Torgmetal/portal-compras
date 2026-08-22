import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees, PDFName } from "pdf-lib";
import { put } from "@vercel/blob";
import { prisma } from "./prisma";
import { baixarDocumento, resolverDriveServidor } from "./databook-arquivo";
import { gerarDataBookPDF } from "./databook-pdf";
import { rotuloRevisao } from "./databook-revisao";
import fs from "fs";
import path from "path";

// ─── DATA BOOK EM VOLUMES ─────────────────────────────────────────────────────
// Vitor (22/08/2026): "pode ser que teremos data books com até 10 mil páginas".
//
// O gerador antigo montava o livro inteiro em memória a cada clique, dentro de uma
// função de 120 s. Isso não é ajuste de parâmetro: 10 mil páginas não cabem na
// memória de uma função, o download dos anexos do SharePoint sozinho já estoura
// qualquer timeout, e o cliente não abre um PDF de 3 GB.
//
// Aqui o livro passa a ser um conjunto de VOLUMES, como data book de papel:
//   Volume 1  = o livro   — capa, sumário, divisórias, listas mestras, assinaturas
//   Volume 2+ = os anexos — na ordem das seções, cada seção com folha de rosto
//
// A geração é um JOB RETOMÁVEL: cada invocação fecha UM volume e grava o cursor.
// O cron retoma de onde parou até acabar. Assim o custo por invocação é constante,
// não importa se o data book tem 200 ou 10.000 páginas.
//
// ⚠ O Volume 1 é gerado POR ÚLTIMO, de propósito: só depois de fechar os anexos é
// que se sabe em que volume caiu cada seção — e o livro precisa dizer isso, senão o
// conjunto de arquivos deixa de ser um documento e vira uma pasta de PDFs.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(0.05, 0.12, 0.24);
const ORANGE = rgb(0.96, 0.50, 0.12);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.16, 0.20, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);

// ORÇAMENTO DE UM VOLUME. O que manda é o primeiro que estourar.
// Os bytes são o limite real: pdf-lib mantém tudo em memória e o pico fica em torno
// de 3× o conteúdo mesclado. 90 MB de origem cabem com folga na função.
const LIMITE_BYTES = 90 * 1024 * 1024;
const LIMITE_PAGINAS = 1200;
// Tempo: sobra para salvar, subir o blob e gravar o banco antes do teto da função.
const LIMITE_MS = 55_000;

// Quantos documentos cabem numa folha de índice. A4 útil ≈ 730 pt / 14 pt por linha
// dá ~52; 46 deixa margem para o cabeçalho e o rodapé sem sobrar folha em branco.
const ENTRADAS_POR_PAGINA = 46;

const fmtOP = (n) => `OP-${String(n).padStart(3, "0")}`;
const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

// ─── ROTEIRO DE IMPRESSÃO ─────────────────────────────────────────────────────
// Lista achatada e DETERMINÍSTICA dos anexos, na ordem das seções. O cursor do job
// é um índice nela — por isso ela tem que sair igual em toda invocação: mesma
// ordenação, mesmo dedup. Se ela mudar no meio da geração, o cursor aponta para
// outro documento e o volume sai trocado.
export async function montarRoteiro(dataBookId) {
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: dataBookId },
    select: {
      id: true, opNumero: true, cliente: true, obra: true, revisao: true, emitidoEm: true, status: true,
      secoes: { orderBy: { ordem: "asc" }, select: { id: true, numero: true, titulo: true, estado: true, documentos: { select: { documentoId: true } } } },
    },
  });
  if (!book) throw new Error("Data book não encontrado");

  const ids = [...new Set(book.secoes.flatMap((s) => s.documentos.map((d) => d.documentoId)))];
  const docs = ids.length
    ? await prisma.documentoQualidade.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, arquivoUrl: true, sharepointItemId: true, sharepointUrl: true, origem: true, numeroDocumento: true },
      })
    : [];
  const porId = new Map(docs.map((d) => [d.id, d]));

  const roteiro = [];
  for (const s of book.secoes) {
    if (s.estado === "NA") continue;
    const vistos = new Set();
    for (const v of s.documentos) {
      const d = porId.get(v.documentoId);
      if (!d) continue;
      const chave = d.sharepointItemId || d.arquivoUrl;
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      roteiro.push({ secaoId: s.id, secaoNumero: s.numero, secaoTitulo: s.titulo, doc: d });
    }
  }
  // ordem estável: seção (pela ordem já aplicada) e, dentro dela, pelo nome — a ordem
  // de `documentos` no banco não é garantida entre consultas.
  return { book, roteiro };
}

// ─── UMA INVOCAÇÃO = UM VOLUME ────────────────────────────────────────────────
export async function processarGeracao(geracaoId) {
  const t0 = Date.now();
  const job = await prisma.dataBookGeracao.findUnique({ where: { id: geracaoId } });
  if (!job) throw new Error("Geração não encontrada");
  if (job.status === "CONCLUIDO" || job.status === "CANCELADO") return { concluido: true, nada: true };

  const { book, roteiro } = await montarRoteiro(job.dataBookId);

  await prisma.dataBookGeracao.update({
    where: { id: job.id },
    data: { status: "GERANDO", totalItens: roteiro.length, iniciadoEm: job.iniciadoEm || new Date() },
  });

  // Acabaram os anexos → fecha com o LIVRO (Volume 1) e encerra.
  if (job.cursor >= roteiro.length) {
    return await gerarLivro(job, book, roteiro);
  }

  const volume = Math.max(job.volumeAtual, 1) + 1; // 1 é o livro; anexos começam no 2
  const servidorDriveId = await resolverDriveServidor(roteiro.map((r) => r.doc));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embutirLogo(pdf);

  const pendencias = Array.isArray(job.pendencias) ? [...job.pendencias] : [];
  // ⚠ mapa por SEÇÃO e por DOCUMENTO. Só a seção não basta nesta escala: dizer que a
  // §02 está "nos Volumes 2 a 18" não ajuda ninguém a achar o desenho T67A417. Com o
  // volume de cada documento, a lista mestra do livro vira índice de verdade.
  const mapa = job.mapa && typeof job.mapa === "object"
    ? { secoes: job.mapa.secoes || {}, docs: job.mapa.docs || {} }
    : { secoes: {}, docs: {} };
  const primeiroItem = roteiro[job.cursor];

  // ─── FASE A: baixa e MEDE, sem desenhar nada ────────────────────────────────
  // O índice do volume precisa da página de cada documento, e a página só se sabe
  // depois de conhecer quantos documentos entram e quantas páginas cada um tem. Por
  // isso baixa primeiro, desenha depois — é o que permite o índice ficar NA FRENTE,
  // onde ele serve, em vez de no fim.
  const carregados = [];
  let bytesLidos = 0;
  let paginasConteudo = 0;
  let i = job.cursor;
  let secaoMedida = null;
  while (i < roteiro.length) {
    const it = roteiro[i];
    if (secaoMedida !== it.secaoId) {
      if (carregados.length && estourou(bytesLidos, paginasConteudo, t0)) break;
      secaoMedida = it.secaoId;
      paginasConteudo++; // folha de rosto da seção
      carregados.push({ it, rosto: true });
    }
    try {
      const buf = await baixarDocumento(it.doc, servidorDriveId);
      bytesLidos += buf.length;
      const ext = await PDFDocument.load(buf, { ignoreEncryption: true });
      carregados.push({ it, ext, n: ext.getPageCount() });
      paginasConteudo += ext.getPageCount();
    } catch (e) {
      // ⚠ NUNCA EM SILÊNCIO. A trava antiga descartava anexo sem avisar e o livro
      // mentia sobre o próprio conteúdo.
      pendencias.push({ secao: it.secaoNumero, nome: it.doc.nome, motivo: e?.message?.slice(0, 200) || "falha ao baixar/abrir" });
      carregados.push({ it, ext: null, n: 1 });
      paginasConteudo++;
    }
    i++;
    if (estourou(bytesLidos, paginasConteudo, t0)) break;
  }

  // ─── FASE B: onde cada coisa cai ────────────────────────────────────────────
  const docs = carregados.filter((c) => !c.rosto);
  const paginasIndice = Math.max(1, Math.ceil(docs.length / ENTRADAS_POR_PAGINA));
  let pos = 1 + paginasIndice; // capa + índice; o conteúdo começa na próxima
  const entradas = [];
  for (const c of carregados) {
    c.pagina = pos + 1;
    pos += c.rosto ? 1 : c.n;
    if (!c.rosto) entradas.push(c);
  }
  const totalPaginas = pos;

  // ─── FASE C: desenha ────────────────────────────────────────────────────────
  capaDoVolume(pdf, { font, bold, logo, book, volume, item: primeiroItem, totalPaginas, docs: docs.length });
  const folhasIndice = [];
  for (let k = 0; k < paginasIndice; k++) folhasIndice.push(pdf.addPage(A4));

  let secaoAberta = null;
  for (const c of carregados) {
    if (c.rosto) {
      folhaDeRosto(pdf, { font, bold, logo, item: c.it, volume });
      secaoAberta = c.it.secaoId;
      continue;
    }
    if (c.ext) {
      const copiadas = await pdf.copyPages(c.ext, c.ext.getPageIndices());
      for (const pg of copiadas) {
        // mesma regra do livro: o que está deitado gira para retrato, como no impresso
        const { width, height } = pg.getSize();
        const rot = pg.getRotation().angle || 0;
        const ehPaisagem = rot % 180 === 0 ? width > height : height > width;
        if (ehPaisagem) pg.setRotation(degrees((rot + 90) % 360));
        pdf.addPage(pg);
      }
    } else {
      avisoNaFolha(pdf, { font, bold, item: c.it });
    }

    const m = mapa.secoes[c.it.secaoId] || { volumeIni: volume, volumeFim: volume, paginas: 0, docs: 0 };
    m.volumeFim = volume;
    m.paginas = (m.paginas || 0) + (c.n || 1);
    m.docs = (m.docs || 0) + 1;
    mapa.secoes[c.it.secaoId] = m;
    // v = volume, p = página dentro do volume (1-based) — é isto que o livro linka
    mapa.docs[c.it.doc.id] = { v: volume, p: c.pagina };
  }
  void secaoAberta;

  // o índice, agora que toda página tem endereço — clicável dentro do volume
  desenharIndice(pdf, folhasIndice, { font, bold, entradas, volume, book });

  const paginas = pdf.getPageCount();
  rodape(pdf, { font, book, volume });

  const bytes = await pdf.save();
  const arq = await guardar(bytes, book, job.revisao, volume, tituloVolume(primeiroItem, roteiro[i - 1]));
  await prisma.dataBookArquivo.upsert({
    where: { dataBookId_revisao_volume: { dataBookId: book.id, revisao: job.revisao, volume } },
    create: { dataBookId: book.id, revisao: job.revisao, volume, titulo: arq.titulo, url: arq.url, pathname: arq.pathname, paginas, tamanho: bytes.length },
    update: { titulo: arq.titulo, url: arq.url, pathname: arq.pathname, paginas, tamanho: bytes.length, geradoEm: new Date() },
  });

  const fim = i >= roteiro.length;
  await prisma.dataBookGeracao.update({
    where: { id: job.id },
    data: {
      cursor: i, volumeAtual: volume, paginas: { increment: paginas },
      pendencias, mapa,
      etapa: fim ? "Fechando o Volume 1 (livro)" : `Anexos — ${i} de ${roteiro.length} documentos`,
    },
  });

  return { concluido: false, volume, paginas, itens: i, total: roteiro.length, mb: fmtMB(bytes.length) };
}

const estourou = (bytes, paginas, t0) =>
  bytes >= LIMITE_BYTES || paginas >= LIMITE_PAGINAS || Date.now() - t0 >= LIMITE_MS;

// ─── VOLUME 1: O LIVRO ────────────────────────────────────────────────────────
// Sai por último porque só agora existe o mapa de onde cada seção foi parar.
async function gerarLivro(job, book, roteiro) {
  const mapa = job.mapa && typeof job.mapa === "object" ? job.mapa : {};
  const out = await gerarDataBookPDF(book.id, { anexos: false, mapaAnexos: mapa });
  const totalVolumes = Math.max(job.volumeAtual, 1);

  const arq = await guardar(out.bytes, book, job.revisao, 1, "O livro — capa, sumário e listas mestras");
  await prisma.dataBookArquivo.upsert({
    where: { dataBookId_revisao_volume: { dataBookId: book.id, revisao: job.revisao, volume: 1 } },
    create: { dataBookId: book.id, revisao: job.revisao, volume: 1, titulo: arq.titulo, url: arq.url, pathname: arq.pathname, paginas: out.paginas || 0, tamanho: out.bytes.length, totalVolumes },
    update: { titulo: arq.titulo, url: arq.url, pathname: arq.pathname, paginas: out.paginas || 0, tamanho: out.bytes.length, totalVolumes, geradoEm: new Date() },
  });
  await prisma.dataBookArquivo.updateMany({
    where: { dataBookId: book.id, revisao: job.revisao },
    data: { totalVolumes },
  });
  await prisma.dataBookGeracao.update({
    where: { id: job.id },
    data: {
      status: "CONCLUIDO", concluidoEm: new Date(), totalVolumes,
      paginas: { increment: out.paginas || 0 },
      etapa: `${totalVolumes} volume(s) · ${roteiro.length} anexo(s)`,
    },
  });
  return { concluido: true, totalVolumes };
}

// ─── BLOB ─────────────────────────────────────────────────────────────────────
async function guardar(bytes, book, revisao, volume, titulo) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Storage de arquivos não configurado (BLOB_READ_WRITE_TOKEN).");
  const rev = rotuloRevisao(revisao);
  const nome = `Data Book ${fmtOP(book.opNumero)} ${rev} - Vol ${String(volume).padStart(2, "0")}.pdf`;
  const blob = await put(`qualidade/data-book/${book.opNumero}/${rev}/${nome}`, Buffer.from(bytes), {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/pdf",
    // ⚠ volume grande sobe em partes; sem isto o upload de ~90 MB vai num corpo só.
    multipart: true,
  });
  return { url: blob.url, pathname: blob.pathname, titulo };
}

// ─── PÁGINAS DE APOIO ─────────────────────────────────────────────────────────
async function embutirLogo(pdf) {
  for (const n of ["torg-logo-white.png", "torg-logo.png"]) {
    try { return await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", n))); } catch { /* segue sem logo */ }
  }
  return null;
}

const fit = (str, f, size, maxW) => {
  let s = String(str ?? "");
  if (f.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
  return s + "…";
};

function capaDoVolume(pdf, { font, bold, logo, book, volume, item, totalPaginas, docs }) {
  const p = pdf.addPage(A4);
  p.drawRectangle({ x: 0, y: A4[1] - 150, width: A4[0], height: 150, color: NAVY });
  if (logo) {
    const w = 92, h = (logo.height / logo.width) * w;
    p.drawImage(logo, { x: M, y: A4[1] - 40 - h, width: w, height: h });
  }
  p.drawText(`VOLUME ${String(volume).padStart(2, "0")}`, { x: M, y: A4[1] - 120, size: 30, font: bold, color: WHITE });
  p.drawText("ANEXOS", { x: M, y: A4[1] - 142, size: 11, font, color: rgb(0.62, 0.74, 0.9) });

  let y = A4[1] - 210;
  p.drawText("DATA BOOK DA QUALIDADE", { x: M, y, size: 13, font: bold, color: NAVY }); y -= 22;
  p.drawText(fmtOP(book.opNumero), { x: M, y, size: 20, font: bold, color: DARK }); y -= 24;
  for (const [rot, val] of [["Cliente", book.cliente], ["Obra", book.obra]]) {
    if (!val) continue;
    p.drawText(`${rot}: `, { x: M, y, size: 10, font, color: GRAY });
    p.drawText(fit(val, bold, 10, A4[0] - 2 * M - 60), { x: M + 46, y, size: 10, font: bold, color: DARK });
    y -= 16;
  }
  y -= 12;
  p.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 2, color: ORANGE });
  y -= 22;
  if (item) {
    p.drawText("Começa em:", { x: M, y, size: 9, font, color: GRAY }); y -= 14;
    p.drawText(fit(`§${item.secaoNumero} — ${item.secaoTitulo}`, bold, 11, A4[0] - 2 * M), { x: M, y, size: 11, font: bold, color: NAVY });
  }
  y -= 24;
  if (docs) {
    p.drawText(`${docs.toLocaleString("pt-BR")} documento(s) · ${Number(totalPaginas || 0).toLocaleString("pt-BR")} páginas`,
      { x: M, y, size: 9.5, font: bold, color: DARK });
    y -= 16;
  }
  p.drawText("Índice deste volume na página seguinte — clique no documento para ir até ele.",
    { x: M, y, size: 8.5, font, color: GRAY });
  y -= 13;
  p.drawText("O sumário geral e as listas mestras estão no Volume 01.",
    { x: M, y, size: 8.5, font, color: GRAY });
}

function folhaDeRosto(pdf, { font, bold, logo, item, volume }) {
  const p = pdf.addPage(A4);
  if (logo) {
    const w = 74, h = (logo.height / logo.width) * w;
    p.drawImage(logo, { x: M, y: A4[1] - 30 - h, width: w, height: h, opacity: 0.9 });
  }
  const cy = A4[1] / 2;
  p.drawText(`SEÇÃO ${item.secaoNumero}`, { x: M, y: cy + 26, size: 11, font: bold, color: ORANGE });
  p.drawText(fit(item.secaoTitulo, bold, 20, A4[0] - 2 * M), { x: M, y: cy, size: 20, font: bold, color: NAVY });
  p.drawLine({ start: { x: M, y: cy - 16 }, end: { x: M + 180, y: cy - 16 }, thickness: 2.5, color: ORANGE });
  p.drawText(`Anexos · Volume ${String(volume).padStart(2, "0")}`, { x: M, y: cy - 36, size: 9.5, font, color: GRAY });
}

function avisoNaFolha(pdf, { font, bold, item }) {
  const p = pdf.addPage(A4);
  p.drawText("Documento não anexado", { x: M, y: A4[1] - 120, size: 14, font: bold, color: rgb(0.7, 0.2, 0.2) });
  p.drawText(fit(item.doc.nome, font, 11, A4[0] - 2 * M), { x: M, y: A4[1] - 142, size: 11, font, color: DARK });
  p.drawText("Consta da lista mestra no Volume 01. Consulte a Qualidade.", { x: M, y: A4[1] - 162, size: 9, font, color: GRAY });
}

function rodape(pdf, { font, book, volume }) {
  const pgs = pdf.getPages();
  pgs.forEach((p, i) => {
    if ((p.getRotation().angle || 0) % 360 !== 0) return; // página girada: rodapé sairia de lado
    if (i === 0) return; // a capa do volume tem identidade própria
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
    p.drawText(`TORG METAL · Documento controlado · PQ-DB-${String(book.opNumero).padStart(3, "0")} · Vol. ${String(volume).padStart(2, "0")}`,
      { x: M, y: 20, size: 7, font, color: GRAY });
    const t = `Página ${i + 1} de ${pgs.length}`;
    p.drawText(t, { x: A4[0] - M - font.widthOfTextAtSize(t, 7), y: 20, size: 7, font, color: GRAY });
  });
}

// ─── ÍNDICE DO VOLUME ─────────────────────────────────────────────────────────
// Vitor (22/08/2026): "no índice consegue deixar clicável para mover para a página
// desejada?".
//
// Aqui o link é INTERNO (mesmo arquivo), que é o tipo que funciona em qualquer leitor
// — inclusive no visualizador do Chrome, que ignora link entre arquivos. Por isso
// cada volume carrega o próprio índice na frente, além do índice geral do Volume 01.
function desenharIndice(pdf, folhas, { font, bold, entradas, volume, book }) {
  const porFolha = Math.ceil(entradas.length / folhas.length) || 1;
  folhas.forEach((pg, k) => {
    pg.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
    pg.drawText(`ÍNDICE DO VOLUME ${String(volume).padStart(2, "0")}`, { x: M, y: A4[1] - 40, size: 15, font: bold, color: WHITE });
    const sub = `${fmtOP(book.opNumero)}${folhas.length > 1 ? `  ·  folha ${k + 1} de ${folhas.length}` : ""}`;
    pg.drawText(sub, { x: M, y: A4[1] - 54, size: 8.5, font, color: rgb(0.62, 0.74, 0.9) });

    let y = A4[1] - 84;
    pg.drawText("Documento", { x: M, y, size: 8, font: bold, color: GRAY });
    pg.drawText("Seção", { x: A4[0] - M - 96, y, size: 8, font: bold, color: GRAY });
    pg.drawText("Pág.", { x: A4[0] - M - 30, y, size: 8, font: bold, color: GRAY });
    y -= 5;
    pg.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: NAVY });
    y -= 14;

    const anots = [];
    for (const e of entradas.slice(k * porFolha, (k + 1) * porFolha)) {
      // azul = a linha inteira é clicável, mesma pista visual do sumário do livro
      pg.drawText(fit(e.it.doc.nome, font, 9, A4[0] - 2 * M - 140), { x: M, y, size: 9, font, color: rgb(0, 0.43, 0.67) });
      pg.drawText(`§${e.it.secaoNumero}`, { x: A4[0] - M - 96, y, size: 8.5, font, color: GRAY });
      const np = String(e.pagina);
      pg.drawText(np, { x: A4[0] - M - font.widthOfTextAtSize(np, 8.5), y, size: 8.5, font, color: GRAY });

      const alvo = pdf.getPage(e.pagina - 1);
      if (alvo) {
        anots.push(pdf.context.register(pdf.context.obj({
          Type: "Annot", Subtype: "Link",
          Rect: [M, y - 3, A4[0] - M, y + 10],
          Border: [0, 0, 0],
          Dest: [alvo.ref, PDFName.of("Fit")],
        })));
      }
      y -= 14;
    }
    if (anots.length) pg.node.set(PDFName.of("Annots"), pdf.context.obj(anots));
  });
}

function tituloVolume(primeiro, ultimo) {
  if (!primeiro) return "Anexos";
  if (!ultimo || ultimo.secaoId === primeiro.secaoId) return `Anexos · §${primeiro.secaoNumero} ${primeiro.secaoTitulo}`;
  return `Anexos · §${primeiro.secaoNumero} a §${ultimo.secaoNumero}`;
}
