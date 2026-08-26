// GET /api/portal/historico?opNumero=… — quem recebeu o portal, quem abriu e o que baixou.
//
// Vitor (26/08/2026): "preciso do histórico do acesso, através do e-mail enviado, e o que foi
// aberto e feito download, para as pessoas que enviamos".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(new URL(req.url).searchParams.get("opNumero") || "").replace(/\D/g, "").padStart(3, "0");
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const portal = await prisma.portalCliente.findUnique({ where: { opNumero }, select: { id: true, enviadoEm: true, acessos: true } });
  if (!portal) return NextResponse.json({ destinatarios: [], eventos: [], total: 0 });

  const [destinatarios, eventos, anon] = await Promise.all([
    prisma.portalDestinatario.findMany({
      where: { portalId: portal.id },
      orderBy: [{ enviadoEm: "desc" }],
      select: { id: true, nome: true, email: true, enviadoEm: true, enviadoPorNome: true, aberturas: true, downloads: true, primeiroAcessoEm: true, ultimoAcessoEm: true },
    }),
    prisma.portalAcesso.findMany({
      where: { portalId: portal.id },
      orderBy: { em: "desc" }, take: 300,
      select: { id: true, destinatarioId: true, email: true, evento: true, documento: true, secao: true, em: true },
    }),
    // ⚠ acesso ANÔNIMO é dado, não lixo: quer dizer que alguém entrou por um link repassado, e não
    // pelo e-mail que enviamos. Some da lista de pessoas, mas tem de aparecer no total.
    prisma.portalAcesso.count({ where: { portalId: portal.id, destinatarioId: null } }),
  ]);

  return NextResponse.json({
    portal: { enviadoEm: portal.enviadoEm, acessos: portal.acessos },
    destinatarios: destinatarios.map((d) => ({
      ...d,
      enviadoEm: d.enviadoEm?.toISOString() || null,
      primeiroAcessoEm: d.primeiroAcessoEm?.toISOString() || null,
      ultimoAcessoEm: d.ultimoAcessoEm?.toISOString() || null,
      // ⚠ "enviado e nunca aberto" é a informação mais acionável daqui — é o cliente que ainda não
      // sabe que o portal existe, e é a ele que se liga.
      nuncaAbriu: !d.primeiroAcessoEm,
    })),
    eventos: eventos.map((e) => ({ ...e, em: e.em.toISOString() })),
    anonimos: anon,
    total: eventos.length,
  });
}
