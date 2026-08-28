// O PORTAL DO CLIENTE LOGADO — as obras dele, com os documentos de cada uma.
//
// ⚠⚠ TUDO PELO E-MAIL DA SESSÃO, nunca por parâmetro. Uma rota que aceitasse "?email=" deixaria
// qualquer cliente logado listar as obras e os documentos de outro — e neles está o nome da obra,
// do cliente e o link de assinatura. Quem pergunta é a sessão.
//
// ⚠ A OBRA APARECE SOZINHA. Vitor (28/08/2026): "esse login pode ter acesso a várias obras; sempre
// que for mencionado o e-mail dele em algum relatório, já sobe para o portal dele". Então não há
// cadastro de "cliente × obra": a obra entra na lista porque o e-mail dele foi usado em ALGUMA
// coisa dela — assinatura de documento, cadeia do data book, destinatário do portal ou contato da
// própria OP. Um vínculo a mais para manter à mão seria um vínculo a mais para esquecer.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const soNum = (n) => String(n ?? "").replace(/\D/g, "").padStart(3, "0");

export async function GET() {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const email = String(user.email || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Sessão sem e-mail." }, { status: 400 });
  const igual = { equals: email, mode: "insensitive" };

  const [assinaturas, dbAssinaturas, destinatarios, planos, portaisEmail] = await Promise.all([
    prisma.assinaturaDocumento.findMany({
      where: { email: igual },
      orderBy: { envio: { enviadoEm: "desc" } },
      select: {
        token: true, assinadoEm: true, convidadoEm: true, ordem: true, setor: true, ip: true,
        envio: { select: { titulo: true, tipo: true, opNumero: true, revisao: true, enviadoEm: true, status: true } },
      },
      take: 200,
    }),
    prisma.dataBookAssinatura.findMany({
      where: { email: igual },
      orderBy: { criadoEm: "desc" },
      select: { token: true, status: true, papel: true, assinadoEm: true, enviadoEm: true, dataBook: { select: { opNumero: true, revisao: true } } },
      take: 100,
    }),
    prisma.portalDestinatario.findMany({
      where: { email: igual },
      orderBy: { enviadoEm: "desc" },
      select: { codigo: true, opNumero: true, enviadoEm: true, ultimoAcessoEm: true, portalId: true },
      take: 100,
    }),
    prisma.planoResponsavel.findMany({ where: { clienteEmail: igual }, select: { opNumero: true } }).catch(() => []),
    prisma.portalCliente.findMany({ where: { clienteEmail: igual }, select: { opNumero: true } }).catch(() => []),
  ]);

  // ── as OPs em que este e-mail aparece ──
  const nums = new Set();
  for (const a of assinaturas) if (a.envio.opNumero) nums.add(soNum(a.envio.opNumero));
  for (const d of dbAssinaturas) if (d.dataBook?.opNumero) nums.add(soNum(d.dataBook.opNumero));
  for (const d of destinatarios) if (d.opNumero) nums.add(soNum(d.opNumero));
  for (const p of planos) if (p.opNumero) nums.add(soNum(p.opNumero));
  for (const p of portaisEmail) if (p.opNumero) nums.add(soNum(p.opNumero));

  // ⚠ contato da OP também conta: é onde o Comercial registra quem acompanha a obra do lado do
  // cliente, e muita gente chega ao portal por aí antes de assinar qualquer coisa.
  const porContato = await prisma.oP.findMany({
    where: { OR: [{ clienteEmail: igual }, { clienteContatos: { array_contains: [{ email: user.email }] } }] },
    select: { numero: true },
  }).catch(() => []);
  for (const o of porContato) nums.add(soNum(o.numero));

  const ops = nums.size
    ? await prisma.oP.findMany({
        where: { numero: { in: [...nums] } },
        select: {
          id: true, numero: true, cliente: true, clienteRazaoSocial: true, obra: true, refCliente: true,
          descricao: true, status: true, clienteCidade: true, clienteUF: true, clienteContato: true,
          dataInicio: true, dataFimPrevista: true, tipoDataBook: true, pitPadrao: true,
        },
      }).catch(() => [])
    : [];
  const opPor = new Map(ops.map((o) => [soNum(o.numero), o]));

  // ⚠ Nº DO PEDIDO DO CLIENTE e ENDEREÇO DE ENTREGA moram no Kick Off, não na OP — é a mesma fonte
  // que o PIT e o PLP usam (ver dadosDaObra em lib/planos-aceite). Sem isso o portal mostraria a
  // cidade do cadastro no lugar do local de entrega combinado.
  const kicks = ops.length
    ? await prisma.oPKickOff.findMany({
        where: { opId: { in: ops.map((o) => o.id) } },
        orderBy: { updatedAt: "asc" },
        select: { opId: true, pedidoCompraCliente: true, entregaEndereco: true },
      }).catch(() => [])
    : [];
  const kickPor = new Map(kicks.map((k) => [k.opId, k]));

  // ── portal público da obra (link com o código pessoal) ──
  const portais = destinatarios.length
    ? await prisma.portalCliente.findMany({
        where: { id: { in: destinatarios.map((d) => d.portalId) }, status: "PUBLICADO" },
        select: { id: true, token: true, opNumero: true },
      })
    : [];
  const portalPor = new Map(portais.map((p) => [p.id, p]));
  const linkPortal = new Map();
  for (const d of destinatarios) {
    const p = portalPor.get(d.portalId);
    if (p?.token) linkPortal.set(soNum(d.opNumero), { link: `/portal/${p.token}?d=${d.codigo}`, ultimoAcessoEm: d.ultimoAcessoEm });
  }

  // ── documentos por OP ──
  // ⚠ ABRIR E BAIXAR, assinado ou não (Vitor, 28/08/2026). O PDF sai da mesma rota pública por
  // token que a página de assinatura usa: quem tem o documento na lista tem o direito de lê-lo,
  // antes e depois de assinar — inclusive para guardar cópia do que assinou.
  const docs = new Map();
  const push = (num, doc) => {
    const k = soNum(num);
    if (!docs.has(k)) docs.set(k, []);
    docs.get(k).push(doc);
  };
  for (const a of assinaturas) {
    push(a.envio.opNumero, {
      titulo: a.envio.titulo, tipo: a.envio.tipo, papel: a.setor || null,
      revisao: a.envio.revisao, enviadoEm: a.envio.enviadoEm,
      assinadoEm: a.assinadoEm, ip: a.ip,
      aguardandoVez: !a.assinadoEm && a.ordem != null && !a.convidadoEm,
      revisaoPedida: a.envio.status === "REVISAO_PEDIDA",
      link: `/assinar/${a.token}`, pdf: `/api/assinar/${a.token}/pdf`,
    });
  }
  for (const d of dbAssinaturas) {
    push(d.dataBook?.opNumero, {
      titulo: `Data Book${d.dataBook?.revisao ? ` — R${String(d.dataBook.revisao).padStart(2, "0")}` : ""}`,
      tipo: "DATA_BOOK", papel: d.papel, revisao: d.dataBook?.revisao ?? null, enviadoEm: d.enviadoEm,
      assinadoEm: d.assinadoEm, ip: null,
      aguardandoVez: d.status === "PENDENTE", revisaoPedida: false,
      link: `/data-book/assinar/${d.token}`, pdf: `/api/qualidade/data-books/assinar/${d.token}/pdf`,
    });
  }

  const obras = [...nums].sort((a, b) => Number(b) - Number(a)).map((n) => {
    const o = opPor.get(n) || null;
    const lista = (docs.get(n) || []).sort((a, b) => (a.assinadoEm ? 1 : 0) - (b.assinadoEm ? 1 : 0) || new Date(b.enviadoEm || 0) - new Date(a.enviadoEm || 0));
    return {
      opNumero: n,
      obra: o?.obra || null,
      cliente: o?.clienteRazaoSocial || o?.cliente || null,
      refCliente: o?.refCliente || null,
      descricao: o?.descricao || null,
      pedidoCliente: (o && kickPor.get(o.id)?.pedidoCompraCliente) || null,
      local: (o && kickPor.get(o.id)?.entregaEndereco) || [o?.clienteCidade, o?.clienteUF].filter(Boolean).join(" - ") || null,
      contato: o?.clienteContato || null,
      dataInicio: o?.dataInicio || null,
      dataFimPrevista: o?.dataFimPrevista || null,
      tipoDataBook: o?.tipoDataBook || null,
      pitPadrao: o?.pitPadrao || null,
      status: o?.status || null,
      portal: linkPortal.get(n) || null,
      documentos: lista,
      pendentes: lista.filter((d) => !d.assinadoEm).length,
    };
  });

  return NextResponse.json({ nome: user.name || null, email: user.email, obras });
}
