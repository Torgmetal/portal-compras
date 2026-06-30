// Utilidades de holerite: split do PDF multipágina (1 holerite/página),
// extração de texto por página e matching best-effort com o cadastro de
// funcionários. O parsing é tolerante a ruído — a tela de revisão do RH é a
// rede de segurança; nunca confiar em auto-match cego (ver plano).
import { PDFDocument } from "pdf-lib";

/** Normaliza texto p/ comparação: maiúsculas, sem acento, espaços colapsados. */
export function normalizar(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Só dígitos (p/ CPF, PIS, matrícula). */
export function soDigitos(s) {
  return (s || "").replace(/\D/g, "");
}

/**
 * Quebra um PDF multipágina em PDFs de 1 página cada.
 * @returns {Promise<Array<{ index: number, bytes: Uint8Array }>>}
 */
export async function splitPaginas(buffer) {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const out = [];
  for (let i = 0; i < total; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    out.push({ index: i, bytes: await doc.save() });
  }
  return out;
}

/**
 * Extrai o texto de cada página com unpdf (import dinâmico — ESM-only).
 * @returns {Promise<string[]>} texto por página (mesma ordem)
 */
export async function extrairTextos(buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

/**
 * Parsing best-effort de um holerite a partir do texto da página.
 * Retorna campos que dão pra inferir; o que falhar vira null (RH corrige).
 */
export function parseHolerite(texto) {
  const t = texto || "";

  // Nome: linha toda em maiúsculas imediatamente antes de "Nome do Funcionário".
  let nome = null;
  const linhas = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const idxNomeLabel = linhas.findIndex((l) => /nome do funcion[aá]rio/i.test(l));
  if (idxNomeLabel > 0) {
    for (let i = idxNomeLabel - 1; i >= 0 && i >= idxNomeLabel - 4; i--) {
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ' ]{6,}$/.test(linhas[i]) && /[A-Z]{2,}/.test(linhas[i])) {
        nome = linhas[i];
        break;
      }
    }
  }

  // CNPJ → identifica a empresa (TORG Metal x VMI etc.).
  const cnpjMatch = t.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
  const cnpj = cnpjMatch ? cnpjMatch[1] : null;

  // Razão social: a linha imediatamente anterior à do CNPJ é a empresa
  // (layout "TORG METAL LTDA" / "53.694.442/0001-41CNPJ:").
  let empresa = null;
  if (cnpj) {
    const idxCnpj = linhas.findIndex((l) => l.includes(cnpj.slice(0, 10)));
    for (let i = idxCnpj - 1; i >= 0 && i >= idxCnpj - 3; i--) {
      const cand = (linhas[i] || "").replace(/CNPJ.*$/i, "").trim();
      if (/[A-ZÀ-Ú]{2,}/.test(normalizar(cand)) && cand.length >= 4) { empresa = cand; break; }
    }
  }

  // Competência por extenso "Maio de 2026" → "2026-05".
  const meses = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  let competencia = null;
  const compMatch = normalizar(t).match(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO) DE (\d{4})\b/);
  if (compMatch) {
    const m = meses.indexOf(compMatch[1].toLowerCase()) + 1;
    competencia = `${compMatch[2]}-${String(m).padStart(2, "0")}`;
  }

  // Valor líquido: pega o maior valor monetário próximo de "líquido".
  let valorLiquido = null;
  const liqCtx = t.match(/l[ií]quido[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (liqCtx) valorLiquido = parseFloat(liqCtx[1].replace(/\./g, "").replace(",", "."));

  return { nome, empresa, cnpj, competencia, valorLiquido };
}

/** Distância de tokens simples: fração de palavras do parse presentes no cadastro. */
function scoreNome(parseNome, cadNome) {
  const a = normalizar(parseNome).split(" ").filter((w) => w.length > 1);
  const b = new Set(normalizar(cadNome).split(" ").filter((w) => w.length > 1));
  if (!a.length || !b.size) return 0;
  const hits = a.filter((w) => b.has(w)).length;
  return hits / Math.max(a.length, b.size);
}

/**
 * Escolhe o melhor funcionário p/ um holerite parseado.
 * @param {object} parsed saída de parseHolerite
 * @param {Array<{id,nome,matricula,cpf}>} funcionarios cadastro ativo
 * @returns {{ funcionarioId: string|null, confianca: number, motivo: string }}
 */
export function matchFuncionario(parsed, funcionarios) {
  if (!parsed?.nome) return { funcionarioId: null, confianca: 0, motivo: "sem nome no PDF" };

  let melhor = { funcionarioId: null, confianca: 0, motivo: "sem correspondência" };
  for (const f of funcionarios) {
    const s = scoreNome(parsed.nome, f.nome);
    if (s > melhor.confianca) {
      melhor = {
        funcionarioId: f.id,
        confianca: s,
        motivo: s >= 0.99 ? "nome idêntico" : s >= 0.6 ? "nome semelhante" : "nome parcial",
      };
    }
  }
  // Abaixo de 0.5 é incerto demais — devolve sugestão mas marca baixa confiança.
  return melhor;
}
