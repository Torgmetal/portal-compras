// ─── O NESTING DO DIA CONTRA O QUE O PCP LIBEROU ─────────────────────────────
//
// Matheus (13/09/2026): *"o planejamento vai subir no Gantt as marcas que estão liberadas para
// produzir naquela máquina; a ideia é BATER o nesting do dia com o que está programado no Gantt"*.
//
// ⚠⚠ A COMPARAÇÃO É DIRECIONAL: **do plano para a liberação**, nunca igualdade de conjuntos.
// Achado do Codex (13/09/2026), depois de eu medir no laboratório e a tela acusar **432 marcas
// "liberadas e fora do plano"**. A causa está escrita em `lib/mes/programado.js`: a fila da máquina
// é o BACKLOG (`lte fimDoDia`, de propósito — atrasado continua sendo trabalho), não o dia. Estar
// liberado NÃO significa ter de entrar neste nesting: o programador escolhe o que cabe na chapa,
// na espessura e no material daquele plano. Cobrar as 432 seria alarme falso — e alarme falso em
// ferramenta de alarme ensina a ignorar a tarja, erro que este projeto já pagou no import de listas.
//
// O que é divergência de verdade: **marca no plano que o PCP não liberou** (material saindo da
// chapa sem destino na obra) e **plano cortando mais do que o saldo liberado**.
//
// ⚠⚠ ESTA CONFERÊNCIA NÃO BLOQUEIA NADA. O nesting já foi feito e a chapa já está na máquina — a
// fábrica não pode parar porque duas telas discordam. Ela informa; quem decide é quem está lá.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");

/**
 * ⚠ A obra tem 90 grafias no banco ("89", "089", "T89A", "T89C" são a mesma OP-89) — o problema
 * multi-chave documentado no CLAUDE.md. Por isso a chave usa só os dígitos.
 *
 * ⚠⚠ SEM OBRA NÃO EXISTE CHAVE. Antes eu devolvia `?|MARCA`, e duas peças de obras desconhecidas
 * casavam entre si — casamento inventado, que é o erro que a conferência existe para evitar
 * (achado do Codex). Item sem obra vira ambiguidade declarada.
 */
export function chaveDaPeca(opNumero, marca) {
  const obra = soDigitos(opNumero);
  const m = String(marca ?? "").trim().toUpperCase();
  return obra && m ? `${obra}|${m}` : null;
}

function doPlano(unidades = []) {
  const mapa = new Map();
  const semObra = [];
  for (const u of unidades) {
    for (const i of u.itens || []) {
      const chave = chaveDaPeca(i.opNumero, i.marca);
      if (!chave) { semObra.push({ marca: i.marca, qtd: i.qtd || 0, unidade: u.indice }); continue; }
      const atual = mapa.get(chave);
      if (atual) { atual.qtd += i.qtd || 0; atual.unidades.push(u.indice); }
      else mapa.set(chave, { marca: i.marca, opNumero: i.opNumero, qtd: i.qtd || 0, unidades: [u.indice] });
    }
  }
  return { mapa, semObra };
}

/** ⚠ SOMA, não sobrescreve: com a queda para o setor (§14.1) a mesma marca chega por lotes
 *  diferentes, e o último venceria — a liberação apareceria menor do que é. */
function doGantt(lotes = []) {
  const mapa = new Map();
  for (const lote of lotes) {
    for (const m of lote.marcas || []) {
      const chave = chaveDaPeca(lote.opNumero, m.marca);
      if (!chave) continue;
      const atual = mapa.get(chave) || { marca: m.marca, opNumero: lote.opNumero, qte: 0, feitas: 0 };
      atual.qte += m.qte || 0;
      atual.feitas += m.feitas || 0;
      mapa.set(chave, atual);
    }
  }
  for (const g of mapa.values()) {
    g.saldo = Math.max(0, g.qte - g.feitas);
    g.concluida = g.qte > 0 && g.feitas >= g.qte;
  }
  return mapa;
}

/**
 * @param {{itens:{marca:string,opNumero:string|null,qtd:number}[],indice:number}[]} unidades do plano
 * @param {{opNumero:string,marcas:{marca:string,qte:number,feitas:number}[]}[]} lotes do Gantt
 */
export function conferirComGantt(unidades, lotes) {
  const { mapa: plano, semObra } = doPlano(unidades);
  const gantt = doGantt(lotes);

  const liberadas = [];
  const semLiberacao = [];
  for (const [chave, p] of plano) {
    const g = gantt.get(chave);
    if (!g) { semLiberacao.push(p); continue; }
    // ⚠ Compara com o SALDO, não com o total: parte da marca pode já ter sido produzida, e medir
    // contra o total faria a produção de ontem parecer folga de hoje (achado do Codex).
    liberadas.push({ ...p, qte: g.qte, feitas: g.feitas, saldo: g.saldo, aMais: Math.max(0, p.qtd - g.saldo) });
  }

  // ⚠ INFORMATIVO, NÃO DIVERGÊNCIA: a fila da máquina é o backlog inteiro, e nada obriga este
  // plano a cobri-la. Fica disponível para quem quiser ver o que mais está esperando, e NÃO entra
  // no veredito.
  const noPlano = new Set(plano.keys());
  const naFila = [...gantt].filter(([c, g]) => !noPlano.has(c) && !g.concluida).map(([, g]) => g);

  return { liberadas, semLiberacao, semObra, naFila, resumo: resumo(liberadas, semLiberacao, semObra, naFila) };
}

function resumo(liberadas, semLiberacao, semObra, naFila) {
  const aMais = liberadas.filter((c) => c.aMais > 0).length;
  return {
    liberadas: liberadas.length,
    semLiberacao: semLiberacao.length,
    semObra: semObra.length,
    naFila: naFila.length,
    aMais,
    // ⚠ O veredito só olha o que é problema do PLANO. `naFila` fora, de propósito.
    bate: semLiberacao.length === 0 && semObra.length === 0 && aMais === 0,
  };
}
