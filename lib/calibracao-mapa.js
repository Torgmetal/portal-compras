import "server-only";
import * as XLSX from "xlsx";
import { listChildrenByPath, downloadFileById } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";

// ─── OS INSTRUMENTOS CALIBRADOS EM DIA ────────────────────────────────────────
// Vitor (22/08/2026): "os vencidos não listar, já vamos resolver essa questão e tirar
// os duplicados; usar esse caminho para listar os equipamentos calibrados em dia" —
// apontando para SERVIDOR/Qualidade/Workspace/Calibração Instrumentos.
//
// A fonte passa a ser o MAPA DE CALIBRAÇÃO DE INSTRUMENTOS que a Qualidade mantém
// nessa pasta, e não mais a varredura dos certificados no Controle de Documentos. A
// diferença importa: a varredura pegava o mesmo instrumento uma vez por certificado
// emitido — daí as duplicatas ("ES-ESQUADRO" duas vezes, "MPS-MEDIDOR DE ESPESSURA"
// duas vezes) — e não sabia dizer qual era o certificado VÁLIDO. O mapa tem uma linha
// por instrumento, com a disposição e a data da próxima calibração.
//
// ⚠ VENCIDO NÃO ENTRA MAIS NA LISTA. Eu tinha defendido o contrário — mostrar marcado
// em vermelho, para o inspetor não medir com ele e deixar de registrar. Vitor decidiu
// tirar e resolver o cadastro. Fica registrado o porquê da troca: a lista existe para
// escolher o que USAR, e instrumento fora de validade não deve ser usado.
//
// Estrutura do mapa (conferida no arquivo real):
//   linha de UMA célula  = tipo do instrumento (TRENA, LUXÍMETRO…)
//   col 0  ID (TR 04)          col 2  certificado        col 10 disposição
//   col 11 última calibração   col 12 próxima (validade)  col 13 localização
// Instrumento com mais de uma variável (temperatura + umidade) ocupa várias linhas; só
// a primeira traz o ID, então as seguintes são continuação e se ignoram.

const PASTA = "/Qualidade/Workspace/Calibração Instrumentos";
const t = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").replace(/\s+/g, " ").trim());

/** Acha o mapa na pasta — pelo conteúdo do nome, não pela posição. */
async function acharMapa(driveId) {
  const kids = await listChildrenByPath(driveId, PASTA).catch(() => []);
  const xls = kids.filter((c) => c.file && /\.xlsx?$/i.test(c.name || ""));
  return xls.find((c) => /mapa/i.test(c.name)) || xls[0] || null;
}

export function interpretarMapa(buffer, { hoje = new Date() } = {}) {
  const wb = XLSX.read(buffer, { cellDates: true });
  const aba = wb.SheetNames.find((n) => /planilha1|mapa/i.test(n)) || wb.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, blankrows: false, defval: "" });

  const out = [];
  const vistos = new Set();
  let tipo = null;

  for (const linha of linhas) {
    const cols = (linha || []).map(t);
    const cheias = cols.filter(Boolean).length;
    if (!cheias) continue;

    // linha de uma célula só = cabeçalho do tipo de instrumento
    if (cheias === 1) {
      const unico = cols.find(Boolean);
      if (unico && !/^mapa de calibra/i.test(unico)) tipo = unico;
      continue;
    }

    const id = cols[0];
    if (!id || /^ID$/i.test(id)) continue;      // cabeçalho da tabela
    if (vistos.has(id.toUpperCase())) continue; // continuação (2ª variável) ou repetido
    vistos.add(id.toUpperCase());

    const disposicao = cols[10] || null;
    const validade = cols[12] || null;
    out.push({
      id,                       // é o código: TR 04, TH-01, LX-01
      codigo: id,
      tipo: tipo || null,
      nome: tipo ? `${id} — ${tipo}` : id,
      certificado: cols[2] && !/^-+$/.test(cols[2]) ? cols[2] : null,
      serie: cols[1] && !/^-+$/.test(cols[1]) ? cols[1] : null,
      disposicao,
      validade,
      local: cols[13] || null,
    });
  }

  const hojeISO = hoje.toISOString().slice(0, 10);
  // em dia = aprovado na última calibração E dentro da validade. Sem data de próxima
  // calibração o instrumento fica DE FORA: não dá para afirmar que está em dia.
  const emDia = out.filter((e) => /aprovad/i.test(e.disposicao || "") && e.validade && e.validade >= hojeISO);
  return { todos: out, emDia };
}

/** A lista para o seletor: só o que está calibrado e em dia, sem repetição. */
export async function instrumentosEmDia() {
  const driveId = await resolveServidorDriveId();
  if (!driveId) return { erro: "Drive SERVIDOR não resolvido.", equipamentos: [] };
  const arq = await acharMapa(driveId);
  if (!arq) return { erro: `Mapa de calibração não encontrado em ${PASTA}.`, equipamentos: [] };
  try {
    const { buffer } = await downloadFileById(driveId, arq.id);
    const { todos, emDia } = interpretarMapa(buffer);
    return { equipamentos: emDia, total: todos.length, arquivo: arq.name };
  } catch (e) {
    return { erro: `Não consegui ler "${arq.name}": ${e.message}`, equipamentos: [] };
  }
}
