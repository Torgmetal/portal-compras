import "server-only";

// O QUE TODO MODELO DE ETIQUETA COMPARTILHA — o rolo, a impressora e o jeito de escrever nele.
//
// ⚠⚠ O TAMANHO NÃO É ESCOLHA, É O ROLO QUE ESTÁ NA MÁQUINA. Etiqueta de 100×50 mm, BOPP permanente
// laranja, numa Argox OS-214 plus (PPLA, 203 dpi). A página do PDF tem EXATAMENTE 100×50 mm para o
// driver do Windows não ter o que reinterpretar: qualquer margem de página aqui vira etiqueta torta
// lá. Vale para o modelo padrão e para o do cliente — é a MESMA impressora e o MESMO rolo.
//
// ⚠ A IMPRESSORA SÓ IMPRIME PRETO. O laranja é o material do rolo, não tinta. Por isso tudo aqui é
// `preto` puro — nada de cinza, que numa térmica de 203 dpi vira pontilhado sujo.

import { rgb } from "pdf-lib";

export const MM = 72 / 25.4;              // 1 mm em pontos PDF
export const L = 100 * MM, A = 50 * MM;   // a página: 100 × 50 mm
export const PRETO = rgb(0, 0, 0);

/** y do pdf-lib conta de baixo; toda a diagramação dos modelos pensa de cima. */
export const dy = (mm) => A - mm * MM;
export const x = (mm) => mm * MM;

export const ENDERECO = [
  "AV. MANOEL GONÇALVES NETO, 2680",
  "SÃO JOÃO DA FIGUEIRA - CONCHAL/SP",
  "FONE: (19) 3500 8293",
];

/**
 * O número como o PÁTIO lê: com "T" na frente.
 *
 * ⚠ Matheus (08/09/2026): "deixe por padrão o T na frente". No cadastro as OPs são "121", "120" —
 * nenhuma tem prefixo. O "T" é convenção da etiqueta, não do banco: a que está colada na peça hoje
 * diz "T89", e as marcas seguem o mesmo padrão ("T89C20", "T121A1"). Quem confere no carregamento
 * compara a etiqueta com a marca, então os dois têm que falar a mesma língua.
 *
 * ⚠ Não dobra o T: se um dia o cadastro vier com "T89", continua "T89".
 */
export const numeroDaEtiqueta = (numero) => {
  const s = String(numero ?? "").trim();
  if (!s) return "—";
  return /^t/i.test(s) ? `T${s.slice(1)}` : `T${s}`;
};

/**
 * "3/3", "300/300" — a peça e quantas são, SEM zero à esquerda.
 *
 * ⚠ Matheus (08/09/2026): "remova esses 0 à esquerda, ele só tinha na outra etiqueta porque às
 * vezes tinha peças que têm mais de 4 casas, aí o BarTender precisa ter já os 0". O "001/1" da
 * etiqueta antiga era limitação de ferramenta, não informação: o BarTender importava a planilha
 * com a largura do campo fixa e precisava dos zeros para alinhar. Aqui o número sai do banco a
 * cada etiqueta, então a largura se ajusta sozinha.
 */
export const contagemDaEtiqueta = (indice, total) => `${indice}/${total}`;

export const pesoBR = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0
    ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

/**
 * O ENDEREÇO DA TORG, alinhado à direita e no MAIOR corpo que ainda caiba.
 *
 * ⚠⚠ 3,5 pt BORRAVA NA IMPRESSORA. Matheus (11/09/2026): "deixe maior também o endereço da Torg e
 * telefone, está saindo todo borrado por conta do tamanho". A 203 dpi, 3,5 pt tem ~10 pontos de
 * altura — na transferência térmica isso vira mancha, não letra. É o menor texto da etiqueta e o
 * primeiro a sofrer.
 *
 * ⚠ O TAMANHO É CALCULADO, NÃO FIXO. Cada modelo tem uma folga diferente entre o logo e o começo do
 * endereço (o padrão tem 32 mm, o QWS tem 60), e fixar um número obrigaria a reconferir os dois a
 * cada mudança de grade — ou, pior, deixaria o texto invadir o logo sem ninguém notar.
 *
 * ⚠ O TETO DE 5,5 pt NÃO É LIMITAÇÃO DE ESPAÇO, É HIERARQUIA. No QWS caberiam 9 pt: o endereço
 * ficaria do tamanho da TAG PETROBRAS, que é o que o cliente precisa ler de longe. Endereço é
 * informação de apoio e tem que parecer uma.
 *
 * @param {{xMin:number, xFim:number, yIni:number, entreLinhas:number, tamMax?:number}} celula em mm
 */
export function desenharEndereco(p, { xMin, xFim, yIni, entreLinhas, tamMax = 5.5 }) {
  let tam = 3;
  for (let t = 3; t <= tamMax; t += 0.25) {
    if (xFim - Math.max(...ENDERECO.map((l) => p.larg(l, t))) >= xMin) tam = t;
  }
  ENDERECO.forEach((l, i) => p.txt(l, xFim - p.larg(l, tam), yIni + i * entreLinhas, tam));
  return tam;
}

/**
 * Encaixa um texto ENTRE DUAS COORDENADAS: primeiro diminuindo a fonte, e só se ainda não couber,
 * cortando com reticência.
 *
 * ⚠ A primeira versão recebia a largura como número à parte, e em dois dos três usos esse número
 * não batia com onde o texto realmente começava. Passar `xIni` e `xFim` faz a conta ser a mesma
 * que o desenho: não dá para as duas discordarem.
 *
 * ⚠⚠ ENCOLHER TEM LIMITE, E O TESTE FOI QUEM MOSTROU. A célula sob o QR tem 22 mm; uma marca de
 * 26 caracteres não cabe ali nem a 4 pt — e abaixo disso não se lê mais nada, então diminuir mais
 * seria trocar um defeito visível por um ilegível. Aí o texto é CORTADO. Perder o fim da marca
 * nessa célula não custa: ela é a legenda do QR, e a marca inteira está no TAG, em corpo grande.
 *
 * @param {{xIni:number, xFim:number, tamMax:number, tamMin?:number}} celula limites em mm
 * @returns {{texto:string, tam:number, largura:number, xFim:number}} mm, menos `tam` (pontos)
 */
export function ajustarTexto(texto, fonte, { xIni, xFim, tamMax, tamMin = 4 }) {
  const disponivel = xFim - xIni;
  const mm = (s, tam) => fonte.widthOfTextAtSize(String(s), tam) / MM;
  let s = String(texto ?? "");
  let t = tamMax;
  while (t > tamMin && mm(s, t) > disponivel) t -= 0.25;
  while (s.length > 1 && mm(s, t) > disponivel) s = s.slice(0, -2) + "…";
  return { texto: s, tam: t, largura: mm(s, t), xFim: xIni + mm(s, t) };
}

/**
 * Um pincel já preso à página e às fontes.
 *
 * ⚠ Existe para os ajudantes não carregarem `pg`, `font` e `bold` em toda chamada. A primeira
 * versão passava tudo em cada uma e os ajudantes chegaram a SETE parâmetros — a essa altura a
 * ordem dos argumentos vira o próprio bug.
 */
export function pincel(pg, font, bold) {
  const larg = (s, tam, f = font) => f.widthOfTextAtSize(String(s ?? ""), tam) / MM;
  // Duas funções em vez de uma com o parâmetro da fonte no fim: na etiqueta quase tudo é negrito,
  // e `negrito("TAG:", …)` diz na chamada o que `txt("TAG:", …, bold)` só dizia no último argumento.
  const comFonte = (f) => (s, mmX, mmY, tam) =>
    pg.drawText(String(s ?? ""), { x: x(mmX), y: dy(mmY), size: tam, font: f, color: PRETO });
  const txt = comFonte(font), negrito = comFonte(bold);
  return {
    font, bold, larg, txt, negrito,
    linha: (x1, y1, x2, y2) =>
      pg.drawLine({ start: { x: x(x1), y: dy(y1) }, end: { x: x(x2), y: dy(y2) }, thickness: 0.7, color: PRETO }),
    centro: ({ s, entre: [x1, x2], mmY, tam, f = font }) =>
      comFonte(f)(s, (x1 + x2) / 2 - larg(s, tam, f) / 2, mmY, tam),
    // ⚠ yRot e yVal são as LINHAS DE BASE, que crescem para CIMA, e são duas — a primeira versão
    // derivava uma da outra e o CLIENTE saiu desenhado por cima do logo.
    campo: ({ rotulo, valor, mmX, yRot, yVal, tam = 8 }) => {
      negrito(rotulo, mmX, yRot, 4.2);
      negrito(valor, mmX + 1, yVal, tam);
    },
    // Encaixa e desenha de uma vez: quem chama nunca vê o texto que não coube.
    encaixar: ({ s, mmX, mmY, xFim, tamMax, f = bold }) => {
      const r = ajustarTexto(s, f, { xIni: mmX, xFim, tamMax });
      comFonte(f)(r.texto, mmX, mmY, r.tam);
      return r;
    },
    imagem: (img, mmX, mmY, mmL) =>
      pg.drawImage(img, { x: x(mmX), y: dy(mmY), width: x(mmL), height: (img.height / img.width) * mmL * MM }),
  };
}
