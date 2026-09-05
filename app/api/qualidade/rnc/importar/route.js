// Importa RNCs do FORM 20. O PARSE acontece no navegador (lib/parse-rnc-form20,
// SheetJS client-side) — os arquivos .xls têm vários MB (fotos embutidas) e não
// cabem no corpo da rota serverless (~4,5MB). Aqui recebemos só o JSON já extraído
// e criamos a NaoConformidade (preservando nº/ano) + o Plano de Ação 5W2H. Pula as
// que já existem (nº+ano+tipo INTERNA).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { numRNC } from "@/lib/nao-conformidade";

export const runtime = "nodejs";
export const maxDuration = 60;

const D = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; };

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let registros;
  try { registros = (await req.json()).registros; }
  catch { return NextResponse.json({ error: "Payload inválido." }, { status: 400 }); }
  if (!Array.isArray(registros) || !registros.length) return NextResponse.json({ error: "Nenhuma RNC para importar." }, { status: 400 });
  if (registros.length > 500) return NextResponse.json({ error: "Máximo de 500 por vez." }, { status: 400 });

  const resultados = [];
  for (const p of registros) {
    const nome = p.arquivo || "arquivo.xls";
    try {
      if (!p.numero || !p.ano) { resultados.push({ arquivo: nome, resultado: "erro", erro: "Não consegui ler o número/ano da RNC" }); continue; }

      const existe = await prisma.naoConformidade.findFirst({ where: { ano: p.ano, numero: p.numero, tipo: "INTERNA" }, select: { id: true } });
      if (existe) { resultados.push({ arquivo: nome, resultado: "ja_existe", numero: p.numero, ano: p.ano }); continue; }

      let planoAcaoId = null;
      const pl = p.plano || {};
      const temPlano = pl.oque || pl.como || pl.porque || pl.onde || pl.quem;
      if (temPlano) {
        const encerrada = p.status === "ENCERRADA";
        const pa = await prisma.planoAcao.create({
          data: {
            numero: p.numero, // o plano da RNC segue a numeração da RNC (RNC-007 -> PA-007)
            titulo: `${numRNC(p.numero, p.ano)} — ${(p.descricao || "Não conformidade").slice(0, 70)}`,
            origem: numRNC(p.numero, p.ano), responsavel: pl.quem || null,
            status: encerrada ? "CONCLUIDO" : "EM_ANDAMENTO",
            itens: [{ oque: pl.oque || "", porque: pl.porque || "", onde: pl.onde || "", quem: pl.quem || "", quando: D(p.prazoResposta)?.toISOString().slice(0, 10) || "", como: pl.como || "", quanto: "", status: encerrada ? "CONCLUIDO" : "A_FAZER", acompanhamento: p.acompanhamento || "", concluidoEm: D(p.realizadoEm)?.toISOString() || null }],
            createdById: user.id,
          },
          select: { id: true },
        });
        planoAcaoId = pa.id;
      }

      await prisma.naoConformidade.create({
        data: {
          numero: p.numero, ano: p.ano, tipo: "INTERNA", data: D(p.data) || new Date(Date.UTC(p.ano, 0, 1)),
          cliente: p.cliente || null, opNumero: p.opNumero || null, desenhoProjetoMarca: p.desenhoProjetoMarca || null,
          origem: p.origem || null, processoArea: p.processoArea || null, descricao: p.descricao || null,
          disposicao: p.disposicao || null, necessitaAcao: p.necessitaAcao || null, elaborador: p.elaborador || null,
          abrangencia: p.abrangencia || null, resultadoReinspecao: p.resultadoReinspecao || null,
          causas: p.causas || null, cincoPorques: Array.isArray(p.cincoPorques) ? p.cincoPorques : [], planoAcaoId,
          prazoResposta: D(p.prazoResposta), realizadoEm: D(p.realizadoEm), acompanhadoPor: p.acompanhadoPor || null,
          acompanhamento: p.acompanhamento || null, avaliacaoEficacia: p.avaliacaoEficacia || null,
          encerradaPor: p.encerradaPor || null, encerradaEm: D(p.encerradaEm), status: p.status || "ABERTA",
          createdById: user.id,
        },
      });
      resultados.push({ arquivo: nome, resultado: "criada", numero: p.numero, ano: p.ano });
    } catch (e) {
      resultados.push({ arquivo: nome, resultado: "erro", erro: e.message?.slice(0, 160) || "falha ao criar" });
    }
  }

  const criadas = resultados.filter((r) => r.resultado === "criada").length;
  const jaExistem = resultados.filter((r) => r.resultado === "ja_existe").length;
  const erros = resultados.filter((r) => r.resultado === "erro").length;
  return NextResponse.json({ success: true, total: registros.length, criadas, jaExistem, erros, resultados });
}
