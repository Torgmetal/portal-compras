// ─── AVANÇO DE FABRICAÇÃO MEDIDO PELA LISTA DE PEÇAS DA FASE ─────────────────────────────────
//
// Vitor (20/09/2026), OP-105: "vamos precisar dividir essas partes B no cronograma, pois o cliente
// pediu (…) deixar o percentual exatamente como está o apontamento" e, sobre as treliças, "vamos ter
// que deixar as treliças como A mas você vai ter que dividir por TAG".
//
// ⚠⚠ POR QUE A LETRA NÃO BASTA. O motor do Syneco (lib/cronograma-syneco.js) casa produção e escopo
// pela LETRA da frente — "T105A-P34" → A, área "… (A)". Na OP-105 isso quebra dos dois lados: a
// fase B são DUAS entregas (Quadros Vasadores e Longarinas) com a mesma letra, e a fase A são DUAS
// treliças (TC 4706 e TC 4707) feitas das MESMAS marcas, metade em cada — a 105A14 são 34 na LPC,
// 17 em cada TAG. Nenhuma letra separa isso; só uma lista dizendo quais marcas, e quantas, entram
// em cada fase.
//
// A lista é a `PecaLote` (a "lista da fase" do lote de expedição). Quando a OP tem essa lista, o
// avanço da área do cronograma com o nome do lote passa a ser medido por ela. OP sem lista continua
// pela letra — nada muda para as outras obras.
//
// ⚠⚠ MARCA REPARTIDA ENTRE FASES: O PRODUZIDO PREENCHE AS FASES NA ORDEM DE ENTREGA. O apontamento
// do Syneco é por marca; ninguém registra se as 17 peças cortadas da 105A14 são da 4706 ou da
// 4707. Regra combinada com o Vitor (20/09/2026): o que foi produzido vai primeiro para a fase de
// menor `ordem` (a TC 4706); a 4707 só começa a andar quando a 4706 completa aquela marca. É como o
// cliente lê ("a primeira treliça está pronta") — e é uma REGRA, não medição direta: quem apresenta
// precisa dizer isso.
//
// ⚠ CROQUI SEGUE O CONJUNTO. A lista do cliente traz conjuntos e avulsas; os croquis (sub-peças que
// só passam pelo corte) entram pelo vínculo croqui→conjunto da LPC, na proporção do conjunto que
// está na fase. Assim a Preparação da TC 4706 mede o corte das sub-peças DELA, não da obra inteira.
//
// ⚠⚠ `ConjuntoCroqui.qtdNoConjunto` É O TOTAL DO CROQUI NAQUELE CONJUNTO, NÃO POR UNIDADE. Medido na
// T105A (20/09/2026): em 133 de 135 croquis, `croqui.qte` = Σ qtdNoConjunto dos seus vínculos — a
// 105A-P3 tem qtdNoConjunto 68 no conjunto 105A14 (×34), ou seja, 2 por unidade. Tratar como "por
// unidade" multiplicava o escopo de corte por 34, a fase de menor ordem engolia tudo e a outra
// ficava com o resto (23.174 kg × 3.854 kg para duas treliças iguais). Por unidade é
// qtdNoConjunto ÷ qte do conjunto.
//
// Escopo por setor segue a regra do motor (Vitor 06/08): CORTE = croquis + avulsas; MONTAGEM, SOLDA,
// PINTURA, JATO e ACABAMENTO = os conjuntos.
//
// Sem dependência de banco de propósito: é a regra que decide o número que vai ao cliente, e regra
// assim tem de poder ser conferida fora do servidor (ver testes/lib/cronograma-lotes.teste.js).

export const SETORES_FABRICACAO = ["CORTE", "MONTAGEM", "SOLDA", "PINTURA", "JATO", "ACABAMENTO"];

/** Nome de lote/área comparável: sem acento, sem espaço duplicado, sem caixa. */
export const chaveNomeLote = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const pct = (n, d) => (d > 0 ? Math.min(100, Math.round((n / d) * 1000) / 10) : null);
const arred = (n) => Math.round(n);

/**
 * Calcula o avanço por fase (lote) × setor.
 *
 * @param {object} p
 * @param {{id:string, nome:string, ordem:number, pecas:{marca:string, qtd:number}[]}[]} p.lotes
 *   lotes da OP com a lista de peças; os sem peças são ignorados
 * @param {{marca:string, tipoPeca:string|null, qte:number, pesoTotalKg:number,
 *          croquis?:{marca:string, qtdNoConjunto:number}[]}[]} p.pecas  linhas da LPC da OP
 * @param {{marca:string, setor:string, un:number, kg:number, data:Date|null}[]} p.apontamentos
 *   baixas do Syneco, setor já normalizado (CORTE, MONTAGEM, …)
 * @returns {Map<string, {id:string, nome:string, porSetor:Object<string,{escopoKg:number, produzidoKg:number,
 *   realizado:number|null, dataInicioReal:Date|null, baixas:{data:Date|null, kg:number}[]}>,
 *   semLpc:string[]}>} por id do lote — só os lotes que têm lista
 */
export function avancoPorLote({ lotes, pecas, apontamentos }) {
  const out = new Map();
  const comLista = (lotes || []).filter((l) => Array.isArray(l.pecas) && l.pecas.length)
    .slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  if (!comLista.length) return out;

  // ⚠ marca repetida na LPC (sub-obras diferentes, mesma marca) soma como uma peça só: a lista do
  // cliente nomeia a marca e não tem como apontar qual das duas quis dizer.
  const lpc = new Map();
  for (const p of pecas || []) {
    const m = String(p.marca || "").trim();
    if (!m) continue;
    const e = lpc.get(m) || { marca: m, tipoPeca: p.tipoPeca || null, qte: 0, kg: 0, croquis: [] };
    e.qte += Number(p.qte) || 0;
    e.kg += Number(p.pesoTotalKg) || 0;
    if (p.tipoPeca === "CONJUNTO") e.tipoPeca = "CONJUNTO";
    for (const c of p.croquis || []) e.croquis.push({ marca: String(c.marca || "").trim(), qtdNoConjunto: Number(c.qtdNoConjunto) || 1 });
    lpc.set(m, e);
  }
  const pesoUnit = (m) => { const e = lpc.get(m); return e && e.qte > 0 ? e.kg / e.qte : 0; };

  // ── cotas: quantas unidades de cada marca pertencem a cada lote, por campo (corte | conjunto) ──
  const cota = new Map(); // loteId -> Map marca -> { corte, conjunto }
  const somaCota = new Map(); // marca -> { corte, conjunto } (para não passar da LPC)
  const dar = (loteId, marca, campo, un) => {
    if (!(un > 0)) return;
    const e = lpc.get(marca); if (!e) return;
    const total = somaCota.get(marca) || { corte: 0, conjunto: 0 };
    const cabe = Math.max(0, Math.min(un, e.qte - total[campo])); // teto: a LPC
    if (!(cabe > 0)) return;
    total[campo] += cabe; somaCota.set(marca, total);
    const porMarca = cota.get(loteId) || new Map(); cota.set(loteId, porMarca);
    const q = porMarca.get(marca) || { corte: 0, conjunto: 0 }; q[campo] += cabe; porMarca.set(marca, q);
  };
  for (const l of comLista) {
    const semLpc = [];
    for (const it of l.pecas) {
      const marca = String(it.marca || "").trim();
      const e = lpc.get(marca);
      if (!e) { semLpc.push(marca); continue; }
      const un = Math.min(Number(it.qtd) || 0, e.qte);
      if (e.tipoPeca === "CONJUNTO") {
        dar(l.id, marca, "conjunto", un);
        for (const c of e.croquis) dar(l.id, c.marca, "corte", e.qte > 0 ? (c.qtdNoConjunto / e.qte) * un : 0);
      } else {
        dar(l.id, marca, "corte", un); // avulsa ou croqui listado direto: só corte
      }
    }
    out.set(l.id, { id: l.id, nome: l.nome, porSetor: {}, semLpc });
  }

  // ── produção do Syneco por marca × setor ──
  const prod = new Map(); // "marca|SETOR" -> { un, kg, baixas }
  for (const a of apontamentos || []) {
    const marca = String(a.marca || "").trim(); const setor = a.setor;
    if (!marca || !setor || !lpc.has(marca)) continue;
    const pu = pesoUnit(marca);
    const un = Number(a.un) > 0 ? Number(a.un) : pu > 0 ? (Number(a.kg) || 0) / pu : 0;
    const k = `${marca}|${setor}`;
    const e = prod.get(k) || { un: 0, kg: 0, baixas: [] };
    e.un += un; e.kg += Number(a.kg) || 0;
    e.baixas.push({ data: a.data || null, kg: Number(a.kg) || 0 });
    prod.set(k, e);
  }

  // ── escopo e alocação, lote a lote, na ordem de entrega ──
  const restante = new Map(); // "marca|SETOR" -> unidades ainda não atribuídas a nenhum lote
  for (const [k, e] of prod) restante.set(k, Math.min(e.un, lpc.get(k.split("|")[0]).qte));
  for (const l of comLista) {
    const porMarca = cota.get(l.id) || new Map();
    const res = out.get(l.id);
    for (const setor of SETORES_FABRICACAO) {
      const campo = setor === "CORTE" ? "corte" : "conjunto";
      let escopo = 0, produzido = 0, ini = null; const baixas = [];
      for (const [marca, q] of porMarca) {
        const un = q[campo]; if (!(un > 0)) continue;
        const pu = pesoUnit(marca);
        escopo += un * pu;
        const k = `${marca}|${setor}`;
        const p = prod.get(k); if (!p) continue;
        const sobra = restante.get(k) || 0;
        const dado = Math.min(sobra, un);
        if (!(dado > 0)) continue;
        restante.set(k, sobra - dado);
        produzido += dado * pu;
        const parte = p.un > 0 ? dado / p.un : 0; // fatia do histórico desta marca que cabe a este lote
        for (const b of p.baixas) {
          if (b.data && (!ini || b.data < ini)) ini = b.data;
          if (b.kg) baixas.push({ data: b.data, kg: b.kg * parte });
        }
      }
      if (escopo > 0 || produzido > 0) {
        res.porSetor[setor] = {
          escopoKg: arred(escopo), produzidoKg: arred(produzido), realizado: pct(produzido, escopo),
          dataInicioReal: ini,
          baixas: baixas.sort((a, b) => ((a.data || 0) > (b.data || 0) ? 1 : -1)).map((b) => ({ data: b.data, kg: arred(b.kg) })),
        };
      }
    }
  }
  return out;
}
