// ─── QUEM ASSINA EM QUAL QUADRO DO RELATÓRIO DE INSPEÇÃO ────────────────────────────────────────
//
// ⚠⚠ UMA DECISÃO SÓ, PARA TODOS OS MODELOS. Vitor (23/09/2026): "notei que alguns estão com o
// Geraldo duplicando a assinatura". Eram os cinco RPM (pré-montagem): a assinatura dele — um
// registro, uma data, um IP — saía em "Inspetor Torg Metal" E em "Fiscalização Torg Metal".
//
// O dimensional tinha a SUA cópia deste casamento, e ela ficou para trás quando a do formulário foi
// consertada (dbccdd81, 04/09/2026, "cada assinatura numa coluna só"): lá cada coluna procurava de
// novo na lista inteira, e "Torg Metal" está dentro dos DOIS nomes de coluna. A mesma cópia punha o
// inspetor também em "Inspetor Cliente" e sumia com a assinatura do cliente — só não saiu porque
// nenhum dimensional foi enviado com os três papéis. Duas cópias da mesma decisão divergem; por isso
// ela mora aqui e os dois desenhos (lib/relatorio-form-pdf.js e lib/relatorio-dimensional-pdf.js)
// só desenham o que ela devolve.
//
// ⚠⚠ O PAPEL DO CONVITE VAI PELA POSIÇÃO, NÃO POR PEDAÇO DE NOME. A tela de envio oferece três
// papéis ("Torg Metal", "Inspetor", "Cliente") e todo modelo tem as colunas na mesma ordem: quem
// inspecionou · a Torg que aprova · o cliente. Casar por pedaço de nome deixava a coluna depender da
// ORDEM ALFABÉTICA de quem assina: no RIP-089-002 o Geraldo (Torg Metal) saía como "Inspetor de
// Qualidade" de uma inspeção que foi do Alexandre; com a Lais de inspetora, ele viraria "Realizado
// por" e ela "Aprovado por".
export const COLUNA_DO_CONVITE = Object.freeze({ inspetor: 0, "torg metal": 1, cliente: 2 });

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, " ").trim();

/**
 * Os quadros do bloco de assinaturas, cada um com quem assina nele.
 *
 * ⚠⚠ QUANDO O INSPETOR É QUEM APROVA, OS DOIS QUADROS VIRAM UM. Nos RPM o Geraldo executou a
 * inspeção (`RelatorioInspecao.inspetor`) e assinou UMA vez, como "Torg Metal". O carimbo nos dois
 * quadros diz que houve duas assinaturas, e não houve; o quadro do inspetor em branco diz que o
 * inspetor não assinou, e assinou. Um quadro com os dois papéis no rótulo e a assinatura uma vez é
 * o que de fato aconteceu — sem frase explicando nada no documento do cliente.
 *
 * ⚠ Só com o MESMO nome. Inspetor que é outra pessoa e não assinou deixa o quadro dele em branco: o
 * Torg Metal não vira inspetor de uma inspeção que não fez. E não une ao contrário (quem assinou
 * como inspetor não ganha a aprovação que ninguém deu).
 *
 * @param {Array<{nome?:string, setor?:string|null, assinadoEm?:Date|null}>|null} assinaturas
 * @param {string[]} papeis rótulos das colunas, na ordem inspetor · aprovação da Torg · cliente
 * @param {{inspetor?:string|null}} [opts] quem executou a inspeção
 * @returns {Array<{inicio:number, colunas:number, rotulo:string, assinatura:object|null}>}
 */
export function quadrosDeAssinatura(assinaturas, papeis, { inspetor = null } = {}) {
  const lista = (assinaturas || []).filter((s) => s?.assinadoEm || s?.nome);
  const daColuna = papeis.map(() => null);
  const usados = new Set();
  const ocupar = (k, i) => {
    if (k < 0 || daColuna[i]) return;
    daColuna[i] = lista[k];
    usados.add(k);
  };
  const achar = (cond) => lista.findIndex((s, k) => !usados.has(k) && cond(norm(s.setor)));

  // 1. o papel escrito igual ao nome da coluna
  papeis.forEach((p, i) => ocupar(achar((st) => st !== "" && st === norm(p)), i));
  // 2. o papel do convite, pela posição
  lista.forEach((s, k) => {
    const i = COLUNA_DO_CONVITE[norm(s.setor)];
    if (!usados.has(k) && i < papeis.length) ocupar(k, i);
  });
  // 3. papel livre (fora do convite) que é pedaço do nome da coluna, ou o contrário
  papeis.forEach((p, i) => {
    const alvo = norm(p);
    if (!daColuna[i]) ocupar(achar((st) => st && !Object.hasOwn(COLUNA_DO_CONVITE, st) && (alvo.includes(st) || st.includes(alvo))), i);
  });
  // 4. ⚠ quem assinou e não casou ocupa a coluna vaga — senão a assinatura some do documento
  //    (dbccdd81: a pessoa assinava e o PDF continuava com a linha em branco)
  papeis.forEach((_, i) => ocupar(achar(() => true), i));

  const quadros = papeis.map((rotulo, i) => ({ inicio: i, colunas: 1, rotulo, assinatura: daColuna[i] }));
  const aprova = daColuna[1];
  if (papeis.length > 1 && !daColuna[0] && aprova && norm(inspetor) && norm(aprova.nome) === norm(inspetor)) {
    quadros.splice(0, 2, { inicio: 0, colunas: 2, rotulo: `${papeis[0]} · ${papeis[1]}`, assinatura: aprova });
  }
  return quadros;
}
