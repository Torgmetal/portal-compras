import { describe, it, expect } from "vitest";
import { lerPedidoOmie, ncmNaDescricao } from "@/lib/fiscal/pedido-omie";
import { auditar, indiceDaTipi, GRAVIDADE } from "@/lib/fiscal/auditoria";

// ─── VALIDAR A MEDIÇÃO ANTES DE EMITIR ───────────────────────────────────────
//
// ⚠⚠ É O PONTO INTEIRO DO MÓDULO. Matheus (23/09/2026): *"na Auditoria precisa ser possível
// selecionar uma medição do Omie para validar ela antes de emitir"*. A auditoria de XML acha o
// erro DEPOIS — a NF-e 973 custou R$ 7.026,56 e só apareceu quando alguém foi procurar.
//
// ⚠⚠ O CASO DESTE ARQUIVO É REAL E ESTAVA EM ABERTO: pedido 327, OP 120 / TMSA-RS, R$ 429.877,11,
// etapa 10, **não faturado** em 23/09/2026. Seis itens, todos NCM 9406.90.20 no campo fiscal e
// `[NCM: 84313900]` na descrição; um com CST 50 a 3,25% e cinco com CST 53.

const item = (n, { ncm = "9406.90.20", cst = "53", aliq = 0, valor = 1000, desc = "PEÇA - [NCM: 84313900]" } = {}) => ({
  ide: { codigo_item: n },
  produto: { codigo: "ARM000001", descricao: "ARMACAO DE ESTRUTURAS METALICAS", ncm, cfop: "6.118",
    unidade: "KG", quantidade: 10, valor_unitario: valor / 10,
    valor_mercadoria: valor, valor_total: valor + (valor * aliq) / 100 },
  imposto: {
    ipi: { cod_sit_trib_ipi: cst, aliq_ipi: aliq, base_ipi: valor, valor_ipi: (valor * aliq) / 100, enquadramento_ipi: "999" },
    icms: { cod_sit_trib_icms: "00", aliq_icms: 12, base_icms: valor, valor_icms: valor * 0.12, origem_icms: "0" },
  },
  inf_adic: { dados_adicionais_item: desc },
});

const pedido = (itens, extra = {}) => ({
  pedido_venda_produto: {
    cabecalho: { numero_pedido: "327", codigo_pedido: 7826673701, etapa: "10", data_previsao: "16/11/2026", ...extra },
    det: itens,
    total_pedido: { valor_mercadorias: 429877.11, valor_IPI: 8061.22, valor_icms: 50617.9, valor_total_pedido: 429877.11 },
  },
});
const op = { numero: "120", cliente: "TMSA", clienteUF: "RS", clienteCnpj: "92782705000126", clienteIE: "0960821821" };

describe("ncmNaDescricao — o NCM que o operador escreveu", () => {
  it.each([
    ["LONGARINA CONFORME DESENHO 70408127-[NCM: 84313900] - [ETC: TPR699-087]", "84313900"],
    ["APOIO - [NCM: 8431.39.00] - x", "84313900"],
    ["peça NCM:94069020 fim", "94069020"],
  ])("acha em %s", (t, esp) => expect(ncmNaDescricao(t)).toBe(esp));

  // ⚠ Só 8 dígitos vale: "NCM 8431" é posição, não classificação — e tratar como NCM faria o
  // portal acusar divergência entre um código e o prefixo dele.
  it.each(["sem ncm nenhum", "NCM: 8431", "", null, "NCM: 123456789012"])("não inventa em %s", (t) => {
    expect(ncmNaDescricao(t)).toBeNull();
  });
});

describe("lerPedidoOmie — a mesma forma que o XML produz", () => {
  it("extrai CST, cEnq e a descrição real do item", () => {
    const d = lerPedidoOmie(pedido([item(1)]), { op });
    expect(d.itens[0]).toMatchObject({ ncm: "94069020", cfop: "6118", ncmDaDescricao: "84313900" });
    expect(d.itens[0].ipi).toMatchObject({ grupo: "IPINT", cst: "53", cEnq: "999" });
  });

  it("o CST 50 vira grupo tributado, com alíquota", () => {
    const d = lerPedidoOmie(pedido([item(1, { cst: "50", aliq: 3.25 })]), { op });
    expect(d.itens[0].ipi).toMatchObject({ grupo: "IPITrib", cst: "50", aliquota: 3.25 });
  });

  // ⚠⚠ `valor_mercadoria` É A BASE, `valor_total` JÁ SOMA O IPI. Usar o total como base faria o
  // portal calcular imposto sobre imposto e acusar divergência onde não há.
  it("a base é o valor da mercadoria, não o total com IPI", () => {
    const d = lerPedidoOmie(pedido([item(1, { cst: "50", aliq: 3.25, valor: 1000 })]), { op });
    expect(d.itens[0].valor).toBe(1000);
  });

  // ⚠⚠ PEDIDO NÃO É NOTA: inventar chave ou número faria um pedido parecer documento emitido para
  // quem confere — e alguém iria procurá-lo na Receita.
  it("não inventa chave nem número de NF-e", () => {
    const d = lerPedidoOmie(pedido([item(1)]), { op });
    expect(d.chave).toBeNull();
    expect(d.numero).toBeNull();
    expect(d.pedido).toBe("327");
    expect(d.etapa).toBe("10");
  });

  it("o destinatário vem do cadastro da OP", () => {
    const d = lerPedidoOmie(pedido([item(1)]), { op });
    expect(d.destinatario).toMatchObject({ nome: "TMSA", uf: "RS", cnpj: "92782705000126" });
    expect(d.emitente.uf).toBe("SP");
  });

  // ⚠ Medição lançada à mão no portal não tem pedido no Omie — e isso é resultado, não erro.
  it("medição manual diz POR QUE não há o que auditar", () => {
    expect(lerPedidoOmie({ _manual: true }, { op }).erro).toMatch(/lançada manualmente/i);
  });

  it.each([{}, { pedido_venda_produto: { det: [] } }])("pedido sem itens é recusado", (p) => {
    expect(lerPedidoOmie(p, { op }).erro).toBeTruthy();
  });
});

describe("auditar o pedido 327 — o caso real, antes de emitir", () => {
  // ⚠ Os DOIS NCMs são 0% na TIPI — conferido na produção em 23/09/2026.
  const tipi = indiceDaTipi([
    { codigo: "94069020", ex: "", aliquotaTipo: "PERCENTUAL", aliquotaValor: 0 },
    { codigo: "84313900", ex: "", aliquotaTipo: "PERCENTUAL", aliquotaValor: 0 },
  ]);
  const doc = lerPedidoOmie(pedido([
    item(1, { cst: "50", aliq: 3.25, valor: 248037.63 }),
    ...[2, 3, 4, 5, 6].map((n) => item(n)),
  ]), { op });
  const r = auditar(doc, tipi, {});

  // ⚠⚠ O ACHADO QUE SÓ EXISTE PORQUE ALGUÉM LEU A DESCRIÇÃO. Os seis itens dizem um NCM no campo
  // fiscal e outro na descrição — a marca de *"alteramos o NCM conforme o cliente solicita"*.
  it("acusa os seis itens com NCM do campo fiscal ≠ NCM da descrição", () => {
    const a = r.achados.filter((x) => x.tipo === "NCM_DIVERGE_DA_DESCRICAO");
    expect(a).toHaveLength(6);
    expect(a[0].titulo).toMatch(/campo fiscal diz NCM 94069020, a descrição do item diz 84313900/);
    // ⚠ O achado é de CLASSIFICAÇÃO, não de dinheiro: aqui os dois códigos são 0%.
    expect(a[0].detalhe).toMatch(/94069020 é 0% e 84313900 é 0%/);
    expect(a[0].estimativa).toBeUndefined();
  });

  it("acusa a alíquota de 3,25% sobre um NCM que a TIPI diz 0%", () => {
    const a = r.achados.find((x) => x.tipo === "ALIQUOTA_DIVERGENTE");
    expect(a.gravidade).toBe(GRAVIDADE.ALTA);
    expect(a.titulo).toMatch(/3,25% × TIPI 0%/);
  });

  it("acusa os cinco CST 53 sobre alíquota zero", () => {
    expect(r.achados.filter((x) => x.tipo === "CST_INCOMPATIVEL_COM_A_TIPI")).toHaveLength(5);
  });

  // ⚠⚠ O MESMO PADRÃO DA NF-e 973 — mesmo NCM, dois tratamentos — só que ANTES de emitir.
  it("acusa a contradição interna, como na 973", () => {
    const c = r.achados.find((x) => x.tipo === "CONTRADICAO_INTERNA");
    expect(c.gravidade).toBe(GRAVIDADE.ALTA);
    expect(c.detalhe).toMatch(/CST 50 em 1 item\(ns\) e CST 53 em 5 item\(ns\)/);
  });

  it("no total: 2 de alta e 16 de média", () => {
    expect(r.resumo).toMatchObject({ alta: 2, media: 16, naoAvaliaveis: 0 });
  });

  // ⚠ Campo fiscal igual à descrição não gera ruído — o achado só existe quando há divergência.
  it("NCM coerente com a descrição não é apontado", () => {
    const ok = lerPedidoOmie(pedido([item(1, { desc: "PEÇA - [NCM: 94069020]" })]), { op });
    expect(auditar(ok, tipi, {}).achados.filter((x) => x.tipo === "NCM_DIVERGE_DA_DESCRICAO")).toEqual([]);
  });

  it("descrição sem NCM nenhum também não é apontada", () => {
    const ok = lerPedidoOmie(pedido([item(1, { desc: "LONGARINA CONFORME DESENHO 70408127" })]), { op });
    expect(auditar(ok, tipi, {}).achados.filter((x) => x.tipo === "NCM_DIVERGE_DA_DESCRICAO")).toEqual([]);
  });
});

// ─── OS ACHADOS DO CODEX (23/09/2026) ───────────────────────────────────────

describe("ausente não é zero", () => {
  // ⚠⚠ `Number(null)`, `Number("")` e `Number(" ")` devolvem **0**, e eu deixava esse zero passar
  // como valor DECLARADO. Com CST 50 e `aliq_ipi` ausente, o item virava "0% declarado" em vez de
  // NAO_AVALIAVEL — e contra uma TIPI que também diz 0% a comparação passava em silêncio, que é a
  // conformidade por falta de dado que a regra 2 do motor existe para proibir.
  const semAliquota = (v) => {
    const it = item(1, { cst: "50", valor: 1000 });
    it.imposto.ipi.aliq_ipi = v;
    return lerPedidoOmie(pedido([it]), { op });
  };

  it.each([null, undefined, "", "  "])("aliq_ipi %s vira null, não 0", (v) => {
    expect(semAliquota(v).itens[0].ipi.aliquota).toBeNull();
  });

  // ⚠⚠ E O MOTOR VOLTA A SE ABSTER — contra TIPI zero, que é onde o silêncio passava.
  it.each([
    ["TIPI a 0%", 0],
    ["TIPI a 3,25%", 3.25],
  ])("CST 50 sem alíquota vira NAO_AVALIAVEL (%s)", (_, aliq) => {
    const t = indiceDaTipi([{ codigo: "94069020", ex: "", aliquotaTipo: "PERCENTUAL", aliquotaValor: aliq }]);
    const r = auditar(semAliquota(null), t, {});
    const a = r.achados.find((x) => x.tipo === "NAO_AVALIAVEL");
    expect(a.faltam).toContain("IPI/pIPI");
    expect(r.resumo.naoAvaliaveis).toBe(1);
  });

  it("alíquota 0 DECLARADA continua sendo zero, não ausência", () => {
    expect(semAliquota(0).itens[0].ipi.aliquota).toBe(0);
  });

  // ⚠ `valor_mercadoria` nulo precisa cair para `valor_total` — com o `num` antigo o nulo virava 0
  // e o fallback nunca acontecia.
  it("valor_mercadoria ausente cai para valor_total", () => {
    const it = item(1, { valor: 500 });
    it.produto.valor_mercadoria = null;
    it.produto.valor_total = 500;
    expect(lerPedidoOmie(pedido([it]), { op }).itens[0].valor).toBe(500);
  });
});
