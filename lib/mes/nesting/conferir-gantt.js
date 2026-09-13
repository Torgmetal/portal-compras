// ─── O NESTING DO DIA CONTRA O QUE O PCP LIBEROU ─────────────────────────────
//
// Matheus (13/09/2026): *"o planejamento vai subir no Gantt as marcas que estão liberadas para
// produzir naquela máquina; a ideia é BATER o nesting do dia com o que está programado no Gantt"*.
//
// São duas listas feitas por duas pessoas diferentes, para o mesmo dia e a mesma máquina: o PCP diz
// **o que pode ser produzido**, o programador diz **o que vai ser cortado**. Elas deveriam ser a
// mesma; quando não são, alguém tem trabalho parado ou material cortado sem liberação.
//
// ⚠⚠ ESTA CONFERÊNCIA NÃO BLOQUEIA NADA, E ISSO É DECISÃO. A fábrica não pode parar porque duas
// telas discordam — o nesting já foi programado, a chapa já está na máquina. Ela INFORMA, e quem
// decide é quem está lá. Bloquear faria o operador contornar por fora, e aí ninguém mais sabe.
//
// ⚠ A COMPARAÇÃO É POR (OBRA, MARCA), NUNCA SÓ MARCA. `T97A16` existe na 097 e na 102; comparando
// só pela marca, uma obra "explicaria" a outra e a divergência sumiria.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");

/**
 * ⚠ A obra tem 90 grafias no banco ("89", "089", "T89A", "T89C" são a mesma OP-89) — o problema
 * multi-chave documentado no CLAUDE.md. Por isso a chave usa só os dígitos.
 */
export const chaveDaPeca = (opNumero, marca) =>
  `${soDigitos(opNumero) || "?"}|${String(marca ?? "").trim().toUpperCase()}`;

const doPlano = (unidades = []) => {
  const mapa = new Map();
  for (const u of unidades) {
    for (const i of u.itens || []) {
      const chave = chaveDaPeca(i.opNumero, i.marca);
      const atual = mapa.get(chave);
      if (atual) { atual.qtd += i.qtd || 0; atual.unidades.push(u.indice); }
      else mapa.set(chave, { marca: i.marca, opNumero: i.opNumero, qtd: i.qtd || 0, unidades: [u.indice] });
    }
  }
  return mapa;
};

const doGantt = (lotes = []) => {
  const mapa = new Map();
  for (const lote of lotes) {
    for (const m of lote.marcas || []) {
      mapa.set(chaveDaPeca(lote.opNumero, m.marca), {
        marca: m.marca, opNumero: lote.opNumero, qte: m.qte || 0, feitas: m.feitas || 0,
        concluida: Boolean(m.concluida),
      });
    }
  }
  return mapa;
};

/**
 * @param {{itens:{marca:string,opNumero:string|null,qtd:number}[],indice:number}[]} unidades do plano
 * @param {{opNumero:string,marcas:{marca:string,qte:number,feitas:number,concluida:boolean}[]}[]} lotes do Gantt
 */
export function conferirComGantt(unidades, lotes) {
  const plano = doPlano(unidades);
  const gantt = doGantt(lotes);

  const casadas = [];
  const foraDoGantt = [];
  for (const [chave, p] of plano) {
    const g = gantt.get(chave);
    if (!g) { foraDoGantt.push(p); continue; }
    casadas.push({
      ...p, qte: g.qte, feitas: g.feitas, concluida: g.concluida,
      // ⚠ O plano pode cortar MAIS do que o PCP liberou (aproveitamento de chapa) — é legítimo e
      // comum, mas quem confere precisa ver, porque o excedente não tem para onde ir na obra.
      aMais: Math.max(0, p.qtd - g.qte),
    });
  }

  const noPlano = new Set(plano.keys());
  const semNesting = [...gantt].filter(([c, g]) => !noPlano.has(c) && !g.concluida).map(([, g]) => g);

  return { casadas, foraDoGantt, semNesting, resumo: resumo(casadas, foraDoGantt, semNesting) };
}

/**
 * ⚠ "Em dia" quer dizer que as duas listas falam da mesma coisa — não que a produção está em dia.
 * Marca liberada e já concluída não entra em `semNesting`: ela não é trabalho pendente.
 */
function resumo(casadas, foraDoGantt, semNesting) {
  return {
    casadas: casadas.length,
    foraDoGantt: foraDoGantt.length,
    semNesting: semNesting.length,
    aMais: casadas.filter((c) => c.aMais > 0).length,
    bate: foraDoGantt.length === 0 && semNesting.length === 0,
  };
}
