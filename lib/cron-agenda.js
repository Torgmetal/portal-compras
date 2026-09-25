import "server-only";
import vercel from "@/vercel.json";

// ─── A TOLERÂNCIA VEM DA AGENDA, NÃO DE UM NÚMERO ESCRITO À MÃO ──────────────
//
// ⚠⚠ DOIS DOS CINCO ALERTAS DE 13/09/2026 ERAM FALSOS, e os dois pela mesma causa: o monitor
// guardava um `maxHoras` fixo por cron, escrito quando a agenda era outra.
//   · `rnc-abertas` roda "0 8 * * 1-5" (só dias úteis) com limite de 30h — de sexta 08:00 a segunda
//     08:00 vão 72h, então ele aparecia como problema TODO DOMINGO, desde sempre.
//   · `data-book` virou "15 10-21 * * 1-5" em 11/09 (Vitor, para a compute do Neon dormir de
//     madrugada) e ninguém mexeu no limite de 2h — a maior folga real passou a ser 61h.
//
// Alarme falso recorrente não é um incômodo: é o que ensina quem recebe a arquivar o e-mail sem
// ler. No dia em que o alerta for verdadeiro, ninguém abre.
//
// Por isso a tolerância passa a ser DERIVADA do `vercel.json`: mudou a agenda, o limite muda junto.

/** Expande um campo do cron ("*", "6-20", "1,3", "*\/5") no conjunto de valores que ele casa. */
export function expandirCampo(expr, min, max) {
  const out = new Set();
  for (const parte of String(expr).split(",")) {
    const [faixa, passoTxt] = parte.split("/");
    const passo = Number(passoTxt) || 1;
    let de = min, ate = max;
    if (faixa !== "*") {
      const [a, b] = faixa.split("-");
      de = Number(a);
      ate = b === undefined ? (passoTxt ? max : Number(a)) : Number(b);
    }
    for (let v = de; v <= ate; v += passo) if (v >= min && v <= max) out.add(v);
  }
  return out;
}

/**
 * O MAIOR intervalo, em horas, entre dois disparos consecutivos da agenda.
 *
 * ⚠ Varre 8 semanas de calendário em vez de fazer conta fechada: as expressões reais do portal
 * misturam faixa de hora com dia da semana ("15 10-21 * * 1-5"), e o buraco que interessa é o do
 * fim de semana — que só aparece quando se olha o calendário andando.
 *
 * ⚠ Dia do mês não é considerado: nenhum cron do portal usa, e suportar as duas colunas (que no
 * cron se combinam por OU, não por E) custaria mais do que vale.
 */
export function maiorIntervaloHoras(expressao) {
  const [m, h, , , dw] = String(expressao).trim().split(/\s+/);
  const minutos = expandirCampo(m, 0, 59);
  const horas = expandirCampo(h, 0, 23);
  const diasSemana = expandirCampo(dw, 0, 7);
  const inicio = Date.UTC(2026, 0, 5); // uma segunda-feira, para a varredura começar alinhada
  let anterior = null, maior = 0;
  for (let i = 0; i < 8 * 7 * 24 * 60; i++) {
    const t = inicio + i * 60_000;
    const d = new Date(t);
    if (!minutos.has(d.getUTCMinutes()) || !horas.has(d.getUTCHours())) continue;
    const dia = d.getUTCDay();
    if (!diasSemana.has(dia) && !(dia === 0 && diasSemana.has(7))) continue;
    if (anterior !== null) maior = Math.max(maior, (t - anterior) / 36e5);
    anterior = t;
  }
  return maior;
}

/**
 * Quantas horas sem sucesso são aceitáveis para esta agenda.
 *
 * ⚠ A FOLGA É PROPORCIONAL, com piso. Uma execução perdida não pode disparar alerta (a Vercel
 * atrasa, o Neon acorda devagar), mas duas seguidas precisam — daí ~1,5×. O piso de 2h protege os
 * crons de alta frequência, onde 25% de uma hora não daria nem para uma tentativa.
 */
export function toleranciaDe(expressao) {
  const gap = maiorIntervaloHoras(expressao);
  if (!gap) return null;
  return Math.ceil(gap + Math.max(2, gap * 0.5));
}

/** O que o `vercel.json` agenda hoje: caminho → expressão. */
export const AGENDA = new Map((vercel.crons || []).map((c) => [c.path, c.schedule]));

/** A tolerância do cron que serve este caminho, ou `null` quando ele não está agendado. */
export const toleranciaDoPath = (path) => {
  const sched = AGENDA.get(path);
  return sched ? toleranciaDe(sched) : null;
};

/**
 * A agenda (em UTC) dita em português, no horário de Brasília — para a tela dizer quando o cron roda.
 *
 * ⚠⚠ EXISTE PELO MESMO MOTIVO DA TOLERÂNCIA ACIMA: o rodapé do Estoque dizia "diariamente às 06:00",
 * texto escrito à mão quando a agenda era outra — e ela é de hora em hora, com 06:00 UTC = 03:00 em
 * Brasília. Derivado da agenda, não há o que esquecer de atualizar.
 *
 * ⚠ Só descreve as formas que o portal usa ("M H * * *" e "M H1-H2 * * *"); o resto sai CRU, marcado
 * UTC — frase bonita e errada é pior que a expressão. Brasília é UTC−3 fixo (sem horário de verão
 * desde 2019); faixa que viraria a meia-noite na conversão também sai crua.
 */
export function descreverAgenda(expressao) {
  if (!expressao) return null;
  const cru = `agenda "${expressao}" (UTC)`;
  const m = /^(\d{1,2}) (\d{1,2})(?:-(\d{1,2}))? \* \* \*$/.exec(String(expressao).trim());
  if (!m) return cru;
  const minuto = Number(m[1]);
  const de = Number(m[2]) - 3;
  const ate = m[3] === undefined ? null : Number(m[3]) - 3;
  if (minuto > 59 || de < 0 || (ate !== null && (ate < de || ate > 20))) return cru;
  const hora = (h) => `${h}h${minuto ? String(minuto).padStart(2, "0") : ""}`;
  return ate === null ? `todo dia às ${hora(de)}` : `de hora em hora, das ${hora(de)} às ${hora(ate)}`;
}
