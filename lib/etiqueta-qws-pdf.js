import "server-only";
import { ENDERECO, contagemDaEtiqueta, numeroDaEtiqueta, pesoBR, pincel } from "@/lib/etiqueta-pdf-base";
import { unidadeDaEtiqueta } from "@/lib/etiqueta-campos-extras";

// ETIQUETA — MODELO QWS / PETROBRAS.
//
// Matheus (10/09/2026): "vou precisar criar um modelo específico para um cliente da OP 102, eles
// pedem informações extras conforme a planilha". Desenhado sobre o croqui que ele mandou junto.
//
// ⚠⚠ O QUE MUDA NÃO É O LAYOUT, É O QUE A ETIQUETA PRECISA DIZER. O modelo padrão identifica a peça
// pela MARCA da Torg; este identifica pela TAG PETROBRAS — o código do cliente, que é por onde o
// recebimento DELES confere. Marca, referência de desenho e posição continuam na etiqueta, mas
// abaixo da TAG. Por isso a TAG ocupa a faixa do meio inteira, em corpo grande: é o que se lê de
// longe no pátio deles.
//
// ⚠ TAG, REFERÊNCIA e POSIÇÃO ("SE-001") não existem no cadastro de peças — vêm da planilha
// "Lista Equivalência de Marcas" do cliente (`lib/parse-equivalencia-marcas.js`, tabela
// `EtiquetaCampoExtra`). Peça sem esses campos importados imprime "—": a etiqueta sai, e o buraco
// aparece na hora de colar, não depois que o caminhão saiu.

// A grade, em mm a partir do canto superior esquerdo. Mudar aqui muda o desenho inteiro; é o único
// lugar com números de posição. Mesma moldura externa do modelo padrão (a etiqueta é a mesma).
export const GRADE_QWS = {
  borda: 1.2,
  fim: 48.8,
  fimDir: 98.8,
  colQR: 74,           // onde começa a coluna do QR (faixa da TAG)
  colRodape: 26,       // largura da coluna QTDE/PESO no rodapé
  yCabecalho: 13,      // logo + endereço
  yCliente: 21,        // cliente|obra  /  O.P.
  colOP: 62,           // onde a O.P. se separa do cliente/obra
  yTagRotulo: 26.5,    // rótulo "TAG PETROBRAS"
  yTag: 36,            // fim da faixa da TAG (e do QR)
  qr: 10.5,            // o lado do QR
};

// ⚠⚠ AS DUAS FAIXAS DO RODAPÉ SÃO APERTADAS — 6,4 mm PARA RÓTULO + VALOR. Os números abaixo saíram
// de olhar o PDF renderizado: com o valor a 6,5 pt (2,3 mm de altura) e o rótulo a 4,2 pt, a
// primeira tentativa ("metade da faixa" para cada linha) fez o rótulo PESO ser desenhado por cima
// do próprio valor. As linhas de base agora são explícitas, medidas a partir do topo do rodapé, e
// deixam ~1 mm de folga entre cada rótulo e o valor dele.
export const RODAPE = { rot1: 2.6, val1: 5.9, rot2: 9.0, val2: 12.3, tamValor: 6.5, tamRotulo: 4.2 };

function moldura(p) {
  const { borda: B, fim, fimDir, colQR, colRodape, yCabecalho, yCliente, yTagRotulo, yTag, colOP } = GRADE_QWS;
  p.linha(B, B, fimDir, B); p.linha(B, fim, fimDir, fim);
  p.linha(B, B, B, fim); p.linha(fimDir, B, fimDir, fim);
  p.linha(B, yCabecalho, fimDir, yCabecalho);
  p.linha(B, yCliente, fimDir, yCliente);
  p.linha(colOP, yCabecalho, colOP, yCliente);     // cliente|obra  |  O.P.
  p.linha(B, yTagRotulo, colQR, yTagRotulo);       // só do lado esquerdo: o QR ocupa a faixa toda
  p.linha(B, yTag, fimDir, yTag);
  p.linha(colQR, yCliente, colQR, yTag);           // a coluna do QR
  p.linha(colRodape, yTag, colRodape, fim);        // QTDE/PESO  |  referência/posição
}

function cabecalho(p, { cliente, obra, opNumero, logo }) {
  const { colOP, fimDir, yCabecalho } = GRADE_QWS;
  const LOGO = 32;
  if (logo) p.imagem(logo, 3, 7 + ((logo.height / logo.width) * LOGO) / 2, LOGO);
  // O endereço é o que o croqui pede no alto à direita — em 3 linhas, como na etiqueta em uso.
  ENDERECO.forEach((l, i) => p.txt(l, fimDir - 1.5 - p.larg(l, 3.3), 4.2 + i * 3.2, 3.3));

  // ⚠ CLIENTE E OBRA NUMA CÉLULA SÓ ("QWS | Revamp"), como no croqui. São duas linhas separadas no
  // modelo padrão; aqui a faixa do meio foi toda para a TAG, e o cliente já é conhecido de quem
  // recebe — o que ele precisa saber é de qual obra dele a peça é.
  // ⚠ Matheus (10/09/2026): "o T102 ficou um pouco pra baixo da linha O.P.". Estava a 7,4 mm do
  // topo da faixa, encostando na moldura de baixo — a faixa tem 8 mm e o valor, 2,6 mm de altura.
  // As duas colunas sobem JUNTAS: elas dividem a linha de base, e mexer só numa desalinharia o par.
  p.negrito("CLIENTE / OBRA:", 3, yCabecalho + 3.2, 4.2);
  const alvo = [cliente, obra].map((s) => String(s ?? "").trim()).filter(Boolean).join(" | ") || "—";
  p.encaixar({ s: alvo, mmX: 3, mmY: yCabecalho + 6.9, xFim: colOP - 1.5, tamMax: 8 });

  p.negrito("O.P.:", colOP + 1.5, yCabecalho + 3.2, 4.2);
  p.negrito(numeroDaEtiqueta(opNumero), colOP + 8, yCabecalho + 6.9, 7.5);
}

/**
 * A faixa do meio: TAG PETROBRAS em corpo grande, e o QR ao lado.
 *
 * ⚠ O QR CONTINUA CODIFICANDO A MARCA DA TORG, não a TAG. É o mesmo QR do modelo padrão de
 * propósito: quem lê o código no pátio é a Torg (conferência, carregamento), e a leitura tem que
 * cair na mesma chave que o portal usa. A TAG do cliente está impressa em texto, do lado.
 */
function faixaTag(p, { tagPetrobras, marca, qr }) {
  const { borda: B, colQR, fimDir, yCliente, yTag } = GRADE_QWS;
  p.negrito("TAG PETROBRAS:", B + 1.8, yCliente + 3.6, 4.2);
  p.encaixar({ s: tagPetrobras || "—", mmX: B + 1.8, mmY: yTag - 2.2, xFim: colQR - 2, tamMax: 13 });

  // ⚠ `imagem` recebe a BORDA DE BAIXO. O QR encostava na legenda quando tinha 11,5 mm — visto no
  // PDF renderizado, não no cálculo: a marca era desenhada por cima do canto dele.
  const lado = GRADE_QWS.qr;
  p.imagem(qr, colQR + (fimDir - colQR - lado) / 2, yCliente + 0.8 + lado, lado);
  // A legenda do QR é a marca — a célula é estreita e corta marca longa, o que não custa: a marca
  // inteira sai no rodapé, no campo TAG FOR.
  p.encaixar({ s: marca, mmX: colQR + 1, mmY: yTag - 0.8, xFim: fimDir - 1, tamMax: 5.5 });
}

function rodape(p, { peca, unidade, indice, total }) {
  const { borda: B, colRodape, fimDir, yTag } = GRADE_QWS;
  const { rot1, val1, rot2, val2, tamValor } = RODAPE;
  p.campo({ rotulo: "QTDE. (PÇ):", valor: contagemDaEtiqueta(indice, total),
            mmX: B + 1.8, yRot: yTag + rot1, yVal: yTag + val1, tam: tamValor });
  p.campo({ rotulo: "PESO (kg):", valor: pesoBR(peca.pesoUnitKg),
            mmX: B + 1.8, yRot: yTag + rot2, yVal: yTag + val2, tam: tamValor });

  p.negrito("REFERÊNCIA:", colRodape + 1.8, yTag + rot1, 4.2);
  p.encaixar({ s: unidade.referencia || "—", mmX: colRodape + 1.8, mmY: yTag + val1, xFim: fimDir - 1.5, tamMax: tamValor });

  // ⚠ É MARCA + POSIÇÃO, e o que amarra a etiqueta do cliente à peça da Torg: a marca sozinha não
  // diz nada para eles, a posição sozinha se repete entre obras.
  //
  // ⚠ O SEPARADOR É " / " COM FOLGA DOS DOIS LADOS, não hífen. Matheus (10/09/2026): "ficou
  // T102A1-SE-001, parece um negócio só; o ideal é ficar T102A1 / SE-001". As duas metades são
  // códigos de sistemas diferentes — coladas por hífen viram um código só, que não existe.
  p.negrito("TAG / DESCRIÇÃO:", colRodape + 1.8, yTag + rot2, 4.2);
  const posicao = [peca.marca, unidade.descricao].map((s) => String(s ?? "").trim()).filter(Boolean).join("  /  ");
  p.encaixar({ s: posicao || "—", mmX: colRodape + 1.8, mmY: yTag + val2, xFim: fimDir - 1.5, tamMax: tamValor });
}

export function desenharEtiquetaQws(pg, { cliente, obra, opNumero, peca, indice, total, qr, font, bold, logo }) {
  const p = pincel(pg, font, bold);
  // ⚠ CADA ETIQUETA TEM A SUA UNIDADE. A 2/3 leva a segunda TAG da planilha, não a da marca —
  // é por esse código que o recebimento do cliente confere a peça.
  const unidade = unidadeDaEtiqueta(peca, indice);
  moldura(p);
  cabecalho(p, { cliente, obra, opNumero, logo });
  faixaTag(p, { tagPetrobras: unidade.tagPetrobras, marca: peca.marca, qr });
  rodape(p, { peca, unidade, indice, total });
}
