// GET  /api/consulta-tinta/[token] — o que o fabricante precisa ver para responder.
// POST /api/consulta-tinta/[token] — a proposta dele.
//
// Vitor (31/08/2026): "precisa ser um portal totalmente separado do de compras e precisamos ter o
// mapa de cotações".
//
// ⚠⚠ SEPARADO DO PORTAL DO COMPRAS DE PROPÓSITO. Lá (/fornecedores/c/[token]) o fornecedor responde
// uma RM: item cadastrado, OP aberta, o pedido vem logo atrás. Aqui a obra ainda não foi vendida, e
// o que se pede é dimensionamento — quantos galões atendem esta área. Se fossem a mesma tela, o
// fornecedor trataria orçamento como pedido, reservaria estoque e cobraria a compra depois.
//
// ⚠ O TOKEN É POR FABRICANTE. Cada um vê e responde só a sua linha; ninguém vê a proposta do outro.
// É o que permite existir um mapa de cotações sem que a concorrência seja pública.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { limparTextoCurto } from "@/lib/html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

async function achar(token) {
  return prisma.cotacaoEstudoFornecedor.findUnique({
    where: { token },
    select: {
      id: true, nome: true, respondidoEm: true, resposta: true, valorTotal: true,
      cotacao: { select: { id: true, tipo: true, snapshot: true, enviadoEm: true, estudoId: true } },
    },
  });
}

export async function GET(_req, { params }) {
  const { token } = await params;
  const f = await achar(token);
  if (!f) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const est = await prisma.estudoFabricacao.findUnique({
    where: { id: f.cotacao.estudoId },
    select: { orcamento: { select: { cliente: true, obra: true } } },
  });

  return NextResponse.json({
    fornecedor: f.nome,
    obra: [est?.orcamento?.cliente, est?.orcamento?.obra].filter(Boolean).join(" · ") || "obra em orçamento",
    enviadoEm: f.cotacao.enviadoEm,
    // ⚠ o snapshot é o que foi PERGUNTADO: se a área mudar no estudo depois, a pergunta que ele
    // respondeu continua sendo esta.
    consulta: f.cotacao.snapshot || {},
    resposta: f.resposta || null,
    respondidoEm: f.respondidoEm,
  });
}

const Body = z.object({
  contato: z.string().trim().min(2, "Informe seu nome.").max(120),
  camadas: z.array(z.object({
    camada: z.string().max(40).optional().nullable(),
    produto: z.string().max(120).optional().nullable(),
    galoes: z.union([z.string(), z.number()]).optional().nullable(),
    litrosGalao: z.union([z.string(), z.number()]).optional().nullable(),
    precoGalao: z.union([z.string(), z.number()]).optional().nullable(),
  })).default([]),
  diluenteLitros: z.union([z.string(), z.number()]).optional().nullable(),
  diluentePreco: z.union([z.string(), z.number()]).optional().nullable(),
  componenteBQtd: z.union([z.string(), z.number()]).optional().nullable(),
  componenteBPreco: z.union([z.string(), z.number()]).optional().nullable(),
  prazo: z.string().trim().max(80).optional().nullable(),
  validade: z.string().trim().max(80).optional().nullable(),
  observacao: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(req, { params }) {
  const { token } = await params;
  const f = await achar(token);
  if (!f) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  let b;
  try { b = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const camadas = b.camadas.map((c) => {
    const galoes = num(c.galoes), preco = num(c.precoGalao);
    return {
      camada: limparTextoCurto(c.camada || "", 40),
      produto: limparTextoCurto(c.produto || "", 120),
      galoes, litrosGalao: num(c.litrosGalao), precoGalao: preco,
      subtotal: galoes * preco,
    };
  });
  const dil = num(b.diluenteLitros) * num(b.diluentePreco);
  const compB = num(b.componenteBQtd) * num(b.componenteBPreco);
  const total = camadas.reduce((s, c) => s + c.subtotal, 0) + dil + compB;

  const resposta = {
    contato: limparTextoCurto(b.contato, 120),
    camadas,
    diluente: { litros: num(b.diluenteLitros), preco: num(b.diluentePreco), subtotal: dil },
    componenteB: { qtd: num(b.componenteBQtd), preco: num(b.componenteBPreco), subtotal: compB },
    prazo: limparTextoCurto(b.prazo || "", 80),
    validade: limparTextoCurto(b.validade || "", 80),
    observacao: limparTextoCurto(b.observacao || "", 2000),
  };

  // ⚠ REENVIAR SUBSTITUI. O fabricante corrige a própria proposta até a Torg decidir — travar na
  // primeira resposta faria ele ter de pedir por e-mail, e aí o número que vale sai do mapa.
  await prisma.cotacaoEstudoFornecedor.update({
    where: { id: f.id },
    data: { resposta, valorTotal: total, respondidoEm: new Date() },
  });

  return NextResponse.json({ ok: true, total });
}
