// Utils pra trabalhar com semanas ISO no painel de produção.

export function isoWeekString(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Retorna a segunda-feira da semana ISO
export function semanaInicio(yyyy, ww) {
  const simple = new Date(Date.UTC(yyyy, 0, 1 + (ww - 1) * 7));
  const dayOfWeek = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
  if (dayOfWeek <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return ISOweekStart;
}

export function semanaFim(yyyy, ww) {
  const inicio = semanaInicio(yyyy, ww);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return fim;
}

export function parseSemana(s) {
  const m = String(s).match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  return { ano: Number(m[1]), semana: Number(m[2]) };
}

// Gera as ultimas N semanas a partir de hoje (incluindo a semana atual)
export function ultimasSemanas(n = 8) {
  const hoje = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i * 7);
    const semana = isoWeekString(d);
    const p = parseSemana(semana);
    if (!p) continue;
    out.push({
      semana,
      dataInicio: semanaInicio(p.ano, p.semana),
      dataFim: semanaFim(p.ano, p.semana),
    });
  }
  return out;
}

// Proximas N semanas
export function proximasSemanas(n = 8) {
  const hoje = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i * 7);
    const semana = isoWeekString(d);
    const p = parseSemana(semana);
    if (!p) continue;
    out.push({
      semana,
      dataInicio: semanaInicio(p.ano, p.semana),
      dataFim: semanaFim(p.ano, p.semana),
    });
  }
  return out;
}

export function fmtSemana(semana) {
  const p = parseSemana(semana);
  if (!p) return semana;
  const ini = semanaInicio(p.ano, p.semana);
  const fim = semanaFim(p.ano, p.semana);
  const fmtD = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${semana} (${fmtD(ini)}–${fmtD(fim)})`;
}
