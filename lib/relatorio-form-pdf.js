import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dataBR } from "./data-br";

// A BASE DOS FORMULÁRIOS DA QUALIDADE.
//
// Vitor (21/08/2026): "a formatação do relatório de EVS deve seguir a mesma linha do de dimensional,
// forma Excel, mesma altura do cabeçalho — tem que ser tudo padrão".
//
// A única forma de "tudo padrão" que sobrevive ao tempo é os relatórios COMPARTILHAREM o desenho,
// não copiá-lo. Duas cópias parecem iguais no dia em que nascem e divergem no primeiro ajuste — e
// aqui vêm quatro modelos (dimensional, visual de solda, ultrassom, pintura), o que daria quatro
// versões do mesmo cabeçalho para manter.
//
// Este módulo é o formulário em si: a folha A4, a moldura, o cabeçalho com logo e bloco
// DATA/Nº/FOLHA, as linhas de identificação, os quadros de aprovação, os instrumentos e as
// assinaturas. Cada relatório escreve só o MIOLO que é dele.

export const A4 = [595.28, 841.89];
export const A4_DEITADA = [841.89, 595.28];
export const M = 28;
export const LARGURA = A4[0] - 2 * M;

export const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
export const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
export const DARK = rgb(0, 38 / 255, 63 / 255);
export const GRAY = rgb(0.36, 0.45, 0.52);
export const LINE = rgb(0.72, 0.76, 0.80);
export const SOFT = rgb(0.957, 0.969, 0.980);
export const WHITE = rgb(1, 1, 1);
export const GREEN = rgb(0.02, 0.47, 0.34);
export const RED = rgb(0.78, 0.12, 0.12);

/** Tira o que a fonte padrão do PDF não escreve (aspas curvas, travessão, reticência). */
export const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
export const nz = (v) => (v == null || v === "" ? "" : String(v));

/**
 * A imagem da assinatura de quem assinou, embutida uma única vez por documento.
 *
 * ⚠ Falha de rede não derruba o relatório: sem imagem, o campo sai com nome e data — que é o que
 * vale juridicamente. A imagem é o rosto da assinatura, não a assinatura.
 */
const cacheAss = new WeakMap();
export async function imagemAssinada(pdf, a) {
  const url = a?.imagemUrl;
  if (!url) return null;
  let mapa = cacheAss.get(pdf);
  if (!mapa) { mapa = new Map(); cacheAss.set(pdf, mapa); }
  if (mapa.has(url)) return mapa.get(url);
  let img = null;
  try {
    const r = await fetch(url);
    if (r.ok) {
      const bin = Buffer.from(await r.arrayBuffer());
      try { img = await pdf.embedPng(bin); } catch { try { img = await pdf.embedJpg(bin); } catch { img = null; } }
    }
  } catch { img = null; }
  mapa.set(url, img);
  return img;
}

/** Abre um documento com as fontes e o logo já carregados. */
export async function abrirDocumento() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo.png"))); } catch { /* sem logo */ }
  return { pdf, font, bold, logo };
}

/**
 * Baixa e embute as fotos, na ordem em que vieram.
 *
 * ⚠ Falha de rede numa foto NÃO derruba o relatório: aquela entra como moldura vazia com a legenda,
 * e as outras seguem. Um documento que não abre por causa de uma imagem é pior que um documento com
 * uma imagem faltando — e a falta fica visível, não silenciosa.
 */
export async function embutirFotos(pdf, fotos = []) {
  const out = [];
  for (const f of fotos) {
    let img = null;
    if (f?.url) {
      try {
        const r = await fetch(f.url);
        if (r.ok) {
          const bin = Buffer.from(await r.arrayBuffer());
          try { img = await pdf.embedJpg(bin); } catch { try { img = await pdf.embedPng(bin); } catch { img = null; } }
        }
      } catch { img = null; }
    }
    out.push({ ...f, img });
  }
  return out;
}

/**
 * Uma folha do formulário. Devolve as ferramentas de desenho já presas a ela.
 *
 * O `y` corre de cima para baixo: cada bloco desenha onde está e desce o cursor. É o que permite
 * empilhar seções sem cada relatório recalcular coordenada.
 */
/**
 * @param {object} doc de `abrirDocumento`
 * @param {{paisagem?:boolean}} opts folha DEITADA — o ensaio por ultrassom tem 18 colunas e não há
 *   como espremê-las em retrato sem que a coluna vire um risco.
 */
export function novaFolha({ pdf, font, bold, logo }, { paisagem = false } = {}) {
  const tam = paisagem ? A4_DEITADA : A4;
  const page = pdf.addPage(tam);
  const W = tam[0] - 2 * M;
  const f = {
    page, font, bold, W,
    y: tam[1] - M,

    /** Onde o cursor está agora (para quem precisa desenhar por conta). */
    get topo() { return f.y; },

    caixa(x, yTopo, larg, alt, fundo = null) {
      if (fundo) page.drawRectangle({ x, y: yTopo - alt, width: larg, height: alt, color: fundo });
      page.drawRectangle({ x, y: yTopo - alt, width: larg, height: alt, borderColor: LINE, borderWidth: 0.7 });
    },

    /** Corta com reticência quando não cabe. */
    fit(t, fnt, tam, larg) {
      let s = san(t);
      if (fnt.widthOfTextAtSize(s, tam) <= larg) return s;
      while (s.length > 1 && fnt.widthOfTextAtSize(`${s}...`, tam) > larg) s = s.slice(0, -1);
      return `${s}...`;
    },

    /** Quebra em linhas que caibam na largura. */
    quebrar(t, fnt, tam, larg) {
      const out = [];
      for (const par of san(t).split(/\n+/)) {
        let l = "";
        for (const p of par.split(/\s+/)) {
          const c = l ? `${l} ${p}` : p;
          if (fnt.widthOfTextAtSize(c, tam) <= larg) l = c;
          else { if (l) out.push(l); l = p; }
        }
        if (l) out.push(l);
      }
      return out;
    },

    rotulo(x, yy, t, tam = 6.2) { page.drawText(san(t), { x, y: yy, size: tam, font: bold, color: GRAY }); },

    /**
     * Valor de um campo.
     *
     * ⚠ ENCOLHE ANTES DE CORTAR. Vitor: "aqui está estourando também" — a referência do cliente pode
     * trazer várias ("TPR763 / TPR803 / TPR804"). Reticência num campo de identificação é pior que
     * letra pequena: quem lê não sabe se falta uma referência ou dez.
     */
    valor(x, yy, t, larg, tam = 8.5) {
      const txt = san(t);
      let usar = tam;
      while (usar > 6 && bold.widthOfTextAtSize(txt, usar) > larg) usar = +(usar - 0.25).toFixed(2);
      page.drawText(f.fit(txt, bold, usar, larg), { x, y: yy, size: usar, font: bold, color: DARK });
    },

    /** Caixinha de marcar, vazia ou com o tique. */
    marcar(x, yy, ligado, cor) {
      page.drawRectangle({ x, y: yy - 6.5, width: 7, height: 7, borderColor: ligado ? cor : LINE, borderWidth: ligado ? 1.1 : 0.7, color: ligado ? cor : undefined });
      if (ligado) {
        page.drawLine({ start: { x: x + 1.6, y: yy - 3 }, end: { x: x + 3, y: yy - 5 }, thickness: 1.1, color: WHITE });
        page.drawLine({ start: { x: x + 3, y: yy - 5 }, end: { x: x + 5.6, y: yy - 0.6 }, thickness: 1.1, color: WHITE });
      }
    },

    /**
     * O cabeçalho: logo, título, subtítulo do SGQ e o bloco DATA / Nº / FOLHA.
     * ⚠ 46 pt de altura em TODOS os relatórios — é a "mesma altura de cabeçalho" que o Vitor pediu.
     */
    cabecalho({ titulo, codigo, emitidoEm, folha = 1, total = 1, revisao = null }) {
      const hCab = 46;
      f.caixa(M, f.y, W, hCab);
      if (logo) { const lw = 62, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M + 8, y: f.y - hCab / 2 - lh / 2, width: lw, height: lh }); }
      // ⚠ O TÍTULO ENCOLHE ATÉ CABER, e quebra em duas linhas se ainda não couber.
      //
      // Vitor (21/08/2026): "está estourando" — "RELATÓRIO DE INSPEÇÃO VISUAL E DIMENSIONAL DE
      // SOLDA" avançava por cima do bloco DATA/Nº/FOLHA. Era tamanho fixo de 11 pt, que servia para
      // o título do dimensional e não para este. Os outros dois modelos que ainda vêm (ensaio por
      // ultrassom, inspeção de pintura) têm títulos igualmente longos, então isso se resolve aqui e
      // não em cada relatório.
      const xDir = M + W - 130;
      const dispTit = xDir - (M + 82) - 8;
      const t = san(titulo);
      let tamTit = 11;
      while (tamTit > 8 && bold.widthOfTextAtSize(t, tamTit) > dispTit) tamTit = +(tamTit - 0.25).toFixed(2);
      if (bold.widthOfTextAtSize(t, tamTit) <= dispTit) {
        page.drawText(t, { x: M + 82, y: f.y - 20, size: tamTit, font: bold, color: NAVY });
      } else {
        // duas linhas, mais juntas, para o subtítulo continuar cabendo na mesma altura de cabeçalho
        const linhas2 = f.quebrar(t, bold, tamTit, dispTit).slice(0, 2);
        linhas2.forEach((ln, i) => page.drawText(ln, { x: M + 82, y: f.y - 15 - i * 10.5, size: tamTit, font: bold, color: NAVY }));
      }
      page.drawText("Torg Metal · Sistema de Gestão da Qualidade · ISO 9001", { x: M + 82, y: f.y - 38, size: 7, font, color: GRAY });

      page.drawLine({ start: { x: xDir, y: f.y }, end: { x: xDir, y: f.y - hCab }, thickness: 0.7, color: LINE });
      // ⚠ A REVISÃO SAI JUNTO DO NÚMERO. Vitor (21/08/2026): "quando o relatório for aprovado
      // salvar como R01, e se for reprovado novamente nova revisão". Um relatório reinspecionado
      // que não diga a revisão é indistinguível do que reprovou — e os dois existem, porque o
      // anterior fica guardado como evidência do retrabalho.
      const numero = revisao ? `${codigo}  ${revisao}` : codigo;
      [["DATA:", dataBR(emitidoEm || new Date())], ["Nº:", numero], ["FOLHA:", `${folha} DE ${total}`]].forEach(([r, v], i) => {
        const yy = f.y - 13 - i * 13;
        page.drawText(r, { x: xDir + 7, y: yy, size: 6.8, font: bold, color: GRAY });
        page.drawText(f.fit(v, bold, 8, 78), { x: xDir + 45, y: yy, size: 8, font: bold, color: DARK });
      });
      f.y -= hCab;
    },

    /** Uma linha de identificação: pares rótulo/valor repartindo a largura. */
    linhaInfo(campos, alt = 16) {
      f.caixa(M, f.y, W, alt, SOFT);
      let x = M;
      campos.forEach(([r, v, frac], i) => {
        const larg = W * frac;
        if (i > 0) page.drawLine({ start: { x, y: f.y }, end: { x, y: f.y - alt }, thickness: 0.7, color: LINE });
        page.drawText(san(r), { x: x + 7, y: f.y - 11, size: 6.4, font: bold, color: GRAY });
        const dx = bold.widthOfTextAtSize(san(r), 6.4) + 12;
        f.valor(x + dx, f.y - 11, nz(v), larg - dx - 8, 8);
        x += larg;
      });
      f.y -= alt;
    },

    /**
     * Reparte a largura pelo CONTEÚDO, não em partes iguais.
     * ⚠ A obra costuma ser longa e a referência curta, mas há obra de nome curto e cliente que manda
     * quatro referências — dividir igual garante que uma das duas estoure. Piso de 18% por campo.
     */
    linhaInfoAuto(campos, alt = 16) {
      const custo = campos.map(([r, v]) => bold.widthOfTextAtSize(san(r), 6.4) + bold.widthOfTextAtSize(san(nz(v)), 8) + 20);
      const total = custo.reduce((a, b) => a + b, 0) || 1;
      const bruto = custo.map((c) => Math.max(0.18, c / total));
      const soma = bruto.reduce((a, b) => a + b, 0);
      f.linhaInfo(campos.map(([r, v], i) => [r, v, bruto[i] / soma]), alt);
    },

    /** Caixa livre para o relatório desenhar dentro; devolve o topo e desce o cursor. */
    bloco(alt, fundo = null) {
      const topo = f.y;
      f.caixa(M, topo, W, alt, fundo);
      f.y -= alt;
      return topo;
    },

    /** Texto em várias linhas dentro de uma caixa com rótulo. */
    blocoTexto(rot, texto, { alt = 44, linhas = 3, tam = 7.5 } = {}) {
      const topo = f.bloco(alt);
      f.rotulo(M + 7, topo - 10, rot);
      let yy = topo - 21;
      for (const ln of f.quebrar(texto || "", font, tam, W - 16).slice(0, linhas)) {
        page.drawText(ln, { x: M + 7, y: yy, size: tam, font, color: DARK });
        yy -= 10;
      }
    },

    /**
     * Os instrumentos usados, com certificado e validade.
     * ⚠ Altura calculada pela lista: com valor fixo a última linha saía por cima das assinaturas.
     */
    blocoInstrumentos(instrumentos, notaTopo = null) {
      const lista = Array.isArray(instrumentos) ? instrumentos : [];
      const cab = notaTopo ? 30 : 20;
      const alt = cab + Math.max(1, lista.length) * 9 + 6;
      const topo = f.bloco(alt);
      let yy = topo - 11;
      if (notaTopo) { page.drawText(san(notaTopo), { x: M + 7, y: yy, size: 6.6, font, color: GRAY }); yy -= 10; }
      page.drawText("*Equipamentos utilizados:", { x: M + 7, y: yy, size: 6.6, font: bold, color: GRAY });
      yy -= 9;
      if (!lista.length) {
        // ⚠ ver relatorio-dimensional-pdf: célula vazia, não frase.
        page.drawText("—", { x: M + 12, y: yy, size: 6.6, font, color: GRAY });
        return;
      }
      for (const e of lista) {
        // ⚠ SÓ O CERTIFICADO. Vitor (22/08/2026): "a validade não há necessidade, apenas o
        // certificado". O número do certificado é o que se confere: por ele se chega ao laudo de
        // calibração, e nele está a validade. Repetir a data na folha era informação de segunda
        // mão ocupando linha.
        //
        // ⚠ "VENCIDO" continua saindo. Não é uma data — é um impedimento: medir com instrumento
        // fora de calibração invalida o ensaio, e isso o documento tem de dizer.
        const txt = `${e.nome}: certificado de calibração nº ${e.certificado || "—"}`;
        page.drawText(f.fit(txt, font, 6.6, W - 20), { x: M + 12, y: yy, size: 6.6, font, color: e.vencido ? RED : DARK });
        if (e.vencido) page.drawText("VENCIDO", { x: M + W - 8 - bold.widthOfTextAtSize("VENCIDO", 6.6), y: yy, size: 6.6, font: bold, color: RED });
        yy -= 9;
      }
    },

    /**
     * Grade de fotos, com legenda em cada moldura.
     *
     * ⚠ FOTO É OPCIONAL no dimensional e no visual de solda. Vitor (21/08/2026): "não precisa
     * obrigatoriamente de imagens, mas no caso de uma necessidade pode ser incluído, e você cria uma
     * nova página no mesmo formato". Por isso a página só existe quando há foto — relatório sem
     * evidência fotográfica não sai com uma folha de molduras vazias.
     */
    blocoFotos(fotos, { colunas = 2, altura = 168 } = {}) {
      const wCel = W / colunas;
      const linhasN = Math.ceil(fotos.length / colunas);
      const topo = f.bloco(altura * linhasN);
      fotos.forEach((foto, i) => {
        const col = i % colunas, lin = Math.floor(i / colunas);
        const x = M + col * wCel, yTopo = topo - lin * altura;
        f.caixa(x, yTopo, wCel, altura);
        // faixa da legenda
        page.drawRectangle({ x, y: yTopo - 15, width: wCel, height: 15, color: SOFT });
        page.drawRectangle({ x, y: yTopo - 15, width: wCel, height: 15, borderColor: LINE, borderWidth: 0.7 });
        const cap = [foto.marca, foto.observacao].filter(Boolean).join(" · ") || `Foto ${i + 1}`;
        page.drawText(f.fit(cap, bold, 6.6, wCel - 14), { x: x + 7, y: yTopo - 10.5, size: 6.6, font: bold, color: GRAY });
        if (foto.img) {
          const dispW = wCel - 12, dispH = altura - 27;
          const esc = Math.min(dispW / foto.img.width, dispH / foto.img.height);
          page.drawImage(foto.img, {
            x: x + 6 + (dispW - foto.img.width * esc) / 2,
            y: yTopo - 21 - dispH + (dispH - foto.img.height * esc) / 2,
            width: foto.img.width * esc, height: foto.img.height * esc,
          });
        } else {
          const t = "(imagem não disponível)";
          page.drawText(t, { x: x + (wCel - font.widthOfTextAtSize(t, 7)) / 2, y: yTopo - altura / 2, size: 7, font, color: GRAY });
        }
      });
    },

    /**
     * Os três papéis que assinam o documento.
     *
     * ⚠ Casa pelo PAPEL INTEIRO, normalizado. Com a primeira palavra, "Inspetor Torg Metal" e
     * "Inspetor Cliente" casavam ambos com o mesmo assinante — e o documento saía dizendo que o
     * cliente assinou quando quem assinou foi a Torg.
     */
    // ⚠⚠ A ASSINATURA SAI DESENHADA quando a pessoa tem imagem cadastrada. Vitor (28/08/2026):
    // "para as assinaturas dos relatórios de qualidade (…) quando o usuário assinar ela sair no
    // campo de assinatura dela — mas isso seria apenas nos relatórios de inspeção". Por isso mora
    // AQUI, no formulário dos relatórios, e não no quadro de aprovações do PIT/PLP: a assinatura do
    // cliente nem sempre dá para capturar, e um campo com linha para assinar à mão continua válido.
    //
    // ⚠ Sem imagem, nada muda: nome + data, como sempre foi. A imagem é um a mais, não um requisito.
    async blocoAssinaturas(assinaturas, papeis = ["Inspetor Torg Metal", "Fiscalização Torg Metal", "Inspetor Cliente"]) {
      // ⚠ o bloco só cresce quando ALGUÉM tem imagem. Num carimbo (nome + CPF + cargo + CNPJ) a
      // altura é o que decide se dá para ler: a 26pt vira um borrão. Documento sem imagem mantém a
      // altura antiga — nada muda nos relatórios que já existem.
      const comImagem = (assinaturas || []).some((a) => a?.assinadoEm && a?.imagemUrl);
      const hAss = comImagem ? 84 : 54;
      const topo = f.bloco(hAss);
      const wA = W / papeis.length;
      const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();
      for (const [i, p] of papeis.entries()) {
        const x = M + i * wA;
        if (i > 0) page.drawLine({ start: { x, y: topo }, end: { x, y: topo - hAss }, thickness: 0.7, color: LINE });
        page.drawText(`${san(p)}:`, { x: x + 8, y: topo - 12, size: 6.8, font: bold, color: GRAY });
        const alvo = norm(p);
        const a = (assinaturas || []).find((s) => {
          const st = norm(s.setor);
          return st === alvo || (st && (alvo.includes(st) || st.includes(alvo)));
        });
        if (a?.assinadoEm) {
          const img = await imagemAssinada(pdf, a);
          if (img) {
            const maxL = wA - 22, maxA = hAss - 38;
            const esc = Math.min(maxL / img.width, maxA / img.height);
            page.drawImage(img, { x: x + 8, y: topo - 18 - img.height * esc, width: img.width * esc, height: img.height * esc });
          }
          const yNome = comImagem ? topo - 66 : topo - 30;
          page.drawText(f.fit(a.nome || "", bold, 8.5, wA - 18), { x: x + 8, y: yNome, size: 8.5, font: bold, color: DARK });
          page.drawText(`assinado em ${dataBR(a.assinadoEm)}`, { x: x + 8, y: yNome - 11, size: 6.4, font, color: GREEN });
        } else {
          const yLinha = comImagem ? topo - 62 : topo - 34;
          page.drawLine({ start: { x: x + 8, y: yLinha }, end: { x: x + wA - 12, y: yLinha }, thickness: 0.6, color: LINE });
          page.drawText("nome / assinatura / data", { x: x + 8, y: yLinha - 10, size: 6.2, font, color: GRAY });
        }
      }
    },
  };
  return f;
}
