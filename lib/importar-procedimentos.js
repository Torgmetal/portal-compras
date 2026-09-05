import "server-only";
import { prisma } from "./prisma";
import { listChildrenByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";

// IMPORTA OS PROCEDIMENTOS DO SGQ PARA O CONTROLE DE DOCUMENTOS.
//
// Vitor (21/08/2026): "usamos a AWS D1.1, mas você tem acesso a todos os procedimentos que estão na
// pasta administrativo e SGQ" — e depois: "sim, pode importar".
//
// Os 21 POs sempre existiram no servidor; o que faltava era o portal conhecê-los. Sem isso, o
// relatório dimensional citava "PO-04 Tolerâncias de Fabricação" a partir de um TEXTO FIXO no
// código: se a Qualidade revisasse o procedimento, o documento emitido continuaria dizendo a
// revisão velha, e ninguém perceberia.
//
// ⚠ A REVISÃO VEM DO NOME DA PASTA ("PO 06 - Ensaio Visual de Solda - R1"), que é como a Qualidade
// controla. Reimportar é seguro: casa pelo número do PO e atualiza nome e revisão.

const BASE = "/Administrativo/SGQ ISO 9001-2015/08 Procedimentos e Formulários do SGQ";

/** "PO 06 - Ensaio Visual de Solda - R1" → { numero: "PO-06", titulo, revisao: "R1" } */
export function lerNomeProcedimento(nome) {
  const m = String(nome).match(/^PO\s*[- ]?\s*(\d{1,2})\s*-\s*(.+?)(?:\s*-\s*(R\d+))?$/i);
  if (!m) return null;
  return {
    numero: `PO-${m[1].padStart(2, "0")}`,
    titulo: m[2].trim(),
    revisao: (m[3] || "").toUpperCase() || null,
  };
}

/**
 * Varre a pasta de procedimentos e grava/atualiza cada um no Controle de Documentos.
 *
 * @param {{userId?:string, incluirFormularios?:boolean}} opts
 */
export async function importarProcedimentos({ userId = null, _incluirFormularios = false } = {}) {
  const driveId = await resolveServidorDriveId();
  if (!driveId) return { erro: "Não consegui resolver o drive do servidor." };

  const pastas = await listChildrenByPath(driveId, `${BASE}/PROCEDIMENTOS`).catch(() => []);
  const out = { criados: 0, atualizados: 0, semPdf: [], ignorados: [] };

  for (const p of pastas) {
    if (!p.folder) continue;
    const info = lerNomeProcedimento(p.name);
    if (!info) { out.ignorados.push(p.name); continue; }

    // o PDF é o que circula; o .docx é o editável e não deve ser o anexo do controle
    const filhos = await listChildrenByPath(driveId, `${BASE}/PROCEDIMENTOS/${p.name}`).catch(() => []);
    const pdf = filhos.find((x) => x.file && /\.pdf$/i.test(x.name));
    if (!pdf) { out.semPdf.push(p.name); continue; }

    const dados = {
      nome: `${info.numero} ${info.titulo}${info.revisao ? ` - ${info.revisao}` : ""}`,
      categoria: "SISTEMA",
      tipo: "Procedimento Operacional",
      numeroDocumento: info.numero,
      // ⚠ a revisão vai em `observacao` E no nome: no nome porque é assim que a Qualidade se
      // refere ao documento, e em campo próprio para dar para comparar depois.
      observacao: info.revisao ? `Revisão ${info.revisao}` : null,
      responsavel: "Qualidade",
      sharepointItemId: pdf.id,
      sharepointUrl: pdf.webUrl || null,
      arquivoNome: pdf.name,
      origem: "importacao_sgq",
      // procedimento do sistema não tem validade: vale até ser revisado
      dataValidade: null,
      validado: true,
      ativo: true,
    };

    const existente = await prisma.documentoQualidade.findFirst({
      where: { categoria: "SISTEMA", numeroDocumento: info.numero },
      select: { id: true },
    });
    if (existente) {
      await prisma.documentoQualidade.update({ where: { id: existente.id }, data: dados });
      out.atualizados++;
    } else {
      await prisma.documentoQualidade.create({ data: { ...dados, createdById: userId } });
      out.criados++;
    }
  }

  return out;
}

/**
 * O procedimento que vale para um tipo de relatório.
 *
 * ⚠ É AQUI QUE O TEXTO FIXO MORRE. Antes cada relatório carregava o nome do procedimento escrito no
 * código; agora sai do Controle de Documentos, com a revisão que está valendo hoje.
 */
const POR_TIPO = {
  DIMENSIONAL: "PO-04",   // Tolerâncias de Fabricação
  VISUAL_SOLDA: "PO-06",  // Ensaio Visual e Dimensional de Soldas
  ULTRASSOM: "PO-06",     // o END de ultrassom referencia o mesmo ensaio visual como base
  LP: "PO-15",            // Ensaio por Líquido Penetrante
  PINTURA: "PO-05",       // Preparação de Superfície e Pintura
};

export async function procedimentoDoTipo(tipo) {
  const numero = POR_TIPO[tipo];
  if (!numero) return null;
  const doc = await prisma.documentoQualidade.findFirst({
    where: { categoria: "SISTEMA", numeroDocumento: numero, ativo: true },
    select: { id: true, nome: true, numeroDocumento: true, observacao: true, sharepointItemId: true },
  });
  return doc || null;
}
