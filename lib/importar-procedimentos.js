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
// controla. Cada revisão tem seu próprio registro para preservar os vínculos históricos.

const COMPLEMENTARES = "/Qualidade/Workspace/Procedimentos";
const BASE = "/Administrativo/SGQ ISO 9001-2015/08 Procedimentos e Formulários do SGQ";

/** "PO 06 - Ensaio Visual de Solda - R1" → { numero: "PO-06", titulo, revisao: "R1" } */
export function lerNomeProcedimento(nome) {
  const m = String(nome).replace(/\.pdf$/i, "").match(/^(POI|PO|PI-QUA)\s*[- ]?\s*(\d{1,3})\s*-\s*(.+?)(?:\s*-?\s*(R\d+))?$/i);
  if (!m) return null;
  return {
    numero: `${m[1].toUpperCase()}-${m[2].padStart(m[1].toUpperCase() === "PI-QUA" ? 3 : 2, "0")}`,
    titulo: m[3].trim(),
    revisao: (m[4] || "").toUpperCase() || null,
  };
}

/**
 * Varre a pasta de procedimentos e grava/atualiza cada um no Controle de Documentos.
 *
 * @param {{userId?:string, incluirFormularios?:boolean}} opts
 */
export async function importarProcedimentos({ userId = null, _incluirFormularios = false, numeros = null } = {}) {
  const driveId = await resolveServidorDriveId();
  if (!driveId) return { erro: "Não consegui resolver o drive do servidor." };

  const pastas = await listChildrenByPath(driveId, BASE);
  const out = { criados: 0, atualizados: 0, semPdf: [], ignorados: [] };
  const vigentes = new Map();
  for (const p of pastas) {
    if (!p.folder) continue;
    const info = lerNomeProcedimento(p.name);
    if (!info) { out.ignorados.push(p.name); continue; }
    if (numeros && !numeros.includes(info.numero)) continue;
    const anterior = vigentes.get(info.numero);
    if (!anterior || numeroRevisao(info.revisao) > numeroRevisao(anterior.info.revisao)) vigentes.set(info.numero, { p, info });
  }
  // PI-QUA/POI são arquivos complementares (não pastas PO), inclusive os procedimentos de END.
  if (!numeros || numeros.some(n => !n.startsWith("PO-"))) {
    const arquivos = await listarComplementares(driveId, COMPLEMENTARES);
    const end = pastas.find(p => p.folder && /^END\b/i.test(p.name));
    if (end) arquivos.push(...await listarComplementares(driveId, `${BASE}/${end.name}`));
    for (const pdf of arquivos) {
      const info = lerNomeProcedimento(pdf.name);
      if (!info || info.numero.startsWith("PO-") || (numeros && !numeros.includes(info.numero))) continue;
      const anterior = vigentes.get(info.numero);
      if (!anterior || numeroRevisao(info.revisao) > numeroRevisao(anterior.info.revisao)) vigentes.set(info.numero, { p: pdf, info, pdf });
    }
  }
  for (const { p, info: pastaInfo, pdf: complementar } of vigentes.values()) {
    const info = { ...pastaInfo };
    const filhos = complementar ? [complementar] : await listChildrenByPath(driveId, `${BASE}/${p.name}`);
    const pdfs = filhos.filter((x) => x.file && /\.pdf$/i.test(x.name) && numeroDoProcedimento({ nome: x.name }) === info.numero);
    const pdf = pdfs.filter(x => revisaoDoProcedimento({ nome: x.name }) >= numeroRevisao(info.revisao)).sort((a,b) => revisaoDoProcedimento({ nome: b.name }) - revisaoDoProcedimento({ nome: a.name }))[0] || (pdfs.length === 1 && revisaoDoProcedimento({ nome: pdfs[0].name }) < 0 ? pdfs[0] : null);
    if (!pdf) { out.semPdf.push(p.name); continue; }
    const revisaoPdf = revisaoDoProcedimento({ nome: pdf.name });
    if (revisaoPdf >= 0) info.revisao = `R${revisaoPdf}`;
    const dados = {
      nome: `${info.numero} ${info.titulo}${info.revisao ? ` - ${info.revisao}` : ""}`,
      categoria: "SISTEMA", tipo: "Procedimento Operacional", numeroDocumento: info.numero,
      observacao: info.revisao ? `Revisão ${info.revisao}` : null,
      responsavel: "Qualidade", sharepointItemId: pdf.id, sharepointUrl: pdf.webUrl || null,
      arquivoNome: pdf.name, arquivoTipo: "application/pdf", origem: "importacao_sgq",
      dataValidade: null, validado: true, ativo: true,
    };
    const existentes = await prisma.documentoQualidade.findMany({
      where: { categoria: "SISTEMA", numeroDocumento: info.numero, ativo: true },
    });
    // Uma revisão nova recebe outro ID: os livros emitidos conservam os vínculos antigos.
    const existente = existentes.find((d) => revisaoDoProcedimento(d) === numeroRevisao(info.revisao) && d.sharepointItemId === pdf.id);
    if (existente) continue;
    if (existentes.some((d) => revisaoDoProcedimento(d) > numeroRevisao(info.revisao))) {
      throw new Error(`O SGQ retornou uma revisão anterior à cadastrada para ${info.numero}.`);
    }
    await prisma.$transaction(async tx => {
      const criado = await tx.documentoQualidade.create({ data: { ...dados, createdById: userId } });
      await tx.auditLog.create({ data: { userId, action: "IMPORTAR_PROCEDIMENTO_SGQ", entity: "DocumentoQualidade", entityId: criado.id, diff: { numero: info.numero, revisao: info.revisao, sharepointItemId: pdf.id } } });
    });
    out.criados++;
  }

  if (numeros) {
    const ausentes = numeros.filter(n => !vigentes.has(n));
    if (ausentes.length) throw new Error(`Procedimentos não encontrados no SGQ: ${ausentes.join(", ")}`);
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
  ULTRASSOM: "PI-QUA-003", // procedimento específico do ensaio de ultrassom conforme AWS D1.1
  LP: "PO-15",            // Ensaio por Líquido Penetrante
  PINTURA: "PO-05",       // Preparação de Superfície e Pintura
  // sais e poeira são ensaios da preparação de superfície, do mesmo PO-05 (02/10/2026)
  SAIS: "PO-05",
  POEIRA: "PO-05",
  PULL_OFF: "PO-05",
};

export async function procedimentoDoTipo(tipo, { sincronizar = false } = {}) {
  const numero = POR_TIPO[tipo];
  if (!numero) return null;
  if (sincronizar) {
    const out = await importarProcedimentos({ numeros: [numero] });
    if (out.erro || out.semPdf.length) throw new Error(out.erro || `Procedimento vigente sem PDF: ${out.semPdf.join(", ")}`);
  }
  const docs = await prisma.documentoQualidade.findMany({
    where: { categoria: "SISTEMA", numeroDocumento: numero, ativo: true },
    select: { id: true, nome: true, numeroDocumento: true, observacao: true, sharepointItemId: true },
  });
  return ultimaRevisaoProcedimentos(docs)[0] || null;
}

function numeroRevisao(texto) {
  return Number(String(texto || "").match(/(?:R(?:EV(?:IS[ÃA]O)?\.?)?\s*)(\d+)/i)?.[1] ?? -1);
}
export function revisaoDoProcedimento(doc) {
  return Math.max(...[doc.nome, doc.arquivoNome, doc.observacao].map(numeroRevisao));
}
export function numeroDoProcedimento(doc) {
  const texto = `${doc.numeroDocumento || ""} ${doc.nome || ""}`;
  const m = texto.match(/\b(PO|POI|PI-QUA)\s*[- ]?\s*(\d{1,3})\b/i);
  return m ? `${m[1].toUpperCase()}-${m[2].padStart(m[1].toUpperCase() === "PI-QUA" ? 3 : 2, "0")}` : null;
}
export function ultimaRevisaoProcedimentos(docs = []) {
  const mapa = new Map();
  for (const d of docs) {
    const numero = numeroDoProcedimento(d) || d.id;
    const atual = mapa.get(numero);
    if (!atual || revisaoDoProcedimento(d) > revisaoDoProcedimento(atual) ||
      (revisaoDoProcedimento(d) === revisaoDoProcedimento(atual) && String(d.id).localeCompare(String(atual.id)) > 0)) mapa.set(numero, d);
  }
  return [...mapa.values()];
}

async function listarComplementares(driveId, raiz) {
  const arquivos = [];
  let nivel = [raiz];
  let total = 0;
  while (nivel.length) {
    total += nivel.length;
    if (total > 150) throw new Error("Árvore de procedimentos excedeu 150 pastas; sincronização interrompida.");
    const proximo = [];
    for (let i = 0; i < nivel.length; i += 6) {
      const lote = nivel.slice(i,i+6);
      const filhos = await Promise.all(lote.map(path=>listChildrenByPath(driveId,path)));
      filhos.forEach((kids,j)=>{
        for (const f of kids) {
          if (/obsolet|backup/i.test(f.name)) continue;
          if (f.folder) proximo.push(`${lote[j]}/${f.name}`);
          else if (f.file && /\.pdf$/i.test(f.name)) arquivos.push(f);
        }
      });
    }
    nivel = proximo;
  }
  return arquivos;
}
