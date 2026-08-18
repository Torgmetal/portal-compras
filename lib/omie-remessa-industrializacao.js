// Emissão da REMESSA PARA INDUSTRIALIZAÇÃO (NF de saída sem financeiro) via Omie,
// a partir de um RomaneioTerceiro. Aba Fiscal → "Remessa Terceiro".
//
// Estratégia (Fase 2, 1ª versão — SEGURA/REVERSÍVEL):
//   - O portal só CRIA o Pedido de Venda no Omie (IncluirPedido), como RASCUNHO
//     (etapa inicial, NÃO faturado). Ninguém emite NF-e automaticamente.
//   - O Fiscal confere o pedido no Omie e clica FATURAR (aí sim sai a NF-e no SEFAZ).
//   - Depois o portal puxa nº/chave da NF via ConsultarNF (lib/omie-nfe.js).
//
// A NF de remessa usa 1 produto genérico (ARM000001 — ARMACAO DE ESTRUTURAS
// METALICAS, NCM 9406.90.20, unidade KG) REPETIDO em várias linhas: uma linha por
// peça/marca enviada, com a MARCA escrita na descrição da própria linha.
//
// Descobertas ao analisar a remessa real NF 897 (MACPROJ) e o modelo em homologação:
//   - A conta Torg tem UM ÚNICO cenário de impostos: "Padrão" (nCodigo 618747071).
//     Não há cenário separado de remessa — a NF de remessa (CFOP 5949, CST ICMS 41,
//     sem financeiro) sai desse mesmo cenário, dirigida pela CATEGORIA financeira
//     1.04.95 ("19.5 - Remessa de Produto") + a tributação do próprio produto.
//   - Por isso NÃO forçamos CFOP na linha: o Omie deriva (ARM000001 → 5949).
// Config (todas com default; podem ser sobrescritas por env se algo mudar no Omie):
//   OMIE_CENARIO_REMESSA    cenário de impostos (default 618747071 = Padrão da conta)
//   OMIE_REMESSA_CATEGORIA  categoria financeira (default 1.04.95 = Remessa de Produto)
//   OMIE_PARCELA_REMESSA    código da parcela (default "000" = à vista, sem financeiro)
//   OMIE_REMESSA_VALOR_KG   R$/kg p/ valorar a MARCA (ARM000001); produto real usa preço próprio
import { omieCall } from "@/lib/omie-call";

const URL_CLIENTES = "https://app.omie.com.br/api/v1/geral/clientes/";
const URL_PEDIDO = "https://app.omie.com.br/api/v1/produtos/pedido/";

// Produto genérico p/ MARCAS (peças fabricadas enviadas p/ galvanização/pintura/jato).
// Matéria-prima usa o PRODUTO REAL do Omie (já cadastrado via compra/RM) — ver montarItens.
const PRODUTO_REMESSA_CODIGO = "ARM000001";

/** Config fiscal da remessa (com defaults descobertos da conta Torg). */
export function configRemessa() {
  const cenario = (process.env.OMIE_CENARIO_REMESSA || "618747071").trim();
  const categoria = (process.env.OMIE_REMESSA_CATEGORIA || "1.04.95").trim();
  const parcela = (process.env.OMIE_PARCELA_REMESSA || "000").trim();
  const valorKg = Number(process.env.OMIE_REMESSA_VALOR_KG || "0") || 0;
  return { ok: Boolean(cenario), cenario, categoria, parcela, valorKg };
}

/**
 * Resolve o codigo_cliente do terceiro no Omie (o pedido de venda precisa dele).
 * Usa o nCodOmie salvo no fornecedor; senão localiza pelo CNPJ (ListarClientes).
 * @returns {{ codigoCliente:number, razaoSocial?:string } | { erro:string }}
 */
export async function resolverClienteOmie({ nCodOmie, cnpj } = {}) {
  if (nCodOmie) return { codigoCliente: Number(nCodOmie) };
  const dig = String(cnpj || "").replace(/\D/g, "");
  if (!dig) return { erro: "Terceiro sem CNPJ — não dá pra localizar o cliente no Omie." };
  const res = await omieCall(URL_CLIENTES, "ListarClientes", {
    pagina: 1,
    registros_por_pagina: 5,
    apenas_importado_api: "N",
    clientesFiltro: { cnpj_cpf: dig },
  });
  const c = (res.clientes_cadastro || [])[0];
  if (!c) return { erro: `Terceiro (CNPJ ${dig}) não está cadastrado no Omie. Cadastre-o antes de emitir a remessa.` };
  if (c.inativo === "S") return { erro: "O cadastro do terceiro está INATIVO no Omie." };
  return { codigoCliente: c.codigo_cliente_omie, razaoSocial: c.razao_social };
}

/** Linhas do pedido a partir das MARCAS (peças fabricadas) do romaneio. 1 linha por
 *  peça, produto genérico ARM000001, com a marca na descrição da própria linha.
 *  (Matéria-prima é outro caminho — ver criarPedidoRemessa.) */
function montarItensMarca(romaneio, { valorKg }) {
  const itens = Array.isArray(romaneio.itens) ? romaneio.itens : [];
  const linhas = [];
  for (const it of itens) {
    const pesoTotal = Number(it.pesoTotal || 0) || 0;
    const qte = Number(it.qte || 0) || 0;
    // produto é por KG → quantidade = peso total da marca; se sem peso, cai no nº de peças
    const quantidade = pesoTotal > 0 ? pesoTotal : qte > 0 ? qte : 1;
    const marca = String(it.marca || "").trim();
    const desc = String(it.descricao || "").trim();
    const descricaoLinha = [marca, desc].filter(Boolean).join(" - ") || "Peça sem marca";
    linhas.push({
      produto: {
        codigo: PRODUTO_REMESSA_CODIGO,
        quantidade,
        valor_unitario: valorKg || 0,
        // sem CFOP forçado: o Omie deriva do produto/cenário (ARM000001 → 5949)
        descricao: descricaoLinha.substring(0, 120), // descrição própria da linha (a marca)
      },
    });
  }
  return linhas;
}

/**
 * Cria o Pedido de Venda de remessa (RASCUNHO — não fatura) no Omie.
 * @param {object} romaneio  RomaneioTerceiro (itens, terceiro, uf, etc.)
 * @param {object} terceiro  { nCodOmie, cnpj, uf }
 * @returns {{ codigoPedido:number, numeroPedido:string, cfop:string } | { erro:string }}
 */
export async function criarPedidoRemessa(romaneio, terceiro = {}) {
  const cfg = configRemessa();

  const cli = await resolverClienteOmie(terceiro);
  if (cli.erro) return { erro: cli.erro };

  const marcas = Array.isArray(romaneio.itens) ? romaneio.itens : [];
  const materiais = Array.isArray(romaneio.materiais) ? romaneio.materiais : [];

  // Regra do negócio (Matheus, 18/08): a NF de remessa é dos MATERIAIS enviados
  // (matéria-prima → PRODUTOS REAIS do Omie, código vindo da RM). As MARCAS ficam só
  // como CONTROLE do que o terceiro deve produzir com esse material — NÃO entram na NF.
  // (O ARM000001 é o fallback p/ remessa de peças prontas — beneficiamento sem material.)
  if (materiais.length > 0) {
    const semCodigo = materiais.filter((m) => !m.codigoOmie);
    if (semCodigo.length > 0) {
      return { erro: `${semCodigo.length} material(is) sem código do Omie (${semCodigo.map((m) => m.perfil).filter(Boolean).slice(0, 5).join(", ")}${semCodigo.length > 5 ? "…" : ""}). O casamento perfil→produto não encontrou. Ajuste no romaneio antes de emitir.` };
    }
    // TODO (com Vitor): custo de compra por material (pedido/RM/estoque Omie) + unidade
    // certa (barra × kg) do produto. Emissão dos materiais liga depois desse teste conjunto.
    return { erro: `Emissão da NF de materiais está em validação com o Vitor (custo de compra + unidade). Os ${materiais.length} materiais já vêm com código do Omie; falta só o valor pra emitir.` };
  }

  if (marcas.length === 0) return { erro: "Romaneio sem materiais nem marcas para remessa." };
  if (!(cfg.valorKg > 0)) return { erro: "Defina o valor da remessa por kg (env OMIE_REMESSA_VALOR_KG) antes de emitir — a NF não pode sair com valor zero." };

  const det = montarItensMarca(romaneio, { valorKg: cfg.valorKg });
  if (det.length === 0) return { erro: "Romaneio sem marcas para remessa." };

  // Nº de integração único — permite rastrear/evitar duplicidade no Omie.
  const codigoPedidoIntegracao = `RT-${romaneio.numero}-${Date.now()}`;

  const param = {
    cabecalho: {
      codigo_cliente: cli.codigoCliente,
      codigo_pedido_integracao: codigoPedidoIntegracao,
      codigo_cenario_impostos: cfg.cenario,
      codigo_parcela: cfg.parcela,
      data_previsao: hojeDDMMYYYY(),
      origem_pedido: "API",
    },
    det,
    informacoes_adicionais: {
      codigo_categoria: cfg.categoria, // 1.04.95 — Remessa de Produto
      // observação impressa na nota — referência da OP/romaneio p/ conferência
      dados_adicionais_nf: [`Remessa p/ industrializacao - Romaneio RT-${romaneio.numero}`, romaneio.opRefNumero ? `OP ${romaneio.opRefNumero}` : "", romaneio.servico ? `Servico: ${romaneio.servico}` : ""].filter(Boolean).join(" | ").substring(0, 200),
    },
  };

  const res = await omieCall(URL_PEDIDO, "IncluirPedido", param);
  // IncluirPedido retorna { codigo_pedido, codigo_pedido_integracao, numero_pedido, ... }
  const codigoPedido = res.codigo_pedido || res.codigo_pedido_omie || null;
  const numeroPedido = res.numero_pedido != null ? String(res.numero_pedido) : null;
  if (!codigoPedido) return { erro: "Omie não retornou o código do pedido criado.", _raw: res };
  return { codigoPedido, numeroPedido };
}

function hojeDDMMYYYY() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
