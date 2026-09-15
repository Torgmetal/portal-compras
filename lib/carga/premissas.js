// Premissas do simulador de carga — catálogo de veículos, embalagens e perfis.
//
// Veio do protótipo local (scratchpad/slots4.mjs, set/2026) que o Vitor validou carga a carga na
// OP-118. Tudo em mm e kg. ⚠ Veículos e frete são PREMISSAS a confirmar com a Expedição — por isso
// ficam num arquivo só, para virar tela de configuração sem mexer no motor.
//
// ⚠⚠ PERFIS = TIPO DE EMBALAGEM, NÃO NÚMERO DE VIAGENS. Vitor (10/09/2026): "o exigente nem seria a
// quantidade de caminhões, seria o tipo de embalagem; a quantidade de cargas sempre será a menor
// possível". O empacotador sempre procura o menor número de viagens; o perfil só muda como a peça
// vai embalada. Os quatro perfis casam com os níveis de embalagem da LQC (lib/lqc.js):
// Econômica → economico · Padrão → recomendado · Reforçada → exigente · Especificada → vale.

export const VEICULOS = {
  hr:          { chave: "hr", nome: "Hyundai HR (carroceria 3,10 m)", C: 3100, L: 1900, alturaUtil: 1800, pesoMax: 1800, assoalho: 850 },
  tresquartos: { chave: "tresquartos", nome: "3/4 - VUC (carroceria 5,00 m)", C: 5000, L: 2150, alturaUtil: 2200, pesoMax: 3500, assoalho: 1000 },
  toco:        { chave: "toco", nome: "Toco 4x2 (carroceria 6,50 m)", C: 6500, L: 2450, alturaUtil: 2400, pesoMax: 6000, assoalho: 1200 },
  truck:       { chave: "truck", nome: "Truck 6x2 (carroceria 8,50 m)", C: 8500, L: 2450, alturaUtil: 2600, pesoMax: 12000, assoalho: 1250 },
  carreta:     { chave: "carreta", nome: "Carreta 3 eixos (carga seca)", C: 12400, L: 2450, alturaUtil: 2900, pesoMax: 25000, assoalho: 1350 },
  carreta14:   { chave: "carreta14", nome: "Carreta especial 14 m", C: 14000, L: 2450, alturaUtil: 2900, pesoMax: 25000, assoalho: 1350 },
};
// do menor para o maior: a carga montada na carreta é remontada no menor veículo em que couber inteira
export const ORDEM_VEIC = ["hr", "tresquartos", "toco", "truck", "carreta"];
// ⚠ índice de frete RELATIVO (carreta = 100): só ordena e compara — trocar pela tabela real da Expedição
export const FRETE = { hr: 35, tresquartos: 45, toco: 55, truck: 70, carreta: 100, carreta14: 140 };
export const LEGAL = { larguraMax: 2600, alturaTotalMax: 4400, compCarretaEspecial: 14000 };

// ⚠⚠ EM PÉ SÓ COM EMBALAGEM ADEQUADA — Vitor (10/09/2026): "em pé pode, desde que tenha embalagem
// adequada". Inclinada continua fora.
export const EMB = {
  engradado: { rotulo: "engradado reforçado", quadro: 60, base: 120, tampa: 60, largMax: 620, kgMax: 600, kgProprio: 45 },
  cavalete:  { rotulo: "cavalete (A-frame) com calços e cintas", quadro: 80, base: 120, tampa: 0, largMin: 700, kgMax: 3000, kgProprio: 60 },
};

// MADEIRA = caibro entre camadas · FOLGA = entre unidade e vizinha/borda · GAP = entre peças do mesmo pacote
// CEL = célula do mapa de altura (100 mm: obra grande; 50 perdia o 3/4 para os delicados)
// CALCO 150 = o carregador nivela apoio desigual com caibro + cunha até 15 cm (exigir nível exato fragmentava a carga)
export const MEDIDAS = { MADEIRA: 100, FOLGA: 60, GAP: 12, CEL: 100, CALCO: 150, CALCO_FUSAO: 300, JANELA: 4 };

// Vitor (10/09/2026, carga 1 da OP-118): "as vigas que formam o nível em pacotes amarrados por fitas; as
// cantoneiras em embalagem de madeira e separadas; guarda-corpo não pode ir por baixo".
export const PAC = { secaoMax: 500, compMin: 800, larguraMax: 1200, alturaMax: 600, kgMax: 2500 };
export const CAIXA_MAD = { compMax: 2000, kgMax: 60, Lint: 800, base: 100, parede: 40, tampaAlt: 40, alturaMax: 600, kgTotal: 1000, tipo: "CAIXA", rotulo: "Caixa de madeira", minPorMarca: 6 };
export const PAC_GC = { alturaMax: 500, kgMax: 600 };
// grade de piso: painéis parecidos empilhados e cintados; delicado — vai por cima e nada sobe nele
export const PAC_GRADE = { alturaMax: 500, kgMax: 1200 };
// ⚠⚠ Vitor (12/09/2026): "essa carga de grades está muito perigosa" — carga SÓ de grade saía em torres.
// Carga só de grade/degrau é montada EM CAMADAS: chão primeiro, maior embaixo, apoio ≥ 80 %, teto 2,4 m.
export const GRADE_CARGA = { teto: 2400, apoioMin: 0.8 };
// espec. TMSA/Vale (TPR00864): caixa manual ≤ 762×508×458 e ≤ 34 kg; acima disso, caixa sobre palete
export const CAIXA_VALE_MANUAL = { compMax: 680, kgMax: 30, Lint: 428, base: 50, parede: 40, tampaAlt: 40, alturaMax: 330, kgTotal: 34, tipo: "CAIXA", rotulo: "Caixa manual (≤34 kg)", minPorMarca: 1, limites: { L: 428, A: 330 } };
export const CAIXA_VALE_PALETE = { compMax: 2000, kgMax: 60, Lint: 1000, base: 140, parede: 40, tampaAlt: 40, alturaMax: 600, kgTotal: 1000, tipo: "CAIXA", rotulo: "Caixa sobre palete", minPorMarca: 1 };

const REGRAS = { niveisMax: 99, pesadoSobreLeve: "alerta", delicadoSobreDelicado: true, engradadoEmpilha: true, apoioMin: 0.6 };
export const PERFIS = {
  economico:   { ...REGRAS, chave: "economico", nome: "Econômico", feixesCurtos:true, compartilharMiudos:true, lqc: "ECONOMICA", resumo: "Pacotes amarrados com cintas e madeira, guarda-corpo deitado em pacote, vigas em feixe cintado, miúdos em caixa de madeira fechada, sem proteção extra de pintura.", gc: "melhor", planos: "pacote", miudos: CAIXA_MAD, protecao: "nenhuma", tempoExtra: 0 },
  recomendado: { ...REGRAS, chave: "recomendado", nome: "Padrão", feixesCurtos:true, compartilharMiudos:true, lqc: "PADRAO", resumo: "Guarda-corpo em pé em engradado quando reduz viagem, vigas em feixe cintado, cantoneira sob toda cinta em peça pintada, miúdos em caixa de madeira fechada.", gc: "melhor2", planos: "pacote", miudos: CAIXA_MAD, protecao: "cantoneiras", tempoExtra: 1 },
  exigente:    { ...REGRAS, chave: "exigente", nome: "Reforçada", lqc: "REFORCADA", resumo: "Tudo embalado: guarda-corpo em pé em engradado, chapas e contraventamentos em engradado deitado, vigas em feixe cintado, miúdos em caixa de madeira, cantoneira e manta.", gc: "engradado", planos: "engradado", miudos: CAIXA_MAD, protecao: "cantoneiras+manta", tempoExtra: 3 },
  vale:        { ...REGRAS, chave: "vale", nome: "Especificada (TMSA/Vale)", lqc: "ESPECIFICADA", resumo: "Dentro da especificação TMSA/Hydro: feixe até 2 t e 12 m, miúdo em caixa sobre palete, guarda-corpo em engradado deitado, grade em engradado, madeira fumigada, um volume numerado por embalagem.", gc: "engradadoDeitado", planos: "engradado", grades: "engradado", miudos: CAIXA_VALE_PALETE, minPorMarca: 6, pac: { kgMax: 2000, compMax: 12000 }, protecao: "cantoneiras+manta", tempoExtra: 2, madeiraTratada: 1.35 },
};

/** Perfil do simulador a partir do nível de embalagem da LQC (ECONOMICA | PADRAO | REFORCADA | ESPECIFICADA). */
export function perfilDaLqc(nivel) {
  return Object.values(PERFIS).find((p) => p.lqc === String(nivel || "").toUpperCase()) || PERFIS.recomendado;
}

// tempo estimado de carregamento (min) — premissa do protótipo
export const TEMPO = { movimento: 4, movimentoLeve: 3, emPe: 4, madeiraPorCamada: 5, amarracao: 30, conferencia: 15 };
