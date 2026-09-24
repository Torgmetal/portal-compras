// Simulador de carga — entrada: a lista do romaneio prévio (marca × quantidade) com a geometria de
// cada marca; saída: as cargas (veículo, volumes posicionados, passos de montagem, madeira) e o resumo.
//
// Vitor (12/09/2026): "o ideal mesmo seria ter como colocar uma lista e vc ler ela e já separar as
// peças dessa lista, pode ser o romaneio prévio gerado pelo planejamento". O motor não sabe a lógica de
// prioridade de cada obra: recebe a lista e monta a carga daquela lista.
import { FRETE, MEDIDAS, PERFIS, TEMPO } from "./premissas";
import { expandirPecas } from "./geometria";
import { montarUnidades } from "./unidades";
import { novoContexto } from "./empacotar";
import { montarCargas } from "./arranjo";
import { madeiraDaCarga, madeiraDaUnidade, pecasDeMadeira } from "./madeira";
import { m3 } from "./classificar";
import { perfisDasPecas } from "./perfil-apoio";
import { travamentoDaCarga } from "./travamento";

const tipoVolume = (u) => u.embalagem?.rotulo || (u.tipo === "PACOTE" ? (u.gc ? "pacote de guarda-corpo cintado" : u.grade ? (u.degrau ? "pacote de degraus cintado" : "pacote de grade cintado") : "feixe cintado") : u.tipo === "CAIXA" ? "caixa de madeira" : "peça solta calçada");

// alertas: comparado com o que está por baixo de verdade
function marcarAlertas(cargas, porId) {
  for (const c of cargas) for (const u of c.itens) { if (u.pilha || !u.sobre?.length) continue;
    const baixo = u.sobre.map((id) => porId.get(id)).filter(Boolean);
    if (u.tipo === "CAIXA") { u.alerta = "caixa empilhada: conferir reforço e resistência da embalagem inferior"; continue; }
    const leve = baixo.find((b) => u.kg > b.kg * 1.5), delic = baixo.find((b) => b.classe === 3 && !b.emPe && !((u.tipo === "PALLET" || u.tipo === "CAIXA") && b.tipo === "PALLET"));
    if (delic) u.alerta = "em cima de peça delicada"; else if (leve) u.alerta = `mais pesada (${Math.round(u.kg)} kg) que a de baixo (${Math.round(leve.kg)} kg)`; }
}

function saidaDaCarga(c, perfil) {
  // camada = quantos volumes há embaixo (o chão é a 1ª). Pela altura, não: o aço no assoalho vai sobre caibro (10 cm) e a
  // caixa não, e o encaixe pelo aço real deixa cada volume numa cota — "camadas" viravam dezenas no PDF
  for (const u of c.itens) if (!u.pilha) u.camada = u.nivelPilha || 0;
  const passos = [...c.itens].sort((a, b) => ((b.pilha ? 1 : 0) - (a.pilha ? 1 : 0)) || (a.y - b.y) || (b.x - a.x) || (a.z - b.z)).map((u) => u.id);
  const mov = c.itens.reduce((t, u) => t + ((u.tipo !== "PECA" || u.kg >= 100) ? TEMPO.movimento : TEMPO.movimentoLeve) + (u.emPe ? TEMPO.emPe : 0) + perfil.tempoExtra, 0);
  const noChao = (u) => !u.pilha && !(u.nivelPilha > 0);
  const nCam = c.itens.filter((u) => !noChao(u)).length * 0.4;
  const chao = Math.round(100 * c.itens.filter(noChao).reduce((t, u) => t + u.C * u.L, 0) / (c.veic.C * c.veic.L));
  const usa = Math.max(...c.itens.map((u) => u.x + (u.fx || u.C))) - Math.min(...c.itens.map((u) => u.x));
  const minutos = Math.round(mov + nCam * TEMPO.madeiraPorCamada + TEMPO.amarracao + TEMPO.conferencia);
  // volumes numerados do chão para cima, da frente para trás
  const ordem = [...c.itens].sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.z - b.z)); ordem.forEach((u, j) => { u.volume = j + 1; });
  // travar o que tem vão à frente (lib/carga/travamento.js): antes da madeira, que conta as escoras
  const trav = travamentoDaCarga(c.itens, { veiculo: c.veic });
  for (const u of c.itens) { const t = trav.get(u.id); if (t) u.travamento = t; else delete u.travamento; }
  const romaneio = ordem.map((u) => { const mad = madeiraDaUnidade(u, c.veic); return { volume: u.volume, id: u.id, tipo: tipoVolume(u), rotulo: u.rotulo, travamento: u.travamento || null, marcas: [...new Set((u.membros || [u]).map((m) => m.marca))], pecas: (u.membros || [u]).length, kgLiquido: Math.round((u.membros || [u]).reduce((t, m) => t + m.kg, 0)), kgBruto: Math.round(u.kg), dimsCm: [u.C, u.L, u.A].map((v) => Math.round(v / 10)), madeira: { ...pecasDeMadeira(mad), nCaibro: mad.nCaibro, compCaibro: Math.round(mad.compCaibro * 10) / 10 } }; });
  const itens = c.itens.map((u) => ({ ...u, membros: (u.membros || [u]).map((m) => ({ id: m.id, marca: m.marca, desc: m.desc, kg: m.kg, nivel: m.nivel, nivelNome: m.nivelNome, C: m.C, L: m.L, A: m.A, perm: m.perm, giro: m.giro, dx: m.dx || 0, dy: m.dy || 0, dz: m.dz || 0, temGeo: m.temGeo })) }));
  // versão 8 (24/09/2026): pacotes de até 1,14 m com madeira entre as camadas e aço sobre caibro no assoalho;
  // 7 = empilha pelo AÇO real (caibros e calços conferidos no IFC); 6 = bloqueava topo irregular
  return { versaoMontagem: 8, veiculo: c.veic, grupo: c.grupo, estrategia: c.estrategia, itens, peso: Math.round(c.peso), altura: c.altura, chao, usa, passos, alertas: c.itens.filter((u) => u.alerta).length,
    profundidade: Math.max(1, ...c.itens.map((u) => (u.nivelPilha || 0) + 1)), camadas: [...new Set(c.itens.map((u) => u.camada || 0))].length, volumes: ordem.length, romaneio, madeira: madeiraDaCarga(c.itens, c.veic),
    tempo: { movimentos: c.itens.length, minutos } };
}

/**
 * @param {object} entrada
 * @param {Array<{marca:string, desc?:string, qtd:number, kgUn:number, nivel?:number, nivelNome?:string, tipoSeq?:number}>} entrada.lista
 * @param {Record<string, {obb?:object, dimsEixos?:number[], temGeo?:boolean}>} entrada.geometria  caixa por marca (maiúscula)
 * @param {string} [entrada.perfil]  chave de PERFIS (default recomendado)
 * @param {string} [entrada.prefixo]  prefixo das marcas ("T118")
 * @param {object} [entrada.opcoes]  { sequencia, gradeSeparada, veiculos, frete, gcModo }
 * @param {Record<string, object>} [entrada.ajustes]  regras por marca (lib/carga/ajustes.js)
 * @param {Record<string, {pos:ArrayLike<number>, idx:ArrayLike<number>}>} [entrada.malhas]  malha do IFC por marca: dá o
 *   aço REAL de cada peça, onde o caibro pode assentar (sem ela, vale a caixa envolvente cheia)
 */
export function simularCarga({ lista, geometria = {}, perfil: chavePerfil = "recomendado", prefixo = "", opcoes = {}, ajustes = {}, malhas = null }) {
  const perfil = PERFIS[chavePerfil] || PERFIS.recomendado;
  const pecasBase = expandirPecas(lista, geometria, ajustes || {});
  const perfis = perfisDasPecas(pecasBase, malhas);
  const semCaixa = pecasBase.filter((u) => u.semCaixa).map((u) => ({ marca: u.marca, desc: u.desc, kg: u.kg }));
  // marcas sem geometria que entraram com caixa estimada pelo peso — a tela pede conferência
  const estimadas = [...new Map(pecasBase.filter((u) => u.estimada).map((u) => [u.marca, { marca: u.marca, desc: u.desc, kg: u.kg, C: u.C, L: u.L, A: u.A }])).values()];
  const rodar = (gcModo) => {
    const ctx = novoContexto({ ...opcoes, prefixo, perfis }); ctx.gradeSeparada = !!opcoes.gradeSeparada;
    const unidades = montarUnidades(pecasBase, perfil, gcModo, ctx);
    const { cargas, especiais } = montarCargas(unidades, perfil, gcModo, ctx);
    marcarAlertas(cargas, ctx.porId);
    const saida = cargas.map((c) => saidaDaCarga(c, perfil));
    const frete = cargas.reduce((t, c) => t + (ctx.frete || FRETE)[c.veicKey], 0);
    return { gcModo, cargas: saida, especiais: especiais.map((u) => ({ id: u.id, rotulo: u.rotulo, transporte: u.transporte, aviso: u.aviso, C: u.C, L: u.L, A: u.A, kg: Math.round(u.kg), marcas: [...new Set((u.membros || [u]).map((m) => m.marca))] })),
      ajustadas: unidades.filter((u) => u.emPe || u.embalagem?.deitado).map((u) => ({ id: u.id, rotulo: u.rotulo, posicao: u.posicao, aviso: u.aviso, embalagem: u.embalagem, medida: m3(u) })),
      resumo: { foraDoModelo: estimadas.length, ajustadas: Object.keys(ajustes || {}).length, viagens: cargas.length, frete, peso: Math.round(cargas.reduce((t, c) => t + c.peso, 0)), volumes: saida.reduce((t, c) => t + c.volumes, 0), alertas: saida.reduce((t, c) => t + c.alertas, 0), semLugar: unidades.filter((u) => u.semLugar).map((u) => u.rotulo), especiais: especiais.length, tempoMin: saida.reduce((t, c) => t + c.tempo.minutos, 0) } };
  };
  // guarda-corpo: testa os jeitos de levar e fica com o frete menor (empate: menos viagens)
  const gc = opcoes.gcModo || perfil.gc;
  let r;
  if (gc === "melhor" || gc === "melhor2") { const cands = ["topo", "engradado"].map(rodar); r = cands.reduce((m, c) => (c.resumo.frete < m.resumo.frete || (c.resumo.frete === m.resumo.frete && c.resumo.viagens < m.resumo.viagens)) ? c : m); }
  else r = rodar(gc);
  return { ...r, perfil: { chave: perfil.chave, nome: perfil.nome, resumo: perfil.resumo, madeiraTratada: perfil.madeiraTratada || 1 }, madeira: MEDIDAS.MADEIRA, semCaixa, estimadas, pecas: pecasBase.length };
}
