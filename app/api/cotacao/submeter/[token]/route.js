import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolverFornecedorPorCnpj } from "@/lib/omie-pedido-compra";
import { notificarEvento } from "@/lib/email";
import { criarNotificacao } from "@/lib/notificacoes";

const itemSchema = z.object({
  cotacaoItemId: z.string().min(1),
  precoUnit: z.number().min(0),
  qtdCotada: z.number().min(0),
  icmsPct: z.number().min(0).optional().nullable(),
  ipiPct: z.number().min(0).optional().nullable(),
  observacao: z.string().optional().nullable(),
  prazoEntrega: z.string().optional().nullable(), // "YYYY-MM-DD" ou null
  semEstoque: z.boolean().optional().default(false),
});

const schema = z.object({
  itens: z.array(itemSchema).min(1),
  cnpj: z.string().optional().nullable(),
  razaoSocial: z.string().optional().nullable(),
  numeroProposta: z.string().optional().nullable(),
  totalProposta: z.number().optional().nullable(),
  prazoEntrega: z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export async function POST(req, { params }) {
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    include: { itens: { select: { id: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Token inválido." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotação cancelada." }, { status: 409 });
  }

  const eRevisao = cotacao.status === "RECEBIDA";

  // Arredonda valores numericos pra 2 casas decimais — evita "lixo" do parser IA
  // ou de inputs do form que possam ter casas extras.
  const round2 = (n) => (n == null ? n : Math.round(Number(n) * 100) / 100);

  // Filtra apenas itens válidos da própria cotação (com preço OU marcados semEstoque)
  const idsValidos = new Set(cotacao.itens.map((i) => i.id));
  const itensValidos = body.itens
    .filter((it) => idsValidos.has(it.cotacaoItemId) && (it.precoUnit > 0 || it.semEstoque))
    .map((it) => ({
      ...it,
      precoUnit: it.semEstoque ? 0 : round2(it.precoUnit),
      qtdCotada: it.semEstoque ? 0 : round2(it.qtdCotada),
      icmsPct: it.semEstoque ? null : (it.icmsPct != null ? round2(it.icmsPct) : null),
      ipiPct: it.semEstoque ? null : (it.ipiPct != null ? round2(it.ipiPct) : null),
    }));
  const itensComPreco = itensValidos.filter((it) => !it.semEstoque && it.precoUnit > 0);
  if (itensComPreco.length === 0) {
    return NextResponse.json({ error: "Preencha ao menos um preço unitário." }, { status: 400 });
  }

  // Total da nota = bruto × qtd × (1 + IPI%) — bate com o "Valor total"
  // do PDF do fornecedor. ICMS nao entra (credito Torg, nao soma na NF).
  const total = round2(
    itensValidos.reduce((s, it) => {
      const ipiPct = Number(it.ipiPct) || 0;
      return s + it.precoUnit * it.qtdCotada * (1 + ipiPct / 100);
    }, 0)
  );

  // Tenta resolver o fornecedor no Omie pelo CNPJ — se achar, ja salva nCodOmie
  // pra que a geracao de pedido saiba pra quem mandar.
  const cnpjLimpo = body.cnpj ? body.cnpj.replace(/\D/g, "") : "";
  let nCodOmieResolvido = cotacao.nCodOmie || null;
  let omieLookupErro = null;
  if (cnpjLimpo && cnpjLimpo.length === 14 && !nCodOmieResolvido) {
    try {
      const r = await resolverFornecedorPorCnpj(
        cnpjLimpo,
        process.env.OMIE_APP_KEY,
        process.env.OMIE_APP_SECRET
      );
      if (r.codigo) {
        nCodOmieResolvido = String(r.codigo);
      } else {
        omieLookupErro = r.error;
      }
    } catch (e) {
      omieLookupErro = e?.message || "erro de rede";
    }
  }

  await prisma.$transaction(async (tx) => {
    // Atualiza todos os itens em paralelo (independentes dentro da mesma transação)
    await Promise.all(itensValidos.map((it) =>
      tx.cotacaoItem.update({
        where: { id: it.cotacaoItemId },
        data: {
          precoUnit: it.precoUnit,
          qtdCotada: it.qtdCotada,
          icmsPct: it.icmsPct ?? null,
          ipiPct: it.ipiPct ?? null,
          observacao: it.observacao || null,
          semEstoque: it.semEstoque || false,
          prazoEntrega: it.prazoEntrega ? new Date(it.prazoEntrega) : null,
        },
      })
    ));

    // Combina observações em um único campo
    const obsParts = [];
    if (body.prazoEntrega) obsParts.push(`Prazo de entrega: ${body.prazoEntrega}`);
    if (body.condicaoPagamento) obsParts.push(`Pagamento: ${body.condicaoPagamento}`);
    if (body.observacao) obsParts.push(body.observacao);
    const obsCombinada = obsParts.join(" | ") || null;

    await tx.cotacao.update({
      where: { id: cotacao.id },
      data: {
        status: "RECEBIDA",
        recebidaEm: new Date(),
        total,
        totalProposta: body.totalProposta ? round2(body.totalProposta) : null,
        numeroProposta: body.numeroProposta?.trim() || null,
        prazoPagamento: body.condicaoPagamento || null,
        observacao: obsCombinada,
        cnpj: cnpjLimpo || cotacao.cnpj,
        nCodOmie: nCodOmieResolvido || cotacao.nCodOmie,
        fornecedorNome: body.razaoSocial ? body.razaoSocial.trim().toUpperCase() : cotacao.fornecedorNome,
        ...(eRevisao ? { numeroRevisao: { increment: 1 } } : {}),
      },
    });

    // Atualiza RMItens dessa cotação pra status COTADO — APENAS itens com preço.
    // Itens que fornecedor deixou em branco/0 nao foram "cotados", ficam em
    // EM_COTACAO pro usuario decidir (re-cotar com outro fornecedor ou cancelar).
    const cotItens = await tx.cotacaoItem.findMany({
      where: { cotacaoId: cotacao.id },
      select: { rmItemId: true, precoUnit: true, rmItem: { select: { rmId: true } } },
    });
    const rmItemIdsComPreco = cotItens.filter((c) => c.precoUnit > 0).map((c) => c.rmItemId);
    if (rmItemIdsComPreco.length > 0) {
      await tx.rMItem.updateMany({
        where: {
          id: { in: rmItemIdsComPreco },
          status: "EM_COTACAO",
        },
        data: { status: "COTADO" },
      });
    }

    // Atualiza status de TODAS as RMs envolvidas (multi-RM consolidada)
    const rmIdsEnvolvidas = [...new Set(cotItens.map((c) => c.rmItem.rmId))];
    await tx.rM.updateMany({
      where: { id: { in: rmIdsEnvolvidas }, status: "EM_COTACAO" },
      data: { status: "COTADA" },
    });

    await tx.auditLog.create({
      data: {
        userId: null,
        action: eRevisao ? "revisar_cotacao_fornecedor" : "submeter_cotacao_fornecedor",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: {
          total,
          fornecedor: cotacao.fornecedorNome,
          itens: itensValidos.length,
          revisao: eRevisao ? cotacao.numeroRevisao + 1 : 0,
        },
      },
    });
  });

  // Invalida cache do Next.js pras paginas que mostram a cotacao — sem isso,
  // o mapa de cotacao pode continuar mostrando dados antigos mesmo apos
  // o usuario navegar (force-dynamic so vale na primeira request, depois
  // entra cache do Router Cache do Next.js).
  try {
    // Busca rms+ops envolvidas pra invalidar todas as paginas relacionadas
    const cotItens = await prisma.cotacaoItem.findMany({
      where: { cotacaoId: cotacao.id },
      select: { rmItem: { select: { rmId: true, rm: { select: { opId: true } } } } },
    });
    const rmIds = new Set();
    const opIds = new Set();
    for (const ci of cotItens) {
      if (ci.rmItem?.rmId) rmIds.add(ci.rmItem.rmId);
      if (ci.rmItem?.rm?.opId) opIds.add(ci.rmItem.rm.opId);
    }
    for (const rmId of rmIds) revalidatePath(`/compras/rm/${rmId}`);
    for (const opId of opIds) revalidatePath(`/compras/painel-ops/${opId}`);
    revalidatePath("/compras");
  } catch (e) {
    console.warn("[submeter] revalidatePath falhou:", e?.message);
  }

  // Notifica os inscritos no evento COTACAO_RESPONDIDA. Best-effort, nao bloqueia.
  // Busca RMs envolvidas via CotacaoItem -> RMItem -> RM pra montar contexto.
  (async () => {
    try {
      const cotItens = await prisma.cotacaoItem.findMany({
        where: { cotacaoId: cotacao.id },
        select: { rmItem: { select: { rm: { select: { id: true, numero: true } } } } },
      });
      const rmsMap = new Map();
      for (const ci of cotItens) {
        const rm = ci.rmItem?.rm;
        if (rm) rmsMap.set(rm.id, rm.numero);
      }
      const rmsNumeros = Array.from(rmsMap.values()).sort();
      const rotuloRMs = rmsNumeros.length === 1
        ? `RM ${rmsNumeros[0]}`
        : `RMs ${rmsNumeros.join(", ")}`;
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
      const linkInterno = rmsMap.size === 1
        ? `/compras/rm/${[...rmsMap.keys()][0]}`
        : "/compras";
      const linkRM = `${baseUrl}${linkInterno}`;
      const totalFmt = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      // Notificacao IN-APP — sempre registrada
      await criarNotificacao({
        tipo: "COTACAO_RESPONDIDA",
        titulo: `${eRevisao ? "Revisão de" : "Nova"} proposta — ${cotacao.fornecedorNome}`,
        mensagem: `${cotacao.fornecedorNome} ${eRevisao ? "atualizou" : "enviou"} a proposta da ${rotuloRMs}. Total ${totalFmt}, ${itensValidos.length} item(s).`,
        link: linkInterno,
        dados: {
          cotacaoId: cotacao.id,
          fornecedor: cotacao.fornecedorNome,
          rmsNumeros,
          total,
          itens: itensValidos.length,
          revisao: eRevisao,
          numeroRevisao: eRevisao ? cotacao.numeroRevisao + 1 : 0,
        },
      });

      await notificarEvento({
        evento: "COTACAO_RESPONDIDA",
        subject: `[Compras] ${eRevisao ? "Revisão de" : "Nova"} proposta — ${cotacao.fornecedorNome} (${rotuloRMs})`,
        html: `
          <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0a3a5c;">
              ${eRevisao ? "Revisão de proposta recebida" : "Nova proposta recebida"}
            </h2>
            <p style="color: #4a5568;">
              <strong>${cotacao.fornecedorNome}</strong> ${eRevisao ? "atualizou" : "enviou"} a proposta de cotação.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
              <tr><td style="padding: 6px 0; color: #718096;">Fornecedor</td><td style="padding: 6px 0;"><strong>${cotacao.fornecedorNome}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #718096;">RM(s)</td><td style="padding: 6px 0;"><strong>${rotuloRMs}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #718096;">Total da proposta</td><td style="padding: 6px 0;"><strong>${totalFmt}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #718096;">Itens preenchidos</td><td style="padding: 6px 0;">${itensValidos.length}</td></tr>
              ${eRevisao ? `<tr><td style="padding: 6px 0; color: #718096;">Revisão</td><td style="padding: 6px 0;"><strong>#${cotacao.numeroRevisao + 1}</strong></td></tr>` : ""}
            </table>
            <p style="margin-top: 24px;">
              <a href="${linkRM}" style="background: #1976d2; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Abrir RM no Workspace Torg
              </a>
            </p>
            <p style="color: #a0aec0; font-size: 12px; margin-top: 24px;">
              Você está inscrito nas notificações de cotações respondidas.
              Pra parar, peça pra um admin remover seu email em /admin/notificacoes.
            </p>
          </div>
        `,
        text: `${cotacao.fornecedorNome} ${eRevisao ? "atualizou" : "enviou"} proposta da ${rotuloRMs}.\n` +
              `Total: ${totalFmt}\nItens: ${itensValidos.length}\n${eRevisao ? `Revisao: #${cotacao.numeroRevisao + 1}\n` : ""}\nAcesse: ${linkRM}`,
      });
    } catch (e) {
      console.error("[notificar COTACAO_RESPONDIDA] erro:", e?.message);
    }
  })();

  return NextResponse.json({
    ok: true,
    total,
    revisao: eRevisao,
    omieResolvido: !!nCodOmieResolvido,
    omieLookupErro,
  });
}
