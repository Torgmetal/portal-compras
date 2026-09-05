// POST /api/engenharia/listas/servidor
// Salva o arquivo da lista (LE/LPC) importada no servidor (SharePoint SERVIDOR),
// na pasta da OP selecionada. Recebe o arquivo em base64 (listas do Tekla são
// pequenas — bem abaixo do limite do corpo serverless).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { salvarListaNoServidor } from "@/lib/sharepoint-lista";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";

const registro = log("api/engenharia/listas/servidor");

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  tipo: z.enum(["LE", "LPC"]),
  opNumero: z.string().min(1),
  fileNome: z.string().min(1).max(260),
  fileBase64: z.string().min(1),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const buffer = Buffer.from(body.fileBase64, "base64");
  if (buffer.length > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo acima de 4 MB — muito grande pra salvar por aqui. Avise o dev (usar upload por token)." }, { status: 413 });
  }

  try {
    const r = await salvarListaNoServidor({ tipo: body.tipo, opNumero: body.opNumero, fileNome: body.fileNome, buffer });

    // ⚠ ALÉM DO TEKLA CRU, A LISTA NO PADRÃO DA CASA. Vitor (30/08/2026): "a que está na pasta da
    // engenharia é a lista que exportamos do tekla, sem formatação". O arquivo cru é a FONTE; o
    // documento — com cabeçalho ISO, código e, na LE, o carimbo do FORM 21 — é a lista formatada,
    // que até agora só existia na tela. Falha aqui não derruba o salvamento do arquivo original.
    let formatada = null;
    try {
      const alvoOp = String(body.opNumero).replace(/\D/g, "").replace(/^0+/, "");
      const op = (await prisma.oP.findMany({ select: { id: true, numero: true } }))
        .find((o) => String(o.numero).replace(/\D/g, "").replace(/^0+/, "") === alvoOp);
      if (op) {
        const { gerarListaEngFormatada } = await import("@/lib/listas-eng-formatada");
        const { arquivarForm } = await import("@/lib/arquivar-form");
        const doc = await gerarListaEngFormatada({ tipo: body.tipo, opId: op.id, opNumero: op.numero });
        if (doc) {
          const a = await arquivarForm({
            pasta: doc.pasta, nomeArquivo: doc.nomeArquivo, bytes: doc.buffer,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          formatada = a.ok ? a.path : null;
          if (!a.ok) registro.erro("[listas] formatada:", a.erro);
        }
      }
    } catch (e) { registro.erro("[listas] formatada:", e?.message); }

    return NextResponse.json({ ok: true, ...r, formatada });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao salvar no servidor." }, { status: 502 });
  }
}
