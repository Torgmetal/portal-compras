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
// Config fiscal (definida pelo contador — sem ela NÃO cria pedido):
//   OMIE_CENARIO_REMESSA      código do cenário de impostos "remessa p/ industrialização"
//   OMIE_CENARIO_REMESSA_FORA (opcional) cenário p/ terceiro fora de SP (CFOP 6901); se
//                             vazio, usa o mesmo cenário
//   OMIE_PARCELA_REMESSA      (opcional) código da parcela (default "000" = à vista)
//   OMIE_REMESSA_VALOR_KG     (opcional) R$/kg pra valorar a mercadoria (default do romaneio/1)
import { omieCall } from "@/lib/omie-call";

const URL_CLIENTES = "https://app.omie.com.br/api/v1/geral/clientes/";
const URL_PEDIDO = "https://app.omie.com.br/api/v1/produtos/pedido/";

// Produto genérico da remessa (já usado hoje pela Torg).
const PRODUTO_REMESSA_CODIGO = "ARM000001";
const UF_TORG = "SP"; // Conchal-SP: dentro do estado = 5901; fora = 6901

/** Config fiscal lida do ambiente. `ok:false` quando o essencial (cenário) falta. */
export function configRemessa() {
  const cenario = (process.env.OMIE_CENARIO_REMESSA || "").trim();
  const cenarioFora = (process.env.OMIE_CENARIO_REMESSA_FORA || "").trim() || cenario;
  const parcela = (process.env.OMIE_PARCELA_REMESSA || "000").trim();
  const valorKg = Number(process.env.OMIE_REMESSA_VALOR_KG || "0") || 0;
  return {
    ok: Boolean(cenario),
    cenario,
    cenarioFora,
    parcela,
    valorKg,
    faltando: cenario ? [] : ["OMIE_CENARIO_REMESSA"],
  };
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

/** Linhas do pedido a partir dos itens (marcas) do romaneio. 1 linha por peça. */
function montarItens(romaneio, { cfop, valorKg }) {
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
        cfop, // CFOP da remessa (5901/6901) — reforça o do cenário
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
  if (!cfg.ok) return { erro: `Config fiscal da remessa ausente: ${cfg.faltando.join(", ")}. Peça ao contador o código do cenário de impostos de "remessa para industrialização".` };

  const cli = await resolverClienteOmie(terceiro);
  if (cli.erro) return { erro: cli.erro };

  const foraDeSP = String(terceiro.uf || "").toUpperCase() !== UF_TORG;
  const cfop = foraDeSP ? "6901" : "5901";
  const cenario = foraDeSP ? cfg.cenarioFora : cfg.cenario;

  const det = montarItens(romaneio, { cfop, valorKg: cfg.valorKg });
  if (det.length === 0) return { erro: "Romaneio sem itens (marcas) para remessa." };

  // Nº de integração único — permite rastrear/evitar duplicidade no Omie.
  const codigoPedidoIntegracao = `RT-${romaneio.numero}-${Date.now()}`;

  const param = {
    cabecalho: {
      codigo_cliente: cli.codigoCliente,
      codigo_pedido_integracao: codigoPedidoIntegracao,
      codigo_cenario_impostos: cenario,
      codigo_parcela: cfg.parcela,
      data_previsao: hojeDDMMYYYY(),
      origem_pedido: "API",
    },
    det,
    informacoes_adicionais: {
      // observação impressa na nota — referência da OP/romaneio p/ conferência
      dados_adicionais_nf: [`Remessa p/ industrializacao - Romaneio RT-${romaneio.numero}`, romaneio.opRefNumero ? `OP ${romaneio.opRefNumero}` : "", romaneio.servico ? `Servico: ${romaneio.servico}` : ""].filter(Boolean).join(" | ").substring(0, 200),
    },
  };

  const res = await omieCall(URL_PEDIDO, "IncluirPedido", param);
  // IncluirPedido retorna { codigo_pedido, codigo_pedido_integracao, numero_pedido, ... }
  const codigoPedido = res.codigo_pedido || res.codigo_pedido_omie || null;
  const numeroPedido = res.numero_pedido != null ? String(res.numero_pedido) : null;
  if (!codigoPedido) return { erro: "Omie não retornou o código do pedido criado.", _raw: res };
  return { codigoPedido, numeroPedido, cfop };
}

function hojeDDMMYYYY() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
