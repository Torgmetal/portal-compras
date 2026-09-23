import { createHash } from "node:crypto";
import { CFOPS, OPERACOES } from "@/lib/fiscal/cfop";
import { CENARIOS, AJUSTES_POR_CFOP } from "@/lib/fiscal/cenarios";

// ─── O CATÁLOGO DE REGRAS ────────────────────────────────────────────────────
//
// As regras continuam EM CÓDIGO — revisadas, testadas e versionadas no git. O que este módulo faz
// é dar a cada uma **identidade estável** e **impressão digital do conteúdo**, para que a
// contabilidade possa dizer "conferi esta, nesta versão, nesta data" e para que uma mudança no
// código derrube a conferência em vez de herdá-la em silêncio.
//
// ⚠⚠ POR QUE NÃO MOVI AS REGRAS PARA O BANCO (parecer do Codex, 23/09/2026). Regra em tabela sai
// do alcance do PR, do lint, do teste e da revisão — uma linha errada passaria a mudar em silêncio
// o que o portal manda emitir, e o briefing é explícito: *"NÃO INVENTE REGRAS"*. Autoria de regra
// pela contabilidade fica **fora desta entrega**, e isso é decisão de escopo, não esquecimento.
//
// ⚠⚠ O ID NÃO PODE SER A POSIÇÃO NO ARRAY. Inserir uma etapa no meio da cadeia renumeraria todas e
// transferiria, calada, a conferência de uma etapa para outra. O id sai do CONTEÚDO que identifica
// a regra — quem emite, qual CFOP, qual papel.

const TIPO = { CFOP: "cfop", ETAPA: "etapa", CENARIO: "cenario" };

const fatia = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/**
 * ⚠⚠ A IMPRESSÃO DIGITAL COBRE O QUE DECIDE O RESULTADO, NÃO A APRESENTAÇÃO. Entram condições,
 * efeitos, emitente, âmbito, fundamentos e o texto que ORIENTA A EMISSÃO — porque uma vírgula
 * nesse texto pode mudar o sentido, e é preferível uma reconferência a mais do que herdar uma
 * aprovação sobre um texto que virou outro. Não entram comentários de código.
 *
 * ⚠ Serialização determinística: chaves ordenadas. `JSON.stringify` cru numa ordem de chaves
 * diferente produziria um hash novo a cada refatoração sem mudança nenhuma de conteúdo.
 */
export function impressao(conteudo) {
  const ordenar = (v) => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v && typeof v === "object") {
      return Object.keys(v).sort().reduce((o, k) => { o[k] = ordenar(v[k]); return o; }, {});
    }
    return v ?? null;
  };
  return createHash("sha256").update(JSON.stringify(ordenar(conteudo))).digest("hex").slice(0, 16);
}

function doCfop(c) {
  const conteudo = {
    codigo: c.codigo, familia: c.familia, emitente: c.emitente, ambito: c.ambito,
    resumo: c.resumo, quando: c.quando, exige: c.exige ?? [], nota: c.nota ?? null,
  };
  return {
    id: `${TIPO.CFOP}:${c.codigo}`, tipo: TIPO.CFOP,
    titulo: `${c.codigoFormatado} — ${c.resumo}`,
    contexto: `Família ${c.familia} · emitente ${c.emitente}`,
    // ⚠ O que a contabilidade vai conferir contra o CONFAZ, à vista na tela de validação.
    conteudo, impressao: impressao(conteudo),
  };
}

function daEtapa(op, n) {
  const conteudo = {
    operacao: op.id, quem: n.quem, cfop: n.cfop ?? null, papel: n.papel,
    natureza: n.natureza ?? null, fundamento: n.fundamento ?? null,
    cita: n.cita?.rotulo ?? null, condicional: n.condicional ?? null, obs: n.obs ?? null,
  };
  return {
    id: `${TIPO.ETAPA}:${op.id}:${fatia(n.quem)}:${fatia(n.cfop ?? "sem-cfop")}:${fatia(n.papel)}`,
    tipo: TIPO.ETAPA,
    titulo: `${n.cfop ?? "sem CFOP"} — ${n.papel}`,
    contexto: `${op.titulo} · emitida por ${n.quem}`,
    conteudo, impressao: impressao(conteudo),
  };
}

function doCenario(familia, c) {
  const conteudo = {
    familia, resumo: c.resumo,
    icms: { candidatos: c.icms.candidatos.map((x) => ({ cst: x.cst, provavel: Boolean(x.provavel) })), porque: c.icms.porque },
    pisCofins: { candidatos: c.pisCofins.candidatos.map((x) => ({ cst: x.cst, provavel: Boolean(x.provavel) })), porque: c.pisCofins.porque },
    ajustes: Object.entries(AJUSTES_POR_CFOP).filter(([, a]) => a.familia === familia).map(([k]) => k),
  };
  return {
    id: `${TIPO.CENARIO}:${fatia(familia)}`, tipo: TIPO.CENARIO,
    titulo: `CST da família ${familia}`,
    contexto: c.resumo,
    conteudo, impressao: impressao(conteudo),
  };
}

/** TODAS as regras do módulo, com id estável e impressão digital do conteúdo. */
export function catalogoDeRegras() {
  const regras = [
    ...CFOPS.map(doCfop),
    ...OPERACOES.flatMap((op) => (op.notas ?? []).map((n) => daEtapa(op, n))),
    ...Object.entries(CENARIOS).map(([familia, c]) => doCenario(familia, c)),
  ];
  // ⚠⚠ ID REPETIDO É DEFEITO, NÃO DETALHE: duas regras com o mesmo id fariam a conferência de uma
  // valer pela outra. Aqui isso vira erro, e o teste cobre o catálogo inteiro.
  const vistos = new Set();
  for (const r of regras) {
    if (vistos.has(r.id)) throw new Error(`Duas regras com o mesmo id no catálogo: ${r.id}`);
    vistos.add(r.id);
  }
  return regras;
}

/**
 * Os ids das regras que UM resultado do simulador usa.
 *
 * ⚠⚠ APROVAR O CFOP NÃO APROVA O CST (parecer do Codex, 23/09/2026). O verbete do CFOP e o cenário
 * de CST da família são regras DIFERENTES, conferidas separadamente — e basta uma delas bloqueada
 * para o resultado não poder ser copiado.
 */
export const idsDoResultado = (cfop) => (cfop ? [`${TIPO.CFOP}:${cfop.codigo}`, `${TIPO.CENARIO}:${fatia(cfop.familia)}`] : []);

export const regraPorId = (id) => catalogoDeRegras().find((r) => r.id === id) ?? null;
