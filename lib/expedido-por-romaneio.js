// QUANTO DE CADA MARCA JÁ EMBARCOU — por ROMANEIO, não por sim/não.
//
// ⚠⚠ ERA UM BOOLEANO, E MARCA PELA METADE VIRAVA MARCA INTEIRA. Larissa (PCP, 22/09/2026),
// emitindo o romaneio da OP-067: *"ele não reconheceu 3 peças T67F62, T67F65 e T67F80. Esses itens
// eram 2 peças de cada marca, e uma peça de cada foi enviada no romaneio 24, o portal entende que
// as peças já foram expedidas e não aparece para que eu possa selecionar, ou ele ignora quando
// subo a lista"*.
//
// A leitura dos romaneios da pasta (`marcasExpedidasOP`) somava o PESO e guardava os números, mas
// jogava fora a QUANTIDADE de cada linha — e gravava `expedidoRomaneio: true` na marca. Medido:
// 1.904 marcas de qte > 1 estão hoje marcadas assim, 50.342 peças. Os arquivos têm o número:
// nos 20 romaneios da OP-067, NENHUMA linha está sem quantidade, e a 24 diz `qtd: 1` para as três.
//
// ⚠ O peso já era somado errado pelo mesmo motivo (arquivo, não romaneio) — ver `acumularRomaneio`.

/**
 * O número que identifica o romaneio, sem a revisão: "14R1" → "14", "R13" → "13", "08" → "8".
 *
 * ⚠⚠ É O MESMO CRITÉRIO DA NUMERAÇÃO DO PRÓXIMO PRÉVIO (romaneios-previos/route.js): vale o
 * PRIMEIRO grupo de dígitos. Tirar todos os não-dígitos juntaria a revisão ao número ("01 R1" →
 * 011). Os zeros à esquerda caem para "08" e "8" serem a mesma carga.
 */
export const numeroDoRomaneio = (n) => {
  const d = String(n ?? "").match(/\d+/)?.[0];
  return d ? String(Number(d)) : null;
};

/**
 * Acumula uma linha de romaneio no mapa `{ numero: qtd }` da marca.
 *
 * ⚠⚠ MÁXIMO POR ROMANEIO, NUNCA SOMA. Medido na pasta da OP-067: "08. ROMANEIO" e "09. ROMANEIO …
 * R1" trazem o MESMO número 08 e os mesmos 22 itens (idem 14/15 e 21/22) — é a carga revisada,
 * salva em outro arquivo. Somando os arquivos, a obra embarcaria duas vezes no papel.
 *
 * ⚠ Linha sem quantidade vale 1: é uma linha de romaneio, e tratá-la como zero apagaria do embarque
 * uma peça que saiu.
 */
export function acumularRomaneio(porRomaneio, { numero, qtd }) {
  const k = numeroDoRomaneio(numero);
  if (!k) return porRomaneio;
  const n = Number(qtd);
  const q = Number.isFinite(n) && n > 0 ? n : 1;
  if (!(porRomaneio[k] > q)) porRomaneio[k] = q;
  return porRomaneio;
}

/** Quantas peças da marca já saíram, somando romaneios distintos. */
export const totalExpedido = (porRomaneio) =>
  Object.values(porRomaneio || {}).reduce((s, q) => s + (Number(q) || 0), 0);

/**
 * Funde o embarque lido dos ARQUIVOS com o que o PORTAL emitiu.
 *
 * ⚠⚠ O ROMANEIO EMITIDO PELO PORTAL TAMBÉM VIRA UM FORM 22 NA PASTA 4.2 — na OP-067 o prévio 27
 * está emitido e o arquivo "Romaneio R27" existe. Somar as duas fontes contaria a mesma carga duas
 * vezes; por isso a fusão é por NÚMERO, e o portal manda no que é dele (a quantidade dele é a que
 * foi escolhida peça a peça).
 */
export const fundirExpedido = (doArquivo, doPortal) => ({ ...(doArquivo || {}), ...(doPortal || {}) });

/**
 * Os itens de um romaneio que são PEÇA DA OBRA — sem os avulsos.
 *
 * ⚠⚠ ITEM AVULSO NÃO É PEÇA DA OBRA. Vitor (22/09/2026): "acontece o caso de enviar tinta para
 * retoque, algum item específico, e precisamos colocar na mão" — e, sobre pôr isso na Lista de
 * Expedição: "meu medo é de quebrar alguma lógica e ficar pior, acho que o caminho vai ser
 * reimportar". Então ele vive só na carga: sai no FORM 22, com o peso na linha, e fica FORA de toda
 * conta que compara embarcado com contratado — o contratado vem da LE, que não tem tinta.
 *
 * ⚠ Toda soma de peso sobre `RomaneioPrevio.itens` passa por aqui. Somar cru é o caminho de volta
 * para o expedido da obra crescer sem a obra ter entregado nada.
 */
export const itensDeObra = (itens) => (Array.isArray(itens) ? itens : []).filter((it) => it && !it.avulso);
