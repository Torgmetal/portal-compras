// GET — e-mails da Engenharia vinculados a esta OP + resumo (início do projeto, tempo
// até a 1ª resposta, quem respondeu). SÓ DIRETORIA (ADMIN ou allowlist de diretoria).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNO = /@torg\.com\.br\s*$/i; // remetente interno (Torg) vs cliente/externo

export async function GET(_req, { params }) {
  let user;
  try { user = await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const eventos = await prisma.obraEmailEvento.findMany({
    where: { opId: params.id },
    orderBy: [{ recebidoEm: "asc" }, { enviadoEm: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true, direcao: true, de: true, deNome: true, para: true, assunto: true, snippet: true,
      recebidoEm: true, enviadoEm: true, temAnexoIfc: true, temAnexo: true, tipoGatilho: true,
      caixa: true, matchMetodo: true, matchConfianca: true, conversationId: true,
    },
  });

  const dataDe = (e) => e.recebidoEm || e.enviadoEm;
  const entradasCliente = eventos.filter((e) => e.direcao === "ENTRADA" && !INTERNO.test(e.de || ""));
  const primeiroContato = entradasCliente[0] || eventos.find((e) => e.direcao === "ENTRADA") || null;
  const ifcRecebido = eventos.find((e) => e.direcao === "ENTRADA" && e.temAnexoIfc) || null;

  let resposta = null;
  if (primeiroContato) {
    const t0 = dataDe(primeiroContato)?.getTime?.() || 0;
    resposta = eventos.find((e) => e.direcao === "SAIDA" && (dataDe(e)?.getTime?.() || 0) >= t0) || null;
  }

  let tempoRespostaH = null;
  let semRespostaH = null;
  if (primeiroContato) {
    const t0 = dataDe(primeiroContato)?.getTime?.();
    if (resposta) {
      const t1 = dataDe(resposta)?.getTime?.();
      if (t0 && t1) tempoRespostaH = Math.max(0, Math.round((t1 - t0) / 36e5));
    } else if (t0) {
      semRespostaH = Math.round((Date.now() - t0) / 36e5);
    }
  }

  const resumo = {
    totalEventos: eventos.length,
    entradas: eventos.filter((e) => e.direcao === "ENTRADA").length,
    saidas: eventos.filter((e) => e.direcao === "SAIDA").length,
    primeiroContato: primeiroContato && {
      de: primeiroContato.de, deNome: primeiroContato.deNome, para: primeiroContato.para,
      assunto: primeiroContato.assunto, em: dataDe(primeiroContato), gatilho: primeiroContato.tipoGatilho,
    },
    inicioProjeto: ifcRecebido ? { tipo: "IFC_RECEBIDO", em: dataDe(ifcRecebido), de: ifcRecebido.de }
      : (primeiroContato ? { tipo: "PRIMEIRO_CONTATO", em: dataDe(primeiroContato), de: primeiroContato.de } : null),
    resposta: resposta && { por: resposta.deNome || resposta.de || resposta.caixa, em: dataDe(resposta), assunto: resposta.assunto },
    tempoRespostaHoras: tempoRespostaH,
    semRespostaHoras: semRespostaH,
  };

  return NextResponse.json({ success: true, resumo, eventos });
}
