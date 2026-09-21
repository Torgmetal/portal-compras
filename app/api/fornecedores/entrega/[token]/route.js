// GET  /api/fornecedores/entrega/[token] — dados do pedido p/ pagina publica
// PATCH /api/fornecedores/entrega/[token] — fornecedor informa nova data
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { avisarResposta, podeEscrever } from "@/lib/resposta-fornecedor";
import { novaPropostaId, propostaPendente, ehRepeticao } from "@/lib/prazo-proposto";

// ⚠ Página de token: nada daqui pode ficar em cache intermediário, e o token não pode vazar no
// `Referer` de um clique para fora (achado do Codex, 18/09/2026).
const SEM_RASTRO = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const responder = (corpo, status = 200) => NextResponse.json(corpo, { status, headers: SEM_RASTRO });

/** O prefixo que separa o que o fornecedor escreveu do comentário interno de Compras. */
const MARCA_FORNECEDOR = "[Fornecedor]";

/**
 * A proposta pendente como o FORNECEDOR a vê — sem o `id`, que é assunto interno da tela de
 * Compras (é ele que trava o aprovar contra uma proposta trocada no meio).
 */
function propostaParaOFornecedor(pedido) {
  const p = propostaPendente(pedido);
  return p ? { prazo: p.prazo, em: p.em, motivo: p.motivo } : null;
}

// ── GET: retorna dados do pedido para a pagina publica ──
export async function GET(_req, { params }) {
  const { token } = params;

  // ⚠ Duas consultas de propósito: o `where` dos recebimentos precisa do id do pedido, e ele só
  // se conhece depois de resolver o token.
  const achado = await prisma.pedidoOmie.findUnique({
    where: { tokenEntrega: token }, select: { id: true },
  });
  if (!achado) return responder({ error: "Token invalido" }, 404);
  const pedidoDoToken = achado;

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: pedidoDoToken.id },
    select: {
      id: true,
      numeroPedido: true,
      codigoPedido: true,
      fornecedorNome: true,
      prazoEntregaPrevisto: true,
      prazoOriginal: true,
      dataEntregaReal: true,
      prazoProposto: true,
      prazoPropostoEm: true,
      prazoPropostoMotivo: true,
      prazoPropostoId: true,
      cotacao: {
        select: {
          fornecedorNome: true,
          fornecedor: { select: { razaoSocial: true } },
          itens: {
            where: { vencedor: true },
            select: {
              id: true,
              prazoEntrega: true,
              rmItem: {
                select: {
                  descricao: true,
                  qtd: true,
                  unidade: true,
                  peso: true,
                  // ⚠⚠ SÓ OS RECEBIMENTOS DESTE PEDIDO (achado do Codex, 18/09/2026). Um RMItem
                  // pode ser atendido por mais de um pedido; somando todos, o saldo mostrado ao
                  // fornecedor incluiria quantidade que outro entregou. Medido: 0 casos hoje —
                  // é defeito estrutural, não incidente.
                  recebimentos: {
                    where: { pedidoOmieId: pedidoDoToken.id },
                    select: { qtdRecebida: true },
                  },
                },
              },
            },
          },
        },
      },
      rmItens: {
        select: {
          id: true,
          descricao: true,
          qtd: true,
          unidade: true,
          peso: true,
          recebimentos: {
            where: { pedidoOmieId: pedidoDoToken.id },
            select: { qtdRecebida: true },
          },
        },
        take: 30,
      },
      prazoHistorico: {
        select: {
          prazoAnterior: true,
          prazoNovo: true,
          motivo: true,
          criadoEm: true,
        },
        orderBy: { criadoEm: "asc" },
      },
    },
  });

  // Montar itens com saldo pendente
  const itensCotacao = pedido.cotacao?.itens?.map((ci) => {
    const ri = ci.rmItem;
    const qtdOriginal = ri?.peso > 0 ? Number(ri.peso) : (ri?.qtd || 0);
    const unidade = ri?.peso > 0 ? "KG" : (ri?.unidade || "UN");
    const totalRecebido = (ri?.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
    const qtdPendente = Math.max(0, qtdOriginal - totalRecebido);
    return { descricao: ri?.descricao || "—", qtdOriginal, unidade, totalRecebido, qtdPendente };
  }) || [];

  const itensDiretos = pedido.rmItens?.map((ri) => {
    const qtdOriginal = ri.peso > 0 ? Number(ri.peso) : (ri.qtd || 0);
    const unidade = ri.peso > 0 ? "KG" : (ri.unidade || "UN");
    const totalRecebido = (ri.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
    const qtdPendente = Math.max(0, qtdOriginal - totalRecebido);
    return { descricao: ri.descricao || "—", qtdOriginal, unidade, totalRecebido, qtdPendente };
  }) || [];

  const itens = itensCotacao.length > 0 ? itensCotacao : itensDiretos;
  const itensPendentes = itens.filter((it) => it.qtdPendente > 0);

  const nomeFornecedor =
    pedido.cotacao?.fornecedor?.razaoSocial ||
    pedido.fornecedorNome ||
    pedido.cotacao?.fornecedorNome ||
    "Fornecedor";

  return NextResponse.json({
    success: true,
    numero: pedido.numeroPedido || pedido.codigoPedido || "s/n",
    fornecedor: nomeFornecedor,
    prazoEntregaPrevisto: pedido.prazoEntregaPrevisto,
    prazoOriginal: pedido.prazoOriginal,
    jaEntregue: !!pedido.dataEntregaReal,
    // ⚠⚠ A TELA DO FORNECEDOR PRECISA DIZER "EM ANÁLISE". Ele informou uma data, a página não
    // mostrava nada diferente e o prazo continuava o antigo — pareceria que a resposta se perdeu,
    // e ele responderia de novo. Agora a proposta pendente aparece, com a data e o dia em que ele
    // mandou, marcada como aguardando a Torg.
    propostaEmAnalise: propostaParaOFornecedor(pedido),
    itensPendentes,
    totalItens: itens.length,
    // ⚠⚠ SÓ O QUE O PRÓPRIO FORNECEDOR ESCREVEU (achado do Codex, 18/09/2026). O mesmo
    // `PrazoHistorico` guarda o comentário INTERNO de quem altera prazo por dentro
    // (`/api/compras/entregas/prazo`), sem prefixo nenhum — e esta rota é pública. Medido em
    // 18/09/2026: 15 das 17 linhas são internas, e uma delas já tinha texto ("Ajuste manual de
    // prazo por ter importado errado do pedido"). Inofensivo hoje; estrutural sempre, e o link
    // agora vai para oito fornecedores de uma vez.
    //
    // ⚠ A data e o prazo de CADA alteração continuam à vista — o fornecedor precisa conferir o
    // que combinou. O que sai é o TEXTO interno.
    prazoHistorico: (pedido.prazoHistorico || []).map((h) => ({
      prazoAnterior: h.prazoAnterior,
      prazoNovo: h.prazoNovo,
      criadoEm: h.criadoEm,
      motivo: String(h.motivo || "").startsWith(MARCA_FORNECEDOR) ? h.motivo : null,
    })),
  }, { headers: SEM_RASTRO });
}

// ── PATCH: o fornecedor responde ────────────────────────────────────────────
//
// Duas respostas possíveis, e o corpo tem de escolher UMA (união estrita do Zod): informar nova
// PREVISÃO, ou declarar que já ENTREGOU, com o número da NF.
//
// ⚠⚠ DECLARAR ENTREGA NÃO É ENTREGAR. Nada aqui escreve `dataEntregaReal`, `statusEntrega` nem
// `nfNumero` — esses vêm da NF de entrada REAL, pelo cron `sync-entregas`. Um terceiro sem login
// mudando a crença do portal sobre o que chegou faria o pedido sumir do vermelho e da lista de
// cobrança sem ninguém da Torg ter conferido nada. A declaração fica em colunas próprias
// (`fornecedorEntregaEm`, `fornecedorNfNumero`), alguém confere, e o pedido CONTINUA cobrável até
// lá (achado do Codex, 18/09/2026).

// ⚠ NF é texto: zero à esquerda importa, e "consertar" a entrada apagaria dígito de quem digitou
// certo. Só apara espaço, limita tamanho e recusa quebra de linha e caractere de controle.
const semControle = (v) => [...v].every((c) => c.codePointAt(0) >= 0x20 && c.codePointAt(0) !== 0x7f);
const nf = z.string().trim().min(1, "Informe o número da NF").max(40, "Número de NF longo demais")
  .refine(semControle, "Número de NF inválido");

// ⚠⚠ UMA RESPOSTA DE CADA VEZ, e a checagem é no `superRefine` — NÃO num `z.union` com
// `z.undefined()` nos campos da outra metade. No **Zod 4** `z.undefined()` é NÃO-OPCIONAL: chave
// ausente falha com "expected nonoptional, received undefined", e as DUAS metades da união
// recusavam o corpo correto. Custou uma bateria inteira de teste vermelho (18/09/2026).
const patchSchema = z.object({
  novoPrazo: z.string().min(1, "Data obrigatoria").optional(),
  entregue: z.literal(true).optional(),
  nfNumero: nf.optional(),
  motivo: z.string().max(500).optional(),
}).superRefine((v, ctx) => {
  const quer = [v.novoPrazo !== undefined, v.entregue === true].filter(Boolean).length;
  if (quer !== 1) {
    ctx.addIssue({ code: "custom",
      message: "Informe uma nova previsão OU marque o pedido como entregue" });
    return;
  }
  // ⚠ A nota é o que torna a declaração conferível: "entreguei" sem número não dá para checar.
  if (v.entregue && !v.nfNumero) {
    ctx.addIssue({ code: "custom", path: ["nfNumero"], message: "Informe o número da NF" });
  }
  if (v.novoPrazo !== undefined && v.nfNumero !== undefined) {
    ctx.addIssue({ code: "custom", message: "Nota fiscal só vai com a declaração de entrega" });
  }
});

/** O pedido que o token abre, com o que o PATCH precisa decidir. */
const pedidoDoToken = (token) => prisma.pedidoOmie.findUnique({
  where: { tokenEntrega: token },
  select: {
    id: true, numeroPedido: true, fornecedorNome: true,
    prazoEntregaPrevisto: true, prazoOriginal: true, dataEntregaReal: true,
    encerradoOmieEm: true, fornecedorEntregaEm: true, fornecedorNfNumero: true,
    prazoProposto: true, prazoPropostoEm: true, prazoPropostoMotivo: true, prazoPropostoId: true,
    rmItens: { select: { rm: { select: { numero: true } } }, take: 1 },
  },
});

/** O fornecedor declara que já entregou. Declaração, não fato. */
async function declararEntrega(pedido, body) {
  const agora = new Date();
  // ⚠⚠ REPETIÇÃO IDÊNTICA É SUCESSO SEM EVENTO (achado do Codex). Sem isto, recarregar a página e
  // reenviar viraria outro aviso — e a rota é pública.
  if (pedido.fornecedorEntregaEm && pedido.fornecedorNfNumero === body.nfNumero) {
    return { repetido: true, resposta: { entregue: true, nfNumero: body.nfNumero } };
  }

  await prisma.$transaction(async (tx) => {
    // ⚠ A condição de estado vai no próprio UPDATE: entre ler e gravar, alguém pode ter confirmado
    // o recebimento por dentro, e a escrita pública não pode passar por cima disso.
    const r = await tx.pedidoOmie.updateMany({
      where: { id: pedido.id, dataEntregaReal: null },
      data: { fornecedorEntregaEm: agora, fornecedorNfNumero: body.nfNumero },
    });
    if (r.count === 0) throw new Error("Este pedido ja foi entregue.");

    await tx.auditLog.create({
      data: {
        userId: null, action: "FORNECEDOR_DECLAROU_ENTREGA", entity: "PedidoOmie", entityId: pedido.id,
        diff: { nfNumero: body.nfNumero, motivo: body.motivo?.trim() || null, viaPortalFornecedor: true },
      },
    });
  });

  return { repetido: false, resposta: { entregue: true, nfNumero: body.nfNumero, motivo: body.motivo } };
}

/**
 * O fornecedor PROPÕE uma nova previsão.
 *
 * ⚠⚠ NÃO ESCREVE `prazoEntregaPrevisto`, NÃO CRIA `PrazoHistorico` E NÃO TOCA EM `prazoOriginal`.
 * Tudo isso é efeito de prazo VALENDO, e quem decide é Compras em
 * `POST /api/compras/prazos-rm/prazo-proposto`. Aqui só fica registrado o que ele pediu.
 */
async function proporPrevisao(pedido, body) {
  const novoPrazo = new Date(body.novoPrazo);
  if (isNaN(novoPrazo.getTime())) throw new Error("Data invalida");

  const motivo = body.motivo?.trim() || null;
  // ⚠ Mesma proposta de novo não é notícia — e a rota é pública.
  if (ehRepeticao(pedido, novoPrazo, motivo)) {
    return { repetido: true, resposta: { proposto: true, prazoNovo: novoPrazo, prazoAnterior: pedido.prazoEntregaPrevisto } };
  }

  const propostaId = novaPropostaId();
  await prisma.$transaction(async (tx) => {
    // ⚠ A condição de estado vai no próprio UPDATE: entre ler e gravar, alguém pode ter confirmado
    // o recebimento por dentro, e a escrita pública não pode passar por cima disso.
    const r = await tx.pedidoOmie.updateMany({
      where: { id: pedido.id, dataEntregaReal: null },
      data: {
        prazoProposto: novoPrazo,
        prazoPropostoEm: new Date(),
        prazoPropostoMotivo: motivo,
        prazoPropostoId: propostaId,
      },
    });
    if (r.count === 0) throw new Error("Este pedido ja foi entregue.");

    await tx.auditLog.create({
      data: {
        userId: null, action: "FORNECEDOR_PROPOS_PRAZO", entity: "PedidoOmie", entityId: pedido.id,
        diff: {
          prazoAtual: pedido.prazoEntregaPrevisto?.toISOString() || null,
          prazoProposto: novoPrazo.toISOString(),
          propostaId, motivo, viaPortalFornecedor: true,
        },
      },
    });
  });

  return {
    repetido: false,
    resposta: { proposto: true, prazoNovo: novoPrazo, prazoAnterior: pedido.prazoEntregaPrevisto, motivo: body.motivo },
  };
}

export async function PATCH(req, { params }) {
  const { token } = params;

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return responder({ error: "Dados invalidos: " + (e.issues?.[0]?.message || e.message) }, 400);
  }

  const pedido = await pedidoDoToken(token);
  if (!pedido) return responder({ error: "Token invalido" }, 404);
  if (pedido.dataEntregaReal) return responder({ error: "Este pedido ja foi entregue." }, 400);

  // ⚠⚠ TETO DE ESCRITA POR TOKEN, antes de qualquer gravação (achado do Codex, 18/09/2026). As
  // travas de aviso limitavam o E-MAIL, não o banco: alternar data e motivo abria transação e
  // gravava auditoria sem limite nenhum. 429 é a resposta certa — o pedido é válido, só veio
  // vezes demais.
  const cota = await podeEscrever(prisma, pedido.id);
  if (!cota.ok) return responder({ error: cota.motivo }, 429);

  let r;
  try {
    r = body.entregue ? await declararEntrega(pedido, body) : await proporPrevisao(pedido, body);
  } catch (e) {
    return responder({ error: e.message || "Nao foi possivel registrar sua resposta." }, 400);
  }

  // ⚠⚠ O AVISO NUNCA DERRUBA A RESPOSTA. Ela já está gravada; dizer ao fornecedor que deu errado
  // o faria tentar de novo, e cada tentativa é outro aviso.
  const aviso = r.repetido
    ? { avisado: false, motivo: "resposta repetida" }
    : await avisarResposta(prisma, {
        id: pedido.id, numeroPedido: pedido.numeroPedido,
        fornecedorNome: pedido.fornecedorNome, rmNumero: pedido.rmItens?.[0]?.rm?.numero || null,
      }, r.resposta).catch(() => ({ avisado: false, motivo: "falha ao avisar" }));

  return responder({ success: true, ...r.resposta, avisoInterno: aviso.avisado });
}
