// ─── A TIPI OFICIAL, LIDA DO XLSX DA RECEITA ─────────────────────────────────
//
// Este arquivo NÃO baixa nada e NÃO fala com banco: recebe as linhas cruas da planilha e devolve a
// leitura estruturada, com o que deu errado dito em voz alta. É o único lugar que entende o formato
// da Receita — quem importa, quem valida e quem consulta leem a saída daqui.
//
// ⚠⚠ O QUE FOI MEDIDO NO ARQUIVO REAL (22/09/2026, 673.645 bytes, aba única "Tabela Completa"):
//   · cabeçalho na linha 8: `NCM | EX | DESCRIÇÃO | ALÍQUOTA (%)`
//   · 15.653 linhas de corpo, das quais:
//       10.521  NCM de 8 dígitos sem Ex
//          582  linhas COM Ex
//        4.545  linhas de HIERARQUIA (3,4,5,6,7 dígitos) — capítulo, posição, subposição
//            5  linhas SEM código — continuação da descrição da linha anterior
//   · alíquotas como TEXTO: "0" (6.405x), "3.25" (1.442x), "6.5", "9.75", "NT" (832x)
//   · 483 NCMs aparecem em MAIS DE UMA LINHA: a geral e uma ou mais de Ex

/**
 * ⚠⚠ `NT`, ZERO E AUSÊNCIA SÃO TRÊS COISAS DIFERENTES, e confundi-las é errar imposto.
 *
 *   · `NT`  — não tributado. Não é 0%: o produto está FORA do campo de incidência.
 *   · `0`   — tributado à alíquota zero. É alíquota de verdade, e são 6.405 linhas.
 *   · vazio — a linha não declara alíquota (é hierarquia, ou a planilha não trouxe).
 *
 * Tratar `NT` como 0 faria o portal afirmar "tributado a zero" sobre mercadoria que nem entra na
 * conta; tratar vazio como 0 inventaria tributação onde a fonte não disse nada. Por isso a alíquota
 * sai como `{ tipo, valor }` e nunca como um número solto — quem consome é obrigado a olhar o tipo.
 */
export const ALIQUOTA = { PERCENTUAL: "PERCENTUAL", NT: "NT", AUSENTE: "AUSENTE" };

const so = (v) => (v == null ? "" : String(v).trim());
const soDigitos = (v) => so(v).replace(/\D/g, "");

/**
 * O CÓDIGO, DESFAZENDO O ESTRAGO QUE O EXCEL FEZ NO ARQUIVO OFICIAL.
 *
 * ⚠⚠ 58 POSIÇÕES DA TIPI PERDERAM UM ZERO, E ISSO É DEFEITO DA FONTE (medido em 22/09/2026). A
 * célula foi gravada como NÚMERO em vez de texto, então o zero sumiu dos dois lados:
 *
 *      "84.3"  na planilha  →  é a posição  84.30   (zero à direita perdido)
 *      "02.1"               →               02.10
 *      "3.03"               →               03.03   (zero à ESQUERDA perdido)
 *
 * ⚠⚠ E ISSO ENVENENAVA A HIERARQUIA INTEIRA. Lido como está, `84.3` vira `843` — que é prefixo de
 * `8437`, `8438`, `8439`… Resultado medido: o `8437.90.00` (partes de máquinas de moagem de grãos)
 * herdava como ancestral o texto de `84.30`, "Outras máquinas e aparelhos de TERRAPLENAGEM". Um
 * capítulo inteiro descrito pela máquina errada, e a busca textual devolvendo escavadeira para quem
 * procura peneira.
 *
 * ⚠ O conserto é estrutural, não uma lista de exceções: posição tem SEMPRE 4 dígitos, dois de cada
 * lado do ponto. Só o caso de 3 dígitos é tratado — ele é o único INEQUÍVOCO (3 nunca é um nível
 * válido). Em 5 dígitos (`8430.3`) as duas leituras possíveis dão o mesmo prefixo, então a
 * hierarquia sai igual de qualquer jeito e mexer ali seria adivinhar sem necessidade.
 */
export function codigoNormalizado(formatado) {
  const cru = soDigitos(formatado);
  if (cru.length !== 3) return cru;
  const partes = so(formatado).split(".");
  if (partes.length !== 2) return cru;
  const [cap, pos] = partes.map((x) => x.replace(/\D/g, ""));
  if (!cap || !pos || cap.length > 2 || pos.length > 2) return cru;
  return `${cap.padStart(2, "0")}${pos.padEnd(2, "0")}`;
}

/** A alíquota como a planilha escreveu — decodificada, nunca adivinhada. */
export function lerAliquota(bruto) {
  const t = so(bruto);
  if (!t) return { tipo: ALIQUOTA.AUSENTE, valor: null, bruto: t };
  if (/^NT$/i.test(t)) return { tipo: ALIQUOTA.NT, valor: null, bruto: t };
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;   // ⚠ não é ausência: é layout inesperado
  return { tipo: ALIQUOTA.PERCENTUAL, valor: n, bruto: t };
}

/**
 * O NÍVEL DA LINHA, pelo tamanho do código.
 *
 * ⚠⚠ NEM TODA LINHA DA TIPI É UM NCM DE 8 DÍGITOS — são 4.545 que não são. `84.37` (posição) e
 * `8437.8` (subposição) existem para dar a descrição que as folhas de 8 dígitos abreviam ("- Partes"
 * só faz sentido sob "Máquinas para limpeza… de grãos"). Importá-las como NCM encheria a consulta
 * de códigos que não existem em nota fiscal nenhuma; jogá-las fora deixaria a descrição sem pé.
 */
export const NIVEL = { NCM: "NCM", HIERARQUIA: "HIERARQUIA" };

/**
 * A planilha inteira, linha a linha.
 *
 * @param {string[][]} linhas  saída de `sheet_to_json(..., { header: 1, raw: false, defval: "" })`
 * @returns {{ cabecalho:number, itens:Array, problemas:Array }}
 */
export function lerTipi(linhas) {
  const cabecalho = acharCabecalho(linhas);
  if (cabecalho < 0) {
    return { cabecalho: -1, itens: [], problemas: [{ linha: null, motivo: "Cabeçalho `NCM | EX | DESCRIÇÃO | ALÍQUOTA` não encontrado — o layout da Receita mudou." }] };
  }

  const itens = [];
  const problemas = [];
  for (let i = cabecalho + 1; i < linhas.length; i += 1) {
    const l = linhas[i] || [];
    const numeroDaLinha = i + 1;                 // 1-based, como o Excel mostra
    const codigo = soDigitos(l[0]);
    const descricao = so(l[2]);
    if (!codigo && !descricao) continue;         // linha em branco de diagramação

    if (!codigo) {
      // ⚠⚠ CONTINUAÇÃO DE DESCRIÇÃO SÓ COLA NA LINHA ANTERIOR RECONHECIDA (parecer do Codex,
      // 22/09/2026). São 5 no arquivo de hoje. Colar em qualquer coisa — ou ignorar em silêncio —
      // é como descrição de um produto passaria a valer para outro; e se aparecer uma continuação
      // ANTES de haver linha lógica, isso não é diagramação, é layout diferente do que se conhece.
      const dona = itens[itens.length - 1];
      if (!dona) { problemas.push({ linha: numeroDaLinha, motivo: `Continuação de descrição sem linha anterior: "${descricao.slice(0, 60)}"` }); continue; }
      dona.descricao = `${dona.descricao} ${descricao}`.trim();
      dona.linhasDeOrigem.push(numeroDaLinha);
      continue;
    }

    const aliquota = lerAliquota(l[3]);
    if (aliquota === null) {
      problemas.push({ linha: numeroDaLinha, motivo: `Alíquota não reconhecida: ${JSON.stringify(so(l[3]))} (esperado número ou "NT")` });
      continue;
    }

    const normalizado = codigoNormalizado(l[0]);
    itens.push({
      linhasDeOrigem: [numeroDaLinha],
      nivel: normalizado.length === 8 ? NIVEL.NCM : NIVEL.HIERARQUIA,
      codigo: normalizado,
      codigoFormatado: so(l[0]),
      // ⚠ O Ex fica como STRING, com o zero à esquerda que a planilha traz ("01" ≠ 1).
      ex: so(l[1]),
      descricao,
      aliquota,
    });
  }

  return { cabecalho: cabecalho + 1, itens, problemas };
}

/** A linha do cabeçalho — procurada, não fixada em 8: a Receita já mexeu no preâmbulo antes. */
function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 60); i += 1) {
    const l = linhas[i] || [];
    if (/^NCM/i.test(so(l[0])) && /AL[ÍI]QUOTA/i.test(so(l[3]))) return i;
  }
  return -1;
}

/**
 * AS ALÍQUOTAS CONSULTÁVEIS, com a chave que o banco vai usar.
 *
 * ⚠⚠ A CHAVE É (NCM, Ex) — NÃO SÓ O NCM. São 483 NCMs com mais de uma linha: a geral e as de Ex.
 * O `1211.20.00` é `NT` na geral e `0` no `Ex 01 "Secas"`. Uma alíquota por NCM teria de escolher
 * uma das duas em silêncio, e as duas estão certas — para mercadorias diferentes.
 *
 * ⚠⚠ E CHAVE REPETIDA É ERRO, NUNCA SOBRESCRITA (parecer do Codex). Se o mesmo (NCM, Ex) vier duas
 * vezes com alíquotas diferentes, a última calada venceria e ninguém saberia qual valeu.
 */
export function aliquotasConsultaveis(itens) {
  const porChave = new Map();
  const problemas = [];
  for (const it of itens) {
    if (it.nivel !== NIVEL.NCM) continue;
    const chave = `${it.codigo}|${it.ex}`;
    const antes = porChave.get(chave);
    if (antes) {
      if (antes.aliquota.bruto !== it.aliquota.bruto) {
        problemas.push({ linha: it.linhasDeOrigem[0], motivo: `NCM ${it.codigo} Ex "${it.ex}" repetido com alíquotas diferentes (${antes.aliquota.bruto} × ${it.aliquota.bruto})` });
      }
      continue;
    }
    porChave.set(chave, it);
  }
  return { aliquotas: [...porChave.values()], problemas };
}

/**
 * O CAMINHO HIERÁRQUICO DE CADA LINHA — e por que a busca textual depende dele.
 *
 * ⚠⚠ A DESCRIÇÃO DA FOLHA SOZINHA NÃO DIZ NADA, E ISSO FOI MEDIDO (22/09/2026): **2.603 dos 11.103
 * NCMs — 23% — são descritos apenas como "Outros" ou "Outras"**, às vezes só "-- Outros". A TIPI é
 * uma árvore: o significado mora no caminho, não na folha.
 *
 * Buscar "construções pré-fabricadas" devolvia ZERO resultados, porque a descrição própria do
 * `9406.90.20` é "Com estrutura de ferro ou aço e paredes exteriores…" — as palavras procuradas
 * estão na POSIÇÃO `94.06`, duas linhas acima. Indexar a folha é publicar uma busca que não acha
 * justamente o que o colaborador digita.
 *
 * ⚠ A árvore se monta por PREFIXO e pela ORDEM do arquivo: uma linha é filha da última linha
 * anterior cujo código é prefixo do dela. É por isso que a hierarquia não pode ser descartada na
 * importação, e é por isso que `ordem` é coluna.
 */
export function comCaminho(itens) {
  const pilha = [];
  return itens.map((it) => {
    while (pilha.length && !(it.codigo.startsWith(pilha[pilha.length - 1].codigo) && pilha[pilha.length - 1].codigo.length < it.codigo.length)) {
      pilha.pop();
    }
    const caminho = pilha.map((p) => p.descricao);
    pilha.push(it);
    // ⚠ Os travessões da TIPI ("-- Outros") são marcação de NÍVEL, não texto: atrapalham a busca e
    // já estão representados pelo próprio caminho.
    const limpa = (t) => t.replace(/^[-\u2013\u2014\s]+/, "").trim();
    const completa = [...caminho, it.descricao].map(limpa).filter(Boolean).join(" > ");
    return { ...it, caminho, descricaoCompleta: completa, busca: textoDeBusca(completa) };
  });
}

/**
 * O TEXTO COMO O COLABORADOR DIGITA — sem acento, em minúscula.
 *
 * ⚠⚠ `to_tsvector('portuguese', …)` NÃO REMOVE ACENTO, e isso zerava a busca inteira (medido em
 * 22/09/2026). Quem procura peça no chão de fábrica digita "construcoes pre-fabricadas" e
 * "maquinas", não "Construções" e "Máquinas" — e `plainto_tsquery` junta os termos com E, então UM
 * acento faltando derrubava a consulta toda. As cinco buscas testadas devolviam ZERO.
 *
 * ⚠ Por que uma COLUNA e não a extensão `unaccent`: ela não é `IMMUTABLE` por padrão, então não
 * entra num índice sem uma função-embrulho — que exige privilégio que o portal não tem no Neon.
 * A coluna é do projeto, funciona em qualquer Postgres e é normalizada do mesmo jeito dos dois
 * lados (aqui e no termo pesquisado), que é o que garante que eles se encontrem.
 */
export const textoDeBusca = (t) =>
  so(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
