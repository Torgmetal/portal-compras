import "server-only";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const DEPT_MAP = {
  "comercial": "COMERCIAL",
  "engenharia": "ENGENHARIA",
  "projeto": "ENGENHARIA",
  "suprimentos": "SUPRIMENTOS",
  "compras": "SUPRIMENTOS",
  "fabricação": "FABRICACAO",
  "fabricacao": "FABRICACAO",
  "produção": "FABRICACAO",
  "producao": "FABRICACAO",
  "expedição": "EXPEDICAO",
  "expedicao": "EXPEDICAO",
  "montagem": "MONTAGEM",
};

function detectDepartamento(taskName) {
  const lower = taskName.trim().toLowerCase();
  for (const [key, val] of Object.entries(DEPT_MAP)) {
    if (lower.startsWith(key)) return val;
  }
  return null;
}

export function extrairOpNumero(nomeArquivo) {
  const match = nomeArquivo.match(/OP[- ]?0*(\d+)/i);
  return match ? match[1].padStart(3, "0") : null;
}

export async function parseMpp(buffer) {
  const { convert } = await import("@byteink/mppjs");

  const id = randomUUID();
  const mppPath = join(tmpdir(), `cronograma-${id}.mpp`);
  const xmlPath = join(tmpdir(), `cronograma-${id}.xml`);

  try {
    await writeFile(mppPath, buffer);
    await convert(mppPath, xmlPath);
    const xml = await readFile(xmlPath, "utf-8");
    return parseXml(xml);
  } finally {
    await unlink(mppPath).catch(() => {});
    await unlink(xmlPath).catch(() => {});
  }
}

function parseXml(xml) {
  const titulo = extractTag(xml, "Title") || "";
  const startDate = extractTag(xml, "StartDate");
  const finishDate = extractTag(xml, "FinishDate");

  const extAttrs = {};
  const extBlock = xml.match(/<ExtendedAttributes>([\s\S]*?)<\/ExtendedAttributes>/);
  if (extBlock) {
    const attrMatches = extBlock[1].matchAll(/<ExtendedAttribute>([\s\S]*?)<\/ExtendedAttribute>/g);
    for (const m of attrMatches) {
      const fieldId = extractTag(m[1], "FieldID");
      const alias = extractTag(m[1], "Alias");
      if (fieldId && alias) extAttrs[fieldId] = alias;
    }
  }

  const tasksBlock = xml.match(/<Tasks>([\s\S]*?)<\/Tasks>/);
  if (!tasksBlock) return { titulo, dataInicio: startDate, dataFim: finishDate, tarefas: [] };

  const taskMatches = tasksBlock[1].matchAll(/<Task>([\s\S]*?)<\/Task>/g);
  const tarefas = [];
  let currentDept = null;
  const parentDepts = {};

  for (const m of taskMatches) {
    const body = m[1];
    const uid = parseInt(extractTag(body, "UID") || "0");
    const nome = extractTag(body, "Name") || "";
    const outlineLevel = parseInt(extractTag(body, "OutlineLevel") || "0");
    const isSummary = extractTag(body, "Summary") === "1";
    const start = extractTag(body, "Start");
    const finish = extractTag(body, "Finish");
    const pct = parseInt(extractTag(body, "PercentComplete") || "0");
    const wbsParent = extractTag(body, "OutlineNumber");

    const extValues = {};
    const extMatches = body.matchAll(/<ExtendedAttribute>([\s\S]*?)<\/ExtendedAttribute>/g);
    for (const em of extMatches) {
      const fid = extractTag(em[1], "FieldID");
      const val = extractTag(em[1], "Value");
      if (fid && extAttrs[fid]) extValues[extAttrs[fid]] = val;
    }

    const qtdePlanejada = parseFloat(extValues["Qtde. Planejada"] || "0") || 0;
    const qtdeRealizada = parseFloat(extValues["Qtde. Realizada"] || "0") || 0;
    const percPrevista = parseFloat((extValues["%Prevista"] || "0").replace("%", "")) || 0;
    const percConcluida = parseFloat((extValues["%Concluída_"] || "0").replace("%", "")) || 0;

    if (outlineLevel === 1 && isSummary) {
      const dept = detectDepartamento(nome);
      if (dept) {
        currentDept = dept;
        parentDepts[uid] = dept;
      }
    }

    let departamento = null;
    if (outlineLevel === 1) {
      departamento = detectDepartamento(nome);
    } else if (outlineLevel > 1) {
      departamento = currentDept;
    }

    tarefas.push({
      uidMpp: uid,
      nome: nome.trim(),
      departamento,
      dataInicioPrevista: start ? new Date(start) : null,
      dataFimPrevista: finish ? new Date(finish) : null,
      percentualPrevisto: percPrevista || pct,
      percentualRealizado: percConcluida || pct,
      qtdePlanejada,
      qtdeRealizada,
      isSummary,
      outlineLevel,
    });
  }

  return {
    titulo,
    dataInicio: startDate ? new Date(startDate) : null,
    dataFim: finishDate ? new Date(finishDate) : null,
    tarefas,
  };
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
}
