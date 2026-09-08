import "server-only";

// Casa o PERFIL da peça (linguagem da Engenharia: "CH4.80X140", "U200X25X2.65", "W250X32.7",
// "TBØ42.40X2.65") com o ITEM DA RM — que é o cadastro do OMIE (código + descrição oficial).
// Vitor 18/08: o romaneio de material do terceiro precisa sair com a descrição e o CÓDIGO do
// Omie, não com o perfil interno. Regras por TIPO (casar número por número dá falso positivo:
// "TB 1/2" casava com "CURVA 1.1/2"):
//   • CHAPA  → casa só a ESPESSURA (a largura do perfil é o corte da peça, não a chapa comprada);
//   • U/UDC  → casa as 3 medidas (alma × aba × parede);
//   • W/H    → casa a bitola (W250) e, se houver, o peso linear (32,7);
//   • TUBO   → casa a POLEGADA quando existir, senão diâmetro × parede;
//   • L      → casa aba × espessura.
// Sem match seguro devolve null (melhor sem código do que com o código errado).

const norm = (s) => String(s ?? "").toUpperCase().replace(/,/g, ".").replace(/\s+/g, " ").trim();
const nums = (s) => (norm(s).match(/\d+(?:\.\d+)?/g) || []).map(Number);
// Polegadas do texto, normalizando "1 1/2" (Omie) e "1.1/2" (Engenharia) pra mesma forma.
const polegadas = (s) => (norm(s).replace(/(\d)\s+(\d+\/\d+)/g, "$1.$2").match(/(?:\d+\.)?\d+\/\d+/g) || []);
// Tubo em polegada ↔ diâmetro EXTERNO em mm (DIN 2440 / NBR 5580). O cadastro descreve o mesmo
// tubo ora por polegada ("Ø1 1/2\""), ora por diâmetro ("D. 48,30") — sem a tabela, 1.1/2" DIN2440
// (48,3) era confundido com o redondo estrutural 1.1/2" (38,1). (Vitor 18/08.)
const POL_MM = { "1/2": 21.3, "3/4": 26.9, "1": 33.7, "1.1/4": 42.2, "1.1/2": 48.3, "2": 60.3, "2.1/2": 76.1, "3": 88.9, "3.1/2": 101.6, "4": 114.3, "5": 141.3, "6": 168.3 };
/* ⚠⚠ BITOLAS QUE SÃO A MESMA CHAPA COM DOIS NOMES. Vitor (08/09/2026), sobre a CH5.00X90 da OP-094
   aparecendo como "sem material no CMR": "pode considerar a 4,75 no caso dessa chapa".

   4,75 mm é a 3/16" — e a lista às vezes arredonda para 5,00. A diferença é de 5%, acima da
   tolerância de 3% que separa bitolas de verdade (4,75 de 4,50, por exemplo), então o casamento
   falhava e o portal dizia que o material nunca entrou.

   ⚠ TABELA, NÃO TOLERÂNCIA MAIOR. Afrouxar os 3% faria 4,75 casar com 4,50 e 6,35 com 6,00 — aí o
   Data Book passaria a apontar o fardo errado, que é pior que não apontar. Aqui são pares nomeados:
   duas grafias do MESMO material comercial, uma a uma, cada uma com quem decidiu.

   ⚠ Isto só amplia CANDIDATOS. Quem declara que a peça saiu daquele fardo continua sendo gente,
   gravando TrocaRastreabilidade — o portal propõe, não afirma [[torg_rastreio_corrida]]. */
const MESMA_BITOLA = [
  [4.75, 5.00],   // 3/16" — Vitor, 08/09/2026 (OP-094, CH5.00X90)
];
const mesmaBitolaComercial = (a, b) =>
  MESMA_BITOLA.some((g) => g.some((x) => Math.abs(x - a) < 0.01) && g.some((x) => Math.abs(x - b) < 0.01));

/* ⚠⚠ LÁBIO DO U ENRIJECIDO: a lista escreve 20 onde a casa sempre comprou 25 — mas SÓ na 200x75.
   Medido no CMR inteiro (108 entradas UDCE, 08/09/2026): na seção 200x75 são 33 entradas e 30,5 t,
   das quais 31 (25,3 t) com lábio 25, em 2025 e 2026, nas OPs 036/038/047/060/064/092/112/113.
   Lábio 20 nessa seção NUNCA foi recebido, em ano nenhum. Já na 150x75 o 20 é real e recorrente
   (43,4 t em 7 entradas) e chega como 20 — ou seja, não é a lista que erra sempre, é esta seção.
   Vitor (08/09/2026): "pode considerar isso então e já corrige para podermos liberar".

   ⚠ PAR NOMEADO, POR SEÇÃO — não é afrouxar tolerância. Aceitar 20≈25 em qualquer perfil faria o
   Ue 200x100x20 casar no 200x100x30 e o Data Book apontar o fardo errado. Aqui é uma seção, um
   par, com quem decidiu.

   ⚠ A ESPESSURA CONTINUA DURA. O que se equivale é o lábio; 3,00 não vira 4,75 por causa disto. */
const LABIO_EQUIVALENTE = [
  { alma: 200, aba: 75, labios: [20, 25] }, // Vitor, 08/09/2026 (OPs 112 e 113)
];
const mesmoLabioComercial = (alma, aba, a, b) =>
  LABIO_EQUIVALENTE.some((g) => perto(alma, g.alma, 0.01) && perto(aba, g.aba, 0.01)
    && g.labios.some((x) => Math.abs(x - a) < 0.01) && g.labios.some((x) => Math.abs(x - b) < 0.01));

/* Medidas do U dobrado na ordem alma × aba × lábio × espessura (o enrijecido tem as quatro; o
   UDC simples, três). Ler por posição é o que permite tratar o lábio diferente das outras. */
const medidasU = (t) => {
  const m = norm(t).match(/\b(?:UDCE|UDC|UE|U)\s*(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)(?:\s*X\s*(\d+(?:\.\d+)?))?/);
  return m ? [m[1], m[2], m[3], m[4]].filter((x) => x != null).map(Number) : null;
};

const perto = (a, b, tol = 0.03) =>
  a > 0 && b > 0 && (Math.abs(a - b) / Math.max(a, b) <= tol || mesmaBitolaComercial(a, b));

// ⚠ CHAPA DESCRITA EM POLEGADA. Vitor (25/08/2026): "essas que não encontrou pode ser que esteja em
// polegada, por isso não encontrou". O CMR tem "CHAPA AÇO CARBONO 3/4 X200X425MM" — 3/4" = 19,05mm —
// e a LPC escreve CH19.05. Sem converter, a mesma chapa saía como material que nunca entrou.
const FRAC_MM = 25.4;
function fracaoParaMm(f) {
  const m = String(f).match(/^(?:(\d+)\.)?(\d+)\/(\d+)$/);
  if (!m) return null;
  const inteiro = m[1] ? Number(m[1]) : 0;
  const den = Number(m[3]);
  if (!den) return null;
  return (inteiro + Number(m[2]) / den) * FRAC_MM;
}

// tipo pelo PERFIL da peça
function tipoPerfil(pf) {
  const u = norm(pf);
  if (/^(CH|CHAPA)\b|^CH\d/.test(u)) return "CHAPA";
  if (/^(TB|TUBO)\b|^TB[ØO]?\d/.test(u)) return "TUBO";
  if (/^W\s*\d|^HP\s*\d/.test(u)) return "W"; // HP250X62 = perfil H (mesma família do W no cadastro)
  /* ⚠⚠ UE É O MESMO PERFIL QUE UDCE — e a letra que faltava aqui custou o rastreio de obra inteira.
     A Engenharia escreve `UE150X75X20X4.75` (U enrijecido); o fornecedor entrega e o CMR lança
     `PERFIL DOBRADO UDCE 150x75x20x4,75`. `^U\s*\d` exige dígito depois do U, então o "E" derrubava
     o tipo para null — sem tipo o casamento nem era TENTADO, e a peça saía "sem material no CMR"
     com o aço cortado e apontado. Vitor (08/09/2026): "já até fizemos as peças e você diz que não
     temos o material dessa OP, o que na verdade tem e você não reconheceu na CMR; isso está
     acontecendo na 113 também". Mesmo defeito de uma letra que já derrubou o BR do redondo. */
  if (/^UE?\s*\d|UDC/.test(u)) return "U";
  if (/^L\s*\d|CANTONEIRA/.test(u)) return "L";
  // ⚠ FC = FERRO CHATO da Engenharia ("FC2.1/2''X3/8''"). Achado em 04/09/2026 fechando o data book
  // da OP-085: sem o FC aqui o tipo saía null, o casamento nem era tentado, e a barra chata caía
  // como "sem material no CMR" com o R 281033 ("BARRA CHATA ... DN. 3/8 X 2.1/2POL") na prateleira.
  if (/BARRA\s*CHATA|^BC\s*\d|^FB\s*\d|^FC\s*\d|^FC\s*[\dØO]/.test(u)) return "CHATA";
  // FR = ferro redondo da Engenharia ("FRØ3/8\"", "FR 12"); BR/VG também aparecem.
  /* ⚠ O BR TAMBÉM VEM COM Ø. O FR já aceitava ("FRØ3/8\""), o BR não — e `BRØ1.1/2"` da OP-094 caía
     como tipo null, sem casamento nem candidato, com seis entradas da mesma bitola no CMR (OPs 059,
     064 e 052). Vitor (08/09/2026): "o BR 1/2 é ferro redondo, e com certeza tem". Assimetria de
     uma letra custou o rastreio da peça. */
  if (/REDOND/.test(u) || /^FR\s*[ØO]?\s*\d|^BR\s*[ØO]?\s*\d/.test(u)) return "REDONDO";
  return null;
}
// tipo pela DESCRIÇÃO do Omie
function tipoOmie(d) {
  const u = norm(d);
  if (/CURVA|JOELHO|LUVA|FLANGE|\bTE\b/.test(u)) return "CONEXAO"; // conexão nunca é tubo reto
  if (/CHAPA/.test(u)) return "CHAPA";
  // ⚠ CHAPA QUE O FORNECEDOR CHAMA DE "PERFIL". Achado em 04/09/2026 no CMR da OP-085: o R 260678
  // (4.880 kg) está lançado como "PERFIL DB FQ 9,50 X 6000 A36" — DB FQ é desbobinado de tira fina
  // a quente, ou seja, chapa. Sem reconhecer isso, 367 peças de CH9.50 da 085 saíam no data book
  // como "sem material no CMR" com o aço comprado, recebido e certificado.
  if (/\bDB\s*F[QF]\b|\bTIRA\s*(FINA|A\s*QUENTE)\b/.test(u)) return "CHAPA";
  if (/TUBO/.test(u)) return "TUBO";
  if (/PERFIL\s+[WH]|\bW\d{2,3}\b/.test(u)) return "W";
  if (/UDC|PERFIL\s+U/.test(u)) return "U";
  if (/CANTONEIRA/.test(u)) return "L";
  if (/BARRA\s+CHATA/.test(u)) return "CHATA";
  if (/BARRA\s+REDONDA|REDOND/.test(u)) return "REDONDO";
  return null;
}

// ⚠⚠ CHAPA LISA NÃO É CHAPA XADREZ. Achado em 02/09/2026 investigando por que as chapas de 3 e 8mm
// da OP-113 não liberavam: `CH3.00X43` (lisa) casou com "CHAPA AÇO CARBONO XADREZ COSIPISO II
// ESPESSURA 3,00MM" do CMR de outra obra e virou material "de estoque".
//
// A regra de chapa compara SÓ a espessura — de propósito, porque a largura do perfil é o corte da
// peça e não a chapa comprada. Só que xadrez e lisa têm a mesma espessura e são materiais
// diferentes: uma é piso antiderrapante, a outra é estrutural. Bastava o PCP informar o R para a
// peça ser liberada e alguém cortar estrutura em chapa de piso.
//
// A Engenharia escreve a diferença ("CHAPA XADREZ 3.00X710" vs "CH3.00X43") e o CMR também
// (XADREZ / COSIPISO / ANTIDERRAPANTE), então dá para exigir que os dois lados concordem.
const RX_XADREZ = /XADREZ|COSIPISO|ANTIDERRAP/;
const ehXadrez = (s) => RX_XADREZ.test(norm(s));

function pontua(tipo, perfil, item) {
  const nP = nums(perfil), nI = nums(item.descricao);
  const polP = polegadas(perfil), polI = polegadas(item.descricao);
  switch (tipo) {
    case "CHAPA": {
      // xadrez só casa com xadrez, lisa só com lisa — ver RX_XADREZ acima
      if (ehXadrez(perfil) !== ehXadrez(item.descricao)) return 0;
      // espessura = 1º número do perfil; a do Omie vem em "ESPESSURA 4,75MM"
      // ⚠ em "CHAPA XADREZ 3.00X710" o 1º número já é a espessura, igual à lisa — a palavra
      // XADREZ não traz número, então nP[0] continua valendo para os dois casos.
      const esp = nP[0];
      const espOmie = (norm(item.descricao).match(/ESPESSURA\s*(\d+(?:\.\d+)?)/) || [])[1];
      if (espOmie) return perto(esp, Number(espOmie)) ? 3 : 0;
      // Sem a palavra ESPESSURA o cadastro escreve a chapa como "CHAPA LQ A36 6,3x1500x3000":
      // o 1º número é a NORMA (A36), não a espessura — comparar com nI[0] nunca casava e a peça
      // saía como "sem material". Tira os códigos de norma/grau e procura a espessura entre os
      // números plausíveis (< 100 mm; 1500/3000 são as dimensões da chapa).
      const semGrau = norm(item.descricao)
        .replace(/\bASTM\b|\bSAE\b|\bLQ\b|\bLF\b/g, " ")
        .replace(/\bA\s*-?\s*\d{2,3}\b/g, " ")
        .replace(/\bGR\.?\s*\d+/g, " ")
        .replace(/\bNBR\s*\d+/g, " ");
      const cands = (semGrau.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0 && x < 100);
      if (cands.some((y) => perto(esp, y))) return 3;
      // ⚠ a espessura pode estar escrita em POLEGADA: "CHAPA AÇO CARBONO 3/4 X200X425MM".
      const emMm = polI.map(fracaoParaMm).filter((x) => x && x < 100);
      return emMm.some((y) => perto(esp, y)) ? 3 : 0;
    }
    case "U": {
      // Três formatos: UDCE enrijecido (150x75x20x4,75 — 4 medidas), UDC dobrado (200x25x2.65 — 3)
      // e U LAMINADO em polegada (U4"X7.95 ↔ "PERFIL U LAMINADO 4\" - 1 ALMA"), onde vale a
      // polegada + peso linear.
      //
      // ⚠ ENRIJECIDO SÓ CASA COM ENRIJECIDO. UDCE tem o lábio, UDC não — são seções diferentes com
      // as mesmas medidas de alma e aba. Mesma regra que já separa HP de W logo abaixo.
      // ⚠ sem \b depois de UDCE: no perfil da Engenharia a medida vem colada ("UDCE150X75...").
      const enrij = (t) => /UDCE|(?:^|\s)UE\s*\d|ENRIJ/.test(norm(t));
      if (enrij(perfil) !== enrij(item.descricao)) return 0;
      /* ⚠⚠ NO ENRIJECIDO A ESPESSURA ENTRA NA COMPARAÇÃO. Só as três primeiras medidas não
         distinguem `UE150X75X20X3.00` de `UE150X75X20X4.75`, e as duas bitolas convivem na MESMA
         obra (OP-112: 4 peças de 3,00 e 5 de 4,75, com só a de 4,75 no CMR). Casar pelo trio faria
         a de 3,00 apontar o fardo errado no Data Book — pior que não apontar. */
      const mP = medidasU(perfil), mI = medidasU(item.descricao);
      if (mP?.length === 4 && mI?.length === 4) {
        // alma, aba e espessura são duras; só o lábio consulta a tabela de equivalência
        if (!perto(mP[0], mI[0]) || !perto(mP[1], mI[1]) || !perto(mP[3], mI[3])) return 0;
        return perto(mP[2], mI[2]) || mesmoLabioComercial(mP[0], mP[1], mP[2], mI[2]) ? 4 : 0;
      }
      if (nP.length >= 4) return nP.slice(0, 4).every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
      const trio = nP.slice(0, 3);
      if (trio.length >= 3) return trio.every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
      const pol = nP[0]; // 4" / 8"
      if (!pol || !nI.some((y) => perto(pol, y, 0.01))) return 0;
      const peso = nP[1];
      return peso && nI.some((y) => perto(peso, y)) ? 4 : 3;
    }
    case "W": {
      // ⚠ HP250 ≠ W250: são seções diferentes com a MESMA bitola. O cadastro escreve "DN. W250 X
      // 32,7KG/M" e "DN. HP250 X 62,0KG/M" — sem exigir que os dois lados concordem no HP, o
      // perfil HP casava no W (ou nem casava, quando "HP" não era reconhecido). (Vitor 19/08.)
      const ehHpPerfil = /^HP\s*\d/.test(norm(perfil));
      const ehHpItem = /\bHP\s*\d/.test(norm(item.descricao));
      if (ehHpPerfil !== ehHpItem) return 0;
      const bit = nP[0]; // W250 / HP250
      if (!bit || !nI.some((y) => perto(bit, y, 0.01))) return 0;
      const peso = nP[1];
      return peso && nI.some((y) => perto(peso, y)) ? 4 : 2;
    }
    case "TUBO": {
      // BITOLA obrigatória + PAREDE desempatando. O perfil vem "TB 1.1/2\"X2.65 - DIN2440"; o
      // cadastro descreve o mesmo tubo por polegada OU por diâmetro (48,30). Sem casar a parede,
      // 1.1/2"×2,65 caía no 1.1/2"×2,00 estrutural ou no ×3,35. Pontua: bitola 2 + parede 2 +
      // norma 1 → exige pelo menos bitola+parede (ou bitola+norma) pra passar do corte (3).
      const normaP = (norm(perfil).match(/DIN\s*-?\s*\d{3,4}|SCH\s*\d+|NBR\s*\d+/) || [])[0];
      const semEspaco = (t) => norm(t).replace(/[\s.-]/g, "");
      const temNorma = normaP && semEspaco(item.descricao).includes(semEspaco(normaP));

      // bitola: polegada igual OU diâmetro em mm equivalente
      let bitolaOk = false;
      if (polP.length) {
        bitolaOk = polP.some((x) => polI.includes(x));
        if (!bitolaOk) {
          const mm = POL_MM[polP[0]];
          if (mm) bitolaOk = nI.some((y) => perto(mm, y, 0.02));
        }
      } else if (nP[0]) {
        bitolaOk = nI.some((y) => perto(nP[0], y));
      }
      if (!bitolaOk) return 0;

      // parede: tira as FRAÇÕES de polegada antes de ler os números — senão "1.1/2" vira [1.1, 2]
      // e o "2" era confundido com a parede (2,00 em vez de 2,65). Sobram só as medidas em mm.
      const semPol = (t) => norm(t).replace(/(\d)\s+(\d+\/\d+)/g, "$1.$2").replace(/(?:\d+\.)?\d+\/\d+/g, " ");
      const mmPerfil = (semPol(perfil).match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x < 1000);
      const mmItem = (semPol(item.descricao).match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x < 1000);
      const paredeP = mmPerfil.find((x) => x > 1 && x < 20);
      const paredeOk = paredeP ? mmItem.some((y) => perto(paredeP, y, 0.02)) : null;
      return 2 + (paredeOk === true ? 2 : 0) + (temNorma ? 1 : 0) - (paredeOk === false ? 1 : 0);
    }
    case "L": {
      // Cantoneira vem em POLEGADAS na Engenharia e no cadastro: L2.1/2''X3/16'' ↔
      // "CANTONEIRA ... DN. 3/16 X 2.1/2POL". Casa pelas frações (ordem não importa).
      if (polP.length >= 2) return polP.every((x) => polI.includes(x)) ? 4 : 0;
      const dois = nP.slice(0, 2);
      if (dois.length < 2) return 0;
      return dois.every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
    }
    case "CHATA": {
      if (polP.length >= 2) return polP.every((x) => polI.includes(x)) ? 4 : 0;
      const dois = nP.slice(0, 2);
      return dois.length >= 2 && dois.every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
    }
    case "REDONDO": {
      // ⚠⚠ 1" NÃO É 1/2". Achado em 04/09/2026 no data book da OP-085: `FRØ1"` não tem fração, caía
      // no ramo dos números crus e o "1" casava com o "1" de "D. 1/2POL" — a tela de perfil sem
      // material oferecia o R de uma barra de meia polegada como origem de uma barra de uma
      // polegada. Proposta errada é pior que nenhuma: quem confirma está assinando rastreabilidade.
      // Quando qualquer um dos lados fala em polegada, os DOIS têm de falar, e o valor tem de bater.
      const polDeTexto = (t) => {
        const u = norm(t).replace(/(\d)\s+(\d+\/\d+)/g, "$1.$2");
        const fracoes = (u.match(/(?:\d+\.)?\d+\/\d+/g) || []).map((f) => (fracaoParaMm(f) || 0) / FRAC_MM);
        // ⚠ tira as frações ANTES de procurar polegada inteira: em "5/8POL" o "8" colado no POL
        // virava "8 polegadas", e aí 3/8 casava com 5/8 pelo denominador.
        const semFracao = u.replace(/(?:\d+\.)?\d+\/\d+/g, " ");
        const inteiros = [...semFracao.matchAll(/(\d+(?:\.\d+)?)\s*(?:["']|POL)/g)]
          .map((m) => Number(m[1]))
          .filter((v) => Number.isFinite(v));
        return [...fracoes, ...inteiros].filter((v) => v > 0);
      };
      const emPol = (t) => /["']|POL(?![A-Z])/.test(norm(t));
      if (emPol(perfil) || emPol(item.descricao)) {
        if (!emPol(perfil) || !emPol(item.descricao)) return 0;
        const vP = polDeTexto(perfil), vI = polDeTexto(item.descricao);
        return vP.length && vI.length && vP.some((a) => vI.some((b) => perto(a, b, 0.01))) ? 4 : 0;
      }
      return nP[0] && nI.some((y) => perto(nP[0], y)) ? 3 : 0;
    }
    default:
      return 0;
  }
}

// ── A MESMA CHAPA ESCRITA DE TRÊS JEITOS ─────────────────────────────────────────────────────
//
// Vitor (28/08/2026), olhando a OP-106: "sobre as chapas de 6,40 que você fala, não seria o mesmo
// caso das chapas 6,3, 6,30 e 6,40, que são a mesma?". É a mesma: 1/4" = 6,35mm, e o cadastro
// escreve ora 6,30, ora 6.35, enquanto a Engenharia desenha CH6.40. A pontuação já aceita as três
// (tolerância de 3%), mas o rastreio usava só a MELHOR descrição — então a entrada gravada com a
// outra grafia ficava fora do FIFO, como se aquele aço não existisse.
//
// ⚠ TOLERÂNCIA NÃO É SINÔNIMO. Chapa xadrez, inox, expandida e galvanizada também têm 6,30mm e NÃO
// são a mesma chapa. Por isso a equivalência exige, além da espessura, que as duas descrições
// concordem em cada um desses qualificadores.
const QUALIF_CHAPA = [/XADREZ|COSIPISO|ANTIDERRAP/, /\bINOX\b|A-?240|\b30[46]\b/, /EXPANDID/, /GALVANIZ|ZINCAD/, /PERFURAD/];

const espessuraDe = (descricao) => {
  const m = norm(descricao).match(/ESPESSURA\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  const semGrau = norm(descricao)
    .replace(/\bASTM\b|\bSAE\b|\bLQ\b|\bLF\b/g, " ")
    .replace(/\bA\s*-?\s*\d{2,3}\b/g, " ")
    .replace(/\bGR\.?\s*\d+/g, " ")
    .replace(/\bNBR\s*\d+/g, " ");
  const cands = (semGrau.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0 && x < 100);
  return cands.length ? cands[0] : null;
};

// ── U DE CHAPA ────────────────────────────────────────────────────────────────────────────────
//
// Vitor (04/09/2026), sobre as 118 peças U200X60X9.5 da OP-085 que saíam "sem material no CMR":
// "do perfil U você deve usar de chapa". O U escrito em três medidas (alma × aba × ESPESSURA) é
// perfil DOBRADO na casa — a matéria-prima que tem certificado é a chapa daquela espessura, não um
// U comprado pronto. Confere no peso da própria lista: (200+2×60) × 9,5 mm dá 23,9 kg/m e a LPC
// traz 22,4 a 23,3 kg/m; um U 8" laminado pesa 17,1.
//
// ⚠ O U COMPRADO CONTINUA MANDANDO. A OP-085 tem U laminado de verdade no CMR (4" e 6"), e trocar
// esse pela chapa seria inventar origem. Só cai para a chapa quando NENHUMA entrada de U casa —
// aí a peça já estava sem material nenhum, e a chapa é a resposta certa.
function uComoChapa(perfil) {
  const n = nums(perfil);
  if (n.length < 3) return null; // U em polegada (U4"X7.95) é laminado: não vira chapa
  /* ⚠⚠ NO ENRIJECIDO A ESPESSURA É A QUARTA MEDIDA, não a terceira. `UE150X75X20X3.00` é
     alma × aba × LÁBIO × espessura: ler a terceira devolvia `CH20` — uma chapa de 20 mm que
     ninguém comprou — e a peça seguia sem material mesmo com a regra da chapa valendo. O U simples
     (`U200X60X9.5`) continua com a espessura na terceira. Vitor (08/09/2026): "usa um certificado
     de chapa, senhor, resolve isso" — a regra dele de 04/09 já cobria o caso; era esta linha que
     não conseguia aplicar. */
  const esp = n.length >= 4 ? n[3] : n[2];
  return esp > 0 && esp < 60 ? `CH${esp}` : null;
}

/**
 * O perfil sob o qual o material é COMPRADO — igual ao da Engenharia, exceto no U dobrado, que se
 * compra como chapa. Uma função só, usada pelo casamento e pela equivalência, para os dois nunca
 * discordarem sobre o que aquela peça consome.
 */
export function perfilDeCompra(perfil, itens) {
  if (tipoPerfil(perfil) !== "U") return perfil;
  const temU = (itens || []).some((it) => it?.descricao && tipoOmie(it.descricao) === "U" && pontua("U", perfil, it) >= 3);
  return temU ? perfil : (uComoChapa(perfil) || perfil);
}

/**
 * As descrições que são O MESMO MATERIAL da escolhida — hoje só para CHAPA, onde a mesma espessura
 * aparece escrita de várias formas. Para os outros perfis devolve só a escolhida: lá a pontuação
 * distingue bitola e peso, e juntar empates misturaria cantoneira de 3/8 com a de 1/2.
 *
 * @returns {string[]} descrições a considerar como um único material
 */
export function descricoesEquivalentes(perfil, escolhida, itens) {
  if (!escolhida) return [];
  const pf = perfilDeCompra(perfil, itens);
  if (tipoPerfil(pf) !== "CHAPA") return [escolhida];
  const espAlvo = espessuraDe(escolhida);
  if (!espAlvo) return [escolhida];
  const marcas = (t) => QUALIF_CHAPA.map((rx) => rx.test(norm(t)));
  const alvo = marcas(escolhida);
  const out = new Set([escolhida]);
  for (const it of itens || []) {
    const d = it?.descricao;
    if (!d || out.has(d) || tipoOmie(d) !== "CHAPA") continue;
    const esp = espessuraDe(d);
    if (!esp || !perto(espAlvo, esp)) continue;
    if (marcas(d).some((v, i) => v !== alvo[i])) continue; // xadrez/inox/expandida não se misturam
    out.add(d);
  }
  return [...out];
}

/**
 * @param {string} perfil - perfil da peça (Engenharia)
 * @param {Array} itensRm - itens da RM da OP: { codigo, descricao, unidade, largura, comprimento }
 * @returns {{codigo, descricao}|null} item do Omie casado, ou null se não houver match seguro
 */
export function casarPerfilComOmie(perfil, itensRm) {
  if (!Array.isArray(itensRm) || !itensRm.length) return null;
  const pf = perfilDeCompra(perfil, itensRm); // U dobrado se compra como chapa — ver acima
  const tipo = tipoPerfil(pf);
  if (!tipo) return null;
  let melhor = null, best = 0;
  for (const it of itensRm) {
    if (tipoOmie(it.descricao) !== tipo) continue;
    const s = pontua(tipo, pf, it);
    if (s > best) { best = s; melhor = it; }
  }
  return best >= 3 ? { codigo: melhor.codigo || null, descricao: melhor.descricao || null } : null;
}
