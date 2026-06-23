// Fonte ÚNICA da agregação do Syneco por dia/setor.
// O "Relatório do dia" (app/api/producao/controle/apontamentos-dia) e o
// Painel de Produção (app/producao) usam estas funções — assim os números
// nunca divergem (antes o painel somava o mesOrdem cumulativo e a janela
// errada, inflando Solda/Acabamento/Jato).

// Mapeia variações de nome do Syneco (máquina/processo) para o setor do portal.
export function normalizeSetorSyneco(s) {
  if (!s) return null;
  const up = s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (up.includes("CORTE") || up.includes("SERRA") || up.includes("PLASMA") || up.includes("OXICO")) return "CORTE";
  if (up.includes("MONTAG")) return "MONTAGEM";
  if (up.includes("SOLDA") || up.includes("MIG") || up.includes("MAG") || up.includes("TIG")) return "SOLDA";
  if (up.includes("ACABAMENTO") || up.includes("ESMERIL") || up.includes("LIXAMENTO")) return "ACABAMENTO";
  if (up.includes("JATO") || up.includes("GRANALHA")) return "JATO";
  if (up.includes("PINTURA") || up.includes("PRIMER")) return "PINTURA";
  if (up.includes("EXPEDICAO") || up.includes("EXPEDIDO") || up.includes("CARREGAMENTO")) return "EXPEDICAO";
  return up; // mantém o original (em maiúsculas) se não mapear
}

// Janela de um dia (string "YYYY-MM-DD") no fuso de Brasília — igual ao
// Relatório do dia. As datas do Syneco vêm como instante; o relatório aplica
// o offset -03:00, então o painel precisa fazer o mesmo para bater nos totais.
export function janelaDiaBRT(dataStr) {
  return {
    inicio: new Date(dataStr + "T00:00:00.000-03:00"),
    fim: new Date(dataStr + "T23:59:59.999-03:00"),
  };
}
