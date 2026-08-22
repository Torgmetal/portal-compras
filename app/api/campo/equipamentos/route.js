// GET — os instrumentos calibrados EM DIA, para o inspetor marcar o que está usando.
//
// Vitor (21/08/2026): "além de informar a peça e a OP, ele seleciona os equipamentos que está
// usando para compor no relatório". E (22/08/2026): "os vencidos não listar, já vamos resolver
// essa questão e tirar os duplicados; usar esse caminho para listar os equipamentos calibrados em
// dia" — SERVIDOR/Qualidade/Workspace/Calibração Instrumentos.
//
// A fonte é o MAPA DE CALIBRAÇÃO que a Qualidade mantém naquela pasta. Antes a lista saía de uma
// varredura dos certificados no Controle de Documentos, e isso trazia dois problemas: o mesmo
// instrumento aparecia uma vez por certificado emitido (as duplicatas) e não havia como saber qual
// certificado era o vigente. O mapa tem UMA linha por instrumento, com o código (TR 04), a
// disposição e a data da próxima calibração.
//
// ⚠ VENCIDO NÃO ENTRA. Eu tinha defendido o contrário — aparecer marcado em vermelho, para o
// inspetor não medir com ele e deixar de registrar. Vitor decidiu tirar e arrumar o cadastro, e a
// razão dele é mais forte: a lista existe para escolher o que USAR, e instrumento fora de validade
// não deve ser usado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { instrumentosEmDia } from "@/lib/calibracao-mapa";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const mapa = await instrumentosEmDia().catch(() => ({ erro: "falha ao ler o mapa", equipamentos: [] }));
  if (mapa.equipamentos.length) {
    return NextResponse.json({
      equipamentos: mapa.equipamentos.map((e) => ({
        id: e.codigo,
        codigo: e.codigo,
        nome: e.nome,
        certificado: e.certificado,
        validade: e.validade,
        local: e.local,
        vencido: false, // por construção: a lista já é só o que está em dia
      })),
      fonte: mapa.arquivo,
    });
  }

  // ⚠ RESERVA. Se o mapa não puder ser lido (arquivo movido, SharePoint fora), a lista NÃO pode
  // ficar vazia: o inspetor está com a peça na frente e ficaria sem como registrar o instrumento.
  // Cai no Controle de Documentos, mas aplicando as mesmas regras — sem vencido e sem repetido.
  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, categoria: "EQUIPAMENTOS" },
    select: { id: true, nome: true, numeroDocumento: true, dataValidade: true, fornecedor: true },
    orderBy: [{ nome: "asc" }, { dataValidade: "desc" }],
  });
  const hoje = new Date();
  const vistos = new Set();
  const equipamentos = [];
  for (const d of docs) {
    if (d.dataValidade && d.dataValidade < hoje) continue;
    const chave = String(d.nome).trim().toUpperCase();
    if (vistos.has(chave)) continue; // o mais recente vence: a ordenação já colocou ele primeiro
    vistos.add(chave);
    equipamentos.push({
      id: d.id,
      codigo: null,
      nome: d.nome,
      certificado: d.numeroDocumento || null,
      validade: d.dataValidade ? d.dataValidade.toISOString().slice(0, 10) : null,
      local: d.fornecedor || null,
      vencido: false,
    });
  }
  return NextResponse.json({ equipamentos, fonte: "controle-de-documentos", aviso: mapa.erro || null });
}
