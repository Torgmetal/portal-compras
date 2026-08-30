// GET /api/comercial/orcamento/solicitacoes?ano=2026
//
// As solicitações que já chegaram e ainda não viraram orçamento no portal.
//
// Vitor (30/08/2026): "inclusive preencher na aba de Acompanhamento as solicitações novas que
// chegarem desses e-mails". Elas não estão na caixa — estão na pasta `1. Solicitados` do
// SharePoint, criada pelo Comercial assim que o pedido chega, antes de o orçamento ganhar número.
//
// ⚠ NÃO CRIA ORÇAMENTO SOZINHO. O número sai da planilha do Comercial; inventar um aqui duplicaria
// a numeração. A solicitação aparece como PENDENTE, com prazo e cliente já lidos, para alguém abrir
// com o número certo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { solicitacoesEmAberto, resolverCliente, emailsArquivados, lerCabecalhoEml } from "@/lib/emails-orcamento-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getUTCFullYear();
  try {
    const [pastas, orcs] = await Promise.all([
      solicitacoesEmAberto(ano),
      prisma.orcamento.findMany({ select: { numero: true, cliente: true } }),
    ]);
    const jaExiste = new Set(orcs.map((o) => o.numero));
    const clientes = [...new Set(orcs.map((o) => o.cliente).filter(Boolean))];

    const pendentes = [];
    for (const s of pastas) {
      // pasta que já virou orçamento no portal não é pendência
      if (s.numero && jaExiste.has(s.numero)) continue;
      const { cliente, obra } = resolverCliente(s.texto || "", clientes);
      // o e-mail arquivado diz quem pediu e quando — é o começo da linha do tempo
      let solicitante = null, pedidoEm = null, assunto = null;
      try {
        const arqs = await emailsArquivados(s.caminho);
        for (const a of arqs.slice(0, 3)) {
          const c = await lerCabecalhoEml(a.caminho);
          if (!c || /@torg\.com\.br$/i.test(String(c.de || ""))) continue;
          if (!pedidoEm || (c.data && c.data < pedidoEm)) {
            pedidoEm = c.data; solicitante = c.deNome || c.de; assunto = c.assunto;
          }
        }
      } catch { /* pasta sem e-mail arquivado ainda: a solicitação continua valendo */ }

      pendentes.push({
        pasta: s.pasta, numero: s.numero || null, prazo: s.prazo, criadaEm: s.modificadoEm,
        cliente, clienteTexto: s.texto, obra, solicitante, pedidoEm, assunto,
      });
    }
    return NextResponse.json({ ano, total: pendentes.length, pendentes });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
