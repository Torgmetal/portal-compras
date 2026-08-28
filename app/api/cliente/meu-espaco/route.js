// O que ESTE cliente tem no portal: documentos esperando a assinatura dele e as obras cujo portal
// ele recebe.
//
// ⚠⚠ TUDO PELO E-MAIL DA SESSÃO, nunca por parâmetro. Uma rota que aceitasse "?email=" deixaria
// qualquer cliente logado listar os documentos de outro — e nesses documentos está o nome da obra,
// do cliente e o link de assinatura. Quem pergunta é a sessão.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const email = String(user.email || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Sessão sem e-mail." }, { status: 400 });

  const [assinaturas, destinatarios, dbAssinaturas] = await Promise.all([
    prisma.assinaturaDocumento.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: [{ assinadoEm: "asc" }, { envio: { enviadoEm: "desc" } }],
      select: {
        token: true, assinadoEm: true, convidadoEm: true, ordem: true, setor: true,
        envio: { select: { titulo: true, tipo: true, opNumero: true, revisao: true, enviadoEm: true, status: true } },
      },
      take: 60,
    }),
    prisma.portalDestinatario.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { enviadoEm: "desc" },
      select: { codigo: true, opNumero: true, enviadoEm: true, ultimoAcessoEm: true, portalId: true },
      take: 40,
    }),
    // cadeia do Data Book (elaborador → inspetor → RT → cliente)
    prisma.dataBookAssinatura.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { criadoEm: "desc" },
      select: { token: true, status: true, papel: true, assinadoEm: true, dataBook: { select: { opNumero: true, cliente: true, obra: true } } },
      take: 40,
    }),
  ]);

  const portais = destinatarios.length
    ? await prisma.portalCliente.findMany({
        where: { id: { in: destinatarios.map((d) => d.portalId) }, status: "PUBLICADO" },
        select: { id: true, token: true, opNumero: true, empresa: true },
      })
    : [];
  const porId = new Map(portais.map((p) => [p.id, p]));

  const ops = [...new Set(destinatarios.map((d) => d.opNumero).filter(Boolean))];
  const obras = ops.length
    ? await prisma.oP.findMany({ where: { numero: { in: ops } }, select: { numero: true, obra: true, cliente: true } })
    : [];
  const obraPor = new Map(obras.map((o) => [o.numero, o]));

  return NextResponse.json({
    nome: user.name || null,
    email: user.email,
    // ⚠ o link do portal leva o CÓDIGO da pessoa (?d=): é ele que dá nome ao acesso no histórico.
    portais: destinatarios
      .map((d) => {
        const p = porId.get(d.portalId);
        if (!p?.token) return null;
        const o = obraPor.get(d.opNumero);
        return {
          opNumero: d.opNumero, obra: o?.obra || null, cliente: o?.cliente || p.empresa || null,
          link: `/portal/${p.token}?d=${d.codigo}`,
          enviadoEm: d.enviadoEm, ultimoAcessoEm: d.ultimoAcessoEm,
        };
      })
      .filter(Boolean),
    documentos: [
      ...assinaturas.map((a) => ({
        titulo: a.envio.titulo, tipo: a.envio.tipo, opNumero: a.envio.opNumero,
        papel: a.setor || null, assinadoEm: a.assinadoEm, enviadoEm: a.envio.enviadoEm,
        // sem convite ainda = a vez é de outro na fila; o link existe mas não adianta abrir
        aguardandoVez: !a.assinadoEm && a.ordem != null && !a.convidadoEm,
        revisaoPedida: a.envio.status === "REVISAO_PEDIDA",
        link: `/assinar/${a.token}`,
      })),
      ...dbAssinaturas.map((d) => ({
        titulo: `Data Book · OP-${d.dataBook?.opNumero || "—"}${d.dataBook?.obra ? ` — ${d.dataBook.obra}` : ""}`,
        tipo: "DATA_BOOK", opNumero: d.dataBook?.opNumero || null,
        papel: d.papel, assinadoEm: d.assinadoEm, enviadoEm: null,
        aguardandoVez: d.status === "PENDENTE",
        revisaoPedida: false,
        link: `/data-book/assinar/${d.token}`,
      })),
    ],
  });
}
