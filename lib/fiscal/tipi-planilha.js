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

    itens.push({
      linhasDeOrigem: [numeroDaLinha],
      nivel: codigo.length === 8 ? NIVEL.NCM : NIVEL.HIERARQUIA,
      codigo,
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
