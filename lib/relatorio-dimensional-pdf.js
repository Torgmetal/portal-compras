import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { dataBR } from "./data-br";
import { imagemAssinada } from "./relatorio-form-pdf";
import { recortarVista } from "./vista-desenho";
import { layoutCotas, setaEm, PADDING } from "./cota-marcacao";
import { tituloDocumento } from "./qualidade-campo";

// RELATÓRIO DE INSPEÇÃO DIMENSIONAL E VISUAL — no formato do formulário da Torg.
//
// Vitor (21/08/2026): "quando gerar o relatório ele precisa ficar com a cara de relatório do
// excel". O layout aqui reproduz o modelo dele, campo a campo:
//
//   título + DATA / Nº / FOLHA
//   FABRICANTE · CLIENTE · OP · OBRA · REF. CLIENTE · IDENTIFICAÇÃO DA PEÇA
//   Nº DESENHO · DESCRIÇÃO · QUANT.
//   [ Dimensão de Projeto | Tolerâncias | Dimensão Encontrada ]  [ CONJUNTO ]
//   DIMENSIONAL / ALINHAMENTO / ACABAMENTO  ·  RESULTADO
//   COMENTÁRIOS
//   *Tolerâncias conforme …   *Equipamentos utilizados: …
//   Inspetor Torg Metal · Fiscalização Torg Metal · Inspetor Cliente
//
// ⚠ O DESENHO FICA AO LADO DA TABELA, não numa página de anexo. É o campo "CONJUNTO"
// do formulário — Vitor: "seria para trazer como se fosse um print do conjunto com as informações
// das cotas do projeto". Entra como página embutida (vetor), então as cotas ficam legíveis.
//
// ⚠ A caixa da dimensão encontrada sai VAZIA quando ninguém mediu. Vitor: "as dimensões
// encontradas você deve deixar para o elaborador do relatório preencher" — e um "—" ali diria que
// mediram e não acharam nada.

const A4 = [595.28, 841.89];
// ⚠ A folha ANEXA é paisagem. Vitor (03/09/2026): "a leitura no papel está ruim ainda, quer criar um
// campo novo para ficar melhor dimensionado a representação do projeto?". Num diagrama de montagem
// (largo) o que limita o tamanho é a LARGURA, e no retrato ela ainda era dividida com a tabela e os
// quadros do formulário. Deitando a folha e deixando só a vista nela, a área passa de 356×419 para
// 786×487 pt — 2,2× mais larga.
const A4_L = [841.89, 595.28];
const M = 28;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.72, 0.76, 0.80);
const SOFT = rgb(0.957, 0.969, 0.980);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.02, 0.47, 0.34);
const RED = rgb(0.78, 0.12, 0.12);

const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const nz = (v) => (v == null || v === "" ? "" : String(v));

export async function gerarDimensionalPDF({ rel, fotos = [], assinaturas = null, desenhoBytes = null, cliente = null, obra = null, refCliente = null }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo.png"))); } catch { /* sem logo */ }

  const W = A4[0] - 2 * M;
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const desenhos = Array.isArray(rel.desenhos) ? rel.desenhos : [];
  const res = rel.resultados || {};

  const fit = (t, f, tam, larg) => {
    let s = san(t);
    if (f.widthOfTextAtSize(s, tam) <= larg) return s;
    while (s.length > 1 && f.widthOfTextAtSize(`${s}...`, tam) > larg) s = s.slice(0, -1);
    return `${s}...`;
  };
  const quebrar = (t, f, tam, larg) => {
    const out = [];
    for (const par of san(t).split(/\n+/)) {
      let l = "";
      for (const p of par.split(/\s+/)) {
        const c = l ? `${l} ${p}` : p;
        if (f.widthOfTextAtSize(c, tam) <= larg) l = c;
        else { if (l) out.push(l); l = p; }
      }
      if (l) out.push(l);
    }
    return out;
  };

  // ── quantas páginas? uma por desenho (o formulário é "FOLHA n DE N") ──────────────────────
  // O modelo é por peça: cada desenho ganha a sua folha, com as dimensões daquela peça.
  const grupos = desenhos.length
    ? desenhos.map((d) => ({
        desenho: d,
        // linha de conjunto tem `conjunto` apontando pro pai; avulsa tem marca própria
        linhas: linhas.filter((l) => (l.conjunto || l.marca) === d.marca) || [],
      }))
    : [{ desenho: null, linhas }];
  // linha que não casou com desenho nenhum não pode sumir do documento
  const orfas = linhas.filter((l) => !grupos.some((g) => g.linhas.includes(l)));
  if (orfas.length) grupos[grupos.length - 1].linhas = [...grupos[grupos.length - 1].linhas, ...orfas];

  // ⚠⚠ PAGINA A TABELA DE COTAS. Vitor (03/09/2026), vendo o RID-089-002 da pré-montagem cortado:
  // "o projeto é grande, mas precisa mostrar tudo que mostrei no projeto". Antes, cota além da que
  // cabia numa folha só ganhava a nota "+N linha(s) — ver continuação" — e a continuação nunca
  // existia; a cota simplesmente não aparecia em lugar nenhum do documento. Um diagrama de
  // montagem tem dezenas de cotas, então isso não era caso raro.
  //
  // Agora cada grupo (um por desenho) vira quantas folhas as cotas dele precisarem: a tabela mostra
  // o pedaço da folha, e o desenho — com TODAS as cotas marcadas, não só as desta folha — se repete
  // igual em cada uma, para quem olha uma folha isolada sempre ver o quadro inteiro.
  /**
   * DESENHA A VISTA COTADA dentro de um retângulo — usada no campo CONJUNTO do formulário e, em
   * tamanho grande, na folha anexa em paisagem.
   *
   * ⚠ Uma implementação só de propósito: são o mesmo desenho em dois tamanhos, e duas cópias
   * divergiriam na primeira correção (foi assim que o recorte e a marcação já se desencontraram).
   *
   * @param {{x:number,y:number,w:number,h:number}} area canto INFERIOR esquerdo + tamanho
   * @param {number} tamLetra corpo da letra A/B/C — maior na folha anexa, que é o ponto dela
   */
  const desenharVista = (page, emb, cotasDaVista, area, tamLetra = 8) => {
    // ⚠ a peça é desenhada com FOLGA em volta, e a folga é onde as linhas de cota vivem — elas
    // ficam FORA da peça, como em qualquer desenho técnico. Mesma constante da tela
    // (lib/cota-marcacao.js), senão a marcação sairia num lugar no PDF e noutro no navegador.
    const Wv = emb.width + PADDING * 2, Hv = emb.height + PADDING * 2;
    const esc = Math.min(area.w / Wv, area.h / Hv);
    const bx0 = area.x + (area.w - Wv * esc) / 2;
    const by0 = area.y + (area.h - Hv * esc) / 2;
    page.drawPage(emb, {
      x: bx0 + PADDING * esc, y: by0 + PADDING * esc,
      width: emb.width * esc, height: emb.height * esc,
    });

    // ── O QUE FOI APAGADO NA TELA SOME AQUI TAMBÉM ──────────────────────────────────────────
    //
    // Vitor (21/08/2026): "está muito confuso para ver os números, é possível permitir remover
    // algumas cotas, meio que apagando isso do desenho?". O desenho do Tekla traz dezenas de marcas
    // de peça (T89A-P115, T89A-P72…) que não se medem e só disputam espaço com o que importa.
    //
    // ⚠ Cobre de branco, não remove: a vista é a PÁGINA ORIGINAL embutida, e o arquivo no servidor
    // continua intocado. Mesma técnica já usada para tapar as tabelas dentro do recorte.
    //
    // ⚠ O texto girado ocupa o espaço na vertical — largura e altura trocam de eixo.
    for (const o of rel.resultados?.ocultosDesenho || []) {
      if (o?.x == null) continue;
      const lg = (o.v ? o.h : o.w) || 0, at = (o.v ? o.w : o.h) || 0;
      if (lg <= 0 || at <= 0) continue;
      page.drawRectangle({
        x: bx0 + (PADDING + o.x - 0.5) * esc,
        y: by0 + (PADDING + o.y - 0.5) * esc,
        width: (lg + 1) * esc, height: (at + 1) * esc,
        color: rgb(1, 1, 1),
      });
    }

    // ── E AS LINHAS QUE FORAM APAGADAS ──────────────────────────────────────────────────────
    //
    // ⚠ Aqui é traço BRANCO POR CIMA, não retângulo: a linha do desenho costuma ser diagonal, e
    // cobrir a caixa dela apagaria um pedaço inteiro da peça. O traço branco segue o mesmo caminho
    // e some só com ele.
    for (const l of rel.resultados?.linhasOcultasDesenho || []) {
      if (!Array.isArray(l) || l.length < 4) continue;
      page.drawLine({
        start: { x: bx0 + (PADDING + l[0]) * esc, y: by0 + (PADDING + l[1]) * esc },
        end: { x: bx0 + (PADDING + l[2]) * esc, y: by0 + (PADDING + l[3]) * esc },
        // ⚠ mais grosso que o traço original, senão sobra fiapo nas bordas. A parte proporcional
        // (× esc) importa mais agora que o desenho é impresso maior: o traço do Tekla cresce junto
        // com a escala, e uma espessura fixa deixaria de cobri-lo.
        thickness: Math.max(1.6, 2.4 * esc), color: rgb(1, 1, 1),
      });
    }

    // ── AS COTAS A / B / C ──────────────────────────────────────────────────────────────────
    //
    // Vitor: "só criar algumas linhas igual a imagem da linha A, B e C, apenas para conseguir
    // mostrar onde vamos medir e colocar as medidas de referência". A linha não mede — ela aponta.
    // A medida de referência fica na tabela.
    const P = (p) => ({ x: bx0 + p[0] * esc, y: by0 + p[1] * esc });
    const risco = (a, b, esp) => page.drawLine({ start: P(a), end: P(b), thickness: esp, color: ORANGE });
    for (const m of layoutCotas(cotasDaVista, emb.width, emb.height)) {
      if (!m) continue;
      risco(m.ext1.a, m.ext1.b, 0.5);
      risco(m.ext2.a, m.ext2.b, 0.5);
      risco(m.linha.a, m.linha.b, 0.9);
      const [la, lb] = [m.linha.a, m.linha.b];
      for (const [p1, p2] of [[la, lb], [lb, la]]) {
        for (const [s1, s2] of setaEm(p1, [p2[0] - p1[0], p2[1] - p1[1]], 5)) risco(s1, s2, 0.9);
      }
      const lt = String(m.letra || "");
      const r = P([m.rotulo.x, m.rotulo.y]);
      page.drawText(lt, {
        x: r.x - (m.vertical ? 0 : bold.widthOfTextAtSize(lt, tamLetra) / 2) - (m.vertical ? tamLetra * 0.7 : 0),
        y: r.y + (m.vertical ? -bold.widthOfTextAtSize(lt, tamLetra) / 2 : 1.5),
        size: tamLetra, font: bold, color: ORANGE,
        rotate: m.vertical ? degrees(90) : undefined,
      });
    }
  };

  // ⚠⚠ O CORPO OCUPA TODA A SOBRA DA FOLHA. Vitor (03/09/2026): "fiz uma impressão do relatório,
  // ele fica muito pequeno, consegue aumentar a proporção dele para aparecer melhor os números das
  // cotas". A altura era fixa em 300 pt e sobravam ~200 pt de papel em branco entre o desenho e as
  // assinaturas — o desenho encolhia à toa. Agora ela é o que resta depois de descontar tudo que
  // vem ABAIXO do corpo, e por isso os blocos de baixo são medidos aqui em cima, antes.
  //
  // ⚠ Medido uma vez por RELATÓRIO, não por folha: o que define esses tamanhos (instrumentos,
  // assinaturas) é igual em todas as folhas, e a paginação da tabela precisa do número antes de
  // saber quantas folhas existem.
  const instrumentos = Array.isArray(rel.equipamentos) ? rel.equipamentos : [];
  // 30 pt de cabeçalho (as duas linhas de nota) + 9 por instrumento + 6 de folga
  const hNotas = 30 + Math.max(1, instrumentos.length) * 9 + 6;
  // quem tem imagem de assinatura cadastrada precisa de um quadro mais alto
  const comImagem = (assinaturas || []).some((a) => a?.assinadoEm && a?.imagemUrl);
  const hAss = comImagem ? 118 : 54;
  const hImg = hAss - 52;
  const hAp = 52, hCom = 44;

  // ⚠⚠ TARJA DE RASCUNHO ATÉ TODOS ASSINAREM. Vitor (03/09/2026): "para os relatórios que forem
  // impressos sem ter a assinatura de todos deve sair com uma tarja de rascunho".
  //
  // O relatório é impresso e circula pela obra antes de fechar, e uma folha sem tarja é
  // indistinguível do documento final — alguém arquiva o rascunho achando que é o válido. A tarja
  // some sozinha quando a última assinatura entra.
  //
  // ⚠ "Todos" = todos os que FORAM CHAMADOS a assinar. Quem entrou só em cópia não vira linha de
  // assinatura (ver a rota de envio), então não segura a tarja para sempre.
  const assinou = (a) => !!a?.assinadoEm;
  const rascunho = !(Array.isArray(assinaturas) && assinaturas.length > 0 && assinaturas.every(assinou));
  const rev = rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null;
  // onde o corpo começa: topo da folha − cabeçalho (46) − as três linhas de identificação (3×16)
  const Y_CORPO = A4[1] - M - 46 - 48;
  // 24 pt no pé: a tarja laranja e a linha de rodapé
  const ROW_H = 17, CAB_H_CORPO = 18;
  // ⚠ PISO DE 200 pt. Uma lista de instrumentos muito longa poderia consumir a folha inteira e
  // deixar a conta negativa — e aí `MAX_LINHAS` viraria ≤ 0, o que trava `emPartes` num laço que
  // nunca avança. Melhor o quadro de notas transbordar a folha (defeito visível, como já era com a
  // altura fixa) do que a geração do PDF pendurar.
  const H_CORPO = Math.max(200, Y_CORPO - 24 - hAp - hCom - hNotas - hAss);
  const MAX_LINHAS = Math.max(1, Math.floor((H_CORPO - CAB_H_CORPO) / ROW_H));
  const emPartes = (arr, n) => {
    if (!arr.length) return [[]];
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  const grupos2 = grupos.map((g) => {
    const cotasG = g.linhas.filter((l) => l.letra);
    const linhasG = cotasG.length ? cotasG : g.linhas;
    return { ...g, cotasG, linhasG, partes: emPartes(linhasG, MAX_LINHAS) };
  });
  // ⚠⚠ OS DESENHOS SÃO RESOLVIDOS ANTES DE NUMERAR AS FOLHAS. Cada grupo com desenho ganha uma
  // folha anexa, então "FOLHA n DE N" — que é impresso já na primeira folha — só fecha depois de
  // saber quais desenhos realmente abriram. Baixar aqui também garante UMA leitura por grupo,
  // reaproveitada em todas as folhas dele.
  for (const g of grupos2) {
    g.emb = null;
    if (!g.desenho || typeof desenhoBytes !== "function") continue;
    const bruto = await desenhoBytes(g.desenho);
    let bytesDesenho = bruto;
    if (bruto) {
      // ⚠ RECORTE MANUAL VALE POR CIMA DO AUTOMÁTICO — mesma caixa que a marcação de cota usa
      // (rota /vetor), para o relatório impresso nunca mostrar um pedaço diferente do que a pessoa
      // marcou na tela.
      const vista = await recortarVista(bruto, { caixaManual: g.desenho?.recorte || null }).catch(() => null);
      if (vista?.bytes) bytesDesenho = vista.bytes;
    }
    if (bytesDesenho) { try { [g.emb] = await pdf.embedPdf(bytesDesenho, [0]); } catch { g.emb = null; } }
  }
  const totalPaginas = grupos2.reduce((s, g) => s + g.partes.length + (g.emb ? 1 : 0), 0);

  let paginaAtual = 0;
  for (let gi = 0; gi < grupos2.length; gi++) {
    const g = grupos2[gi];
    const embGrupo = g.emb;

  for (let sp = 0; sp < g.partes.length; sp++) {
    paginaAtual++;
    const parte = g.partes[sp];
    const page = pdf.addPage(A4);
    const marca = g.desenho?.marca || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : "");
    let y = A4[1] - M;

    const caixa = (x, yTopo, larg, alt, fundo = null) => {
      if (fundo) page.drawRectangle({ x, y: yTopo - alt, width: larg, height: alt, color: fundo });
      page.drawRectangle({ x, y: yTopo - alt, width: larg, height: alt, borderColor: LINE, borderWidth: 0.7 });
    };
    const rotulo = (x, yy, t) => page.drawText(san(t), { x, y: yy, size: 6.2, font: bold, color: GRAY });
    /**
     * Escreve o valor de um campo do cabeçalho.
     *
     * ⚠ ENCOLHE ANTES DE CORTAR. Vitor (21/08/2026): "aqui está estourando também" — a referência
     * do cliente pode trazer várias ("TPR763 / TPR803 / TPR804") e saía "TPR763 / TPR803 / T...".
     * Reticência num campo de identificação é pior que letra pequena: quem lê não sabe se falta
     * uma referência ou dez. Diminui até 6 pt e só corta se ainda assim não couber.
     */
    const valor = (x, yy, t, larg, tam = 8.5) => {
      const txt = san(t);
      let usar = tam;
      while (usar > 6 && bold.widthOfTextAtSize(txt, usar) > larg) usar = +(usar - 0.25).toFixed(2);
      page.drawText(fit(txt, bold, usar, larg), { x, y: yy, size: usar, font: bold, color: DARK });
    };

    // ── cabeçalho ──
    const hCab = 46;
    caixa(M, y, W, hCab);
    if (logo) { const lw = 62, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M + 8, y: y - hCab / 2 - lh / 2, width: lw, height: lh }); }
    // ⚠ o título sai do TIPO. Vitor (03/09/2026): "para o relatório de pré-montagem o nome está
    // saindo como de dimensional" — estava escrito à mão aqui, e a pré-montagem usa este mesmo
    // formulário. Ver lib/qualidade-campo (TITULO_DOCUMENTO).
    page.drawText(san(tituloDocumento(rel.tipo)), { x: M + 82, y: y - 20, size: 11, font: bold, color: NAVY });
    page.drawText("Torg Metal · Sistema de Gestão da Qualidade · ISO 9001", { x: M + 82, y: y - 33, size: 7, font, color: GRAY });

    // bloco DATA / Nº / FOLHA, à direita
    const xDir = M + W - 130;
    page.drawLine({ start: { x: xDir, y }, end: { x: xDir, y: y - hCab }, thickness: 0.7, color: LINE });
    // ⚠ a revisão sai junto do número: relatório reinspecionado que não a diga é indistinguível do
    // que reprovou — e os dois existem, porque o anterior fica guardado como evidência do retrabalho
    // (`rev` é medido no topo da função, junto da tarja de rascunho)
    const infos = [["DATA:", dataBR(rel.emitidoEm || new Date())], ["Nº:", rev ? `${rel.codigo}  ${rev}` : rel.codigo], ["FOLHA:", `${paginaAtual} DE ${totalPaginas}`]];
    infos.forEach(([r, v], i) => {
      const yy = y - 13 - i * 13;
      page.drawText(r, { x: xDir + 7, y: yy, size: 6.8, font: bold, color: GRAY });
      page.drawText(fit(v, bold, 8, 78), { x: xDir + 45, y: yy, size: 8, font: bold, color: DARK });
    });
    y -= hCab;

    // ── identificação ──
    const linhaInfo = (campos, alt = 16) => {
      caixa(M, y, W, alt, SOFT);
      let x = M;
      campos.forEach(([r, v, frac], i) => {
        const larg = W * frac;
        if (i > 0) page.drawLine({ start: { x, y }, end: { x, y: y - alt }, thickness: 0.7, color: LINE });
        page.drawText(san(r), { x: x + 7, y: y - 11, size: 6.4, font: bold, color: GRAY });
        const dx = bold.widthOfTextAtSize(san(r), 6.4) + 12;
        valor(x + dx, y - 11, nz(v), larg - dx - 8, 8);
        x += larg;
      });
      y -= alt;
    };
    // ── O QUE FOI DEFINIDO NA ABERTURA DA OP ─────────────────────────────────────────────────
    //
    // Vitor (21/08/2026): "descrever todas as informações que criamos na abertura da OP: nome do
    // cliente, obra, referência do cliente".
    //
    // O campo trazia "OP-089 - TERMASA", que mistura o número da OP com o nome do cliente e não diz
    // qual é a obra. São três coisas diferentes, e cada uma tem dono: a OP é nossa, a obra é do
    // contrato, e a REFERÊNCIA é o código que o cliente usa internamente — sem ela o documento
    // chega lá e ninguém sabe a que projeto pertence.
    linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
    // ⚠ a largura das três colunas sai do CONTEÚDO, não é fixa. A obra costuma ser longa e a
    // referência curta, mas há obra com nome de duas palavras e cliente que manda três referências
    // — repartir em partes iguais garante que uma das duas sempre estoure.
    {
      const campos = [["OP:", `OP-${rel.opNumero}`], ["OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]];
      const custo = campos.map(([r, v]) =>
        bold.widthOfTextAtSize(san(r), 6.4) + bold.widthOfTextAtSize(san(v), 8) + 20);
      const total = custo.reduce((a, b) => a + b, 0) || 1;
      // piso de 18%: campo espremido demais fica ilegível mesmo cabendo
      const bruto = custo.map((c) => Math.max(0.18, c / total));
      const soma = bruto.reduce((a, b) => a + b, 0);
      linhaInfo(campos.map(([r, v], i) => [r, v, bruto[i] / soma]));
    }
    const primeira = g.linhas[0] || {};
    linhaInfo([
      // ⚠ AQUI VAI A DESCRIÇÃO, NÃO O NÚMERO. Vitor (21/08/2026): "aqui você ainda traz o número da
      // peça, tem que ser a descrição dela". Faz sentido: o número já está no campo ao lado
      // ("Nº DESENHO"), e repetido duas vezes ele ocupa o lugar da única informação que dizia o que
      // a peça É. Sem descrição cadastrada, cai na marca — melhor que campo vazio.
      ["IDENTIFICAÇÃO DA PEÇA:", rel.resultados?.tiposPeca?.[String(marca).toUpperCase()] || marca, 0.4],
      // ⚠ SÓ O NÚMERO DO DESENHO. Vitor (21/08/2026): "nesse caso só será necessário o número do
      // desenho". O arquivo no servidor costuma carregar o histórico no nome ("T89A1 - RASTREADO
      // 19-08 10-07.pdf") e isso estourava o campo, saindo cortado com reticências. O número é o que
      // vem antes do primeiro travessão.
      ["Nº DESENHO:", (g.desenho?.nome?.replace(/\.pdf$/i, "").split(/\s+-\s+/)[0] || marca || "").trim(), 0.35],
      // ⚠ A QUANTIDADE VEM DA LISTA DA ENGENHARIA, não da linha da tabela. Vitor: "falta informar a
      // quantidade". Antes lia `qtd` da primeira linha — que servia quando as linhas vinham da lista
      // de materiais e traziam a quantidade de cada peça do conjunto. Hoje a linha é uma COTA, e
      // cota não tem quantidade: o campo saía sempre vazio. O que vale é quantas peças daquela
      // marca a OP tem, gravado na criação.
      ["QUANT.:", (() => {
        const q = rel.resultados?.qtdPeca?.[String(marca).toUpperCase()] ?? primeira.qtd;
        return q != null ? String(q) : "";
      })(), 0.25],
    ]);

    // ── corpo: tabela à esquerda, desenho à direita ──
    const hCorpo = H_CORPO;
    // ⚠⚠ A TABELA CEDE LARGURA PARA O DESENHO (era 0,46). Numa folha retrato, um diagrama de
    // montagem é LARGO: quem limita o tamanho dele é a largura da caixa, não a altura — então
    // esticar só a altura (acima) quase não ajudaria. O que a tabela mostra é curto ("Cota A",
    // "1250", "± 3", "1248") e cabe bem em 0,34; o cabeçalho das colunas encolhe sozinho.
    const wTab = W * 0.34;
    const wDes = W - wTab;
    const yCorpo = y;

    // cabeçalho das colunas
    const cabH = 18;
    caixa(M, yCorpo, wTab, cabH, SOFT);
    // ⚠ a coluna de projeto leva o texto INTEIRO ("Furos Ø18 na alma (2) — posição") e o valor;
    // com um terço da tabela ela cortava a descrição e a linha deixava de dizer o que medir.
    const cols = [
      { t: "Dimensão de Projeto", w: wTab * 0.52 },
      { t: "Tolerâncias", w: wTab * 0.18 },
      { t: "Dimensão Encontrada", w: wTab * 0.30 },
    ];
    let cx = M;
    cols.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x: cx, y: yCorpo }, end: { x: cx, y: yCorpo - hCorpo }, thickness: 0.7, color: LINE });
      // ⚠ ENCOLHE ANTES DE CORTAR, como nos campos do cabeçalho. "Dimensão Encontrada" já não cabia
      // inteiro na coluna e saía "Dimensão Encontr..."; com a tabela mais estreita (o desenho ganhou
      // a largura) cortaria mais ainda. Título de coluna truncado é pior que título miúdo — quem lê
      // não sabe se a coluna é a encontrada ou a esperada.
      let tam = 6.6;
      while (tam > 4.8 && bold.widthOfTextAtSize(san(c.t), tam) > c.w - 6) tam = +(tam - 0.1).toFixed(2);
      const t = fit(c.t, bold, tam, c.w - 6);
      page.drawText(t, { x: cx + (c.w - bold.widthOfTextAtSize(t, tam)) / 2, y: yCorpo - 12, size: tam, font: bold, color: GRAY });
      cx += c.w;
    });
    caixa(M, yCorpo, wTab, hCorpo);

    // ⚠ COTA GANHA DA LISTA. Marcada uma cota no desenho, a tabela é só dela — é o modelo do
    // Vitor ("cota simples, referenciamos como A B C"). Conviver com as linhas da lista de
    // materiais era a poluição que ele pediu para tirar. `g.cotasG`/`g.linhasG` já vêm prontas do
    // grupo (calculadas uma vez, lá em cima); `parte` é só o pedaço desta folha.
    const rowH = ROW_H;
    const maxLinhas = MAX_LINHAS;
    let ly = yCorpo - cabH;
    for (let i = 0; i < maxLinhas; i++) {
      const l = parte[i];
      page.drawLine({ start: { x: M, y: ly - rowH }, end: { x: M + wTab, y: ly - rowH }, thickness: 0.35, color: rgb(0.88, 0.90, 0.92) });
      if (l) {
        let x = M;
        // projeto: "W310X21 · 1034"
        // valor à direita da célula, descrição à esquerda: assim a descrição usa todo o espaço que
        // sobra e o número fica alinhado com os das outras linhas
        const val = l.projetoMm != null ? String(l.projetoMm) : "";
        const wVal = val ? bold.widthOfTextAtSize(val, 7.5) + 8 : 0;
        page.drawText(fit(l.descricao || l.marca || "", font, 7.5, cols[0].w - 10 - wVal), { x: x + 5, y: ly - 12, size: 7.5, font, color: DARK });
        if (val) page.drawText(val, { x: x + cols[0].w - 5 - bold.widthOfTextAtSize(val, 7.5), y: ly - 12, size: 7.5, font: bold, color: DARK });
        x += cols[0].w;
        // ⚠ centralizada, a pedido do Vitor: a coluna é estreita e o valor é curto ("± 3"); encostado
        // à esquerda ele ficava solto, longe da linha a que pertence.
        const tol = fit(l.tolerancia || "", font, 7.5, cols[1].w - 8);
        if (tol) {
          page.drawText(tol, {
            x: x + (cols[1].w - font.widthOfTextAtSize(tol, 7.5)) / 2,
            y: ly - 12, size: 7.5, font, color: GRAY,
          });
        }
        x += cols[1].w;
        // ⚠ vazio quando ninguém mediu
        if (l.encontradoMm != null) {
          const dif = l.projetoMm != null ? Number(l.encontradoMm) - Number(l.projetoMm) : null;
          page.drawText(String(l.encontradoMm), { x: x + 5, y: ly - 12, size: 7.5, font: bold, color: DARK });
          if (dif) {
            const t = `${dif > 0 ? "+" : ""}${Math.round(dif * 10) / 10}`;
            page.drawText(t, { x: x + cols[2].w - 8 - font.widthOfTextAtSize(t, 6.5), y: ly - 12, size: 6.5, font: bold, color: Math.abs(dif) > 3 ? RED : ORANGE });
          }
        }
      }
      ly -= rowH;
    }

    // campo do croqui / desenho
    caixa(M + wTab, yCorpo, wDes, hCorpo);
    page.drawRectangle({ x: M + wTab, y: yCorpo - cabH, width: wDes, height: cabH, color: SOFT });
    page.drawRectangle({ x: M + wTab, y: yCorpo - cabH, width: wDes, height: cabH, borderColor: LINE, borderWidth: 0.7 });
    // Vitor: "aqui sempre escrever conjunto". O campo deixou de receber foto quando o dimensional
    // passou a ser montado do projeto — o que entra ali é sempre a vista do conjunto.
    const tCro = "CONJUNTO";
    page.drawText(tCro, { x: M + wTab + (wDes - bold.widthOfTextAtSize(tCro, 6.6)) / 2, y: yCorpo - 12, size: 6.6, font: bold, color: GRAY });

    // ⚠ `embGrupo` já foi baixado e recortado uma vez, antes do laço de folhas deste grupo — a
    // mesma imagem se repete em cada folha, sem baixar nem recortar de novo.
    if (embGrupo) {
      desenharVista(page, embGrupo, g.cotasG, {
        x: M + wTab + 4, y: yCorpo - hCorpo + 4, w: wDes - 8, h: hCorpo - cabH - 8,
      });
    }
    y = yCorpo - hCorpo;

    // ── aprovações ──
    const marcar = (x, yy, ligado, cor) => {
      page.drawRectangle({ x, y: yy - 6.5, width: 7, height: 7, borderColor: ligado ? cor : LINE, borderWidth: ligado ? 1.1 : 0.7, color: ligado ? cor : undefined });
      if (ligado) {
        page.drawLine({ start: { x: x + 1.6, y: yy - 3 }, end: { x: x + 3, y: yy - 5 }, thickness: 1.1, color: WHITE });
        page.drawLine({ start: { x: x + 3, y: yy - 5 }, end: { x: x + 5.6, y: yy - 0.6 }, thickness: 1.1, color: WHITE });
      }
    };
    caixa(M, y, W, hAp);
    const wAp = W * 0.62;
    page.drawLine({ start: { x: M + wAp, y }, end: { x: M + wAp, y: y - hAp }, thickness: 0.7, color: LINE });
    [["DIMENSIONAL:", res.dimensional], ["ALINHAMENTO:", res.alinhamento], ["ACABAMENTO:", res.acabamento]].forEach(([rot, v], i) => {
      const yy = y - 15 - i * 14;
      page.drawText(rot, { x: M + 8, y: yy - 6, size: 7, font: bold, color: DARK });
      marcar(M + 92, yy, v === "APROVADO", GREEN);
      page.drawText("APROVADO", { x: M + 103, y: yy - 6, size: 7, font, color: DARK });
      marcar(M + 165, yy, v === "REPROVADO", RED);
      page.drawText("REPROVADO", { x: M + 176, y: yy - 6, size: 7, font, color: DARK });
    });
    page.drawText("RESULTADO:", { x: M + wAp + 8, y: y - 15, size: 7, font: bold, color: DARK });
    ["Retrabalhar", "Aprovado", "Reprovado"].forEach((op, i) => {
      const yy = y - 15 - i * 13;
      const on = String(res.resultado || "").toUpperCase() === op.toUpperCase();
      marcar(M + wAp + 74, yy, on, op === "Reprovado" ? RED : op === "Aprovado" ? GREEN : ORANGE);
      page.drawText(op, { x: M + wAp + 85, y: yy - 6, size: 7, font: on ? bold : font, color: DARK });
    });
    y -= hAp;

    // ── comentários ──
    caixa(M, y, W, hCom);
    rotulo(M + 7, y - 10, "COMENTÁRIOS:");
    let cyy = y - 21;
    for (const ln of quebrar(rel.observacoes || "", font, 7.5, W - 16).slice(0, 3)) {
      page.drawText(ln, { x: M + 7, y: cyy, size: 7.5, font, color: DARK });
      cyy -= 10;
    }
    y -= hCom;

    // ── notas: tolerância + instrumentos ── (`instrumentos`/`hNotas` medidos no topo da função)
    caixa(M, y, W, hNotas);
    page.drawText(san(`*Tolerâncias conforme ${res.tolerancia || "PO-04 Tolerâncias de Fabricação"}`), { x: M + 7, y: y - 11, size: 6.6, font, color: GRAY });
    page.drawText("*Equipamentos utilizados:", { x: M + 7, y: y - 21, size: 6.6, font: bold, color: GRAY });
    let iyy = y - 30;
    if (instrumentos.length) {
      for (const e of instrumentos) {
        const txt = `${e.nome}: certificado de calibração nº ${e.certificado || "—"}${e.validade ? ` (validade ${String(e.validade).split("-").reverse().join("/")})` : ""}`;
        page.drawText(fit(txt, font, 6.6, W - 20), { x: M + 12, y: iyy, size: 6.6, font, color: e.vencido ? RED : DARK });
        if (e.vencido) page.drawText("VENCIDO", { x: M + W - 8 - bold.widthOfTextAtSize("VENCIDO", 6.6), y: iyy, size: 6.6, font: bold, color: RED });
        iyy -= 9;
      }
    } else {
      // ⚠ o quadro fica vazio; dizer "nenhum instrumento informado" é a Torg declarando, no
      // documento que o cliente lê, que fez o ensaio sem registrar o instrumento.
      page.drawText("—", { x: M + 12, y: iyy, size: 6.6, font, color: GRAY });
    }
    y -= hNotas;

    // ── assinaturas: os três papéis do formulário ──
    // ⚠ mesma regra do formulário (lib/relatorio-form-pdf): quem tem imagem de assinatura
    // cadastrada sai com ela desenhada no campo; quem não tem sai com nome e data.
    // (`comImagem`/`hAss`/`hImg` medidos no topo da função — o corpo depende deles)
    caixa(M, y, W, hAss);
    const papeis = ["Inspetor Torg Metal", "Fiscalização Torg Metal", "Inspetor Cliente"];
    const wA = W / 3;
    const escrever = (txt, xCol, yTxt, fnt, size, color) => {
      const t = String(txt ?? "");
      const px = comImagem ? xCol + (wA - fnt.widthOfTextAtSize(t, size)) / 2 : xCol + 8;
      page.drawText(t, { x: px, y: yTxt, size, font: fnt, color });
    };
    for (const [i, p] of papeis.entries()) {
      const x = M + i * wA;
      if (i > 0) page.drawLine({ start: { x, y }, end: { x, y: y - hAss }, thickness: 0.7, color: LINE });
      page.drawText(`${p}:`, { x: x + 8, y: y - 12, size: 6.8, font: bold, color: GRAY });
      // ⚠ casa pelo PAPEL INTEIRO, normalizado. Com a primeira palavra, "Inspetor Torg Metal" e
      // "Inspetor Cliente" casavam os dois com o mesmo assinante — e o documento saía dizendo que
      // o cliente assinou quando quem assinou foi a Torg.
      const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, " ").trim();
      const alvoP = norm(p);
      const a = (assinaturas || []).find((s) => {
        const st = norm(s.setor);
        return st === alvoP || (st && (alvoP.includes(st) || st.includes(alvoP)));
      });
      if (a?.assinadoEm) {
        const img = await imagemAssinada(pdf, a);
        if (img) {
          // ocupa o campo e fica no centro — mesma regra do formulário (lib/relatorio-form-pdf)
          const esc = Math.min((wA - 14) / img.width, hImg / img.height);
          const lg = img.width * esc, al = img.height * esc;
          page.drawImage(img, { x: x + (wA - lg) / 2, y: y - 16 - (hImg - al) / 2 - al, width: lg, height: al });
        }
        const yNome = comImagem ? y - hAss + 24 : y - 26;
        escrever(fit(a.nome, bold, 8, wA - 18), x, yNome, bold, 8, DARK);
        const d = new Date(a.assinadoEm);
        escrever(san(`assinado eletronicamente em ${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`), x, yNome - 10, font, 5.8, GREEN);
        if (a.ip) escrever(san(`IP ${a.ip}`), x, yNome - 18, font, 5.8, GRAY);
      } else {
        const yLinha = comImagem ? y - hAss + 34 : y - 34;
        page.drawLine({ start: { x: x + 8, y: yLinha }, end: { x: x + wA - 10, y: yLinha }, thickness: 0.5, color: LINE });
        escrever("Controle de Qualidade", x, yLinha - 10, font, 6.4, GRAY);
      }
    }
    y -= hAss;

    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: 3, color: ORANGE });
    // ⚠ A REVISÃO VAI NO RODAPÉ TAMBÉM. Vitor (03/09/2026): "no caso de revisões deve ser informado
    // no número do rodapé do relatório". Ela já saía no quadro "Nº:", mas é o rodapé que fica à
    // vista quando a folha está numa prancheta ou grampeada no meio de outras.
    page.drawText(san(`${rel.codigo}${rev ? ` ${rev}` : ""} · OP-${rel.opNumero} · folha ${paginaAtual} de ${totalPaginas}`), { x: M, y: 10, size: 6.2, font, color: GRAY });
    const av = rascunho
      ? "RASCUNHO — documento sem todas as assinaturas."
      : "Registro eletrônico — confirmação, data/hora e IP registrados no portal.";
    page.drawText(san(av), { x: A4[0] - M - font.widthOfTextAtSize(san(av), 6.2), y: 10, size: 6.2, font, color: rascunho ? RED : GRAY });

  }

  // ── FOLHA ANEXA: A VISTA COTADA, GRANDE, EM PAISAGEM ─────────────────────────────────────────
  //
  // Vitor (03/09/2026): "a leitura no papel está ruim ainda, quer criar um campo novo para ficar
  // melhor dimensionado a representação do projeto?".
  //
  // ⚠ NÃO SUBSTITUI O CAMPO CONJUNTO do formulário — soma-se a ele. O formulário é documento do
  // SGQ e mantém a cara aprovada; o campo lá continua servindo de referência ao lado da tabela.
  // Esta folha existe para uma coisa só: conferir a medida no papel, com o desenho legível.
  //
  // ⚠ A FAIXA DE COTAS NO PÉ repete os valores da tabela de propósito. Sem ela a folha mostra as
  // letras A/B/C e obriga a voltar ao formulário para saber o que cada uma vale — o inspetor está
  // com a peça na frente, não com o relatório inteiro na mão.
  if (embGrupo) {
    paginaAtual++;
    const pg = pdf.addPage(A4_L);
    const WL = A4_L[0] - 2 * M;
    const marcaL = g.desenho?.marca || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : "");

    // cabeçalho enxuto: identifica a folha sem roubar altura do desenho
    const hTopo = 24;
    const yTopo = A4_L[1] - M;
    pg.drawRectangle({ x: M, y: yTopo - hTopo, width: WL, height: hTopo, color: SOFT });
    pg.drawRectangle({ x: M, y: yTopo - hTopo, width: WL, height: hTopo, borderColor: LINE, borderWidth: 0.7 });
    pg.drawText("VISTA COTADA", { x: M + 8, y: yTopo - 16, size: 8.5, font: bold, color: NAVY });
    const idL = san(`${rel.codigo} · OP-${rel.opNumero}${marcaL ? ` · ${marcaL}` : ""}`);
    pg.drawText(idL, { x: M + 92, y: yTopo - 16, size: 7.5, font, color: DARK });
    const folhaL = san(`FOLHA ${paginaAtual} DE ${totalPaginas}`);
    pg.drawText(folhaL, { x: M + WL - 8 - bold.widthOfTextAtSize(folhaL, 7.5), y: yTopo - 16, size: 7.5, font: bold, color: GRAY });

    // faixa das cotas, no pé — 3 linhas × 5 colunas cobrem 15 cotas
    const hFaixa = 40, yFaixa = 24 + hFaixa;
    pg.drawRectangle({ x: M, y: 24, width: WL, height: hFaixa, borderColor: LINE, borderWidth: 0.7 });
    const cotasL = g.cotasG.filter((c) => c.letra);
    if (cotasL.length) {
      const COLS = 5, LINHAS_FAIXA = 3, colW = (WL - 16) / COLS;
      const cabem = COLS * LINHAS_FAIXA;
      cotasL.slice(0, cabem).forEach((c, i) => {
        const cxx = M + 8 + (i % COLS) * colW;
        const cyy = yFaixa - 13 - Math.floor(i / COLS) * 11;
        pg.drawText(String(c.letra), { x: cxx, y: cyy, size: 8, font: bold, color: ORANGE });
        const proj = c.projetoMm != null ? String(c.projetoMm) : "—";
        const enc = c.encontradoMm != null ? String(c.encontradoMm) : "—";
        const txt = san(`${proj}${c.tolerancia ? ` ${c.tolerancia}` : ""}  →  ${enc}`);
        pg.drawText(fit(txt, font, 7.5, colW - 20), { x: cxx + 12, y: cyy, size: 7.5, font, color: DARK });
      });
      if (cotasL.length > cabem) {
        const resto = san(`+${cotasL.length - cabem} cota(s) — ver a tabela do formulário`);
        pg.drawText(resto, { x: M + WL - 8 - font.widthOfTextAtSize(resto, 6.4), y: 30, size: 6.4, font, color: ORANGE });
      }
    } else {
      pg.drawText("Nenhuma cota marcada neste desenho.", { x: M + 8, y: yFaixa - 15, size: 7, font, color: GRAY });
    }

    // ⚠ o desenho fica com TODO o resto da folha — é o motivo desta página existir. Letra da cota
    // maior (12 em vez de 8): num desenho grande a letra de 8 pt vira um respingo.
    const yDes = yFaixa + 6;
    pg.drawRectangle({ x: M, y: yDes, width: WL, height: (yTopo - hTopo) - yDes, borderColor: LINE, borderWidth: 0.7 });
    desenharVista(pg, embGrupo, g.cotasG, {
      x: M + 4, y: yDes + 4, w: WL - 8, h: (yTopo - hTopo) - yDes - 8,
    }, 12);

    pg.drawRectangle({ x: 0, y: 0, width: A4_L[0], height: 3, color: ORANGE });
    pg.drawText(san(`${rel.codigo}${rev ? ` ${rev}` : ""} · OP-${rel.opNumero} · folha ${paginaAtual} de ${totalPaginas} · anexo da vista cotada`), { x: M, y: 10, size: 6.2, font, color: GRAY });

  }
  }

  // ── PÁGINA DE FOTOS, SÓ SE HOUVER ────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "no caso do relatório de dimensional e visual de solda não precisa
  // obrigatoriamente de imagens, mas no caso de uma necessidade pode ser incluído, e você cria uma
  // nova página no mesmo formato".
  //
  // ⚠ Reusa a folha do EVS de propósito — é literalmente o mesmo formato, e duas implementações da
  // mesma página divergiriam na primeira correção.
  if (Array.isArray(fotos) && fotos.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    // ⚠ o dimensional monta o documento com `pdf` direto, não com o objeto de `abrirDocumento`;
    // a folha de fotos precisa do mesmo formato, então recebe o embrulho equivalente.
    // ⚠ na pré-montagem a folha de fotos tem nome próprio no modelo ("REGISTRO FOTOGRÁFICO -
    // PRÉ-MONTAGEM", com seis molduras). O resto do relatório é o mesmo do dimensional.
    await paginaDeFotos({ pdf, font, bold, logo }, rel, fotos, {
      cliente, obra, assinaturas, paginas: totalPaginas,
      titulo: rel.tipo === "PRE_MONTAGEM" ? "REGISTRO FOTOGRÁFICO - PRÉ-MONTAGEM" : null,
    });
  }

  // ── TARJA DE RASCUNHO, POR ÚLTIMO E EM TODAS AS FOLHAS ───────────────────────────────────────
  //
  // Vitor (03/09/2026): "para os relatórios que forem impressos sem ter a assinatura de todos deve
  // sair com uma tarja de rascunho".
  //
  // O relatório é impresso e circula pela obra antes de fechar, e uma folha sem tarja é
  // indistinguível do documento final — alguém arquiva o rascunho achando que é o válido. Some
  // sozinha quando a última assinatura entra.
  //
  // ⚠ AQUI NO FIM, sobre `pdf.getPages()`: pega formulário, anexo E folha de fotos de uma vez, sem
  // repetir a chamada em cada lugar que cria página (a de fotos vive noutro módulo, e seria
  // esquecida). E sendo o último desenho, fica POR CIMA de tudo.
  //
  // ⚠ "Todos" = todos os que FORAM CHAMADOS a assinar. Quem entrou só em cópia não vira linha de
  // assinatura (ver a rota de envio), então não segura a tarja para sempre.
  if (rascunho) {
    for (const pg of pdf.getPages()) {
      const { width: pw, height: ph } = pg.getSize();
      const txt = "RASCUNHO";
      // ⚠ Vitor (03/09/2026): "não precisa ser uma marca d'água tão grande assim". Estava em 0,17
      // da folha (~100 pt) e a palavra atravessava a página inteira, disputando com o desenho.
      // Basta ser inconfundível de longe — não precisa cobrir o documento.
      const tam = Math.min(pw, ph) * 0.075;
      // ⚠ centralizada A PARTIR DO TEXTO GIRADO: como a tarja sai inclinada, o canto de início não
      // é o canto do bloco. Medindo a largura real e projetando no ângulo, ela fica no meio tanto
      // na folha retrato quanto na anexa em paisagem — sem número mágico por formato.
      const ang = (34 * Math.PI) / 180;
      const larguraTexto = bold.widthOfTextAtSize(txt, tam);
      pg.drawText(txt, {
        x: (pw - larguraTexto * Math.cos(ang)) / 2,
        y: (ph - larguraTexto * Math.sin(ang)) / 2,
        // ⚠ opacidade baixa: quem imprime o rascunho está justamente conferindo medida nele.
        size: tam, font: bold, color: rgb(0.85, 0.24, 0.24), opacity: 0.15,
        rotate: degrees(34),
      });
    }
  }

  return pdf.save();
}
