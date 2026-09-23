// ─── AS FONTES JURÍDICAS OFICIAIS ────────────────────────────────────────────
//
// ⚠⚠ ESTE ARQUIVO NÃO CONTÉM REGRA FISCAL — CONTÉM ENDEREÇO DE FONTE. É a diferença que o briefing
// de auditoria (22/09/2026) exige: *"a base de conhecimento fiscal da TORG deverá ser constituída
// por legislação e documentos oficiais armazenados em nosso banco interno; não queremos um conjunto
// de frases escritas por inteligência artificial sem sustentação jurídica"*. O que o portal afirma
// tem de apontar para um texto que ele baixou, hasheou e guardou — não para um comentário meu.
//
// ⚠⚠ E LEI NÃO É RESPOSTA À CONSULTA. O tipo viaja junto do documento porque o PESO é diferente:
// o RICMS vincula; uma Resposta à Consulta é entendimento do fisco sobre os fatos DAQUELE
// consulente, com data e limitações próprias. Tratar as duas como "fonte oficial" indistintamente
// é o erro que faz uma RC de 2015 virar regra universal de 2026.
//
// ⚠⚠ UMA PÁGINA PODE TRAZER VÁRIOS ARTIGOS. Medido em 22/09/2026: `art405.aspx` a `art408.aspx`
// devolvem **404**, porque os quatro moram em `art404.aspx`, cujo título é "RICMS - Artigo 404 a
// 408". Sem esse mapa, o coletor concluiria que o art. 406 — o artigo central da industrialização
// por conta de terceiros — simplesmente não existe.

export const ORGAO = {
  SEFAZ_SP: "Secretaria da Fazenda e Planejamento do Estado de São Paulo",
  CONFAZ: "Conselho Nacional de Política Fazendária",
  RFB: "Receita Federal do Brasil",
};

/**
 * ⚠⚠ O PESO JURÍDICO É ATRIBUTO DO DOCUMENTO, e a tela mostra isso ao lado de cada fundamento.
 * `VINCULANTE` = texto legal em vigor. `INTERPRETATIVO` = como o fisco leu a lei num caso concreto.
 * `REFERENCIA` = tabela oficial (CFOP, TIPI) — não interpreta nada, mas é a lista que vale.
 */
export const PESO = {
  VINCULANTE: "VINCULANTE",
  INTERPRETATIVO: "INTERPRETATIVO",
  REFERENCIA: "REFERENCIA",
};

export const TIPO = {
  ARTIGO_RICMS: "ARTIGO_RICMS",
  DECISAO_NORMATIVA: "DECISAO_NORMATIVA",
  RESPOSTA_CONSULTA: "RESPOSTA_CONSULTA",
};

const SP = "https://legislacao.fazenda.sp.gov.br/Paginas";

const artigo = (pagina, artigos, assunto) => ({
  chave: `RICMS-SP-art-${artigos.join("-")}`,
  tipo: TIPO.ARTIGO_RICMS,
  peso: PESO.VINCULANTE,
  orgao: ORGAO.SEFAZ_SP,
  titulo: artigos.length > 1
    ? `RICMS/SP — Artigos ${artigos[0]} a ${artigos[artigos.length - 1]}`
    : `RICMS/SP — Artigo ${artigos[0]}`,
  norma: "Decreto 45.490/2000 (RICMS/SP)",
  url: `${SP}/art${pagina}.aspx`,
  // ⚠⚠ QUAIS ARTIGOS A PÁGINA PRECISA CONTER. É a validação estrutural do briefing: uma página de
  // erro do SharePoint devolve **200** com HTML, e sem essa conferência ela entraria no banco como
  // se fosse o texto da lei.
  artigos,
  assunto,
});

export const FONTES = [
  artigo("125", ["125"], "Emissão de documentos fiscais — regras gerais."),
  artigo("052", ["52"], "Alíquotas do ICMS nas operações interestaduais."),
  artigo("402", ["402"], "Industrialização por conta de terceiros — suspensão na remessa."),
  artigo("403", ["403"], "Industrialização por conta de terceiros — retorno."),
  // ⚠⚠ UMA PÁGINA, CINCO ARTIGOS — incluindo o 406 e o 408, que são o centro do módulo.
  artigo("404", ["404", "405", "406", "407", "408"],
    "Industrialização por conta de terceiros: insumos entregues direto pelo fornecedor (406) e entrega do produto ao adquirente do encomendante (408)."),
  artigo("409", ["409"], "Industrialização por conta de terceiros — disposições finais."),
  {
    chave: "DN-CAT-03-2016", tipo: TIPO.DECISAO_NORMATIVA, peso: PESO.INTERPRETATIVO,
    orgao: ORGAO.SEFAZ_SP, titulo: "Decisão Normativa CAT 03/2016",
    norma: "Decisão Normativa CAT 03, de 2016",
    url: `${SP}/denorm032016.aspx`,
    marcadores: ["DECISÃO NORMATIVA CAT", "industrialização"],
    assunto: "Industrialização por conta de terceiros; insumos adquiridos com entrega direta ao industrializador.",
  },
  {
    chave: "RC-33732-2026", tipo: TIPO.RESPOSTA_CONSULTA, peso: PESO.INTERPRETATIVO,
    orgao: ORGAO.SEFAZ_SP, titulo: "Resposta à Consulta 33732/2026",
    norma: "Resposta à Consulta Tributária 33732/2026",
    url: `${SP}/RC33732_2026.aspx`,
    marcadores: ["RESPOSTA À CONSULTA", "33732"],
    assunto: "Combinação entre os artigos 406 e 408 do RICMS/SP.",
  },
  {
    chave: "RC-33438-2026", tipo: TIPO.RESPOSTA_CONSULTA, peso: PESO.INTERPRETATIVO,
    orgao: ORGAO.SEFAZ_SP, titulo: "Resposta à Consulta 33438/2026",
    norma: "Resposta à Consulta Tributária 33438/2026",
    url: `${SP}/RC33438_2026.aspx`,
    marcadores: ["RESPOSTA À CONSULTA", "33438"],
    assunto: "Industrialização com remessa direta do fornecedor ao industrializador.",
  },
  {
    chave: "RC-5788-2015", tipo: TIPO.RESPOSTA_CONSULTA, peso: PESO.INTERPRETATIVO,
    orgao: ORGAO.SEFAZ_SP, titulo: "Resposta à Consulta 5788/2015",
    norma: "Resposta à Consulta Tributária 5788/2015",
    url: `${SP}/RC5788_2015.aspx`,
    marcadores: ["RESPOSTA À CONSULTA", "5788"],
    assunto: "Procedimento com CFOP 5.924, 5.949, 5.925 e 5.125 e entrega direta ao adquirente.",
  },
];

/**
 * ⚠⚠ A RESSALVA VIAJA COM O DOCUMENTO, não fica num rodapé da tela. Uma Resposta à Consulta é
 * entendimento do fisco sobre os fatos DAQUELE consulente — o briefing é explícito: *"não considere
 * uma resposta à consulta como regra universal sem analisar seus fatos e limitações"*.
 */
export const RESSALVA_POR_PESO = {
  [PESO.VINCULANTE]: null,
  [PESO.INTERPRETATIVO]: "É entendimento do fisco sobre os fatos apresentados naquele caso, com data própria. Não vincula outros contribuintes automaticamente — a aplicação à TORG precisa ser conferida pela contabilidade.",
  [PESO.REFERENCIA]: "É tabela oficial de referência: lista códigos e descrições, não resolve a incidência de nenhum tributo.",
};

export const fontePorChave = (chave) => FONTES.find((f) => f.chave === chave) ?? null;
