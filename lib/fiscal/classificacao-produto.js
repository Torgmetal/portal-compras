// ─── O REGISTRO DE CLASSIFICAÇÃO DE PRODUTO ──────────────────────────────────
//
// Responde "alguém já decidiu, com fundamento, qual é o NCM desta peça?" — e **só isso**.
//
// ⚠⚠ ELE NÃO CLASSIFICA NADA. Matheus (22/09/2026): *"utilizamos o item ARMAÇÃO DE ESTRUTURA
// METÁLICA para todos os faturamentos, só alteramos o NCM conforme o cliente solicita; o que é cada
// um vai na descrição do item no Omie"*. Medido na NF-e 973: os 24 itens têm o MESMO `cProd`
// (ARM000010) e a MESMA `xProd` — o que distingue um do outro é o `infAdProd`. Enquanto um código
// serve para tudo, o NCM é escolhido caso a caso, sem registro de quem decidiu nem com que
// fundamento. Este módulo não conserta isso: ele dá **onde guardar a decisão humana** e um jeito de
// localizá-la depois.
//
// ⚠⚠ CORRESPONDÊNCIA TEXTUAL NÃO DETERMINA O NCM (achado do Codex, 23/09/2026). `contains("FLANGE")`
// casa "SUPORTE PARA FLANGE": um casamento ÚNICO não é prova de que o verbete fala desta peça. Por
// isso o resultado se chama `CORRESPONDENCIA_UNICA`, nunca "classificação encontrada", e nenhum
// caminho deste módulo preenche campo de NCM em lugar nenhum. Ele mostra a evidência e o aprovador;
// quem enquadra é quem conhece a peça.
//
// ⚠⚠ E A COMPARAÇÃO É COM O CADASTRO DE HOJE. Uma aprovação de hoje não prova qual decisão existia
// quando a nota antiga saiu — `aprovadoEm` é a data do registro no portal, não vigência fiscal.
// Todo resultado carrega `comparadoCom: "cadastro atual"` para que nenhuma tela sugira o contrário.

/** Os estados possíveis. ⚠ "Não sei" e "não tem" são coisas diferentes, e cada uma tem um nome. */
export const CLASSIFICACAO = {
  /** Não há descrição para examinar — não é ausência de registro, é ausência de pergunta. */
  NAO_AVALIAVEL: "NAO_AVALIAVEL",
  /** ⚠⚠ Falha ao ler o registro. NUNCA vira "sem classificação" (achado do Codex). */
  INDISPONIVEL: "INDISPONIVEL",
  /** Havia o que examinar, e nenhum verbete aprovado casou. */
  SEM_REGISTRO: "SEM_REGISTRO",
  /** Mais de um verbete aprovado casou — ambiguidade não é resposta. */
  AMBIGUA: "AMBIGUA",
  /** Exatamente um verbete aprovado casou. ⚠ Evidência, não enquadramento. */
  CORRESPONDENCIA_UNICA: "CORRESPONDENCIA_UNICA",
};

export const STATUS = { PROPOSTA: "PROPOSTA", APROVADA: "APROVADA", REVOGADA: "REVOGADA" };

/**
 * A NORMALIZAÇÃO — determinística, e a MESMA na escrita e na leitura.
 *
 * ⚠ Ela também é a chave do índice único parcial (`scripts/ensure-fiscal-tables.mjs`). Mudá-la aqui
 * sem regravar a coluna faria dois verbetes que hoje colidem passarem a conviver em silêncio.
 */
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * A FORMA CANÔNICA DO CÓDIGO DE PRODUTO — a mesma na gravação, no índice e na comparação.
 *
 * ⚠⚠ UM CÓDIGO QUE NORMALIZA PARA VAZIO NÃO É UM CÓDIGO. `"---"` sobrevive ao `trim`, é gravado
 * como específico e some na leitura — passando a valer para QUALQUER produto, que é o oposto do
 * que quem digitou quis. A gravação recusa; aqui o vazio significa só uma coisa: global.
 */
/**
 * ⚠⚠ AQUI A PONTUAÇÃO SOME, NÃO VIRA ESPAÇO — e é por isso que não dá para reusar `normalizar`. Na
 * DESCRIÇÃO a fronteira de palavra importa ("METALICAS FLANGE" não pode casar dois campos
 * grudados); num CÓDIGO ela é ruído de digitação: quem escreve `arm-000010` está falando do
 * `ARM000010`. Unificar é a direção segura — se dois códigos do Omie diferissem só por um traço, a
 * aprovação bate no índice único e a pessoa é avisada, em vez de o portal responder errado calado.
 */
export const canonico = (codigo) => normalizar(codigo).replace(/ /g, "");

const CAMPOS = [
  { chave: "descricaoItem", rotulo: "descrição do item (infAdProd / dados adicionais)" },
  { chave: "descricao", rotulo: "descrição do produto no cadastro" },
];

/**
 * Quais verbetes valem para este código de produto.
 *
 * ⚠⚠ GLOBAL E ESPECÍFICO CONCORREM, e nenhum dos dois ganha por ser mais específico (achado do
 * Codex). Se os dois casarem, o resultado é AMBIGUA — inventar precedência seria o portal decidindo
 * o que a contabilidade não decidiu. Quem escrever os dois precisa saber que escreveu os dois.
 */
export function verbetesDoCodigo(verbetes, codigo) {
  const c = canonico(codigo);
  return (verbetes ?? []).filter((v) => {
    if (v.status !== STATUS.APROVADA) return false;
    // ⚠⚠ O ESCOPO SAI DA COLUNA CANÔNICA, NÃO DO LITERAL (achado do Codex, 23/09/2026). A escrita
    // guardava o código com `trim` e a leitura normalizava: `ARM000010` e `arm000010` passavam
    // pelo índice único como escopos diferentes e depois casavam juntos, virando AMBIGUA para
    // sempre. Uma forma canônica só, gravada, indexada e comparada.
    const alvo = v.codigoNormalizado ?? "";
    return alvo === "" || alvo === c;
  });
}

// ⚠⚠ OS NOMES SÃO OS DA PERSISTÊNCIA, NÃO OS QUE FICARAM BONITOS NA FIXTURE (achado do Codex,
// 23/09/2026). O motor lia `v.aprovadoPor`; a tabela devolve `aprovadoPorNome`. Registro real saía
// com o aprovador `null` e a tela escrevia "—" — o campo que dá sentido ao registro inteiro. E os
// meus testes usavam o nome inventado, então **defendiam o defeito**. A evidência expõe o nome
// como `aprovadoPor` para quem lê; quem alimenta é o campo que existe no banco.
const evidencia = (v, campo, textoOriginal) => ({
  id: v.id,
  padrao: v.padraoDescricao,
  ncm: v.ncm,
  codigoProduto: v.codigoProduto ?? null,
  fundamento: v.fundamento ?? null,
  aprovadoPor: v.aprovadoPorNome ?? null,
  aprovadoEm: v.aprovadoEm ?? null,
  campo: campo.chave,
  campoRotulo: campo.rotulo,
  trecho: textoOriginal,
});

/**
 * ⚠ Os campos são examinados SEPARADAMENTE, e o resultado diz qual deles casou. Concatenar a
 * descrição genérica com a do item criaria casamentos que não existem em nenhum dos dois.
 */
function casar(examinada, verbetes) {
  const achados = new Map();
  for (const campo of CAMPOS) {
    const alvo = normalizar(examinada[campo.chave]);
    if (!alvo) continue;
    for (const v of verbetes) {
      const padrao = normalizar(v.padraoDescricao);
      if (padrao && alvo.includes(padrao) && !achados.has(v.id)) {
        achados.set(v.id, evidencia(v, campo, examinada[campo.chave]));
      }
    }
  }
  return [...achados.values()];
}

/**
 * PROCURA a decisão humana que fala desta peça.
 *
 * @param {{codigo?:string, descricao?:string, descricaoItem?:string}} item
 * @param {object[]|null} verbetes  já filtrados por `verbetesDoCodigo`, ou null se a leitura falhou
 */
export function procurarClassificacao(item, verbetes) {
  const base = { comparadoCom: "cadastro atual", descricaoExaminada: null, candidatos: [] };

  if (verbetes === null || verbetes === undefined) {
    return { ...base, status: CLASSIFICACAO.INDISPONIVEL,
      motivo: "Não foi possível ler o registro de classificações — a conferência não foi feita." };
  }

  const examinada = {};
  for (const campo of CAMPOS) examinada[campo.chave] = String(item?.[campo.chave] ?? "").trim() || null;
  base.descricaoExaminada = examinada;

  const temTexto = CAMPOS.some((c) => normalizar(examinada[c.chave]) !== "");
  if (!temTexto) {
    return { ...base, status: CLASSIFICACAO.NAO_AVALIAVEL,
      motivo: "O item não traz descrição — sem texto não há o que procurar no registro." };
  }

  const candidatos = casar(examinada, verbetes);
  if (candidatos.length === 0) {
    return { ...base, status: CLASSIFICACAO.SEM_REGISTRO,
      motivo: "Nenhuma classificação aprovada foi escrita para uma peça descrita assim." };
  }
  if (candidatos.length > 1) {
    const ncms = [...new Set(candidatos.map((c) => c.ncm))];
    return { ...base, status: CLASSIFICACAO.AMBIGUA, candidatos,
      motivo: `${candidatos.length} classificações aprovadas casam com esta descrição`
        + (ncms.length === 1
          // ⚠ Mesmo com o NCM igual a ambiguidade FICA: são dois verbetes se sobrepondo, e isso é
          // um defeito do cadastro que alguém precisa resolver antes que os NCMs divirjam.
          ? ` (todas com o NCM ${ncms[0]}, mas os padrões se sobrepõem e isso precisa ser resolvido no cadastro).`
          : ` e elas discordam do NCM: ${ncms.join(", ")}.`) };
  }

  return { ...base, status: CLASSIFICACAO.CORRESPONDENCIA_UNICA, candidatos, verbete: candidatos[0],
    motivo: `A descrição contém “${candidatos[0].padrao}”, que tem classificação aprovada.` };
}

/**
 * COMPARA o NCM declarado no documento com o do verbete achado.
 *
 * ⚠⚠ Só existe resposta quando há UM verbete. Nos outros estados não há com o que comparar, e
 * devolver "confere" ou "diverge" a partir de ambiguidade seria escolher um dos dois no escuro.
 */
export function compararNcm(resultado, ncmDeclarado) {
  if (resultado?.status !== CLASSIFICACAO.CORRESPONDENCIA_UNICA) return { comparavel: false };
  const declarado = String(ncmDeclarado ?? "").replace(/\D/g, "");
  const registrado = String(resultado.verbete.ncm ?? "").replace(/\D/g, "");
  if (declarado.length !== 8 || registrado.length !== 8) return { comparavel: false };
  return { comparavel: true, confere: declarado === registrado, declarado, registrado };
}
