// Arranjo das cargas: várias ordens de entrada no empacotador, fica a que dá menos viagens e menor
// frete; cada carga é remontada no MENOR veículo em que couber inteira.
import { FRETE, MEDIDAS, ORDEM_VEIC } from "./premissas";
import { area, empacotar, fotografar, restaurar } from "./empacotar";
import { ehDelicadoPlano } from "./classificar";

const familia = (u) => (u.tipo === "PECA" ? `z${u.desc || ""}` : u.rotulo.replace(/~.*$/, ""));
const exigePiso = u => !!(u.soChao || (u.baseEmV && u.almaVertical !== false) || u.tipo === "PALLET");
const ESTRATEGIAS = {
  pisoReservado: (a,b) => Number(exigePiso(b))-Number(exigePiso(a)) || (a.classe-b.classe) || (area(b)-area(a)) || (b.kg-a.kg),
  base: (a, b) => (a.classe - b.classe) || (area(b) - area(a)) || (b.kg - a.kg) || familia(a).localeCompare(familia(b)),
  comprimento: (a, b) => (a.classe - b.classe) || (b.C - a.C) || (b.kg - a.kg),
  peso: (a, b) => (a.classe - b.classe) || (b.kg - a.kg) || (area(b) - area(a)),
  familia: (a, b) => (a.classe - b.classe) || familia(a).localeCompare(familia(b)) || (b.C - a.C),
  largura: (a, b) => (a.classe - b.classe) || (b.L - a.L) || (b.C - a.C), // peça larga (pórtico, painel) é a mais difícil de encaixar: vai primeiro
  // delicado entre o pesado e o miúdo: o guarda-corpo sobe nas vigas enquanto o topo ainda está livre, e os pacotes leves fecham em volta
  delicadoMeio: (a, b) => (meio(a) - meio(b)) || (area(b) - area(a)) || (b.kg - a.kg),
  pesoPuro: (a, b) => (b.kg - a.kg) || (b.C - a.C),
};
function meio(u) { return u.classe === 3 ? 1.5 : u.classe; }
const ordemSequencia = (a, b) => (a.nivel - b.nivel) || (a.tipoSeq - b.tipoSeq) || (a.classe - b.classe) || (area(b) - area(a)) || (b.kg - a.kg);
const ordemSequenciaComp = (a, b) => (a.nivel - b.nivel) || (a.tipoSeq - b.tipoSeq) || (a.classe - b.classe) || (b.C - a.C) || (area(b) - area(a)) || (b.kg - a.kg);
// grupo de grades: maior painel embaixo (área, depois peso); o nível da obra só desempata
const ordemGrades = (a, b) => (area(b) - area(a)) || (b.kg - a.kg) || (a.nivel - b.nivel);
const ordemGradesComp = (a, b) => (b.C - a.C) || (area(b) - area(a)) || (b.kg - a.kg);

const freteDe = (ctx, k) => (ctx.frete || FRETE)[k];

// a carga montada na carreta é remontada no MENOR veículo em que couber inteira (frete menor)
function menorVeiculo(carga, perfil, ctx, ordem, pref) {
  const itens = ordem.filter((u) => carga.itens.includes(u)), pilha = carga.itens.filter((u) => u.pilha);
  if (carga.veicKey === "carreta14") return carga;
  for (const k of ORDEM_VEIC) { if (freteDe(ctx, k) >= freteDe(ctx, carga.veicKey)) break; const v = ctx.veiculos[k]; if (!v) continue;
    if (carga.peso > v.pesoMax) continue;
    const FOLGA = 60;
    if (carga.itens.some((u) => u.A > v.alturaUtil || (!(u.C + FOLGA <= v.C && u.L + FOLGA <= v.L) && !(u.L + FOLGA <= v.C && u.C + FOLGA <= v.L)))) continue;
    const snap = fotografar(carga.itens);
    const cs = empacotar(itens, k, perfil, ctx, pilha, pref);
    if (cs.length === 1 && cs[0].itens.length === carga.itens.length && !carga.itens.some((u) => u.semLugar)) return cs[0];
    restaurar(snap);
  }
  return carga;
}

/** Testa as ordens de entrada e devolve o melhor arranjo: menos viagens > frete menor > menos alertas > carga mais baixa. */
export function melhorArranjo(lista, perfil, ctx, pilha, veicBase = "carreta") {
  let melhor = null;
  const avaliar = (cargas) => {
    const semLugar = lista.concat(pilha).filter((u) => u.semLugar).length;
    const frete = cargas.reduce((t, c) => t + freteDe(ctx, c.veicKey), 0);
    const alertas = cargas.reduce((t, c) => t + c.itens.filter((u) => u.sobre?.length && u.sobre.some((id) => { const b = ctx.porId.get(id); return b && u.kg > b.kg * 1.5; })).length, 0);
    const score = semLugar * 1e6 + cargas.length * 1e4 + frete * 10 + alertas * 3 + Math.max(0, ...cargas.map((c) => c.altura)) / 500;

    return {score, frete};
  };
  const estrategias = ctx.refinarOrdens || (ctx.modoGrupo === "grades" ? { "grades-area": ordemGrades, "grades-comp": ordemGradesComp }
    : ctx.sequencia ? { sequencia: ordemSequencia, "sequencia-comp": ordemSequenciaComp } : ESTRATEGIAS);
  const prefs = ctx.refinarOrdens ? ["empilhar"] : ctx.sequencia ? ["chao"] : ["chao", "empilhar"];
  // com delicados na lista, tenta também RESERVANDO no alto o espaço deles: rígidos param mais baixo e o guarda-corpo cabe em cima
  const altDelic = Math.max(0, ...lista.filter((u) => u.classe === 3 && !u.emPe).map((u) => u.A));
  const reservas = !ctx.refinarOrdens && !ctx.sequencia && ctx.modoGrupo !== "grades" && altDelic ? [0, altDelic + MEDIDAS.MADEIRA] : [0];
  for (const [nomeOrdem, cmp] of Object.entries(estrategias)) for (const pref of prefs) for (const reserva of reservas) {
    ctx.reservaTopo = reserva;
    const nome = `${nomeOrdem}/${pref}${reserva ? "/reserva" : ""}`, ordem = [...lista].sort(cmp);
    let cargas = empacotar(ordem, veicBase, perfil, ctx, pilha, pref);
    if (!ctx.sequencia && cargas.length > 1) { // 2ª tentativa: o que caiu nas cargas seguintes entra primeiro (é a peça difícil)
      const dificeis = cargas.slice(1).flatMap((c) => c.itens.filter((u) => !u.pilha)), ordem2 = dificeis.concat(ordem.filter((u) => !dificeis.includes(u)));
      const snap = fotografar(lista.concat(pilha)), cargas2 = empacotar(ordem2, veicBase, perfil, ctx, pilha, pref);
      if (cargas2.length < cargas.length) { cargas = cargas2; ordem.splice(0, ordem.length, ...ordem2); } else restaurar(snap); }
    cargas = cargas.map((c) => menorVeiculo(c, perfil, ctx, ordem, pref));
    const {score, frete} = avaliar(cargas);
    if (!melhor || score < melhor.score) melhor = { nome, cargas, score, frete, ordem:[...ordem], snap: fotografar(lista.concat(pilha)) };
  }
  // Só refina cargas pequenas que ainda pedem outra viagem e não excedem o peso de um veículo.
  // A grade de 10 cm pode rejeitar dois volumes que cabem lado a lado nas medidas reais.
  if (!ctx.refinarOrdens && !ctx.sequencia && !pilha.length && ctx.cel > 50 && lista.length <= 80
    && melhor.cargas.length > 1 && lista.reduce((s,u)=>s+u.kg,0)<=ctx.veiculos[veicBase].pesoMax) {
    const ordemEscolhida = melhor.nome.split("/")[0];
    const fino = melhorArranjo(lista, perfil, {...ctx, cel:50, refinarOrdens:{
      [ordemEscolhida]:estrategias[ordemEscolhida],
      areaLivre:(a,b)=>b.C*b.L-a.C*a.L || b.kg-a.kg,
      larguraLivre:(a,b)=>b.L-a.L || b.C-a.C,
    }}, pilha, veicBase);
    if (fino.score < melhor.score) melhor = {...fino,nome:`${fino.nome}/grade50`};
  }
  // Uma sobra pequena pode caber se entrar antes de seus apoios serem ocupados.
  // Reencaixe limitado, mantendo as mesmas regras; não altera peças, embalagem ou quantidade.
  if (ctx.refinarOrdens && melhor.cargas.length === 2) {
    const sobras = melhor.cargas[1].itens;
    if (sobras.length <= 3) {
      const restantes = melhor.ordem.filter(u=>!sobras.includes(u));
      const passo = Math.max(1,Math.ceil(restantes.length/40));
      ctx.reservaTopo=0;
      for (let i=0;i<=restantes.length;i+=passo) {
        const ordem=[...restantes.slice(0,i),...sobras,...restantes.slice(i)];
        let cargas=empacotar(ordem,veicBase,perfil,ctx,pilha,"empilhar");
        if (cargas.length !== 1 || lista.some(u=>u.semLugar)) continue;
        cargas=cargas.map(c=>menorVeiculo(c,perfil,ctx,ordem,"empilhar"));
        melhor={nome:`${melhor.nome}/reencaixe`,cargas,...avaliar(cargas),ordem,snap:fotografar(lista.concat(pilha))};
        break;
      }
    }
  }
  ctx.reservaTopo = 0; restaurar(melhor.snap); return melhor;
}

/**
 * Monta as cargas de um conjunto de unidades: grupo de grades à parte (quando pedido), peças longas na
 * carreta de 14 m, e a tentativa de separar delicados quando já são 2+ viagens.
 * @returns {{ cargas: object[], especiais: object[] }}
 */
export function montarCargas(unidades, perfil, gcModo, ctx) {
  ctx.porId = new Map(unidades.map((u) => [u.id, u]));
  const normais = unidades.filter((u) => u.transporte === "normal"), longas = unidades.filter((u) => u.transporte === "carreta14"), especiais = unidades.filter((u) => u.transporte === "especial");
  const montarGrupo = (lista, nome, veicBase = "carreta") => {
    const pilha = lista.filter((u) => u.gc && !u.emPe && gcModo === "pilha"), resto = lista.filter((u) => !pilha.includes(u));
    ctx.modoGrupo = nome === "grades de piso" ? "grades" : "";
    const arranjo = melhorArranjo(resto, perfil, ctx, pilha, veicBase); ctx.modoGrupo = "";
    for (const c of arranjo.cargas) { c.grupo = nome; c.estrategia = arranjo.nome; } return arranjo.cargas; };
  const frete = (cs) => cs.reduce((t, c) => t + freteDe(ctx, c.veicKey), 0);
  const chaveSeq = (c) => c.grupo === "grades de piso" ? Math.max(...c.itens.map((u) => u.nivel || 0)) : Math.min(...c.itens.map((u) => u.nivel || 0));
  const ordenar = (cs) => ctx.sequencia ? cs.sort((a, b) => (chaveSeq(a) - chaveSeq(b)) || ((a.grupo === "grades de piso") - (b.grupo === "grades de piso")) || ((a.veicKey !== "carreta14") - (b.veicKey !== "carreta14"))) : cs;
  const emGrupos = (lista) => {
    const soGrade = lista.length && lista.every((u) => u.grade);
    if (soGrade) return montarGrupo(lista, "grades de piso");
    if (ctx.gradeSeparada && lista.some((u) => u.grade)) return montarGrupo(lista.filter((u) => !u.grade), "estrutura").concat(montarGrupo(lista.filter((u) => u.grade), "grades de piso"));
    return montarGrupo(lista, "tudo"); };
  let cargas;
  if (longas.length) {
    // peça de 12,4–14 m exige a carreta de 14 m; na sequência ela é completada com colunas (nível 0, tipo 1)
    const cand = ctx.sequencia ? normais.filter((u) => u.tipoSeq === 1 && !u.nivel && !u.grade) : [];
    const c14 = montarGrupo(longas.concat(cand), "carreta 14 m (colunas + peças de 12,4 a 14 m)", "carreta14").filter((c) => c.itens.some((u) => longas.includes(u)));
    const levados = new Set(c14.flatMap((c) => c.itens));
    cargas = ordenar([...c14, ...emGrupos(normais.filter((u) => !levados.has(u)))]);
  } else cargas = ordenar(emGrupos(normais));
  // se já são 2+ viagens, tenta delicados separados — vale se não aumentar viagens nem frete
  if (!ctx.sequencia && cargas.length >= 2) {
    const snapA = fotografar(normais);
    const est = normais.filter((u) => !ehDelicadoPlano(u)), del = normais.filter(ehDelicadoPlano);
    if (est.length && del.length) {
      const rebaixados = perfil.delicadoSobreDelicado ? del.filter((u) => u.classe === 3 && !u.emPe) : []; for (const u of rebaixados) u.classe = 2;
      const cargasB = montarGrupo(est, "estrutura").concat(montarGrupo(del, "delicados"));
      for (const u of rebaixados) u.classe = 3;
      if (cargasB.length <= cargas.length && frete(cargasB) <= frete(cargas)) cargas = cargasB; else restaurar(snapA);
    }
  }
  return { cargas, especiais };
}
