// Consultas de recebimento de NF e status de pedido de compra no Omie.
// Usado pelo sync de entregas pra detectar automaticamente quando um
// pedido foi faturado/recebido (NF de entrada registrada).

const OMIE_PEDIDO_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_RECEBIMENTO_URL = "https://app.omie.com.br/api/v1/produtos/recebimentonfe/";
const OMIE_REMESSA_URL = "https://app.omie.com.br/api/v1/produtos/remessa/";

function getCredentials() {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("OMIE_APP_KEY/OMIE_APP_SECRET não configurados");
  return { appKey, appSecret };
}

async function omieCall(url, call, param) {
  const { appKey, appSecret } = getCredentials();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param }),
  });
  const data = await resp.json();
  if (data.faultstring) {
    throw new Error(`Omie ${call}: ${data.faultstring}`);
  }
  return data;
}

// Pausa entre chamadas pra nao estourar rate limit do Omie (3 req/s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Consulta um pedido de compra no Omie pelo nCodPed.
 * Retorna o objeto completo do pedido com cEtapa, itens com nQtdeRec, etc.
 */
export async function consultarPedidoCompra(nCodPed) {
  const data = await omieCall(OMIE_PEDIDO_URL, "ConsultarPedCompra", [
    { nCodPed: Number(nCodPed) },
  ]);
  return data;
}

/**
 * Lista recebimentos de NF-e vinculados a um pedido de compra.
 * Retorna array de recebimentos com chave NFe, data, etc.
 */
export async function listarRecebimentos(nIdPedido) {
  try {
    const mapa = await buscarNFsPorPedidos([String(nIdPedido)]);
    return mapa.get(String(nIdPedido)) || [];
  } catch {
    return [];
  }
}

/**
 * Busca NFs de entrada recentes no Omie e mapeia por nIdPedido.
 * Faz 1-3 chamadas paginadas (100/página) cobrindo os últimos 90 dias.
 *
 * Retorna Map<codigoPedido, Array<{ nfNumero, nfChave, nfSerie, dataEmissao, valor, dataRecebimento }>>
 */
export async function buscarNFsPorPedidos(codigosPedidos) {
  const resultado = new Map();
  if (!codigosPedidos || codigosPedidos.length === 0) return resultado;

  const codSet = new Set(codigosPedidos.map(String));

  // Data range: últimos 90 dias
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 90);
  const fmtData = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  try {
    let pagina = 1;
    const maxPaginas = 5; // safety limit

    while (pagina <= maxPaginas) {
      const data = await omieCall(OMIE_RECEBIMENTO_URL, "ListarRecebimentos", [
        {
          nPagina: pagina,
          nRegistrosPorPagina: 100,
          cExibirDetalhes: "S",
          dtEmissaoDe: fmtData(inicio),
          dtEmissaoAte: fmtData(hoje),
        },
      ]);

      const lista = data.recebimentos || [];
      for (const rec of lista) {
        const cabec = rec.cabec || {};
        const itens = rec.itensRecebimento || [];
        const infoCad = rec.infoCadastro || {};

        // Cada item do recebimento pode linkar a um pedido diferente
        const pedidosNestaNotaSet = new Set();
        for (const item of itens) {
          const ic = item.itensCabec || {};
          const pedId = ic.nIdPedido ? String(ic.nIdPedido) : null;
          if (pedId && codSet.has(pedId)) {
            pedidosNestaNotaSet.add(pedId);
          }
        }

        // Associa a NF a cada pedido encontrado
        for (const pedId of pedidosNestaNotaSet) {
          if (!resultado.has(pedId)) resultado.set(pedId, []);
          resultado.get(pedId).push({
            nfNumero: cabec.cNumeroNFe?.replace(/^0+/, "") || null,
            nfChave: cabec.cChaveNFe || null,
            nfSerie: cabec.cSerieNFe || null,
            dataEmissao: cabec.dEmissaoNFe || null,
            valor: cabec.nValorNFe || 0,
            dataRecebimento: infoCad.dRec || null,
            nIdReceb: cabec.nIdReceb,
          });
        }
      }

      // Verifica paginação
      const totalPag = data.nTotalPaginas || 1;
      if (pagina >= totalPag) break;
      pagina++;
      await sleep(350);
    }
  } catch (e) {
    console.warn("[buscarNFsPorPedidos] erro:", e.message);
  }

  return resultado;
}

/**
 * Consulta status de uma remessa no Omie (pra FD).
 * Retorna { faturada, nfes: [{ chave, numero, status, danfe }] }
 */
export async function consultarStatusRemessa(nCodPed) {
  try {
    const data = await omieCall(OMIE_REMESSA_URL, "StatusRemessa", [
      { nCodPed: Number(nCodPed) },
    ]);
    const faturada = data.faturada === "S" || data.cStatus === "FATURADA";
    const nfes = (data.ListaNfe || []).map((nf) => ({
      chave: nf.cChaveNFe,
      numero: nf.cNumNFe,
      status: nf.cStatusNFe,
      danfe: nf.cDanfe,
    }));
    return { faturada, nfes, raw: data };
  } catch {
    return { faturada: false, nfes: [], raw: null };
  }
}

/**
 * Verifica se um pedido de compra Omie já foi recebido (NF entrada registrada).
 * Analisa a etapa do pedido e qtdes recebidas.
 *
 * Retorna:
 *  { recebido: boolean, parcial: boolean, etapa: string, dataRecebimento?: Date }
 */
export async function verificarRecebimentoPedido(codigoPedido) {
  if (!codigoPedido) return { recebido: false, parcial: false, etapa: "SEM_CODIGO" };

  try {
    const pedido = await consultarPedidoCompra(codigoPedido);

    // A API ConsultarPedCompra retorna campos em cabecalho_consulta e
    // produtos_consulta (não em "cabecalho"/"det" como outras APIs Omie).
    const cabecalho = pedido.cabecalho_consulta
      || pedido.cabecalho
      || pedido.pedido_compra_produto?.cabecalho
      || pedido;
    const etapa = cabecalho.cEtapa || "";

    // Etapas do Omie que indicam recebimento:
    // "50" = Faturado, "60" = Recebido, "70" = Finalizado
    // "40" = Recebido Parcialmente
    const ETAPAS_RECEBIDO = ["50", "60", "70"];
    const ETAPAS_PARCIAL = ["40"];

    // Extrai itens pra analisar quantidades recebidas.
    // produtos_consulta: itens ficam no nível raiz (não dentro de "produto").
    const itens = pedido.produtos_consulta
      || pedido.det
      || pedido.pedido_compra_produto?.det
      || [];

    // Na pratica o Omie nem sempre atualiza a cEtapa quando registra NF de
    // entrada — a etapa fica em "15" mesmo com nQtdeRec > 0 nos itens.
    // Entao verifica TAMBEM pelas quantidades recebidas dos itens.
    let totalQtd = 0;
    let totalQtdRec = 0;
    for (const item of itens) {
      const prod = item.produto || item;
      totalQtd += Number(prod.nQtde) || 0;
      totalQtdRec += Number(prod.nQtdeRec) || 0;
    }

    // Decide se está recebido pela etapa OU pelas quantidades
    let recebido = ETAPAS_RECEBIDO.includes(etapa);
    let parcial = ETAPAS_PARCIAL.includes(etapa);

    // Se a etapa nao indica, mas os itens mostram recebimento → usa qtd
    if (!recebido && !parcial && totalQtdRec > 0) {
      if (totalQtd > 0 && totalQtdRec >= totalQtd) {
        recebido = true; // 100% recebido
      } else {
        parcial = true; // recebimento parcial
      }
    }

    // Tenta extrair data do recebimento dos itens
    let dataRecebimento = null;
    for (const item of itens) {
      const prod = item.produto || item;
      const dtField = prod.dDtRecebimento || prod.dDtReceb;
      if (dtField) {
        const parts = dtField.split("/");
        if (parts.length === 3) {
          const dt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          if (!isNaN(dt.getTime()) && (!dataRecebimento || dt > dataRecebimento)) {
            dataRecebimento = dt;
          }
        }
      }
    }

    // Fallback: se detectou recebimento mas não achou data, usa data atual
    if (!dataRecebimento && (recebido || parcial)) {
      dataRecebimento = new Date();
    }

    // Extrai previsão de entrega do Omie (campo dDtPrevisao)
    let previsaoEntrega = null;
    const dDtPrevisao = cabecalho.dDtPrevisao;
    if (dDtPrevisao) {
      const parts = dDtPrevisao.split("/");
      if (parts.length === 3) {
        const dt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(dt.getTime())) previsaoEntrega = dt;
      }
    }

    // Extrai itens formatados pra salvar no campo itensOmie do PedidoOmie
    const itensOmie = itens.map((item) => {
      const prod = item.produto || item;
      return {
        descricao: prod.cDescricao || prod.cProduto || "",
        qtd: Number(prod.nQtde) || 0,
        unidade: prod.cUnidade || "KG",
        valorUnit: Number(prod.nValUnit) || 0,
        qtdRecebida: Number(prod.nQtdeRec) || 0,
      };
    });

    return { recebido, parcial, etapa, dataRecebimento, previsaoEntrega, totalQtd, totalQtdRec, itensOmie };
  } catch (e) {
    return { recebido: false, parcial: false, etapa: "ERRO", error: e.message };
  }
}

/**
 * Sincroniza status de entrega de todos os pedidos pendentes.
 * Busca PedidoOmie sem dataEntregaReal, consulta Omie, atualiza.
 * Agora tambem cria registros de Recebimento por item quando detecta entrega.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {{ sincronizados: number, erros: number, detalhes: Array }}
 */
export async function syncEntregas(prisma) {
  // Busca pedidos que ainda não foram marcados como entregues
  const pedidos = await prisma.pedidoOmie.findMany({
    where: {
      dataEntregaReal: null,
      codigoPedido: { not: null },
      status: "CRIADO",
    },
    select: {
      id: true,
      codigoPedido: true,
      numeroPedido: true,
      faturamentoDireto: true,
      fornecedorNome: true,
      prazoEntregaPrevisto: true,
      rmItens: {
        select: {
          id: true,
          qtd: true,
          peso: true,
          unidade: true,
          recebimentos: { select: { qtdRecebida: true } },
        },
      },
    },
  });

  const detalhes = [];
  let sincronizados = 0;
  let erros = 0;

  // Busca NFs de entrada dos ultimos 90 dias pra associar ao recebimento.
  // Uma unica chamada paginada (vs. 1 por pedido) pra economizar rate limit.
  const codigosPedidos = pedidos.map((p) => p.codigoPedido);
  let nfsPorPedido = new Map();
  try {
    nfsPorPedido = await buscarNFsPorPedidos(codigosPedidos);
  } catch (e) {
    console.warn("[syncEntregas] buscarNFsPorPedidos falhou:", e.message);
  }

  for (const pedido of pedidos) {
    try {
      let recebido = false;
      let parcial = false;
      let dataRecebimento = null;

      if (pedido.faturamentoDireto) {
        // FD: verifica status da remessa
        const status = await consultarStatusRemessa(pedido.codigoPedido);
        recebido = status.faturada;
        if (recebido && !dataRecebimento) {
          dataRecebimento = new Date();
        }
      } else {
        // Torg: verifica recebimento do pedido de compra
        const status = await verificarRecebimentoPedido(pedido.codigoPedido);
        recebido = status.recebido;
        parcial = status.parcial;
        dataRecebimento = status.dataRecebimento;

        // Sincroniza itens reais do Omie e prazo de entrega
        const updateData = {};
        if (status.itensOmie?.length > 0) {
          updateData.itensOmie = status.itensOmie;
        }
        if (status.previsaoEntrega && !pedido.prazoEntregaPrevisto) {
          updateData.prazoEntregaPrevisto = status.previsaoEntrega;
        }
        if (Object.keys(updateData).length > 0) {
          await prisma.pedidoOmie.update({
            where: { id: pedido.id },
            data: updateData,
          });
        }
      }

      if (recebido || parcial) {
        const dataReal = dataRecebimento || new Date();

        // Pega dados da NF associada a este pedido (se encontrada)
        const nfs = nfsPorPedido.get(pedido.codigoPedido) || [];
        const nf = nfs[0] || null; // pega a primeira (mais comum: 1 NF por pedido)

        // Cria registros de Recebimento para cada RMItem vinculado
        // (so cria se ainda nao tem recebimento completo desse item)
        for (const rmItem of pedido.rmItens) {
          const qtdEfetiva = rmItem.peso > 0 ? Number(rmItem.peso) : rmItem.qtd;
          const jaRecebido = rmItem.recebimentos.reduce((s, r) => s + r.qtdRecebida, 0);

          if (jaRecebido < qtdEfetiva) {
            // Se recebido completo, registra o restante. Se parcial, nao sabemos quanto.
            if (recebido) {
              const falta = qtdEfetiva - jaRecebido;
              await prisma.recebimento.create({
                data: {
                  pedidoOmieId: pedido.id,
                  rmItemId: rmItem.id,
                  qtdRecebida: falta,
                  unidade: "KG",
                  dataRecebimento: dataReal,
                  origem: "OMIE_SYNC",
                  observacao: `Sync automatico - Pedido ${pedido.numeroPedido}`,
                  // Dados da NF de entrada (quando disponivel)
                  nfNumero: nf?.nfNumero || null,
                  nfChave: nf?.nfChave || null,
                  nfSerie: nf?.nfSerie || null,
                },
              });
            }
            // Para parcial (etapa 40), nao criamos registro pois nao sabemos
            // a qtd exata recebida. O usuario pode registrar manualmente.
          }
        }

        if (recebido) {
          const prazo = pedido.prazoEntregaPrevisto;
          const atrasado = prazo && dataReal > new Date(prazo);

          await prisma.pedidoOmie.update({
            where: { id: pedido.id },
            data: {
              dataEntregaReal: dataReal,
              statusEntrega: atrasado ? "ATRASADO" : "ENTREGUE",
            },
          });

          detalhes.push({
            pedidoId: pedido.id,
            numero: pedido.numeroPedido,
            fornecedor: pedido.fornecedorNome,
            fd: pedido.faturamentoDireto,
            status: "ENTREGUE",
            data: dataReal.toISOString(),
            itensRegistrados: pedido.rmItens.length,
            nf: nf ? { numero: nf.nfNumero, chave: nf.nfChave } : null,
          });
          sincronizados++;
        } else if (parcial) {
          // Parcial: atualiza statusEntrega mas nao marca dataEntregaReal (para continuar no sync)
          await prisma.pedidoOmie.update({
            where: { id: pedido.id },
            data: { statusEntrega: "PARCIAL" },
          });

          detalhes.push({
            pedidoId: pedido.id,
            numero: pedido.numeroPedido,
            fornecedor: pedido.fornecedorNome,
            fd: pedido.faturamentoDireto,
            status: "PARCIAL",
            nf: nf ? { numero: nf.nfNumero, chave: nf.nfChave } : null,
          });
          sincronizados++;
        }
      } else {
        detalhes.push({
          pedidoId: pedido.id,
          numero: pedido.numeroPedido,
          fornecedor: pedido.fornecedorNome,
          fd: pedido.faturamentoDireto,
          status: "PENDENTE",
        });
      }
    } catch (e) {
      erros++;
      detalhes.push({
        pedidoId: pedido.id,
        numero: pedido.numeroPedido,
        fornecedor: pedido.fornecedorNome,
        error: e.message,
      });
    }

    // Rate limiting: 350ms entre chamadas
    await sleep(350);
  }

  // Backfill: sincroniza itensOmie de pedidos que ainda nao tem o campo
  // preenchido (max 10 por sync pra nao estourar rate limit).
  let itensSync = 0;
  try {
    const semItens = await prisma.pedidoOmie.findMany({
      where: {
        codigoPedido: { not: null },
        itensOmie: null,
        status: "CRIADO",
      },
      select: { id: true, codigoPedido: true, faturamentoDireto: true },
      take: 10,
    });

    for (const p of semItens) {
      if (p.faturamentoDireto) continue; // FD nao tem itens de pedido de compra
      try {
        const omie = await consultarPedidoCompra(p.codigoPedido);
        const itensRaw = omie.produtos_consulta || omie.det || [];
        const itensOmie = itensRaw.map((item) => {
          const prod = item.produto || item;
          return {
            descricao: prod.cDescricao || prod.cProduto || "",
            qtd: Number(prod.nQtde) || 0,
            unidade: prod.cUnidade || "KG",
            valorUnit: Number(prod.nValUnit) || 0,
            qtdRecebida: Number(prod.nQtdeRec) || 0,
          };
        });
        if (itensOmie.length > 0) {
          await prisma.pedidoOmie.update({
            where: { id: p.id },
            data: { itensOmie },
          });
          itensSync++;
        }
        await sleep(350);
      } catch {
        // silencia erros no backfill — nao bloqueia o sync principal
      }
    }
  } catch {
    // silencia
  }

  return { sincronizados, erros, total: pedidos.length, itensSync, detalhes };
}
