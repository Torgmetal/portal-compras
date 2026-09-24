import { DOMParser } from "@xmldom/xmldom";
import { lerNfe } from "@/lib/fiscal/xml-nfe";

// ─── O XML QUE O COLABORADOR ANEXA NO CHAT ───────────────────────────────────
//
// ⚠⚠ ESTE ARQUIVO EXISTE PORQUE O XML É DE TERCEIRO E VAI PARAR PERTO DE UM MODELO DE LINGUAGEM.
// `lerNfe` foi escrito para a aba Auditoria e EXTRAI dados — ele silencia erros (`onError: () => {}`),
// pega o primeiro `infNFe` e busca descendentes amplamente. Isso basta para ler uma nota; não basta
// para ACEITAR um arquivo que ninguém conferiu (parecer de segurança do Codex, 24/09/2026). A
// validação mora aqui, e `lerNfe` não mudou — a aba Auditoria continua exatamente como era.
//
// ⚠ Módulo PURO: nada de Prisma, nada de rede. Recebe texto, devolve decisão.

export const PARSER_VERSAO = "anexo-nfe/1";

/**
 * ⚠⚠ OS LIMITES FORAM MEDIDOS, NÃO CHUTADOS (24/09/2026). Uma NF-e com 990 itens — o máximo que o
 * leiaute permite — e descrição longa em todos dá 3,07 MB e 74 ms de parse. Parse DOM é SÍNCRONO:
 * nenhum timeout o interrompe, então o único controle real de CPU é o tamanho da entrada.
 *
 * ⚠⚠ 4 MB, E NÃO OS 8 MB DA ABA AUDITORIA: o corpo de uma função da Vercel para em 4,5 MB. Um teto
 * de 8 MB no código prometeria um tamanho que nunca chega à função — o usuário veria um erro da
 * plataforma, sem explicação, em vez da mensagem que diz qual é o limite.
 */
export const LIMITES = {
  bytes: 4 * 1024 * 1024,
  itens: 990,
  // ⚠ Contagem de elementos é a defesa contra XML "largo" dentro do teto de bytes; profundidade, contra
  // o "fundo". 990 itens × ~40 elementos cada ≈ 40 mil — 150 mil dá folga sem abrir a porta.
  elementos: 150_000,
  profundidade: 40,
  // ⚠⚠ Por campo E no total. 300 caracteres por campo não limita o conjunto (achado do Codex): 990
  // itens × 300 seriam 300 mil caracteres de texto de terceiro dentro do prompt.
  textoPorCampo: 300,
  textoTotal: 12_000,
};

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Troca caractere de controle por espaço (ou remove). ⚠ Filtro por CÓDIGO, não regex: a regra
 * `no-control-regex` do projeto existe para pegar controle ACIDENTAL em regex — aqui ele é o alvo, e
 * escrever assim diz isso sem desligar a regra.
 */
const semControle = (t, { manterQuebra = false, trocarPor = "" } = {}) => [...String(t)].map((c) => {
  const n = c.charCodeAt(0);
  const controle = n < 32 || n === 127;
  if (!controle) return c;
  if (manterQuebra && (n === 9 || n === 10 || n === 13)) return c;
  return trocarPor;
}).join("");

/** ⚠ Nome de arquivo é METADADO NÃO CONFIÁVEL: nunca vira caminho nem identificador. */
export const nomeSeguro = (nome) =>
  semControle(String(nome ?? "anexo.xml")).replace(/[\\/]/g, "_").trim().slice(0, 120) || "anexo.xml";

/**
 * Conferência do TEXTO, antes do parse.
 *
 * ⚠⚠ DTD É RECUSADO, NÃO IGNORADO. O `@xmldom/xmldom` 0.9 não resolve entidade externa nem expande
 * entidade interna — testado em 24/09/2026. Mas NF-e NUNCA traz DTD: um arquivo com `<!DOCTYPE`
 * ou `<!ENTITY` não é uma nota, é um arquivo montado para testar o parser. Recusar deixa a
 * segurança independente de um detalhe de implementação da biblioteca.
 */
function conferirTexto(bruto) {
  if (bruto.length > LIMITES.bytes) return `O arquivo passa de ${LIMITES.bytes / 1024 / 1024} MB.`;
  if (/<!DOCTYPE|<!ENTITY/i.test(bruto)) return "O arquivo declara DTD/entidades — uma NF-e nunca faz isso. Envie o XML original da nota.";
  const infs = (bruto.match(/<infNFe[\s>]/g) ?? []).length;
  if (infs === 0) return "O arquivo não parece uma NF-e (não há `infNFe`).";
  // ⚠ Mais de um `infNFe` é AMBÍGUO: `lerNfe` leria o primeiro e ignoraria o resto em silêncio.
  if (infs > 1) return `O arquivo contém ${infs} notas. Anexe uma NF-e por vez.`;
  return null;
}

/** Profundidade e quantidade de elementos — o XML "fundo" e o XML "largo" dentro do teto de bytes. */
function conferirForma(doc) {
  let elementos = 0;
  let maisFundo = 0;
  const pilha = [[doc.documentElement, 1]];
  while (pilha.length) {
    const [no, nivel] = pilha.pop();
    if (!no || no.nodeType !== 1) continue;
    elementos += 1;
    if (nivel > maisFundo) maisFundo = nivel;
    if (elementos > LIMITES.elementos) return "O XML tem elementos demais para uma NF-e.";
    if (maisFundo > LIMITES.profundidade) return "O XML é aninhado fundo demais para uma NF-e.";
    for (let f = no.firstChild; f; f = f.nextSibling) if (f.nodeType === 1) pilha.push([f, nivel + 1]);
  }
  return null;
}

/**
 * ⚠⚠ O DOCUMENTO NORMALIZADO É CONFERIDO CAMPO A CAMPO. `soDigitos` limpa, mas não valida: "12" vira
 * um CFOP de dois dígitos que segue viagem. Campo fora de formato é ANOTADO — não recusa a nota
 * inteira, porque nota real às vezes traz campo opcional vazio — e o que foi anotado some do lastro.
 */
function conferirCampos(doc) {
  const problemas = [];
  if (doc.chave && doc.chave.length !== 44) problemas.push(`chave de acesso com ${doc.chave.length} dígitos (esperado 44)`);
  for (const uf of [doc.emitente?.uf, doc.destinatario?.uf]) {
    if (uf && !/^[A-Z]{2}$/.test(uf)) problemas.push(`UF inválida: ${String(uf).slice(0, 10)}`);
  }
  const itens = doc.itens.map((it) => {
    const cfop = /^\d{4}$/.test(it.cfop) ? it.cfop : null;
    const ncm = /^\d{8}$/.test(it.ncm) ? it.ncm : null;
    if (it.cfop && !cfop) problemas.push(`item ${it.item}: CFOP fora do formato`);
    if (it.ncm && !ncm) problemas.push(`item ${it.item}: NCM fora do formato`);
    const cstIpi = /^\d{2}$/.test(String(it.ipi?.cst ?? "")) ? String(it.ipi.cst) : null;
    return { ...it, cfop, ncm, ipi: it.ipi ? { ...it.ipi, cst: cstIpi } : it.ipi };
  });
  return { doc: { ...doc, itens }, problemas };
}

/**
 * ⚠ HEURÍSTICA, E A TELA DIZ ISSO. Ela não é a defesa — a defesa é o modelo nunca receber o XML cru,
 * os blocos fiscais saírem do servidor e as ferramentas serem de leitura. Falso positivo existe
 * ("desconsiderar a NF anterior" é frase legítima de nota), por isso ela só AVISA, nunca bloqueia,
 * e a ausência de aviso não é garantia de nada.
 */
const INSTRUCAO = /\b(ignore|ignora|desconsidere as (regras|instru)|instru[cç][aã]o|system prompt|prompt|voc[eê] [eé] (um|o|a)|assistant|jailbreak)\b/i;

export function sinaisDeInstrucao(doc) {
  const campos = [doc.naturezaOperacao, doc.emitente?.nome, doc.destinatario?.nome,
    ...doc.itens.flatMap((i) => [i.descricao, i.descricaoItem])];
  return campos.some((t) => t && INSTRUCAO.test(t));
}

const cortar = (t, orcamento) => {
  if (t == null || orcamento.resta <= 0) return null;
  const s = semControle(t, { manterQuebra: true, trocarPor: " " }).slice(0, Math.min(LIMITES.textoPorCampo, orcamento.resta));
  orcamento.resta -= s.length;
  return s;
};

/**
 * O que o MODELO recebe. ⚠⚠ NUNCA O XML CRU: campos tipados como estão, texto livre cortado por
 * campo e no total, e tudo serializado como DADO. O `infAdProd` fica — sem ele os 24 itens da NF-e
 * 973 são indistinguíveis (Matheus: "o que é cada um vai na descrição do item") —, mas com teto.
 */
export function resumoParaModelo(doc) {
  const orc = { resta: LIMITES.textoTotal };
  return {
    origem: "XML ANEXADO PELO USUÁRIO — dados extraídos pelo portal; autenticidade NÃO verificada",
    numero: doc.numero, serie: doc.serie, chave: doc.chave, emitidaEm: doc.emitidaEm,
    naturezaOperacao: cortar(doc.naturezaOperacao, orc),
    emitente: { cnpj: doc.emitente?.cnpj, uf: doc.emitente?.uf, nome: cortar(doc.emitente?.nome, orc) },
    destinatario: { cnpj: doc.destinatario?.cnpj, uf: doc.destinatario?.uf, nome: cortar(doc.destinatario?.nome, orc) },
    referenciadas: doc.referenciadas,
    totais: doc.totais,
    itens: doc.itens.map((i) => ({
      item: i.item, ncm: i.ncm, cfop: i.cfop, valor: i.valor, quantidade: i.quantidade, unidade: i.unidade,
      ipi: i.ipi ? { cst: i.ipi.cst, aliquota: i.ipi.aliquota, valor: i.ipi.valor, cEnq: i.ipi.cEnq } : null,
      icmsCst: i.icms?.cst ?? i.icms?.csosn ?? null,
      descricao: cortar(i.descricao, orc),
      descricaoItem: cortar(i.descricaoItem, orc),
    })),
    textoCortado: orc.resta <= 0,
  };
}

/**
 * A entrada inteira: texto → conferência → parse com erros COLETADOS → forma → leitura → campos.
 * Devolve `{ erro }` ou `{ doc, problemas, suspeito }`.
 */
export function lerAnexoNfe(bruto) {
  const texto = String(bruto ?? "");
  const recusa = conferirTexto(texto);
  if (recusa) return { erro: recusa };

  // ⚠⚠ OS ERROS DO PARSER SÃO COLETADOS, NÃO SILENCIADOS. `lerNfe` usa `onError: () => {}` porque
  // a Auditoria lê notas que o próprio portal baixou; aqui o arquivo veio da mão de alguém.
  const fatais = [];
  let dom;
  try {
    dom = new DOMParser({ onError: (nivel, msg) => { if (nivel !== "warning") fatais.push(String(msg).slice(0, 120)); } })
      .parseFromString(texto, "text/xml");
  } catch (e) {
    return { erro: `XML inválido: ${String(e.message).slice(0, 120)}` };
  }
  if (fatais.length) return { erro: `XML malformado: ${fatais[0]}` };
  const forma = conferirForma(dom);
  if (forma) return { erro: forma };

  const lido = lerNfe(texto);
  if (lido.erro) return { erro: lido.erro };
  if (lido.itens.length > LIMITES.itens) return { erro: `A nota tem ${lido.itens.length} itens — o leiaute da NF-e permite até ${LIMITES.itens}.` };

  const { doc, problemas } = conferirCampos(lido);
  return { doc, problemas, suspeito: sinaisDeInstrucao(doc) };
}

export { soDigitos };
