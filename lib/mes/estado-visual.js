// ─── COMO CADA ESTADO DO POSTO SE CHAMA E QUE COR TEM ─────────────────────────
//
// ⚠⚠ UMA FONTE SÓ PARA O ESTADO, e ela mora AQUI. Antes existiam duas — uma tabela de cores no
// cabeçalho do totem e um rótulo fixo no card da sessão — e foi assim que a tela passou a dizer
// "PRODUZINDO" com a máquina parada. Agora o totem e o monitor da supervisão leem o mesmo mapa:
// divergir de novo exigiria editar este arquivo, não esquecer de editar o outro.
//
// ⚠⚠ MÓDULO NEUTRO: sem `"use client"` e sem `server-only`. Ele é lido pelo totem (cliente), pela
// lista de bancadas do setor (servidor) e pelo monitor (cliente). Um utilitário exportado de um
// arquivo `"use client"` NÃO atravessa a fronteira do servidor — o servidor recebe uma referência
// de componente, não a função, e quebra com "visualDo is not a function". Dado fica aqui;
// componente fica no `FaixaEstado.jsx`.
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
  // ⚠ LIVRE é do MONITOR, não do totem: posto sem sessão aberta. Não é parada (ninguém está
  // esperando conserto) nem produção — é máquina disponível, e o supervisor precisa ver isso
  // diferente de "parado", que é o que ele vai atrás de resolver.
  LIVRE:        { rotulo: "LIVRE",         fundo: "bg-slate-400",   icone: "quadrado" },
};

// ⚠⚠ O MESMO ESTADO EM DUAS SUPERFÍCIES. O totem é escuro; o monitor da supervisão é claro, no
// padrão das telas de TV do portal. "Sem registro" é o único que não sobrevive à troca: `bg-white/15`
// desaparece em cima do branco, e o card ficava sem faixa nenhuma — parecia defeito de renderização.
// Quem pinta superfície clara usa `fundoClaro`/`textoClaro` quando existirem.
const DESCONHECIDO = {
  rotulo: "SEM REGISTRO", fundo: "bg-white/15", icone: "duvida",
  fundoClaro: "bg-gray-200", textoClaro: "text-torg-gray",
};

export const visualDo = (estado) => ESTADO_VISUAL[estado] || DESCONHECIDO;
