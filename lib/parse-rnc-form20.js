import * as XLSX from "xlsx";

// Parser determinístico do FORM 20 (RNC da Torg) — lê o .xls e extrai os campos
// da NaoConformidade. Label-based (procura pelos rótulos), robusto a pequenas
// variações de posição entre revisões do template. Ver lib/nao-conformidade.js.

const ORIGEM = { "PROCESSO": "PROCESSO", "PRODUTO": "PRODUTO", "CLIENTE": "CLIENTE", "FORNECEDOR": "FORNECEDOR", "AUDITORIA INTERNA": "AUDITORIA_INTERNA", "AUDITORIA EXTERNA": "AUDITORIA_EXTERNA", "INDICADOR": "INDICADOR" };
const DISP = { "RETRABALHAR": "RETRABALHAR", "REFUGAR": "REFUGAR", "APROVAR SOB CONCESSÃO OU USAR COMO ESTÁ": "APROVAR_CONCESSAO", "DEVOLVER AO FORNECEDOR": "DEVOLVER_FORNECEDOR" };
const ACAO = { "CORRETIVA": "CORRETIVA", "PREVENTIVA": "PREVENTIVA", "NÃO NECESSÁRIO": "NAO_NECESSARIO", "NAO NECESSARIO": "NAO_NECESSARIO" };

const isDate = (v) => v instanceof Date && !isNaN(v);
const asStr = (v) => (v == null ? "" : isDate(v) ? "" : String(v).replace(/\s+/g, " ").trim());
const up = (v) => asStr(v).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const asDate = (v) => { if (isDate(v)) return v; const s = asStr(v); if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; };
const onlyDigits = (v) => { const m = asStr(v).match(/\d+/); return m ? parseInt(m[0], 10) : null; };

function makeGrid(sheet) {
  const g = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  const R = g.length, C = g.reduce((m, row) => Math.max(m, row.length), 0);
  return { g, R, C, cell: (r, c) => (r >= 0 && r < R && c >= 0 && c < (g[r]?.length || 0) ? g[r][c] : "") };
}
// procura o PRIMEIRO cell cujo texto CONTÉM sub (normalizado); retorna [r,c] ou [null,null]
function find(G, sub) {
  const s = up(sub);
  for (let r = 0; r < G.R; r++) for (let c = 0; c < G.C; c++) if (up(G.cell(r, c)).includes(s)) return [r, c];
  return [null, null];
}
const rightOf = (G, r, c, max = 18) => { if (r == null) return ""; for (let cc = c + 1; cc < Math.min(G.C, c + max); cc++) { const v = asStr(G.cell(r, cc)); if (v) return v; } return ""; };
const belowOf = (G, r, c, max = 3) => { if (r == null) return ""; for (let rr = r + 1; rr < Math.min(G.R, r + max); rr++) { const v = asStr(G.cell(rr, c)); if (v) return v; } return ""; };
const belowDate = (G, r, c, max = 3) => { if (r == null) return null; for (let rr = r + 1; rr < Math.min(G.R, r + max); rr++) { const v = G.cell(rr, c); if (isDate(v) || asStr(v)) return asDate(v); } return null; };
// marca (X) → rótulo mais à esquerda na mesma linha
function checked(G, group) {
  for (let r = 0; r < G.R; r++) for (let c = 0; c < G.C; c++) {
    if (up(G.cell(r, c)) !== "X") continue;
    for (let cc = c - 1; cc >= 0; cc--) { const t = up(G.cell(r, cc)); if (!t) continue; for (const [lbl, val] of Object.entries(group)) if (t === up(lbl)) return val; break; }
  }
  return null;
}

export function parseRncForm20(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const shName = wb.SheetNames.find((n) => up(n) === "RNC") || wb.SheetNames[0];
  const G = makeGrid(wb.Sheets[shName]);

  const [rn, cn] = find(G, "RNC  Nº");
  const numero = onlyDigits(rightOf(G, rn, cn) || (rn != null ? G.cell(rn, cn + 4) : ""));
  const [ra, ca] = find(G, "ANO");
  let ano = onlyDigits(belowOf(G, ra, ca) || rightOf(G, ra, ca));
  if (ano != null && ano < 100) ano = 2000 + ano;
  const [rd, cd] = find(G, "DATA");
  const data = belowDate(G, rd, cd) || null;

  const [rc, cc] = find(G, "CLIENTE:");
  const cliente = belowOf(G, rc, cc);
  const [ro, co] = find(G, "OP:");
  const opNumero = belowOf(G, ro, co);
  const [rmk, cmk] = find(G, "DESENHO");
  const desenhoProjetoMarca = belowOf(G, rmk, cmk, 3);
  const [rpa] = find(G, "PROCESSO/ÁREA");
  const processoArea = rpa != null ? asStr(G.cell(rpa, 0)).split(":").slice(1).join(":").trim() : "";
  const [rde, cde] = find(G, "DESCRIÇÃO DA NÃO");
  const descricao = belowOf(G, rde, cde, 3);
  const [rcs, ccs] = find(G, "CAUSAS DA");
  const causas = belowOf(G, rcs, ccs, 3);
  const [rel, cel] = find(G, "ELABORADOR");
  const elaborador = rightOf(G, rel, cel);
  const [rab, cab] = find(G, "ABRANGÊNCIA");
  const abrangencia = belowOf(G, rab, cab, 3);
  const [rri, cri] = find(G, "RESULTADO DA REINSPE");
  const resultadoReinspecao = belowOf(G, rri, cri, 3);

  // plano de ação (5W1H inline)
  const plano = {
    oque: rightOf(G, ...find(G, "O que fazer")),
    como: rightOf(G, ...find(G, "Como fazer")),
    porque: rightOf(G, ...find(G, "Por que fazer")),
    onde: rightOf(G, ...find(G, "Onde fazer")),
    quem: rightOf(G, ...find(G, "Quem fará")),
  };
  const [rpe] = find(G, "Prazo para Execução");
  const prazoResposta = belowDate(G, rpe, 0);
  const [rre, cre] = find(G, "Realizado em");
  const realizadoEm = belowDate(G, rre, cre);
  const [rac, cac] = find(G, "Acompanhado por");
  const acompanhadoPor = belowOf(G, rac, cac);
  const [rai, cai] = find(G, "ACOMPANHAMENTO DA");
  const acompanhamento = belowOf(G, rai, cai, 3);
  const [rav, cav] = find(G, "AVALIAÇÃO DA EFIC");
  const avaliacaoEficacia = belowOf(G, rav, cav, 3);
  const [renc] = find(G, "ENCERRADA POR");
  let encerradaPor = "", encerradaEm = null;
  if (renc != null) {
    encerradaPor = asStr(G.cell(renc, 0)).split(":").slice(1).join(":").trim();
    for (let c = 0; c < G.C; c++) { const v = G.cell(renc, c); if (isDate(v)) { encerradaEm = v; break; } }
  }

  // 5 porquês (aba de análise de causa raiz)
  const cincoPorques = [];
  const shRaiz = wb.SheetNames.find((n) => up(n).includes("CAUSA RAIZ"));
  if (shRaiz) {
    const G2 = makeGrid(wb.Sheets[shRaiz]);
    for (let r = 0; r < G2.R; r++) {
      if (/^\d+\)\s*PORQUE/.test(up(G2.cell(r, 0)))) {
        let resp = "";
        for (let c = 1; c < G2.C; c++) { const v = asStr(G2.cell(r, c)); if (v) { resp = v; break; } }
        if (resp) cincoPorques.push({ porque: `${cincoPorques.length + 1}º porquê`, resposta: resp });
      }
    }
  }

  const encerrada = !!encerradaPor || !!encerradaEm;
  return {
    numero, ano: ano || (data ? data.getUTCFullYear() : null), data,
    cliente: cliente || null, opNumero: opNumero || null, desenhoProjetoMarca: desenhoProjetoMarca || null,
    origem: checked(G, ORIGEM), processoArea: processoArea || null, descricao: descricao || null,
    disposicao: checked(G, DISP), necessitaAcao: checked(G, ACAO),
    elaborador: elaborador || null, abrangencia: abrangencia || null, resultadoReinspecao: resultadoReinspecao || null,
    causas: causas || null, cincoPorques,
    prazoResposta, realizadoEm, acompanhadoPor: acompanhadoPor || null,
    acompanhamento: acompanhamento || null, avaliacaoEficacia: avaliacaoEficacia || null,
    encerradaPor: encerradaPor || null, encerradaEm, status: encerrada ? "ENCERRADA" : "ABERTA",
    plano,
  };
}
