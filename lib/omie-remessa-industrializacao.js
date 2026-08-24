// Emissão da REMESSA DE PRODUTO (NF de remessa p/ industrialização, sem financeiro) via
// Omie, a partir de um RomaneioTerceiro. Aba Fiscal → "Remessa Terceiro".
//
// IMPORTANTE — endpoint dedicado: o Omie tem um MÓDULO próprio de "Remessa de Produto"
// (`produtos/remessa` → IncluirRemessa), SEPARADO do Pedido de Venda (`produtos/pedido`).
// Usar o pedido de venda faz o documento cair na listagem de VENDAS; a remessa tem que ir
// pelo IncluirRemessa pra aparecer na tela "Remessa de Produto".
//
// Estratégia (SEGURA/REVERSÍVEL): o portal só CRIA a remessa (rascunho, NÃO faturada).
// O Fiscal confere no Omie e FATURA lá (emite a NF-e no SEFAZ, via produtos/remessafat).
// Depois o portal registra nº/série/chave da NF.
//
// Template real (ConsultarRemessa de uma remessa da conta Torg):
//   cabec: { nCodCli, codigo_cenario_impostos: 618747071 (Padrão), dPrevisao DD/MM/YYYY }
//   produtos[]: { nCodProd (ID interno), cCFOP (5.949), nQtde, nValUnit } — impostos
//   (ICMS CST 41, etc.) o Omie DERIVA do cenário; não enviamos.
//
// A remessa de MATÉRIA-PRIMA usa os produtos REAIS do Omie (código resolvido na tela).
// O fallback de MARCAS (peças prontas p/ beneficiamento) usa o genérico ARM000001 por kg.
// Config (defaults com override por env):
//   OMIE_CENARIO_REMESSA    cenário de impostos (default 618747071 = Padrão da conta)
//   OMIE_REMESSA_CATEGORIA  categoria (default 1.04.95 = Remessa de Produto)
//   OMIE_REMESSA_CFOP       força o CFOP (senão deriva: SP→5901, fora→6901)
//   OMIE_REMESSA_VALOR_KG   R$/kg p/ valorar a MARCA (ARM000001); produto real usa preço próprio
import { omieCall } from "@/lib/omie-call";

const URL_CLIENTES = "https://app.omie.com.br/api/v1/geral/clientes/";
const URL_REMESSA = "https://app.omie.com.br/api/v1/produtos/remessa/";
const URL_REMESSA_FAT = "https://app.omie.com.br/api/v1/produtos/remessafat/";
const URL_PRODUTOS = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_NFCONSULTAR = "https://app.omie.com.br/api/v1/produtos/nfconsultar/";
const URL_NFUTIL = "https://app.omie.com.br/api/v1/produtos/notafiscalutil/";
const UF_TORG = "SP"; // Torg fica em Conchal-SP → dentro do estado 5901, fora 6901

const codigoProdutoCache = new Map(); // SKU (codigo) → codigo_produto (ID interno do Omie)

// Produto genérico p/ MARCAS (peças fabricadas enviadas p/ galvanização/pintura/jato).
// Matéria-prima usa o PRODUTO REAL do Omie (já cadastrado via compra/RM).
const PRODUTO_REMESSA_CODIGO = "ARM000001";

/** Config fiscal da remessa (com defaults descobertos da conta Torg). */
export function configRemessa() {
  const cenario = (process.env.OMIE_CENARIO_REMESSA || "618747071").trim();
  const categoria = (process.env.OMIE_REMESSA_CATEGORIA || "1.04.95").trim();
  const cfopForcado = (process.env.OMIE_REMESSA_CFOP || "").trim() || null;
  const valorKg = Number(process.env.OMIE_REMESSA_VALOR_KG || "0") || 0;
  // CST (situação tributária): o IncluirRemessa via API NÃO aplica o cenário sozinho (a tela
  // do Omie aplica; a API não). TESTADO: enviar o CST no IncluirRemessa FUNCIONA (o CST cola;
  // AlterarRemessa é que descarta). Padrão das remessas da conta p/ CFOP 5.901: ICMS 41
  // (não tributada), PIS/COFINS 08 (sem incidência), IPI 99. Valores zero. Override por env.
  const cstIcms = (process.env.OMIE_REMESSA_CST_ICMS || "41").trim();
  const cstPisCofins = (process.env.OMIE_REMESSA_CST_PISCOFINS || "08").trim();
  const cstIpi = (process.env.OMIE_REMESSA_CST_IPI || "99").trim();
  const ipiTpCalc = (process.env.OMIE_REMESSA_IPI_TPCALC || "B").trim(); // B = Base × Alíquota
  const origem = (process.env.OMIE_REMESSA_ORIGEM || "0").trim();
  // Modalidade do frete (obrigatória p/ SEFAZ): 0=CIF (remetente), 1=FOB (destinatário),
  // 2=terceiros, 9=sem transporte. Default 0. Override por env.
  const tpFrete = (process.env.OMIE_REMESSA_TP_FRETE || "0").trim();
  return { ok: Boolean(cenario), cenario, categoria, cfopForcado, valorKg, cstIcms, cstPisCofins, cstIpi, ipiTpCalc, origem, tpFrete };
}

/** Bloco de frete do IncluirRemessa a partir do que o Fiscal informou (opts.frete).
 *  Só a modalidade (cTpFrete) é obrigatória p/ o SEFAZ; o resto entra quando informado. */
function montarFrete(cfg, frete) {
  const f = frete || {};
  const n = (v) => Number(v) || 0;
  const bloco = { cTpFrete: (f.tpFrete || cfg.tpFrete || "0").trim() };
  if (f.nCodTransp) bloco.nCodTransp = Number(f.nCodTransp);
  if (f.placa) bloco.cPlaca = String(f.placa).toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 7);
  if (f.uf) bloco.cUF = String(f.uf).toUpperCase().substring(0, 2);
  if (f.qtdVol != null && n(f.qtdVol) > 0) bloco.nQtdVol = Math.round(n(f.qtdVol));
  if (f.especie) bloco.cEspVol = String(f.especie).substring(0, 60);
  if (n(f.pesoLiq) > 0) bloco.nPesoLiq = n(f.pesoLiq);
  if (n(f.pesoBruto) > 0) bloco.nPesoBruto = n(f.pesoBruto);
  if (n(f.valorFrete) > 0) bloco.nValFrete = n(f.valorFrete);
  if (n(f.valorSeguro) > 0) bloco.nValSeguro = n(f.valorSeguro);
  if (n(f.valorOutras) > 0) bloco.nValOutras = n(f.valorOutras);
  return bloco;
}

/** Blocos de imposto de um item: só a SITUAÇÃO (CST), valores zero (remessa não tributa).
 *  IPI precisa do TIPO DE CÁLCULO ("B" = Base de Cálculo × Alíquota) senão a tela pede. */
function impostosRemessa(cfg) {
  return {
    ICMS: { cSitTrib: cfg.cstIcms, cOrigem: cfg.origem, nBC: 0, nAliq: 0, nValor: 0 },
    IPI: { cSitTribIPI: cfg.cstIpi, cTpCalcIPI: cfg.ipiTpCalc, cEnqIPI: "999", nBCIPI: 0, nAliqIPI: 0, nValIPI: 0 },
    PIS: { cSitTribPIS: cfg.cstPisCofins, nBCPIS: 0, nAliqPIS: 0, nValPIS: 0 },
    COFINS: { cSitTribCOFINS: cfg.cstPisCofins, nBCCOFINS: 0, nAliqCOFINS: 0, nValCOFINS: 0 },
  };
}

/** O Omie cadastra o CFOP no formato pontuado ("5.901"); enviar "5901" dá "CFOP não cadastrada". */
function formatarCfop(c) {
  const d = String(c || "").replace(/\D/g, "");
  return d.length === 4 ? `${d[0]}.${d.slice(1)}` : String(c || "").trim();
}

/** CFOP da remessa p/ industrialização: dentro do estado 5901, fora 6901 (override por env/romaneio). */
function cfopRemessa(cfg, romaneio, uf) {
  const bruto = cfg.cfopForcado || romaneio?.remessaCfop || (String(uf || "").toUpperCase() && String(uf).toUpperCase() !== UF_TORG ? "6901" : "5901");
  return formatarCfop(bruto);
}

/**
 * Resolve o codigo_produto (ID interno do Omie) a partir do SKU (codigo). A remessa
 * referencia o produto por nCodProd (ID interno), não pelo SKU. Cacheia em memória.
 * @returns {Map<string, number>} sku → codigo_produto
 */
async function resolverCodigosProduto(skus) {
  const mapa = new Map();
  const unicos = [...new Set(skus.filter(Boolean).map((s) => String(s).trim()))];
  for (const sku of unicos) {
    if (codigoProdutoCache.has(sku)) { mapa.set(sku, codigoProdutoCache.get(sku)); continue; }
    try {
      const d = await omieCall(URL_PRODUTOS, "ConsultarProduto", { codigo: sku });
      const id = d?.codigo_produto ? Number(d.codigo_produto) : null;
      if (id) { codigoProdutoCache.set(sku, id); mapa.set(sku, id); }
    } catch { /* não encontrado → fica de fora; o chamador acusa */ }
  }
  return mapa;
}

/**
 * Resolve o codigo_cliente do terceiro no Omie (a remessa precisa dele).
 * Usa o nCodOmie salvo no fornecedor; senão localiza pelo CNPJ (ListarClientes).
 * @returns {{ codigoCliente:number, razaoSocial?:string } | { erro:string }}
 */
export async function resolverClienteOmie({ nCodOmie, cnpj } = {}) {
  if (nCodOmie) return { codigoCliente: Number(nCodOmie) };
  const dig = String(cnpj || "").replace(/\D/g, "");
  if (!dig) return { erro: "Terceiro sem CNPJ — não dá pra localizar o cliente no Omie." };
  const res = await omieCall(URL_CLIENTES, "ListarClientes", {
    pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N", clientesFiltro: { cnpj_cpf: dig },
  });
  const c = (res.clientes_cadastro || [])[0];
  if (!c) return { erro: `Terceiro (CNPJ ${dig}) não está cadastrado no Omie. Cadastre-o antes de emitir a remessa.` };
  if (c.inativo === "S") return { erro: "O cadastro do terceiro está INATIVO no Omie." };
  return { codigoCliente: c.codigo_cliente_omie, razaoSocial: c.razao_social };
}

/** Linhas resolvidas → itens do IncluirRemessa (nCodProd + CFOP + qtd + valor + CST + info). */
function montarProdutos(linhas, cCodIntRem, cfop, cfg) {
  const imp = impostosRemessa(cfg);
  return linhas.map((l, i) => ({
    cCodItInt: `${cCodIntRem}-${i + 1}`.substring(0, 30),
    nCodProd: l.nCodProd,
    cCFOP: cfop,
    nQtde: l.nQtde > 0 ? l.nQtde : 1,
    nValUnit: Number(l.nValUnit) || 0,
    ...imp, // CST (situação) — TESTADO: o IncluirRemessa aceita e mantém; sem isso o Omie trava o faturamento
    ...(l.info ? { infAdicItem: { cInfItemNF: String(l.info).substring(0, 200) } } : {}),
  }));
}

/**
 * Cria a REMESSA DE PRODUTO (rascunho — não fatura) no Omie via IncluirRemessa.
 * @param {object} romaneio  RomaneioTerceiro (usa numero, itens, materiais, opRefNumero, servico, remessaCfop)
 * @param {object} terceiro  { nCodOmie, cnpj, uf }
 * @param {object} [opts]    { materiaisResolvidos: [{ codigoOmie, descricao, qtd, valorUnit }] }
 * @returns {{ codigoPedido:number, numeroPedido:string } | { erro:string }}
 */
export async function criarPedidoRemessa(romaneio, terceiro = {}, opts = {}) {
  const cfg = configRemessa();
  const cli = await resolverClienteOmie(terceiro);
  if (cli.erro) return { erro: cli.erro };

  const marcas = Array.isArray(romaneio.itens) ? romaneio.itens : [];
  const resolvidos = Array.isArray(opts.materiaisResolvidos) ? opts.materiaisResolvidos : null;
  const cfop = cfopRemessa(cfg, romaneio, terceiro.uf);

  // Regra (Matheus): a NF de remessa é dos MATERIAIS enviados (produtos reais do Omie).
  // As MARCAS são só controle do que o terceiro deve produzir. ARM000001 é o fallback
  // p/ remessa de peças prontas (beneficiamento, sem material).
  let linhas;
  if (resolvidos && resolvidos.length > 0) {
    const invalidos = resolvidos.filter((m) => !m.codigoOmie || !(Number(m.valorUnit) > 0) || !(Number(m.qtd) > 0));
    if (invalidos.length > 0) return { erro: `${invalidos.length} material(is) sem código do Omie ou sem valor/quantidade — resolva na tela de preparação antes de gerar.` };
    const mapa = await resolverCodigosProduto(resolvidos.map((m) => m.codigoOmie));
    const semId = [];
    linhas = [];
    for (const m of resolvidos) {
      const id = mapa.get(String(m.codigoOmie).trim());
      if (!id) { semId.push(m.codigoOmie); continue; }
      // Materiais = produtos reais: a descrição vem do PRÓPRIO produto no Omie (via nCodProd).
      // NÃO enviamos info extra p/ não sobrescrever/poluir a descrição do cadastro.
      linhas.push({ nCodProd: id, nQtde: Number(m.qtd), nValUnit: Number(m.valorUnit), info: null });
    }
    if (semId.length > 0) return { erro: `Produto(s) não encontrado(s) no Omie pelo código: ${[...new Set(semId)].join(", ")}. Confira o código na tela de preparação.` };
  } else {
    if (marcas.length === 0) return { erro: "Romaneio sem materiais nem marcas para remessa." };
    if (!(cfg.valorKg > 0)) return { erro: "Defina o valor da remessa por kg (env OMIE_REMESSA_VALOR_KG) antes de emitir — a NF não pode sair com valor zero." };
    const mapa = await resolverCodigosProduto([PRODUTO_REMESSA_CODIGO]);
    const id = mapa.get(PRODUTO_REMESSA_CODIGO);
    if (!id) return { erro: `Produto genérico ${PRODUTO_REMESSA_CODIGO} não encontrado no Omie.` };
    linhas = marcas.map((it) => {
      const peso = Number(it.pesoTotal || 0) || 0;
      const qte = Number(it.qte || 0) || 0;
      const q = peso > 0 ? peso : qte > 0 ? qte : 1;
      const info = [String(it.marca || "").trim(), String(it.descricao || "").trim()].filter(Boolean).join(" - ") || "Peça sem marca";
      return { nCodProd: id, nQtde: q, nValUnit: cfg.valorKg, info };
    });
  }
  if (!linhas.length) return { erro: "Sem itens para a remessa." };

  // Nº de integração único — rastreia/evita duplicidade no Omie.
  const cCodIntRem = `RT-${romaneio.numero}-${Date.now()}`.substring(0, 60);

  const param = {
    cabec: {
      cCodIntRem,
      nCodCli: cli.codigoCliente,
      codigo_cenario_impostos: Number(cfg.cenario) || cfg.cenario,
      dPrevisao: hojeDDMMYYYY(),
    },
    frete: montarFrete(cfg, opts.frete), // modalidade + transportadora/volumes (SEFAZ exige a modalidade)
    infAdic: {
      cCodCateg: cfg.categoria, // 1.04.95 — Remessa de Produto
      cConsFinal: "N", // terceiro é empresa (industrialização), não consumidor final
      cDadosAdic: [`Remessa p/ industrializacao - Romaneio RT-${romaneio.numero}`, romaneio.opRefNumero ? `OP ${romaneio.opRefNumero}` : "", romaneio.servico ? `Servico: ${romaneio.servico}` : ""].filter(Boolean).join(" | ").substring(0, 300),
    },
    produtos: montarProdutos(linhas, cCodIntRem, cfop, cfg),
  };

  const res = await omieCall(URL_REMESSA, "IncluirRemessa", param);
  // IncluirRemessa retorna { nCodRem, cCodIntRem, cNumeroRemessa, ... }
  const codigo = res.nCodRem || res.codigo_remessa || null;
  const numero = res.cNumeroRemessa != null ? String(res.cNumeroRemessa)
    : (res.nNumeroRemessa != null ? String(res.nNumeroRemessa) : null);
  if (!codigo) return { erro: "Omie não retornou o código da remessa criada.", _raw: res };
  return { codigoPedido: codigo, numeroPedido: numero };
}

/**
 * CONFERE a remessa no Omie (valida antes de emitir) — ConferirRemessa. Não emite NF.
 * @returns {{ ok:true, mensagem:string } | { ok:false, erro:string }}
 */
export async function conferirRemessaOmie(nCodRem) {
  if (!nCodRem) return { ok: false, erro: "Remessa sem código no Omie." };
  try {
    const res = await omieCall(URL_REMESSA_FAT, "ConferirRemessa", { nCodRem: Number(nCodRem) });
    // sucesso: cCodStatus "0" + cDescStatus "... validada com sucesso!"
    const ok = String(res.cCodStatus || "0") === "0";
    return ok ? { ok: true, mensagem: res.cDescStatus || res.cDesStatus || "Remessa validada." }
      : { ok: false, erro: res.cDescStatus || res.cDesStatus || "Remessa não passou na conferência." };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

const ddmmyyyy = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

/**
 * Localiza a NF-e ligada a uma remessa (nfconsultar → compl.nIdPedido === nCodRem).
 * @returns {{ nCodNF, numero, serie, chave, cancelada, denegada } | null}
 */
export async function buscarNfDaRemessa(nCodRem) {
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 2 * 864e5);
  const alvo = Number(nCodRem);
  try {
    for (let pagina = 1; pagina <= 5; pagina++) {
      const d = await omieCall(URL_NFCONSULTAR, "ListarNF", {
        pagina, registros_por_pagina: 50, apenas_importado_api: "N",
        dEmiInicial: ddmmyyyy(ontem), dEmiFinal: ddmmyyyy(hoje),
      });
      const lista = d.nfCadastro || [];
      for (const nf of lista) {
        const c = nf.compl || {}, ide = nf.ide || {};
        if (c.nIdPedido === alvo) {
          return {
            nCodNF: c.nIdNF || null,
            numero: ide.nNF ? String(ide.nNF) : null, serie: ide.serie ? String(ide.serie) : null,
            chave: c.cChaveNFe || null, cancelada: !!ide.dCan, denegada: ide.cDeneg === "S",
          };
        }
      }
      if (pagina >= (d.total_de_paginas || 1)) break;
    }
  } catch { /* consulta best-effort */ }
  return null;
}

/**
 * STATUS REAL da NF-e da remessa no SEFAZ. A NF-e AUTORIZADA tem DANFE (GetUrlDanfe devolve
 * URL); a REJEITADA devolve "none". É o único jeito confiável de distinguir (achado testando).
 * @returns {{ estado:"AUTORIZADA"|"REJEITADA"|"CANCELADA"|"SEM_NF", nf?:{numero,serie,chave}, danfeUrl?:string }}
 */
export async function statusNfDaRemessa(nCodRem) {
  const nf = await buscarNfDaRemessa(nCodRem);
  if (!nf || !nf.nCodNF) return { estado: "SEM_NF" };
  if (nf.cancelada || nf.denegada) return { estado: "CANCELADA", nf };
  let danfeUrl = null;
  try {
    const d = await omieCall(URL_NFUTIL, "GetUrlDanfe", { nCodNF: Number(nf.nCodNF) });
    danfeUrl = d?.cUrlDanfe && d.cUrlDanfe !== "none" ? d.cUrlDanfe : null;
  } catch { /* trata como ainda não autorizada */ }
  return danfeUrl
    ? { estado: "AUTORIZADA", nf: { numero: nf.numero, serie: nf.serie, chave: nf.chave }, danfeUrl }
    : { estado: "REJEITADA", nf: { numero: nf.numero, serie: nf.serie, chave: nf.chave } };
}

/**
 * CONCLUI a remessa no Omie (ConcluirRemessa → SEFAZ) e espera o resultado REAL via GetUrlDanfe.
 * @returns {{ ok:true, autorizada:true, nf } | { ok:false, rejeitada?:true, erro:string }}
 */
export async function concluirRemessaOmie(nCodRem) {
  if (!nCodRem) return { ok: false, erro: "Remessa sem código no Omie." };
  try {
    const res = await omieCall(URL_REMESSA_FAT, "ConcluirRemessa", { nCodRem: Number(nCodRem) });
    const st = String(res.cCodStatus ?? "0");
    if (st !== "0" && (res.cDescStatus || res.cDesStatus)) return { ok: false, erro: res.cDescStatus || res.cDesStatus };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
  // Poll do status real no SEFAZ (DANFE = autorizada) por ~40s.
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await statusNfDaRemessa(nCodRem);
    if (s.estado === "AUTORIZADA") return { ok: true, autorizada: true, nf: s.nf, danfeUrl: s.danfeUrl };
    if (s.estado === "REJEITADA") return { ok: false, rejeitada: true, erro: `NF-e ${s.nf?.numero || ""} REJEITADA pelo SEFAZ. Veja o motivo no Omie (aba Comunicação com a SEFAZ), corrija e reenvie.` };
  }
  return { ok: false, erro: "A NF-e ainda está em processamento no SEFAZ. Clique em \"Atualizar status\" em instantes." };
}

function hojeDDMMYYYY() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
