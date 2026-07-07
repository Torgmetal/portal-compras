// Parser da planilha "CET Auditoria" (Custo Efetivo Total — CLT). Lê a aba
// "Custo Efetivo" (1 colaborador/linha) e AGREGA por SETOR do custo-hora:
//   • Torg + VMI = uma empresa só (não separa por CNPJ).
//   • "Montagem externa" fica à parte (não é fábrica).
//   • Setores de apoio (qualidade, RH, engenharia, portaria, adm, orçamento,
//     PCP, financeiro, projetos, almoxarifado, jardinagem, comercial, expedição,
//     produção, etc.) viram um único setor "ADM".
//   • Os demais são os setores de fábrica que faturam hora (preparação, soldagem,
//     montagem, jato, pintura, acabamento).
// Soma headcount, salário base e CET (custo efetivo real). As HORAS são ignoradas
// de propósito — o time lança manualmente na tela.
import * as XLSX from "xlsx";

const norm = (s) => String(s ?? "").trim();
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const stripAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const canon = (s) => stripAcentos(norm(s).toUpperCase());

// Setores de fábrica (faturam hora) — mantêm o nome próprio.
const FABRICA = new Set(["PREPARACAO", "SOLDAGEM", "SOLDA", "MONTAGEM", "JATO", "JATEAMENTO", "PINTURA", "ACABAMENTO", "CORTE", "FURACAO", "CORTE E FURACAO"]);
// Montagem externa — setor à parte (não é fábrica).
const EXTERNA = new Set(["MONTAGEM EXTERNA"]);

// Classifica um setor da planilha no setor do custo-hora.
function grupoDe(setor) {
  const c = canon(setor);
  if (EXTERNA.has(c)) return { nome: "Montagem externa", tipo: "Externa" };
  if (FABRICA.has(c)) return { nome: norm(setor), tipo: "Fábrica" }; // preserva acento/caixa do original
  return { nome: "ADM", tipo: "ADM" }; // todo o apoio cai aqui
}

export function parseCetAuditoria(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets["Custo Efetivo"];
  if (!ws) throw new Error('Aba "Custo Efetivo" não encontrada no arquivo.');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const hi = rows.findIndex((r) => Array.isArray(r) && r.some((c) => norm(c) === "Setor") && r.some((c) => /Custo Efetivo Total/i.test(norm(c))));
  if (hi < 0) throw new Error("Cabeçalho não encontrado (Setor / Custo Efetivo Total).");
  const header = rows[hi].map(norm);
  const idx = (nome) => header.findIndex((h) => h.toLowerCase() === String(nome).toLowerCase());
  const iSetor = idx("Setor"), iStatus = idx("Status");
  const iSal = idx("Salário Base"), iCet = idx("Custo Efetivo Total");

  const map = new Map();
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const setor = norm(row[iSetor]);
    if (!setor) continue;
    const status = norm(row[iStatus]).toLowerCase();
    if (status && status !== "ativo") continue; // só colaboradores ativos

    const g = grupoDe(setor);
    const cur = map.get(g.nome) || { nome: g.nome, empresa: g.tipo, headcount: 0, salarios: 0, mod: 0, horasMes: 0 };
    cur.headcount += 1;
    cur.salarios += num(row[iSal]);
    cur.mod += num(row[iCet]); // CET = MOD real (folha + encargos + benefícios)
    map.set(g.nome, cur);
  }

  // Fábrica primeiro (maior CET no topo), depois Montagem externa, depois ADM.
  const ordem = (s) => (s.empresa === "Fábrica" ? 0 : s.empresa === "Externa" ? 1 : 2);
  const setores = [...map.values()]
    // ADM = overhead (não fatura hora); fábrica e montagem externa faturam.
    .map((s) => ({ nome: s.nome, empresa: s.empresa, faturaHora: s.empresa !== "ADM", headcount: s.headcount, salarios: Math.round(s.salarios), mod: Math.round(s.mod), horasMes: 0, cifDireto: 0 }))
    .sort((a, b) => ordem(a) - ordem(b) || b.mod - a.mod);
  const cetTotal = setores.reduce((a, s) => a + s.mod, 0);
  return { setores, cetTotal };
}
