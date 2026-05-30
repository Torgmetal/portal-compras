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
    const data = await omieCall(OMIE_RECEBIMENTO_URL, "ListarRecebimentos", [
      { nPagina: 1, nRegPorPag: 50 },
    ]);
    // Filtra recebimentos desse pedido (API nao tem filtro por pedido direto)
    const lista = data.recebimentos || [];
    return lista.filter((r) =>
      (r.itens || []).some((it) => Number(it.nIdPedido) === Number(nIdPedido))
    );
  } catch {
    return [];
  }
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

    return { recebido, parcial, etapa, dataRecebimento, previsaoEntrega, totalQtd, totalQtdRec };
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

        // Atualiza prazo de entrega se o Omie tem e nosso banco não
        if (status.previsaoEntrega && !pedido.prazoEntregaPrevisto) {
          await prisma.pedidoOmie.update({
            where: { id: pedido.id },
            data: { prazoEntregaPrevisto: status.previsaoEntrega },
          });
        }
      }

      if (recebido || parcial) {
        const dataReal = dataRecebimento || new Date();

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
                  unidade: rmItem.peso > 0 ? "KG" : rmItem.unidade,
                  dataRecebimento: dataReal,
                  origem: "OMIE_SYNC",
                  observacao: `Sync automatico - Pedido ${pedido.numeroPedido}`,
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

  return { sincronizados, erros, total: pedidos.length, detalhes };
}
