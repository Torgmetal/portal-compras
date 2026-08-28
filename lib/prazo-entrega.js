// Cálculo da Previsão de Entrega do pedido de compra a partir do "Prazo de entrega"
// que o fornecedor preencheu na proposta (ex.: "15 dias úteis", "20 dias corridos",
// "2 semanas", ou uma data). A base é o dia em que a RM foi ganha/aprovada (geração
// do pedido). Dias úteis pulam sábado/domingo.

/** Pega "Prazo de entrega: X" de dentro da observação combinada da cotação. */
export function extrairPrazoEntrega(observacao) {
  const s = String(observacao || "");
  for (const p of s.split("|")) {
    const m = p.match(/Prazo\s+de\s+entrega:\s*(.+)/i);
    if (m) return m[1].trim();
  }
  return "";
}

/** "15 dias úteis" → {dias:15, uteis:true}; "20 dias"/"corridos" → {dias:20, uteis:false};
 *  "2 semanas" → {dias:14, uteis:false}. Retorna null se não achar número. */
export function parsePrazoEntrega(texto) {
  const t = String(texto || "").toLowerCase();
  const sem = t.match(/(\d+)\s*semana/);
  if (sem) return { dias: parseInt(sem[1], 10) * 7, uteis: false };
  const m = t.match(/(\d+)/);
  if (!m) return null;
  const dias = parseInt(m[1], 10);
  if (!dias || Number.isNaN(dias)) return null;
  const uteis = /[úu]te(l|is)/.test(t); // útil / úteis / uteis
  return { dias, uteis };
}

/** Soma N dias úteis (pula fim de semana) a uma data. */
export function addDiasUteis(base, n) {
  const d = new Date(base);
  let add = 0;
  while (add < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) add++;
  }
  return d;
}

/** Data de entrega a partir da base + texto do prazo. Aceita também data explícita
 *  (aaaa-mm-dd ou dd/mm/aaaa). Retorna Date (meio-dia UTC) ou null. */
export function calcularDataEntrega(base, texto) {
  const t = String(texto || "").trim();
  if (!t) return null;
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12));
  const br = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1], 12));
  const p = parsePrazoEntrega(t);
  if (!p) return null;
  const b = new Date(base);
  const d0 = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 12));
  if (p.uteis) return addDiasUteis(d0, p.dias);
  d0.setUTCDate(d0.getUTCDate() + p.dias);
  return d0;
}

/** Date → "DD/MM/AAAA" (formato que o Omie espera em dDtPrevisao). */
export function ddmmyyyy(d) {
  if (!d) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Atalho: da observação da cotação + base → string DD/MM/AAAA (ou null). */
export function previsaoEntregaDDMMYYYY(observacao, base = new Date()) {
  const texto = extrairPrazoEntrega(observacao);
  const data = calcularDataEntrega(base, texto);
  return data ? ddmmyyyy(data) : null;
}
