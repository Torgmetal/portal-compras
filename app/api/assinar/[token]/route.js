// Assinatura PÚBLICA (token) de um documento (Plano de Treinamentos / Cronograma de Auditoria).
// GET → dados do documento p/ a pessoa · POST → registra a assinatura (confirmação + data + IP).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehTipoDePlano, docDoTipo, tudoAprovado, arquivarPlano } from "@/lib/planos-aceite";

export const runtime = "nodejs";

async function carregar(token) {
  return prisma.assinaturaDocumento.findUnique({
    where: { token },
    include: { envio: { select: { tipo: true, revisao: true, titulo: true, enviadoEm: true, opNumero: true, snapshot: true } } },
  });
}

export async function GET(_req, { params }) {
  const a = await carregar(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  // ⚠ PLP e PIT são ACEITE DO CLIENTE, não validação de setor: a página muda a redação e oferece o
  // Excel. Chamar de "assinatura do meu setor" na tela do inspetor do cliente é errado no que a
  // pessoa está afirmando ao clicar.
  const doObra = a.envio.tipo === "PLP" || a.envio.tipo === "PIT";
  const interno = a.envio.tipo === "PLP_INTERNO" || a.envio.tipo === "PIT_INTERNO";
  return NextResponse.json({
    nome: a.nome, setor: a.setor, assinadoEm: a.assinadoEm, ip: a.ip,
    titulo: a.envio.titulo, revisao: a.envio.revisao, tipo: a.envio.tipo, enviadoEm: a.envio.enviadoEm,
    aceiteCliente: doObra, temArquivo: doObra || interno, verificacaoInterna: interno,
  });
}

export async function POST(req, { params }) {
  const a = await carregar(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (a.assinadoEm) return NextResponse.json({ ok: true, jaAssinado: true, assinadoEm: a.assinadoEm, ip: a.ip });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const upd = await prisma.assinaturaDocumento.update({ where: { id: a.id }, data: { assinadoEm: new Date(), ip } });

  // ⚠⚠ APROVOU TUDO → ARQUIVA. Vitor (26/08/2026): "você deve salvar na pasta da qualidade do
  // SharePoint e anexar ao Data Book depois de todos terem aprovado". O gatilho é a última
  // assinatura, aqui: esperar alguém lembrar de clicar em "arquivar" é como o Data Book fica sem o
  // plano justamente na obra que já fechou.
  //
  // ⚠ FALHA AO ARQUIVAR NÃO DERRUBA A ASSINATURA. Quem assinou, assinou — o arquivamento se refaz.
  if (ehTipoDePlano(a.envio.tipo)) {
    const doc = docDoTipo(a.envio.tipo);
    const opNumero = a.envio.opNumero || a.envio.snapshot?.opNumero || null;
    if (opNumero) {
      try {
        if (await tudoAprovado(prisma, doc, opNumero)) await arquivarPlano(prisma, doc, opNumero);
      } catch { /* silêncio de propósito: ver o comentário acima */ }
    }
  }

  return NextResponse.json({ ok: true, assinadoEm: upd.assinadoEm, ip: upd.ip });
}
