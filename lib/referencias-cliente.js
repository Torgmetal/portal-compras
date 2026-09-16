// ─── REFERÊNCIAS DO CLIENTE: PAPÉIS FIXOS, PALAVRAS DE CADA CLIENTE ──────────────────────────
// Vitor (16/09/2026): "precisamos ter campos para descrever as TAGs, OCs, TPR da TMSA" e, sobre os
// outros clientes, "vamos deixar amarrado esses termos?" → não. O que é fixo é o PAPEL que cada
// código cumpre; a palavra é do cliente: TMSA diz TPR/OC/ETC/TAG, Danpower diz ENC/PC, Marko diz
// AF, Valmet diz OC. Se o campo se chamasse "OC", metade das obras digitaria no lugar errado.
//
// ⚠ A LÓGICA DO PORTAL SÓ CONHECE O PAPEL. Romaneio numerado pelo PROJETO, Kick Off e faturamento
// pelo PEDIDO, mapa e avanço pela TAG — para qualquer cliente. O rótulo é só o que a tela e os
// documentos mostram.
//
// ⚠ O RÓTULO É FOTOGRAFADO NA REFERÊNCIA (`OPReferencia.rotulo`). Se o cliente mudar o dicionário
// amanhã, a OP de ontem continua dizendo o que dizia no contrato dela.

/** Os quatro papéis, na ordem em que aparecem; OUTRO é o saco de códigos soltos (TDR, CNO…). */
export const PAPEIS = ["PROJETO", "PEDIDO", "ITEM", "TAG", "OUTRO"];

/** Rótulos genéricos — o que um cliente sem dicionário vê. */
export const TERMOS_PADRAO = {
  projeto: { rotulo: "Projeto", exemplo: "código do projeto/contrato no cliente", ativo: true },
  pedido: { rotulo: "Pedido", exemplo: "nº do pedido de compra", ativo: true },
  item: { rotulo: "Item", exemplo: "item do pedido", ativo: false },
  tag: { rotulo: "TAG", exemplo: "equipamento/posição", ativo: false },
};

const CHAVE = { PROJETO: "projeto", PEDIDO: "pedido", ITEM: "item", TAG: "tag" };

/**
 * O dicionário efetivo de um cliente: o dele por cima do padrão, papel a papel.
 * @param {object|null|undefined} termos `Cliente.termos`
 */
export function termosEfetivos(termos) {
  const out = {};
  for (const [k, padrao] of Object.entries(TERMOS_PADRAO)) {
    const t = termos && typeof termos === "object" ? termos[k] : null;
    out[k] = {
      rotulo: String(t?.rotulo || "").trim() || padrao.rotulo,
      exemplo: String(t?.exemplo || "").trim() || padrao.exemplo,
      ativo: t && typeof t.ativo === "boolean" ? t.ativo : padrao.ativo,
    };
  }
  return out;
}

/** O rótulo de um papel para este cliente ("OC", "AF", "Pedido"). OUTRO não tem rótulo fixo. */
export function rotuloDoPapel(papel, termos) {
  const k = CHAVE[String(papel || "").toUpperCase()];
  return k ? termosEfetivos(termos)[k].rotulo : "Outro";
}

/**
 * O texto único que os documentos ao cliente imprimem (`OP.refCliente`): PROJETOs, depois
 * PEDIDOs com o rótulo deles. ITEM e TAG ficam de fora — são detalhe, não identificação.
 * @param {Array<{papel:string, rotulo?:string, codigo:string}>} referencias
 * @returns {string|null}
 */
export function montarRefCliente(referencias) {
  const lista = Array.isArray(referencias) ? referencias : [];
  const cod = (r) => String(r.codigo || "").trim();
  const projetos = lista.filter((r) => r.papel === "PROJETO" && cod(r)).map(cod);
  const pedidos = lista.filter((r) => r.papel === "PEDIDO" && cod(r)).map((r) => {
    const rot = String(r.rotulo || "").trim();
    const c = cod(r);
    // "OC 231297-1", mas não "OC OC231297" quando o código já traz o rótulo
    return rot && !c.toUpperCase().startsWith(rot.toUpperCase()) ? `${rot} ${c}` : c;
  });
  const partes = [...new Set([...projetos, ...pedidos])];
  return partes.length ? partes.join(" · ") : null;
}

/**
 * Lê uma lista colada ("TC 8011, TC 8012\nSE-001") em códigos limpos, sem repetição.
 * @param {string} texto
 */
export function lerListaDeCodigos(texto) {
  const vistos = new Set();
  const out = [];
  for (const bruto of String(texto || "").split(/[\n;,]+/)) {
    const c = bruto.trim().replace(/\s+/g, " ");
    if (!c) continue;
    const k = c.toUpperCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(c);
  }
  return out;
}

/** Normaliza o nome do cliente para casar `OP.cliente` com `Cliente.nome`. */
export function nomeClienteNormalizado(nome) {
  return String(nome || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Dicionários dos clientes de hoje, lidos das OPs existentes (16/09/2026). Entram no cadastro na
 * primeira vez que o portal roda; quem sabe o termo certo corrige na tela do cliente.
 */
export const DICIONARIOS_INICIAIS = {
  "TMSA Tecnologia em movimentação": {
    projeto: { rotulo: "TPR", exemplo: "TPR00751", ativo: true },
    pedido: { rotulo: "OC", exemplo: "231297-1", ativo: true },
    item: { rotulo: "ETC", exemplo: "ETC-00846-16", ativo: true },
    tag: { rotulo: "TAG", exemplo: "TC 8011", ativo: true },
  },
  DANPOWER: {
    projeto: { rotulo: "ENC", exemplo: "ENC 0336", ativo: true },
    pedido: { rotulo: "PC", exemplo: "PC 26005242", ativo: true },
    item: { rotulo: "Item", exemplo: "", ativo: false },
    tag: { rotulo: "TAG", exemplo: "", ativo: false },
  },
  MARKO: {
    projeto: { rotulo: "Obra", exemplo: "Cyrela RJ", ativo: false },
    pedido: { rotulo: "AF", exemplo: "AF 10862", ativo: true },
    item: { rotulo: "Item", exemplo: "", ativo: false },
    tag: { rotulo: "TAG", exemplo: "", ativo: false },
  },
  VALMET: {
    projeto: { rotulo: "Projeto", exemplo: "", ativo: false },
    pedido: { rotulo: "OC", exemplo: "OC 401541", ativo: true },
    item: { rotulo: "Item", exemplo: "", ativo: false },
    tag: { rotulo: "TAG", exemplo: "", ativo: true },
  },
};

const PAPEIS_FILHOS = { ITEM: { chave: "item", campo: "itens" }, TAG: { chave: "tag", campo: "tags" } };
const num = (v) => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const dataOuNull = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(+d) ? null : d; };
const txt = (v, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };

/**
 * Transforma o que a tela manda (árvore por papel) nas linhas que `OPReferencia` guarda: cada
 * linha com o rótulo do cliente FOTOGRAFADO e a ordem; ITEM/TAG apontam para o índice do pedido
 * (`paiIndice`) para a gravação ligar `paiId` depois de criar os pais.
 *
 * Entrada: { projetos: ["TPR00751"], pedidos: [{ codigo, descricao, valor, data, revisao, itens: ["ETC-1"],
 * tags: ["TC 8011"] | [{ codigo, frente }] }], outros: [{ rotulo: "CNO", codigo }] }
 *
 * @returns {Array<{papel, rotulo, codigo, descricao, valor, data, revisao, frente, ordem, paiIndice:number|null}>}
 */
export function planificarReferencias(entrada, termos) {
  const t = termosEfetivos(termos);
  const linhas = [];
  const e = entrada && typeof entrada === "object" ? entrada : {};
  let ordem = 0;
  for (const p of lerListaDeCodigos(Array.isArray(e.projetos) ? e.projetos.join("\n") : e.projetos)) {
    linhas.push({ papel: "PROJETO", rotulo: t.projeto.rotulo, codigo: p, descricao: null, valor: null, data: null, revisao: null, frente: null, ordem: ordem++, paiIndice: null });
  }
  for (const ped of Array.isArray(e.pedidos) ? e.pedidos : []) {
    const codigo = txt(ped?.codigo, 120);
    if (!codigo) continue;
    const paiIndice = linhas.length;
    linhas.push({ papel: "PEDIDO", rotulo: t.pedido.rotulo, codigo, descricao: txt(ped.descricao, 300), valor: num(ped.valor), data: dataOuNull(ped.data), revisao: txt(ped.revisao, 40), frente: null, ordem: ordem++, paiIndice: null });
    for (const [papel, { chave, campo }] of Object.entries(PAPEIS_FILHOS)) {
      const bruto = ped[campo];
      const lista = Array.isArray(bruto) ? bruto : lerListaDeCodigos(bruto);
      for (const f of lista) {
        const cod = txt(typeof f === "string" ? f : f?.codigo, 120);
        if (!cod) continue;
        const frente = typeof f === "object" && f?.frente ? String(f.frente).trim().toUpperCase().slice(0, 4) : null;
        linhas.push({ papel, rotulo: t[chave].rotulo, codigo: cod, descricao: typeof f === "object" ? txt(f?.descricao, 300) : null, valor: null, data: null, revisao: null, frente, ordem: ordem++, paiIndice });
      }
    }
  }
  for (const o of Array.isArray(e.outros) ? e.outros : []) {
    const codigo = txt(o?.codigo, 120);
    if (!codigo) continue;
    linhas.push({ papel: "OUTRO", rotulo: txt(o?.rotulo, 40) || "Código", codigo, descricao: txt(o?.descricao, 300), valor: null, data: null, revisao: null, frente: null, ordem: ordem++, paiIndice: null });
  }
  return linhas;
}

/**
 * O caminho de volta: linhas do banco (com `id`/`paiId`) → árvore que a tela edita e mostra.
 */
export function agruparReferencias(linhas) {
  const lista = Array.isArray(linhas) ? [...linhas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)) : [];
  const porId = new Map(lista.map((l) => [l.id, l]));
  const arvore = { projetos: [], pedidos: [], outros: [] };
  const pedidos = new Map();
  for (const l of lista) {
    if (l.papel === "PROJETO") arvore.projetos.push({ id: l.id, codigo: l.codigo, rotulo: l.rotulo });
    else if (l.papel === "PEDIDO") { const p = { id: l.id, rotulo: l.rotulo, codigo: l.codigo, descricao: l.descricao, valor: l.valor, data: l.data, revisao: l.revisao, aditivoId: l.aditivoId || null, itens: [], tags: [] }; pedidos.set(l.id, p); arvore.pedidos.push(p); }
    else if (l.papel === "OUTRO") arvore.outros.push({ id: l.id, rotulo: l.rotulo, codigo: l.codigo, descricao: l.descricao });
  }
  for (const l of lista) {
    if (l.papel !== "ITEM" && l.papel !== "TAG") continue;
    const pai = l.paiId && porId.has(l.paiId) ? pedidos.get(l.paiId) : null;
    const alvo = pai || (arvore.pedidos[0] ?? null);
    const linha = { id: l.id, codigo: l.codigo, rotulo: l.rotulo, descricao: l.descricao, frente: l.frente };
    if (!alvo) { arvore.outros.push({ ...linha, papel: l.papel }); continue; }
    (l.papel === "ITEM" ? alvo.itens : alvo.tags).push(linha);
  }
  return arvore;
}
