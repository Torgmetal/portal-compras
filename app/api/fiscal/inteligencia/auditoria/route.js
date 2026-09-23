import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { lerNfe } from "@/lib/fiscal/xml-nfe";
import { auditar, indiceDaTipi } from "@/lib/fiscal/auditoria";
import { log } from "@/lib/log";

// Auditoria de um XML de NF-e contra a TIPI de referência.
//
// ⚠⚠ NADA É GRAVADO, E ISSO É DELIBERADO NESTA PRIMEIRA VERSÃO. O XML sobe, é lido em memória,
// comparado e descartado. Guardar apontamento fiscal exige decidir antes quem revisa, quem aprova e
// o que acontece com um achado contestado — e apontamento guardado sem esse fluxo vira uma lista que
// ninguém fecha. O briefing também é explícito: nenhuma NF complementar sai daqui.
//
// ⚠ O XML não é persistido: ele é o documento do cliente, já está na Receita e no Omie, e uma cópia
// a mais num banco de aplicação é superfície sem dono.
const registro = log("api/fiscal/auditoria");
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ⚠ NF-e com centenas de itens passa de 1 MB com folga; 8 MB cobre o maior caso plausível e ainda
// recusa upload acidental de coisa que não é nota.
const TETO_BYTES = 8 * 1024 * 1024;

export async function POST(req) {
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let xml;
  try {
    const form = await req.formData();
    const arquivo = form.get("xml");
    if (!arquivo || typeof arquivo === "string") {
      return NextResponse.json({ success: false, error: "Envie o arquivo XML da NF-e." }, { status: 400 });
    }
    if (arquivo.size > TETO_BYTES) {
      return NextResponse.json({ success: false, error: `Arquivo de ${(arquivo.size / 1024 / 1024).toFixed(1)} MB — o teto é 8 MB.` }, { status: 413 });
    }
    xml = await arquivo.text();
  } catch {
    return NextResponse.json({ success: false, error: "Não foi possível ler o arquivo enviado." }, { status: 400 });
  }

  const doc = lerNfe(xml);
  if (doc.erro) return NextResponse.json({ success: false, error: doc.erro }, { status: 400 });

  const versao = await prisma.fiscalTipiVersao.findFirst({ where: { status: "ATIVA" }, include: { arquivo: true } });
  if (!versao) {
    return NextResponse.json({ success: false, error: "Nenhuma versão da TIPI está ativa — sincronize antes de auditar." }, { status: 409 });
  }

  // ⚠ Só os NCMs da nota: carregar as 11 mil linhas para conferir 24 itens seria desperdício, e o
  // índice `(codigo, ex)` existe exatamente para isto.
  const ncms = [...new Set(doc.itens.map((i) => i.ncm).filter(Boolean))];
  const linhas = await prisma.fiscalTipiLinha.findMany({
    where: { versaoId: versao.id, nivel: "NCM", codigo: { in: ncms } },
  });

  const r = auditar(doc, indiceDaTipi(linhas), {
    versaoId: versao.id,
    sha256: versao.arquivo.sha256,
    observadoEm: versao.observadoEm,
    vigenciaDeclarada: Boolean(versao.vigenciaInicio),
  });

  registro.info(`NF ${r.numero} auditada por ${user.email}: ${r.resumo.alta} alta(s), estimado R$ ${r.resumo.diferencaEstimada}`);
  return NextResponse.json({ success: true, ...r, emitente: doc.emitente, itensDoDoc: doc.itens.map((i) => ({
    item: i.item, ncm: i.ncm, cfop: i.cfop, descricao: i.descricaoItem || i.descricao,
    valor: i.valor, cst: i.ipi?.cst, cEnq: i.ipi?.cEnq, aliquota: i.ipi?.aliquota, ipi: i.ipi?.valor,
  })) });
}
