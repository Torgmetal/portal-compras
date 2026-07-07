// Parser da planilha "CET Auditoria" (Custo Efetivo Total — CLT). Lê a aba
// "Custo Efetivo" (1 colaborador/linha) e AGREGA por setor+empresa: headcount,
// salário base, CET (custo efetivo total real, já com encargos+benefícios) e
// horas efetivas (Previstas − Ausência). Vira a base do custo-hora por setor.
import * as XLSX from "xlsx";

const norm = (s) => String(s ?? "").trim();
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
// As colunas de horas do CET vêm em horas decimais (ex.: 184.8). Aceita também
// "HH:MM" por segurança.
function horas(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const m = /^(\d+):(\d{2})/.exec(String(v));
  return m ? Number(m[1]) + Number(m[2]) / 60 : num(v);
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
  const iSetor = idx("Setor"), iEmp = idx("Contratante"), iStatus = idx("Status");
  const iSal = idx("Salário Base"), iCet = idx("Custo Efetivo Total");
  const iPrev = header.findIndex((h) => /Horas Previstas/i.test(h));
  const iAus = header.findIndex((h) => /Horas de Aus[êe]ncia/i.test(h));

  const map = new Map();
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const setor = norm(row[iSetor]);
    if (!setor) continue;
    const status = norm(row[iStatus]).toLowerCase();
    if (status && status !== "ativo") continue; // só colaboradores ativos
    const emp = norm(row[iEmp]) || "—";
    const key = emp + "|" + setor;
    const cur = map.get(key) || { nome: setor, empresa: emp, headcount: 0, salarios: 0, mod: 0, horasMes: 0 };
    cur.headcount += 1;
    cur.salarios += num(row[iSal]);
    cur.mod += num(row[iCet]); // CET = MOD real (folha + encargos + benefícios)
    cur.horasMes += Math.max(0, horas(row[iPrev]) - horas(row[iAus]));
    map.set(key, cur);
  }

  const setores = [...map.values()]
    .map((s) => ({ nome: s.nome, empresa: s.empresa, headcount: s.headcount, salarios: Math.round(s.salarios), mod: Math.round(s.mod), horasMes: Math.round(s.horasMes), cifDireto: 0 }))
    .sort((a, b) => (a.empresa === b.empresa ? b.mod - a.mod : a.empresa.localeCompare(b.empresa)));
  const cetTotal = setores.reduce((a, s) => a + s.mod, 0);
  return { setores, cetTotal };
}
