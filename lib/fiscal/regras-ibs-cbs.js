// ─── AS REGRAS DE IBS/CBS QUE AS NOSSAS NOTAS JÁ USAM ────────────────────────
//
// Matheus (26/09/2026): *"puxar as regras IBS/CBS que já temos em nossa NF no Omie"*. O `ListarNF`
// traz, por item, `pAliqCbs` e `pAliqIBSUf` junto do NCM e do CFOP (conferido na NF 943: CBS 0,9 %,
// IBS UF 0,1 % — as alíquotas de teste de 2026).
//
// ⚠⚠ AUSÊNCIA NÃO É 0 %. Item sem o grupo (remessa, nota antiga) não gera regra: gravar "0 %" faria o
// simulador afirmar que a operação não tem IBS/CBS quando só não havia nota para dizer.
//
// ⚠⚠ DIVERGÊNCIA NÃO SE RESOLVE AQUI. Alíquotas diferentes para o mesmo NCM × CFOP ficam em linhas
// separadas; quem lê vê as duas com as notas de cada uma. Escolher uma seria inventar regra.
//
// ⚠ Sem UF: o `ListarNF` não traz a UF do destinatário. Em 2026 a alíquota é a mesma para todo
// destino; a partir de 2027 o IBS é do DESTINO e a chave vai precisar dela.

const dig = (v) => String(v ?? "").replace(/\D/g, "");
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const iso = (br) => {
  const [d, m, a] = String(br ?? "").split("/");
  return a ? `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null;
};

/** As observações de IBS/CBS de uma NF do `ListarNF`, um item por linha (puro). */
export function extrairRegrasDaNf(nf) {
  const nfNum = String(Number(dig(nf?.ide?.nNF)) || "");
  const emitidaEm = iso(nf?.ide?.dEmi);
  const out = [];
  for (const d of nf?.det ?? []) {
    const p = d?.prod ?? {};
    const pCbs = num(p.pAliqCbs);
    const pIbsUf = num(p.pAliqIBSUf);
    if (!(pCbs > 0) && !(pIbsUf > 0)) continue;
    const ncm = dig(p.NCM);
    const cfop = dig(p.CFOP);
    if (ncm.length !== 8 || cfop.length !== 4) continue;
    out.push({ ncm, cfop, pCbs: pCbs ?? 0, pIbsUf: pIbsUf ?? 0, nf: nfNum, emitidaEm });
  }
  return out;
}

/** Uma linha por NCM × CFOP × alíquotas, com quantas NOTAS (não itens) usaram e a primeira/última. */
export function agruparRegras(observacoes) {
  const mapa = new Map();
  for (const o of observacoes ?? []) {
    const chave = [o.ncm, o.cfop, o.pCbs, o.pIbsUf].join("|");
    let g = mapa.get(chave);
    if (!g) {
      g = { ncm: o.ncm, cfop: o.cfop, pCbs: o.pCbs, pIbsUf: o.pIbsUf, notas: new Set(),
        primeiraNf: o.nf, primeiraEm: o.emitidaEm, ultimaNf: o.nf, ultimaEm: o.emitidaEm };
      mapa.set(chave, g);
    }
    g.notas.add(o.nf);
    if (o.emitidaEm < g.primeiraEm) { g.primeiraEm = o.emitidaEm; g.primeiraNf = o.nf; }
    if (o.emitidaEm > g.ultimaEm) { g.ultimaEm = o.emitidaEm; g.ultimaNf = o.nf; }
  }
  return [...mapa.values()].map(({ notas, ...g }) => ({ ...g, qtdNotas: notas.size }));
}

/** Como ler as linhas de um NCM × CFOP: nenhuma nota, uma regra só, ou notas que discordam. */
export function situacaoDaRegra(linhas) {
  const l = linhas ?? [];
  return { situacao: l.length === 0 ? "SEM_NF" : l.length === 1 ? "UNICA" : "DIVERGENTE", linhas: l };
}
