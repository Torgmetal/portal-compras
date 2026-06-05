// GET /api/financeiro/nfse-conchal?de=YYYY-MM-DD&ate=YYYY-MM-DD
//
// Lista as NFS-e que a Torg emitiu como PRESTADORA em Conchal (SigissWeb) no
// período, marcando as que foram emitidas FORA do Omie (avulsas na prefeitura) —
// que são as que não aparecem na listagem de Ordens de Serviço.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prismaDirect } from "@/lib/prisma";
import { sigissConfigurado, listarNfsePrestadas } from "@/lib/sigissweb";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  if (!sigissConfigurado()) {
    return NextResponse.json({
      configurado: false,
      notas: [],
      aviso: "SigissWeb não configurado. Defina SIGISS_URL, SIGISS_LOGIN e SIGISS_SENHA no ambiente.",
    });
  }

  const sp = new URL(req.url).searchParams;
  const hoje = new Date();
  const ate = sp.get("ate") ? new Date(sp.get("ate") + "T00:00:00") : hoje;
  const de  = sp.get("de")
    ? new Date(sp.get("de") + "T00:00:00")
    : new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1); // default: ~3 meses

  if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
    return NextResponse.json({ error: "Datas inválidas (use YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const { notas, truncado } = await listarNfsePrestadas({ de, ate, enriquecer: true, maxEnriquecer: 150 });

    // Vínculos manuais já salvos (NFS-e avulsa → projeto Omie)
    const numeros = [...new Set(notas.map(n => n.numero).filter(Boolean))];
    const vinculos = numeros.length
      ? await prismaDirect.nfseConchalVinculo.findMany({ where: { numero: { in: numeros } } })
      : [];
    const vincDe = new Map(vinculos.map(v => [`${v.numero}|${v.serie}`, v]));

    const serial = notas.map(n => {
      const v = vincDe.get(`${n.numero}|${n.serie || ""}`);
      return {
      numero: n.numero, serie: n.serie,
      data: n.data ? n.data.toISOString() : null,
      valor: n.valor, valorServico: n.valorServico,
      cancelada: n.cancelada,
      tomadorCnpj: n.tomadorCnpj, tomadorNome: n.tomadorNome,
      descricao: n.descricao ?? null,
      obra: n.obra ?? null, numeroOp: n.numeroOp ?? null,
      sistemaGerador: n.sistemaGerador ?? null,
      foraDoOmie: n.foraDoOmie ?? null,
      vinculoCodProj: v?.codProj ?? null,
      vinculoProjeto: v?.projetoNome ?? null,
      };
    });

    const ativas = serial.filter(n => !n.cancelada);
    return NextResponse.json({
      configurado: true,
      periodo: { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) },
      total: serial.length,
      truncadoEnriquecimento: truncado,
      resumo: {
        ativas: ativas.length,
        foraDoOmie: ativas.filter(n => n.foraDoOmie === true).length,
        valorTotal: ativas.reduce((s, n) => s + (n.valor || 0), 0),
        valorForaDoOmie: ativas.filter(n => n.foraDoOmie === true).reduce((s, n) => s + (n.valor || 0), 0),
      },
      notas: serial,
    });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao consultar SigissWeb: " + (e?.message || e) }, { status: 502 });
  }
}
