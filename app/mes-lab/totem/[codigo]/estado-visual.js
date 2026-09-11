// ─── COMO CADA ESTADO DO POSTO SE CHAMA E QUE COR TEM ─────────────────────────
//
// ⚠⚠ MÓDULO NEUTRO, SEM `"use client"`, DE PROPÓSITO. A tela do totem é cliente, mas a lista de
// bancadas do setor é SERVIDOR — e um utilitário exportado de um arquivo `"use client"` não
// atravessa essa fronteira: o servidor recebe uma referência de componente, não a função, e quebra
// com "visualDo is not a function". Dado fica aqui; componente fica no `FaixaEstado.jsx`.
//
// ⚠⚠ UMA FONTE SÓ PARA O ESTADO. Antes existiam duas — uma tabela de cores no cabeçalho e um rótulo
// fixo no card da sessão — e foi assim que a tela passou a dizer "PRODUZINDO" com a máquina parada.
//
// ⚠ SEM EVENTO É "SEM REGISTRO", NÃO "PARADO". Conectividade é dimensão separada do estado
// produtivo (§7.3 do doc): máquina que nunca apontou não é máquina parada, e pintar de vermelho o
// que ninguém sabe envenena o Pareto e a Disponibilidade com tempo que ninguém viveu.

export const ESTADO_VISUAL = {
  PRODUCAO:     { rotulo: "PRODUZINDO",    fundo: "bg-emerald-600", icone: "play" },
  PARADA:       { rotulo: "PARADO",        fundo: "bg-red-600",     icone: "pause" },
  SETUP:        { rotulo: "EM SETUP",      fundo: "bg-amber-500",   icone: "chave" },
  RETRABALHO:   { rotulo: "RETRABALHO",    fundo: "bg-orange-600",  icone: "martelo" },
  MANUTENCAO:   { rotulo: "EM MANUTENÇÃO", fundo: "bg-sky-600",     icone: "chave" },
  FORA_TURNO:   { rotulo: "FORA DE TURNO", fundo: "bg-slate-600",   icone: "relogio" },
  ENCERRAMENTO: { rotulo: "ENCERRADO",     fundo: "bg-slate-700",   icone: "quadrado" },
};

const DESCONHECIDO = { rotulo: "SEM REGISTRO", fundo: "bg-white/15", icone: "duvida" };

export const visualDo = (estado) => ESTADO_VISUAL[estado] || DESCONHECIDO;
