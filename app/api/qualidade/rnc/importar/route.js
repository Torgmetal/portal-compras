// Importa RNCs do FORM 20 (.xls) em massa. Upload de vários arquivos → parse
// determinístico → cria a NaoConformidade (preservando o nº/ano do documento) +
// o Plano de Ação 5W2H. Pula as que já existem (mesmo nº+ano).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseRncForm20 } from "@/lib/parse-rnc-form20";
import { numRNC } from "@/lib/nao-conformidade";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let files;
  try { files = (await req.formData()).getAll("files").filter((f) => f && typeof f.arrayBuffer === "function"); }
  catch { return NextResponse.json({ error: "Envie os arquivos .xls" }, { status: 400 }); }
  if (!files.length) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  if (files.length > 200) return NextResponse.json({ error: "Máximo de 200 arquivos por vez." }, { status: 400 });

  const resultados = [];
  for (const file of files) {
    const nome = file.name || "arquivo.xls";
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const p = parseRncForm20(buf);
      if (!p.numero || !p.ano) { resultados.push({ arquivo: nome, resultado: "erro", erro: "Não consegui ler o número/ano da RNC" }); continue; }

      const existe = await prisma.naoConformidade.findFirst({ where: { ano: p.ano, numero: p.numero, tipo: "INTERNA" }, select: { id: true } });
      if (existe) { resultados.push({ arquivo: nome, resultado: "ja_existe", numero: p.numero, ano: p.ano }); continue; }

      // Plano de ação 5W2H (reaproveita o módulo existente)
      let planoAcaoId = null;
      const temPlano = p.plano && (p.plano.oque || p.plano.como || p.plano.porque || p.plano.onde || p.plano.quem);
      if (temPlano) {
        const ult = await prisma.planoAcao.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
        const encerrada = p.status === "ENCERRADA";
        const pa = await prisma.planoAcao.create({
          data: {
            numero: (ult?.numero || 0) + 1,
            titulo: `${numRNC(p.numero, p.ano)} — ${(p.descricao || "Não conformidade").slice(0, 70)}`,
            origem: numRNC(p.numero, p.ano), responsavel: p.plano.quem || null,
            status: encerrada ? "CONCLUIDO" : "EM_ANDAMENTO",
            itens: [{ oque: p.plano.oque || "", porque: p.plano.porque || "", onde: p.plano.onde || "", quem: p.plano.quem || "", quando: fmtD(p.prazoResposta), como: p.plano.como || "", quanto: "", status: encerrada ? "CONCLUIDO" : "PENDENTE", acompanhamento: p.acompanhamento || "", concluidoEm: p.realizadoEm ? new Date(p.realizadoEm).toISOString() : null }],
            createdById: user.id,
          },
          select: { id: true },
        });
        planoAcaoId = pa.id;
      }

      await prisma.naoConformidade.create({
        data: {
          numero: p.numero, ano: p.ano, tipo: "INTERNA", data: p.data || new Date(Date.UTC(p.ano, 0, 1)),
          cliente: p.cliente, opNumero: p.opNumero, desenhoProjetoMarca: p.desenhoProjetoMarca,
          origem: p.origem, processoArea: p.processoArea, descricao: p.descricao,
          disposicao: p.disposicao, necessitaAcao: p.necessitaAcao, elaborador: p.elaborador,
          abrangencia: p.abrangencia, resultadoReinspecao: p.resultadoReinspecao,
          causas: p.causas, cincoPorques: p.cincoPorques || [], planoAcaoId,
          prazoResposta: p.prazoResposta, realizadoEm: p.realizadoEm, acompanhadoPor: p.acompanhadoPor,
          acompanhamento: p.acompanhamento, avaliacaoEficacia: p.avaliacaoEficacia,
          encerradaPor: p.encerradaPor, encerradaEm: p.encerradaEm, status: p.status || "ABERTA",
          createdById: user.id,
        },
      });
      resultados.push({ arquivo: nome, resultado: "criada", numero: p.numero, ano: p.ano, cliente: p.cliente, descricao: p.descricao, plano: !!planoAcaoId });
    } catch (e) {
      resultados.push({ arquivo: nome, resultado: "erro", erro: e.message?.slice(0, 160) || "falha ao ler" });
    }
  }

  const criadas = resultados.filter((r) => r.resultado === "criada").length;
  const jaExistem = resultados.filter((r) => r.resultado === "ja_existe").length;
  const erros = resultados.filter((r) => r.resultado === "erro").length;
  return NextResponse.json({ success: true, total: files.length, criadas, jaExistem, erros, resultados });
}
