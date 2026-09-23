// ─── O PEDIDO DO OMIE, LIDO COMO DOCUMENTO AUDITÁVEL ─────────────────────────
//
// ⚠⚠ VALIDAR ANTES DE EMITIR É O PONTO INTEIRO DO MÓDULO. Matheus (23/09/2026): *"na Auditoria
// precisa ser possível selecionar uma medição do Omie para validar ela antes de emitir"*. A
// auditoria de XML acha o erro DEPOIS — a NF-e 973 custou R$ 7.026,56 de IPI não destacado e só
// apareceu quando alguém foi procurar. O pedido de venda é o mesmo documento antes de existir.
//
// ⚠⚠ E ELE TEM TUDO O QUE O `ListarNF` NÃO TEM: `cod_sit_trib_ipi` (o CST), `enquadramento_ipi`
// (o cEnq) e `dados_adicionais_item` (a descrição real da peça). São exatamente os três campos que
// obrigaram a auditoria a pedir o XML — e no pedido eles já estão lá, antes da emissão.
//
// ⚠ A SAÍDA TEM A MESMA FORMA QUE `lerNfe` DEVOLVE, de propósito: o motor de auditoria é o mesmo,
// sem uma linha de "se for pedido, faça diferente". Duas leituras, um julgamento — a mesma regra
// que vale entre o simulador e a auditoria.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * ⚠⚠ O NCM QUE O OPERADOR ESCREVEU NA DESCRIÇÃO. Visto no pedido 327 (OP 120 / TMSA, 23/09/2026):
 * os SEIS itens trazem `[NCM: 84313900]` em `dados_adicionais_item` e `9406.90.20` no campo
 * fiscal. É a marca do problema que o Matheus já tinha descrito — *"alteramos o NCM conforme o
 * cliente solicita"* — e sem ler a descrição ninguém vê que os dois campos discordam.
 */
export function ncmNaDescricao(texto) {
  const m = String(texto ?? "").match(/NCM[:\s]*([\d.]{8,10})/i);
  const d = m ? soDigitos(m[1]) : "";
  return d.length === 8 ? d : null;
}

/** ⚠ O Omie devolve o IPI com `aliq_ipi` mesmo quando o CST é de não tributação — e aí o zero não
 *  é alíquota, é ausência. O grupo é derivado do CST, como no XML. */
function lerIpi(imposto) {
  const i = imposto?.ipi ?? {};
  const cst = String(i.cod_sit_trib_ipi ?? "").trim() || null;
  const tributado = cst === "50";
  return {
    grupo: cst ? (tributado ? "IPITrib" : "IPINT") : null,
    cst,
    cEnq: String(i.enquadramento_ipi ?? "").trim() || null,
    aliquota: tributado ? num(i.aliq_ipi) : null,
    valor: num(i.valor_ipi) ?? 0,
    base: tributado ? num(i.base_ipi) : null,
  };
}

const lerIcms = (imposto) => {
  const c = imposto?.icms ?? {};
  return {
    grupo: c.cod_sit_trib_icms ? `ICMS${c.cod_sit_trib_icms}` : null,
    cst: String(c.cod_sit_trib_icms ?? "").trim() || null,
    aliquota: num(c.aliq_icms), valor: num(c.valor_icms), base: num(c.base_icms),
    origem: String(c.origem_icms ?? "").trim() || null,
  };
};

/**
 * @param {object} payload   o `payload` de `OPMedicao` (o `pedido_venda_produto` do Omie)
 * @param {object} contexto  { op: { numero, cliente, clienteUF, clienteCnpj, clienteIE } }
 */
export function lerPedidoOmie(payload, contexto = {}) {
  const p = payload?.pedido_venda_produto ?? payload;
  if (!p?.det?.length) {
    // ⚠ Medição lançada à mão no portal não tem pedido no Omie — e isso é resultado, não erro:
    // não há o que auditar, e dizer por quê evita a caça ao bug que não existe.
    return { erro: payload?._manual
      ? "Esta medição foi lançada manualmente no portal e não tem pedido de venda no Omie para auditar."
      : "O pedido do Omie não traz itens (`det`) para auditar." };
  }
  const cab = p.cabecalho ?? {};
  const op = contexto.op ?? {};

  const itens = p.det.map((d, i) => {
    const prod = d.produto ?? {};
    const descricaoItem = d.inf_adic?.dados_adicionais_item ?? d.observacao ?? null;
    return {
      item: i + 1,
      codigo: prod.codigo ?? null,
      descricao: prod.descricao ?? null,
      // ⚠⚠ É AQUI QUE MORA O QUE A PEÇA É DE VERDADE — todos os itens da TORG saem com o mesmo
      // `cProd` e a mesma `xProd`; o que distingue um do outro é esta linha.
      descricaoItem,
      ncm: soDigitos(prod.ncm),
      // ⚠ O NCM escrito na descrição, quando existe: é o que permite ver os dois campos discordarem.
      ncmDaDescricao: ncmNaDescricao(descricaoItem),
      cfop: soDigitos(prod.cfop),
      unidade: prod.unidade ?? null,
      quantidade: num(prod.quantidade),
      valorUnitario: num(prod.valor_unitario),
      // ⚠⚠ `valor_mercadoria` É A BASE, `valor_total` JÁ SOMA O IPI. Usar o total como base do IPI
      // faria o portal cobrar imposto sobre imposto e acusar divergência onde não há.
      valor: num(prod.valor_mercadoria) ?? num(prod.valor_total),
      ipi: lerIpi(d.imposto),
      icms: lerIcms(d.imposto),
    };
  });

  const t = p.total_pedido ?? {};
  return {
    // ⚠⚠ NÃO EXISTE CHAVE: o documento ainda não foi emitido, e inventar um identificador de NF-e
    // faria um pedido parecer nota na tela de quem confere.
    chave: null,
    pedido: String(cab.numero_pedido ?? ""),
    codigoPedido: cab.codigo_pedido ?? null,
    numero: null,
    serie: null,
    emitidaEm: null,
    previsao: cab.data_previsao ?? null,
    etapa: String(cab.etapa ?? "") || null,
    naturezaOperacao: null,
    emitente: { cnpj: "53694442000141", nome: "TORG METAL LTDA", uf: "SP" },
    destinatario: { cnpj: soDigitos(op.clienteCnpj), nome: op.cliente ?? null, uf: op.clienteUF ?? null, ie: op.clienteIE ?? null },
    itens,
    referenciadas: [],
    totais: { produtos: num(t.valor_mercadorias), ipi: num(t.valor_IPI), icms: num(t.valor_icms), nota: num(t.valor_total_pedido) },
  };
}
