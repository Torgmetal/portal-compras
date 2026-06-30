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

// Palavras-chave do Syneco que mapeiam para cada setor canônico do portal
// (mesma lógica do normalizeSetorSyneco, mas para montar filtros SQL).
export const SETOR_SYNECO_KEYWORDS = {
  CORTE: ["corte", "serra", "plasma", "oxico"],
  MONTAGEM: ["montag"],
  SOLDA: ["solda", "mig", "mag", "tig"],
  ACABAMENTO: ["acabamento", "esmeril", "lixamento"],
  JATO: ["jato", "granalha"],
  PINTURA: ["pintura", "primer"],
};

// Cláusula `where` do Prisma que casa as linhas do Syneco (mesOrdem/mesApontamento)
// de um setor canônico, cobrindo todas as variações de nome de máquina/processo.
export function whereSetorSyneco(canonico) {
  const kws = SETOR_SYNECO_KEYWORDS[String(canonico).toUpperCase()] || [String(canonico).toLowerCase()];
  return { OR: kws.map((k) => ({ setor: { contains: k, mode: "insensitive" } })) };
}

// Janela de um dia (string "YYYY-MM-DD") do Syneco.
// As datas do Syneco são gravadas UTC-naïve (o relógio BRT escrito como se fosse
// UTC — ex.: corte às 02:11 BRT vira 02:11Z). Então o "dia" é
// [dia 00:00Z, dia 23:59:59.999Z]. NÃO aplicar offset -03:00: isso jogava os
// apontamentos entre 00:00–03:00 (corte noturno/madrugada) pro dia ANTERIOR, e
// eles sumiam do "hoje" (ex.: corte 1.176 kg às 02:11 não aparecia). Bate com o
// dia-calendário do Syneco. Usada pelo Painel de Produção e pelo Relatório do dia.
export function janelaDiaBRT(dataStr) {
  return {
    inicio: new Date(dataStr + "T00:00:00.000Z"),
    fim: new Date(dataStr + "T23:59:59.999Z"),
  };
}

// Dia-calendário de uma data DO SYNECO ("YYYY-MM-DD"). Como elas são UTC-naïve
// (o relógio BRT escrito como se UTC), o dia é só a parte UTC — NÃO usar diaBRT()
// de lib/data-br (que converte o fuso e subtrai 3h, jogando a madrugada pro dia
// anterior). Use SÓ em datas do Syneco (mesOrdem/mesApontamento); pra timestamps
// do portal (UTC real, ex.: createdAt) continua valendo o diaBRT.
export function diaSyneco(date) {
  if (date == null) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
