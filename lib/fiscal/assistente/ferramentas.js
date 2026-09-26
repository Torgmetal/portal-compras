import "server-only";
import { prisma } from "@/lib/prisma";
import { buscarNcm, detalharNcm, referenciaAtiva } from "@/lib/fiscal/consulta";
import { CFOPS, buscarCfop, operacoesDoCfop } from "@/lib/fiscal/cfop";
import { simular, ambitoDe, daEscolhaDoCfop } from "@/lib/fiscal/simulador";
import { idsDoResultado, regraPorId } from "@/lib/fiscal/catalogo-regras";
import { decisoesVigentes } from "@/lib/fiscal/validacao-regras";
import { situacaoDaRegra, situacaoDoConjunto } from "@/lib/fiscal/politica-regras";
import { verbetesAprovados } from "@/lib/fiscal/registro-classificacao";
import { verbetesDoCodigo, procurarClassificacao } from "@/lib/fiscal/classificacao-produto";
import { buscarLegislacao } from "@/lib/fiscal/assistente/recuperacao";
import * as C from "@/lib/fiscal/assistente/contrato";

// ─── AS FERRAMENTAS DO ASSISTENTE ────────────────────────────────────────────
//
// ⚠⚠ TODAS SÃO DE LEITURA. Nenhuma escreve no banco fiscal, nenhuma emite nota, nenhuma muda o
// status de aprovação de uma regra. O briefing é explícito nos três pontos, e a lista é FECHADA:
// o modelo não escolhe uma ferramenta que não esteja aqui, não recebe SQL e não recebe URL.
//
// ⚠⚠ CADA FERRAMENTA DEVOLVE `{ estrutura, bloco }`. `estrutura` é o que o modelo lê para raciocinar;
// `bloco` é o que o SERVIDOR renderiza na tela. É a fronteira do parecer do Codex: o modelo comenta
// o CFOP, ele não escreve o CFOP.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** ⚠ O esquema é o CONTRATO com o modelo. Campo a mais aqui é campo que ele vai tentar preencher. */
export const ESQUEMAS = [
  {
    name: "consultar_ncm",
    description: "Consulta a TIPI oficial por um código NCM de 8 dígitos e devolve a alíquota de IPI geral, os Ex TIPI e a descrição hierárquica. Use quando o usuário informar um NCM.",
    input_schema: { type: "object", properties: { ncm: { type: "string", description: "NCM com 8 dígitos, com ou sem pontuação." } }, required: ["ncm"] },
  },
  {
    name: "buscar_ncm",
    description: "Procura NCMs na TIPI pela DESCRIÇÃO do produto e devolve até 8 candidatos por semelhança de texto, com a alíquota de IPI de cada um. Use quando o usuário descrever a peça mas não souber o código. Devolve candidatos, nunca a escolha: quem enquadra a mercadoria é quem a conhece.",
    input_schema: { type: "object", properties: { termo: { type: "string", description: "A descrição da peça ou do material, em português (ex.: \"parafuso sextavado de aço\")." } }, required: ["termo"] },
  },
  {
    name: "consultar_cfop",
    description: "Consulta a tabela de CFOPs que a TORG utiliza. Com `codigo`, devolve aquele CFOP se ele estiver na tabela; com `termo`, devolve até 6 candidatos que casam com a descrição da operação. CFOP fora da tabela da TORG não é devolvido — a resposta diz que ele não está na tabela.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "CFOP de 4 dígitos, com ou sem ponto (ex.: \"5101\" ou \"5.101\")." },
        termo: { type: "string", description: "A operação descrita em palavras, quando não se sabe o código (ex.: \"remessa para industrialização\")." },
      },
    },
  },
  {
    name: "buscar_legislacao",
    description: "Procura o fundamento legal na base jurídica interna da TORG (RICMS/SP, Decisão Normativa CAT e Respostas à Consulta da SEFAZ-SP). Resultado vazio significa que ESTA BASE não cobre o assunto — nunca que não existe previsão legal.",
    input_schema: { type: "object", properties: { consulta: { type: "string", description: "A pergunta ou a operação descrita, em português." } }, required: ["consulta"] },
  },
  {
    // ⚠ O Codex pediu este nome: hoje NÃO HÁ regra validada, e chamar de "regra validada" faria o
    // modelo — e quem lê — supor conferência que não aconteceu.
    name: "consultar_regra_e_situacao",
    description: "Diz se as regras internas que sustentam um CFOP foram conferidas pela contabilidade, e em que estado estão (PENDENTE, VALIDADA, ALTERADA, CONTESTADA, INDISPONIVEL). CONTESTADA e INDISPONIVEL impedem orientação.",
    input_schema: { type: "object", properties: { cfop: { type: "string", description: "CFOP de 4 dígitos." } }, required: ["cfop"] },
  },
  {
    name: "simular_operacao",
    description: "Simulação fiscal determinística de uma operação de saída: IPI pela TIPI (a versão fixada para esta conversa), ICMS de referência, conferência do CFOP contra as UFs, alertas e as perguntas que ainda faltam. Use-a para qualquer alíquota ou valor de imposto da resposta: o portal confere os números escritos contra os blocos que as ferramentas devolveram, e número sem lastro aparece como alerta ao usuário.",
    input_schema: {
      type: "object",
      properties: {
        ncm: { type: "string", description: "NCM com 8 dígitos, com ou sem pontuação." },
        cfop: { type: "string", description: "Código único ou par '5101/6101' (a simulação escolhe pelo âmbito das UFs)." },
        ufOrigem: { type: "string", description: "UF de origem, sigla (ex.: \"SP\"). Padrão: SP." },
        ufDestino: { type: "string", description: "UF de destino, sigla." },
        valor: { type: "number", description: "Valor da operação em reais, se o usuário informou." },
        cstPretendido: { type: "string", description: "CST que o usuário pretende usar, para conferência." },
      },
      required: ["ncm", "cfop"],
    },
  },
  {
    name: "consultar_classificacao",
    description: "Procura no registro interno se a contabilidade já decidiu o NCM de uma peça com esta descrição. Devolve EVIDÊNCIA de decisão humana — nunca enquadra a peça sozinho.",
    input_schema: {
      type: "object",
      properties: {
        descricao: { type: "string", description: "A descrição da peça como o usuário a chama." },
        codigoProduto: { type: "string", description: "O código do produto no cadastro, se o usuário souber." },
      },
      required: ["descricao"],
    },
  },
];

export const NOMES = ESQUEMAS.map((e) => e.name);

/** ⚠ Resposta padrão quando a ferramenta não tem o que devolver — nunca `null` solto, que o modelo
 *  interpretaria como "não existe". */
const vazio = (motivo) => ({ estrutura: { encontrado: false, motivo }, bloco: null });

async function daTipiPara(ncm, versaoId) {
  const linhas = await prisma.fiscalTipiLinha.findMany({ where: { versaoId, nivel: "NCM", codigo: ncm } });
  return linhas.length ? { geral: linhas.find((l) => !l.ex) ?? null, excecoes: linhas.filter((l) => l.ex) } : undefined;
}

/** A situação das regras que um CFOP aciona — usada pela ferramenta e pela simulação. */
/**
 * ⚠ As decisões da contabilidade também são lidas UMA vez por execução quando o contexto as traz:
 * uma contestação registrada entre duas ferramentas faria a mesma resposta dizer "pendente" num
 * bloco e "contestada" no outro.
 */
async function situacaoDoCfop(codigo, ctx = {}) {
  const decisoes = ctx.decisoes !== undefined ? ctx.decisoes : await decisoesVigentes();
  const cfop = CFOPS.find((c) => c.codigo === soDigitos(codigo)) ?? null;
  const ids = idsDoResultado(cfop);
  if (!ids.length) return null;
  return situacaoDoConjunto(ids.map((id) => {
    const r = regraPorId(id);
    return r ? situacaoDaRegra(r, decisoes?.get(id), { disponivel: decisoes !== null }) : null;
  }));
}

const EXECUTORES = {
  async consultar_ncm({ ncm }, ctx) {
    const r = await detalharNcm(ncm, { referencia: ctx.referencia });
    if (r.erro) return vazio(r.erro);
    return { estrutura: { ncm: r.ncmFormatado, descricao: r.descricaoCompleta, ipiGeral: r.geral?.ipi ?? null, excecoes: r.excecoes?.map((e) => ({ ex: e.ex, ipi: e.ipi })) ?? [] }, bloco: C.blocoNcm(r) };
  },

  async buscar_ncm({ termo }, ctx) {
    const r = await buscarNcm(termo, { limite: 8, referencia: ctx.referencia });
    const itens = (r?.resultados ?? []).slice(0, 8);
    if (!itens.length) return vazio(`Nenhum NCM da TIPI casa com "${termo}".`);
    return {
      // ⚠⚠ CANDIDATOS, NÃO ESCOLHA. Devolver um só faria o modelo apresentá-lo como "o NCM da peça",
      // e classificação de mercadoria é decisão humana — é a regra de `classificacao-produto.js`.
      estrutura: { candidatos: itens.map((i) => ({ ncm: i.codigoFormatado, descricao: i.descricaoCompleta ?? i.descricao, ipi: i.ipi?.rotulo ?? null })), aviso: "Candidatos por semelhança textual. Quem enquadra a mercadoria é quem a conhece." },
      bloco: null,
    };
  },

  async consultar_cfop({ codigo, termo }) {
    const d = soDigitos(codigo);
    const achado = d ? CFOPS.find((c) => c.codigo === d) : null;
    if (achado) return { estrutura: { cfop: achado }, bloco: C.blocoCfop(achado) };
    const lista = termo ? buscarCfop(termo) : [];
    if (!lista.length) return vazio(codigo ? `O CFOP ${codigo} não está na tabela que a TORG utiliza.` : "Descreva a operação para eu procurar o CFOP.");
    return { estrutura: { candidatos: lista.slice(0, 6).map((c) => ({ codigo: c.codigoFormatado, resumo: c.resumo, quando: c.quando })) }, bloco: lista.length === 1 ? C.blocoCfop(lista[0]) : null };
  },

  async buscar_legislacao({ consulta }, ctx) {
    const r = await buscarLegislacao(consulta, { corpus: ctx.corpus });
    if (!r.achados.length) {
      return {
        estrutura: { encontrado: false, cobertura: r.cobertura,
          motivo: "Não encontrei fundamento NESTA BASE para o assunto. Isso não significa que não exista previsão legal — significa que o documento não está na base interna da TORG." },
        bloco: null,
      };
    }
    return { estrutura: { achados: r.achados.map(({ trecho, ...resto }) => ({ ...resto, trecho: trecho.slice(0, 1200) })), cobertura: r.cobertura }, bloco: C.blocoLegislacao(r.achados) };
  },

  async consultar_regra_e_situacao({ cfop }, ctx) {
    const s = await situacaoDoCfop(cfop, ctx);
    if (!s) return vazio(`O CFOP ${cfop} não está na tabela da TORG, então não há regra interna sobre ele.`);
    return {
      estrutura: { bloqueada: s.bloqueada, motivo: s.motivo, todasValidadas: s.todasValidadas, pendentes: s.pendentes, alteradas: s.alteradas, regras: s.regras.map((r) => ({ titulo: r.titulo, situacao: r.situacao, motivo: r.motivo })) },
      bloco: {
        tipo: C.BLOCO.REGRA, titulo: "Conferência pela contabilidade", bloqueio: s.bloqueada ? s.motivo : null, fontes: [],
        linhas: s.regras.map((r) => ({ rotulo: r.titulo, valor: r.situacao, ressalva: r.motivo })),
        lastro: C.lastro(C.ORIGEM.REGRA, { cfops: s.regras.map((r) => /^cfop:(\d{4})$/.exec(r.id ?? "")?.[1]) }),
      },
    };
  },

  async simular_operacao(entrada, ctx) {
    const ncm = soDigitos(entrada.ncm);
    // ⚠⚠ A VERSÃO FIXADA PELA EXECUÇÃO, não "a ATIVA agora" (achado do Codex, 24/09/2026). Antes esta
    // ferramenta reconsultava `status: "ATIVA"` — e se a sincronização ativasse uma TIPI nova entre
    // o `consultar_ncm` e esta simulação, a MESMA resposta mostraria duas alíquotas de duas versões.
    const t = ctx.referencia?.tipi;
    if (!t) return vazio("Nenhuma versão da TIPI está ativa — a simulação fica indisponível.");
    const versao = { id: t.id, arquivo: { sha256: t.fonte.sha256 }, observadoEm: t.observadoEm, vigenciaInicio: t.vigenciaInicio };
    const dados = {
      ncm, cfop: entrada.cfop ?? null,
      ufOrigem: entrada.ufOrigem || "SP", ufDestino: entrada.ufDestino || null,
      valor: entrada.valor ?? null, cstPretendido: entrada.cstPretendido ?? null,
    };
    const escolhido = daEscolhaDoCfop(dados.cfop, ambitoDe(dados.ufOrigem, dados.ufDestino))?.cfop ?? null;
    const validacao = escolhido ? await situacaoDoCfop(escolhido.codigo, ctx) : null;
    const r = simular(dados, await daTipiPara(ncm, versao.id), {
      validacao, versaoId: versao.id, sha256: versao.arquivo.sha256,
      observadoEm: versao.observadoEm, vigenciaDeclarada: Boolean(versao.vigenciaInicio),
    });
    return {
      estrutura: { cfop: r.cfop ?? null, ipi: r.ipi ?? null, icms: r.icms ?? null, alertas: r.alertas ?? [], perguntas: r.perguntas ?? [], bloqueada: Boolean(validacao?.bloqueada) },
      bloco: C.blocoSimulacao(r),
    };
  },

  async consultar_classificacao({ descricao, codigoProduto }, ctx) {
    const verbetes = ctx.verbetes !== undefined ? ctx.verbetes : await verbetesAprovados();
    if (verbetes === null) return vazio("Não consegui ler o registro de classificações — a conferência fica suspensa.");
    const achado = procurarClassificacao({ descricaoItem: descricao, codigo: codigoProduto }, verbetesDoCodigo(verbetes, codigoProduto));
    return {
      estrutura: { status: achado.status, motivo: achado.motivo, candidatos: achado.candidatos ?? [],
        aviso: "Evidência de decisão humana registrada. Não é enquadramento automático." },
      bloco: C.blocoClassificacao(achado),
    };
  },
};

/**
 * ⚠⚠ LISTA FECHADA, ARGUMENTOS VALIDADOS, ERRO QUE NÃO VAZA STACK. Nome fora da lista é recusa, não
 * busca nova — e é aqui que o parecer do Codex sobre injeção de prompt encosta: um XML ou um
 * documento recuperado que peça "chame a ferramenta X" não tem ferramenta X para chamar.
 */
export async function executar(nome, argumentos, contexto = {}) {
  const exec = EXECUTORES[nome];
  if (!exec) return { estrutura: { erro: `Ferramenta desconhecida: ${nome}.` }, bloco: null };
  try {
    return await exec(argumentos ?? {}, contexto);
  } catch (e) {
    return { estrutura: { erro: `A consulta falhou: ${e.message}` }, bloco: null };
  }
}

export { referenciaAtiva, operacoesDoCfop };
