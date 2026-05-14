import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notificarEvento } from "@/lib/email";

const itemSchema = z.object({
  opItemId: z.string().nullable().optional(),
  aditivoItemId: z.string().nullable().optional(),
  // NOVO: OP destinataria multi-OP (linha pode apontar pra OP diferente
  // da OP "principal" da RM, ou ser null = estoque livre)
  opDestinoId: z.string().nullable().optional(),
  // NOVO: marca se este item vai pro estoque (true) ou sob encomenda OP (false)
  destinoEstoque: z.boolean().default(false),
  // NOVO: codigo do produto Omie (pra vincular ao EstoqueItem e criar reserva)
  codigoOmieEstoque: z.string().nullable().optional(),
  descricao: z.string().min(1),
  unidade: z.string().min(1),
  qtd: z.number().min(0),
  // Campos detalhados (de planilha Tekla)
  codigo: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  comprimento: z.string().optional().nullable(),
  largura: z.string().optional().nullable(),
  tratamento: z.string().optional().nullable(),
  peso: z.number().optional().nullable(),
  pesoLinear: z.number().optional().nullable(),
});

const anexoSchema = z.object({
  url: z.string().url(),
  nomeArquivo: z.string().min(1),
  tamanho: z.number().int().min(0),
  tipo: z.string().default("application/octet-stream"),
});

const schema = z.object({
  numero: z.string().optional().nullable(),
  tipoRM: z.enum(["ENGENHARIA", "INTERNA"]).default("ENGENHARIA"),
  opId: z.string().nullable().optional(),
  categoriasOP: z.array(z.string()).default([]),
  tipo: z.string().default("Material"),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  setor: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1),
  // Anexos ja foram pro Vercel Blob via /api/upload-blob — aqui so vinculamos
  // os metadados na RM via Anexo records.
  anexos: z.array(anexoSchema).default([]),
});

export async function POST(req) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.message || "") }, { status: 400 });
  }

  // Numero da RM: usa o que o usuario informou (geralmente vem do Tekla,
  // tipo "T83-001"). Se nao vier, gera sequencial como fallback.
  let numeroRM = (body.numero || "").trim().toUpperCase();
  if (!numeroRM) {
    const ultima = await prisma.rM.findFirst({ orderBy: { createdAt: "desc" }, select: { numero: true } });
    let proximoNumero = "0001";
    if (ultima?.numero) {
      const m = ultima.numero.match(/^(?:RM-)?(\d+)$/);
      if (m) proximoNumero = String(parseInt(m[1]) + 1).padStart(4, "0");
    }
    numeroRM = `RM-${proximoNumero}`;
  }
  // Valida unicidade
  const existe = await prisma.rM.findUnique({ where: { numero: numeroRM } });
  if (existe) {
    return NextResponse.json(
      { error: `Já existe uma RM com o número "${numeroRM}". Use outro número.` },
      { status: 409 }
    );
  }

  const rm = await prisma.rM.create({
    data: {
      numero: numeroRM,
      tipoRM: body.tipoRM,
      opId: body.opId || null,
      categoriasOP: body.categoriasOP,
      tipo: body.tipo,
      descricao: body.descricao,
      observacao: body.observacao || null,
      createdById: user.id,
      setor: body.setor || user.setor || null,
      itens: {
        create: body.itens.map((it, idx) => ({
          ordem: idx,
          opItemId: it.opItemId || null,
          aditivoItemId: it.aditivoItemId || null,
          opDestinoId: it.opDestinoId || body.opId || null,
          destinoEstoque: !!it.destinoEstoque,
          codigoOmieEstoque: it.codigoOmieEstoque || it.codigo || null,
          descricao: it.descricao,
          unidade: it.unidade,
          qtd: it.qtd,
          codigo: it.codigo || null,
          material: it.material || null,
          comprimento: it.comprimento || null,
          largura: it.largura || null,
          tratamento: it.tratamento || null,
          peso: it.peso ?? null,
          pesoLinear: it.pesoLinear ?? null,
        })),
      },
      ...(body.anexos.length > 0
        ? {
            anexos: {
              create: body.anexos.map((a) => ({
                nomeArquivo: a.nomeArquivo,
                blobUrl: a.url,
                tamanho: a.tamanho,
                tipo: a.tipo,
              })),
            },
          }
        : {}),
    },
  });

  // Cria EstoqueReserva automatica pra cada item com destinoEstoque=true,
  // opDestinoId definido e codigoOmieEstoque vinculado a um EstoqueItem.
  // Itens sem opDestino entram como "estoque livre" (sem reserva).
  try {
    const rmItensSalvos = await prisma.rMItem.findMany({
      where: { rmId: rm.id },
      select: {
        id: true, opDestinoId: true, destinoEstoque: true,
        codigoOmieEstoque: true, qtd: true, peso: true, unidade: true,
      },
    });
    for (const ri of rmItensSalvos) {
      if (!ri.destinoEstoque || !ri.opDestinoId || !ri.codigoOmieEstoque) continue;
      const itemEstoque = await prisma.estoqueItem.findUnique({
        where: { codigoOmie: ri.codigoOmieEstoque },
      });
      if (!itemEstoque) continue;
      // Usa peso quando o item de estoque eh em KG, senao a qtd
      const qtdReserva = (itemEstoque.unidade === "KG" && ri.peso)
        ? Number(ri.peso)
        : Number(ri.qtd);
      if (qtdReserva <= 0) continue;
      await prisma.estoqueReserva.create({
        data: {
          itemEstoqueId: itemEstoque.id,
          opId: ri.opDestinoId,
          rmItemId: ri.id,
          qtdReservada: qtdReserva,
          status: "ATIVA",
        },
      });
    }
  } catch (e) {
    console.error("[rm create reservas] erro:", e?.message);
    // Nao bloqueia criacao da RM — reservas podem ser sincronizadas depois
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_rm",
      entity: "RM",
      entityId: rm.id,
      diff: {
        numero: rm.numero,
        tipoRM: body.tipoRM,
        opId: body.opId || null,
        categoriasOP: body.categoriasOP,
        itens: body.itens.length,
      },
    },
  });

  // Notifica por email os inscritos no evento RM_CRIADA. Best-effort: nao
  // bloqueia o response — dispara em background com setTimeout pra nao
  // segurar o usuario. Se Resend falhar so loga.
  const opVinculada = body.opId
    ? await prisma.oP.findUnique({ where: { id: body.opId }, select: { numero: true, cliente: true } })
    : null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace-torg.vercel.app";
  const linkRM = `${baseUrl}/compras/rm/${rm.id}`;
  notificarEvento({
    evento: "RM_CRIADA",
    subject: `[Compras] Nova RM ${rm.numero}${opVinculada ? ` — OP ${opVinculada.numero}` : ""}`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0a3a5c;">Nova RM criada: ${rm.numero}</h2>
        <p style="color: #4a5568;">
          ${user.name || user.email} acabou de criar uma nova RM.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #718096;">Número</td><td style="padding: 6px 0;"><strong>${rm.numero}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #718096;">Tipo</td><td style="padding: 6px 0;">${body.tipoRM}</td></tr>
          ${opVinculada ? `<tr><td style="padding: 6px 0; color: #718096;">OP</td><td style="padding: 6px 0;"><strong>${opVinculada.numero}</strong> — ${opVinculada.cliente}</td></tr>` : ""}
          <tr><td style="padding: 6px 0; color: #718096;">Descrição</td><td style="padding: 6px 0;">${body.descricao}</td></tr>
          <tr><td style="padding: 6px 0; color: #718096;">Itens</td><td style="padding: 6px 0;">${body.itens.length}</td></tr>
          <tr><td style="padding: 6px 0; color: #718096;">Criada por</td><td style="padding: 6px 0;">${user.name || user.email}</td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="${linkRM}" style="background: #1976d2; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Abrir RM no Workspace Torg
          </a>
        </p>
        <p style="color: #a0aec0; font-size: 12px; margin-top: 24px;">
          Você recebeu esse email porque está inscrito nas notificações de novas RMs.
          Pra parar de receber, peça pra um admin remover seu email em /admin/notificacoes.
        </p>
      </div>
    `,
    text: `Nova RM ${rm.numero} criada por ${user.name || user.email}.\n` +
          `${opVinculada ? `OP: ${opVinculada.numero} — ${opVinculada.cliente}\n` : ""}` +
          `Descrição: ${body.descricao}\nItens: ${body.itens.length}\n\nAcesse: ${linkRM}`,
  }).catch((e) => console.error("[notificar RM_CRIADA] erro:", e?.message));

  return NextResponse.json({ id: rm.id, numero: rm.numero });
}
