import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { lerNfe } from "@/lib/fiscal/xml-nfe";
import { lerPedidoOmie } from "@/lib/fiscal/pedido-omie";
import { auditar, indiceDaTipi } from "@/lib/fiscal/auditoria";
import { verbetesAprovados } from "@/lib/fiscal/registro-classificacao";
import { log } from "@/lib/log";

// Auditoria contra a TIPI de referência — de um XML de NF-e JÁ EMITIDA ou de uma MEDIÇÃO do Omie,
// que é o mesmo documento ANTES de existir.
//
// ⚠⚠ VALIDAR ANTES DE EMITIR É O PONTO INTEIRO. Matheus (23/09/2026): *"na Auditoria precisa ser
// possível selecionar uma medição do Omie para validar ela antes de emitir"*. A auditoria de XML
// acha o erro depois: a NF-e 973 custou R$ 7.026,56 de IPI não destacado e só apareceu quando
// alguém foi procurar. O pedido de venda tem `cod_sit_trib_ipi`, `enquadramento_ipi` e
// `dados_adicionais_item` — os três campos que obrigavam a pedir o XML — antes da emissão.
//
// ⚠ AS DUAS ENTRADAS PRODUZEM O MESMO DOCUMENTO e passam pelo MESMO motor. Um `if (é pedido)`
// dentro da auditoria faria as duas divergirem no primeiro ajuste de regra.
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
    user = await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const tipoConteudo = req.headers.get("content-type") ?? "";
  let doc, origem;

  if (tipoConteudo.includes("application/json")) {
    // ── Uma medição do Omie: o documento ANTES de virar nota ────────────────
    const body = await req.json().catch(() => ({}));
    const id = String(body.medicaoId ?? "");
    if (!id) return NextResponse.json({ success: false, error: "Informe a medição." }, { status: 400 });
    const m = await prisma.oPMedicao.findUnique({
      where: { id },
      select: {
        id: true, numeroPedidoOmie: true, descricao: true, data: true, valorBruto: true,
        tipoDocumento: true, status: true, etapa: true, ultimoSync: true, payload: true,
        op: { select: { numero: true, cliente: true, clienteUF: true, clienteCnpj: true, clienteIE: true } },
      },
    });
    if (!m) return NextResponse.json({ success: false, error: "Medição não encontrada." }, { status: 404 });
    doc = lerPedidoOmie(m.payload, { op: m.op });
    if (doc.erro) return NextResponse.json({ success: false, error: doc.erro }, { status: 400 });
    origem = {
      tipo: "MEDICAO", medicaoId: m.id, pedido: m.numeroPedidoOmie, op: m.op.numero, cliente: m.op.cliente,
      uf: m.op.clienteUF, valorBruto: m.valorBruto, status: m.status, etapa: doc.etapa,
      sincronizadoEm: m.ultimoSync, tipoDocumento: m.tipoDocumento,
    };
  } else {
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
    doc = lerNfe(xml);
    if (doc.erro) return NextResponse.json({ success: false, error: doc.erro }, { status: 400 });
    origem = { tipo: "NFE" };
  }

  const versao = await prisma.fiscalTipiVersao.findFirst({ where: { status: "ATIVA" }, include: { arquivo: true } });
  if (!versao) {
    return NextResponse.json({ success: false, error: "Nenhuma versão da TIPI está ativa — sincronize antes de auditar." }, { status: 409 });
  }

  // ⚠ Só os NCMs da nota: carregar as 11 mil linhas para conferir 24 itens seria desperdício, e o
  // índice `(codigo, ex)` existe exatamente para isto.
  // ⚠ O NCM da DESCRIÇÃO entra na carga: sem ele, o achado de divergência não teria como dizer o
  // que a TIPI diz do outro código, e viraria "os dois campos diferem" sem consequência.
  const ncms = [...new Set(doc.itens.flatMap((i) => [i.ncm, i.ncmDaDescricao]).filter(Boolean))];
  const linhas = await prisma.fiscalTipiLinha.findMany({
    where: { versaoId: versao.id, nivel: "NCM", codigo: { in: ncms } },
  });

  // ⚠⚠ EM LOTE, E `null` QUANDO A LEITURA FALHA. `verbetesAprovados` devolve null em erro, e o
  // motor transforma isso em "conferência não feita" — nunca em "esta peça não tem classificação",
  // que seria uma afirmação sobre um cadastro que ninguém conseguiu ler.
  const classificacoes = await verbetesAprovados();

  const r = auditar(doc, indiceDaTipi(linhas), {
    classificacoes,
    versaoId: versao.id,
    sha256: versao.arquivo.sha256,
    observadoEm: versao.observadoEm,
    vigenciaDeclarada: Boolean(versao.vigenciaInicio),
  });

  registro.info(`${origem.tipo === "MEDICAO" ? `pedido ${origem.pedido}` : `NF ${r.numero}`} auditado por ${user.email}: ${r.resumo.alta} alta(s), estimado R$ ${r.resumo.diferencaEstimada}`);
  return NextResponse.json({ success: true, ...r, origem, emitente: doc.emitente, destinatario: doc.destinatario,
    itensDoDoc: doc.itens.map((i) => ({
      item: i.item, ncm: i.ncm, ncmDaDescricao: i.ncmDaDescricao ?? null, cfop: i.cfop,
      descricao: i.descricaoItem || i.descricao,
      valor: i.valor, cst: i.ipi?.cst, cEnq: i.ipi?.cEnq, aliquota: i.ipi?.aliquota, ipi: i.ipi?.valor,
    })) });
}
