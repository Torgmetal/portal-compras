// Lancamento manual de proposta pela tela de Compras (quando o fornecedor
// nao respondeu pelo portal e o Compras tem a proposta em mãos).
// Diferenca pra /api/cotacao/submeter/[token]:
//   - autorizada por sessao (Admin/Compras), nao por token publico
//   - identifica itens pelo rmItemId (nao cotacaoItemId) — cria/atualiza
//     CotacaoItem se nao existir
//   - resolve fornecedor no Omie pelo CNPJ (igual ao submeter)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resolverFornecedorPorCnpj } from "@/lib/omie-pedido-compra";
import { log } from "@/lib/log";

const registro = log("api/cotacao/[id]/lancar-manual");
export const runtime = "nodejs";
// ⚠⚠ SEM ISTO A ROTA MORRIA EM 10 SEGUNDOS — o padrão da Vercel — e morrer aqui não devolve corpo
// nenhum: o navegador faz `res.json()` num corpo VAZIO e mostra "Unexpected end of JSON input".
// Matheus (11/09/2026), lançando uma proposta grande: "deu esse erro para salvar depois da IA
// preencher". A leitura por IA tinha funcionado; quem caiu foi a GRAVAÇÃO.
//
// O orçamento de tempo daqui não é pequeno: consulta do CNPJ no Omie (rede, com retry) + uma
// escrita por item da proposta + atualização da cotação, das RMItens e do status de cada RM
// envolvida. Numa proposta de dezenas de itens isso passa de 10s com folga.
//
// ⚠ É o mesmo defeito que o import de LPC já documenta neste projeto ("60s estourava → timeout →
// HTML → token JSON"). O sintoma engana porque parece erro de JSON; é a função sendo morta.
export const maxDuration = 60;


const itemSchema = z.object({
  rmItemId: z.string(),
  precoUnit: z.number().min(0),
  qtdCotada: z.number().min(0),
  icmsPct: z.number().min(0).optional().nullable(),
  ipiPct: z.number().min(0).optional().nullable(),
});

const anexoSchema = z.object({
  url: z.string().url(),
  nomeArquivo: z.string().min(1),
  tamanho: z.number().int().min(0),
  tipo: z.string().default("application/octet-stream"),
}).nullable().optional();

const schema = z.object({
  cnpj: z.string().min(11),
  razaoSocial: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1),
  prazoEntrega: z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  // Total declarado pelo fornecedor (PDF). Quando preenchido, vira fonte da
  // verdade — gerar-pedidos ajusta precos no Omie pra bater com esse valor.
  totalProposta: z.number().min(0).optional().nullable(),
  // PDF/imagem da proposta uploaded — vincula como Anexo da Cotacao
  anexo: anexoSchema,
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, rmItemId: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotação cancelada." }, { status: 409 });
  }

  const cnpjLimpo = body.cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14 && cnpjLimpo.length !== 11) {
    return NextResponse.json({ error: "Informe CNPJ (14 dígitos) ou CPF (11 dígitos)." }, { status: 400 });
  }

  // Resolve fornecedor no Omie (mesmo padrao do submeter publico)
  let nCodOmieResolvido = cotacao.nCodOmie || null;
  if (!nCodOmieResolvido) {
    try {
      const r = await resolverFornecedorPorCnpj(
        cnpjLimpo,
        process.env.OMIE_APP_KEY,
        process.env.OMIE_APP_SECRET
      );
      if (r.codigo) nCodOmieResolvido = String(r.codigo);
    } catch (e) {
      registro.erro("lancar-manual: falha ao resolver fornecedor Omie por CNPJ:", e);
    }
  }

  // Mapa rmItemId -> cotacaoItemId existente (se houver)
  const cotItemPorRm = new Map();
  for (const ci of cotacao.itens) cotItemPorRm.set(ci.rmItemId, ci.id);

  // Arredonda valores numericos pra 2 casas decimais — evita "lixo" do parser IA
  // ou de inputs do form que possam ter casas extras.
  const round2 = (n) => (n == null ? n : Math.round(Number(n) * 100) / 100);

  // Itens validos: precoUnit > 0
  const itensValidos = body.itens
    .filter((it) => it.precoUnit > 0)
    .map((it) => ({
      ...it,
      precoUnit: round2(it.precoUnit),
      qtdCotada: round2(it.qtdCotada),
      icmsPct: it.icmsPct != null ? round2(it.icmsPct) : null,
      ipiPct: it.ipiPct != null ? round2(it.ipiPct) : null,
    }));
  if (itensValidos.length === 0) {
    return NextResponse.json({ error: "Preencha ao menos um preço unitário." }, { status: 400 });
  }

  // Total da nota = bruto × qtd × (1 + IPI%) — bate com o "Valor total"
  // do PDF do fornecedor. ICMS nao entra (e credito da Torg, nao soma na NF).
  const total = round2(
    itensValidos.reduce((s, it) => {
      const ipiPct = Number(it.ipiPct) || 0;
      return s + it.precoUnit * it.qtdCotada * (1 + ipiPct / 100);
    }, 0)
  );
  const eRevisao = cotacao.status === "RECEBIDA";

  // ⚠⚠ O TETO PADRÃO DA TRANSAÇÃO INTERATIVA DO PRISMA É 5 SEGUNDOS, e ele é independente do limite
  // da função: estourado, a gravação aborta com "Transaction already closed" DEPOIS de já ter feito
  // metade do trabalho. Uma proposta com dezenas de itens é uma escrita por item na mesma conexão,
  // então 5s não dá. O número aqui fica abaixo do `maxDuration` de propósito — se algo travar, quem
  // tem de falhar primeiro é a transação (que desfaz tudo), não a função (que morre sem resposta).
  const OPCOES_TX = { maxWait: 10_000, timeout: 45_000 };

  await prisma.$transaction(async (tx) => {
    // ⚠ As linhas são independentes (uma por rmItemId), então vão juntas em vez de uma de cada vez
    // — é o mesmo que /api/cotacao/submeter já faz. O laço sequencial pagava uma ida e volta ao
    // Neon por item, e é isso que fazia a proposta grande estourar o tempo.
    await Promise.all(itensValidos.map(async (it) => {
      const existing = cotItemPorRm.get(it.rmItemId);
      if (existing) {
        await tx.cotacaoItem.update({
          where: { id: existing },
          data: {
            precoUnit: it.precoUnit,
            qtdCotada: it.qtdCotada,
            icmsPct: it.icmsPct ?? null,
            ipiPct: it.ipiPct ?? null,
            // ⚠⚠ PREÇO E "SEM DISPONIBILIDADE" NÃO PODEM COEXISTIR. Esta rota gravava o preço sem
            // olhar a flag: se o fornecedor tinha respondido pelo portal marcando "não tenho" e
            // depois a proposta era lançada à mão com preço, o item ficava com OS DOIS. No mapa ele
            // volta a parecer preço normal (a célula só esconde quando o preço é zero), fica
            // clicável, pode vencer e virar pedido — com o "não tenho" do fornecedor ainda gravado
            // nele. Lançar um preço é afirmar que ele tem; a flag antiga é a resposta velha e sai.
            semEstoque: false,
            // A qtd digitada manualmente passa a mandar — limpa o snapshot do
            // abatimento de estoque para nao ficar contraditorio/orfao.
            qtdPecasCotada: null,
            estoqueAbatidoQtd: null,
          },
        });
      } else {
        // Cria CotacaoItem novo (caso o RMItem nao estivesse na cotacao original)
        await tx.cotacaoItem.create({
          data: {
            cotacaoId: cotacao.id,
            rmItemId: it.rmItemId,
            precoUnit: it.precoUnit,
            qtdCotada: it.qtdCotada,
            icmsPct: it.icmsPct ?? null,
            ipiPct: it.ipiPct ?? null,
          },
        });
      }
    }));

    const obsParts = [];
    if (body.prazoEntrega) obsParts.push(`Prazo de entrega: ${body.prazoEntrega}`);
    if (body.condicaoPagamento) obsParts.push(`Pagamento: ${body.condicaoPagamento}`);
    if (body.observacao) obsParts.push(body.observacao);
    obsParts.push("Lançada manualmente por " + user.name);
    const obsCombinada = obsParts.filter(Boolean).join(" | ");

    await tx.cotacao.update({
      where: { id: cotacao.id },
      data: {
        status: "RECEBIDA",
        recebidaEm: new Date(),
        total,
        totalProposta: body.totalProposta != null ? round2(body.totalProposta) : null,
        cnpj: cnpjLimpo,
        nCodOmie: nCodOmieResolvido || cotacao.nCodOmie,
        fornecedorNome: body.razaoSocial?.trim() || cotacao.fornecedorNome,
        prazoPagamento: body.condicaoPagamento || null,
        observacao: obsCombinada,
        ...(eRevisao ? { numeroRevisao: { increment: 1 } } : {}),
      },
    });

    // Atualiza RMItens dos itens lancados pra COTADO (se ainda EM_COTACAO/PENDENTE)
    await tx.rMItem.updateMany({
      where: {
        id: { in: itensValidos.map((it) => it.rmItemId) },
        status: { in: ["PENDENTE", "EM_COTACAO"] },
      },
      data: { status: "COTADO" },
    });

    // Atualiza status de TODAS as RMs envolvidas (multi-RM consolidada).
    // Descobre rmIds via rmItens lancados nessa proposta.
    const rmIdsEnvolvidas = await tx.rMItem.findMany({
      where: { id: { in: itensValidos.map((it) => it.rmItemId) } },
      select: { rmId: true },
    });
    const rmIdsUnicos = [...new Set(rmIdsEnvolvidas.map((r) => r.rmId))];
    await tx.rM.updateMany({
      where: { id: { in: rmIdsUnicos }, status: { in: ["ABERTA", "EM_COTACAO"] } },
      data: { status: "COTADA" },
    });

    // Vincula PDF/imagem da proposta como Anexo da cotacao (se enviado)
    if (body.anexo && body.anexo.url) {
      await tx.anexo.create({
        data: {
          cotacaoId: cotacao.id,
          nomeArquivo: body.anexo.nomeArquivo,
          blobUrl: body.anexo.url,
          tamanho: body.anexo.tamanho,
          tipo: body.anexo.tipo,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: eRevisao ? "lancar_manual_revisao" : "lancar_manual",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: {
          total, fornecedor: body.razaoSocial, cnpj: cnpjLimpo,
          itens: itensValidos.length,
          anexo: body.anexo?.nomeArquivo || null,
        },
      },
    });
  }, OPCOES_TX);

  return NextResponse.json({ ok: true, total });
}
