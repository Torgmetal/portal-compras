import "server-only";
import * as XLSX from "xlsx";
import { downloadFileByPath } from "./sharepoint";

// ─── ABSENTEÍSMO, LIDO DO CONTROLE DE PRESENÇA DO RH ──────────────────────────
// Vitor (27/08/2026), apontando a planilha: "nessa pasta temos uma informação para preencher o
// indicador de absenteísmo do RH, poderia verificar as informações e usar isso como informação para
// preencher esses indicadores".
//
// A planilha é `/Qualidade/Presença.xlsx` — o controle diário que o RH mantém, uma folha por ano,
// blocos por SETOR e MÊS, uma linha por colaborador e uma coluna por dia (1 a 31).
//
// ⚠⚠ O NÚMERO NA CÉLULA É A FALTA, EM DIAS. Conferido contra a aba de resumo da própria planilha:
// "1" é um dia inteiro e "0.5" meio período. O resto do vocabulário não é falta:
//   Sab · Dom · Fer → não é dia útil, sai do denominador
//   "-"             → sem contrato no dia (antes da admissão / depois do desligamento)
//   Com             → dia compensado, trabalhado
//   Dispensado      → dia trabalhado, dispensa formal
//
// ⚠ OS DOIS TIPOS DE AFASTAMENTO CONTAM. Vitor (27/08/2026): "precisa considerar os dois tipos de
// afastamento" — a falta do dia a dia e o afastamento longo (acidente, INSS) entram no mesmo
// índice. Faz diferença grande: em maio/2026 são 15,9% com os afastados e 6,2% sem eles. Como ele
// decidiu incluir, o indicador mede a AUSÊNCIA REAL na fábrica, não só a falta evitável — e é por
// isso que o detalhamento separa quem ficou o mês inteiro fora: sem essa leitura ao lado, o número
// parece dizer que 40 pessoas faltam demais, quando são 3 ou 4 afastadas.
const PASTA = "/Qualidade";
const ARQUIVO = "Presença.xlsx";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const so = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// ⚠ o `!ref` de uma folha assim costuma declarar muito mais do que existe; ler pelas células reais
// evita percorrer faixa vazia (o mesmo cuidado do leitor de PLP).
function faixaReal(ws, maxLinhas = 800) {
  let maxL = 0, maxC = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const c = XLSX.utils.decode_cell(k);
    if (c.r > maxL) maxL = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  return XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.min(maxL, maxLinhas - 1), c: Math.min(maxC, 40) } });
}

/** Lê a folha de um ano e devolve o mês a mês. */
export function interpretarPresenca(buffer, ano) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const nomeFolha = wb.SheetNames.find((n) => so(n) === String(ano));
  if (!nomeFolha) return { achou: false, erro: `A planilha não tem a folha de ${ano}.`, meses: [] };

  const ws = wb.Sheets[nomeFolha];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "", range: faixaReal(ws) });

  const porMes = new Map();
  let mes = null;
  let setor = null;
  for (const l of linhas) {
    const c = l.map(so);
    // cabeçalho de bloco: [SETOR, nº de pessoas, mês]
    const mesDoBloco = c[2] ? MESES.indexOf(c[2].toLowerCase()) : -1;
    if (c[0] && mesDoBloco >= 0) { mes = mesDoBloco; setor = c[0]; continue; }
    if (!c[0] || /^nome/i.test(c[0]) || mes == null) continue;

    let uteis = 0;
    let faltas = 0;
    for (const v of c.slice(2, 33)) {
      if (/^(sab|dom|fer)$/i.test(v)) continue;   // não é dia útil
      if (v === "-") continue;                     // sem contrato no dia
      uteis++;
      if (!v) continue;                            // dia trabalhado
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n)) faltas += n;         // o número é a falta, em dias
    }
    if (!uteis) continue;

    const m = porMes.get(mes) || { mes, pessoas: [], porSetor: new Map() };
    m.pessoas.push({ nome: c[0], funcao: c[1] || null, setor, uteis, faltas });
    m.porSetor.set(setor, (m.porSetor.get(setor) || 0) + faltas);
    porMes.set(mes, m);
  }

  const meses = [...porMes.values()].sort((a, b) => a.mes - b.mes).map((m) => {
    const uteis = m.pessoas.reduce((s, p) => s + p.uteis, 0);
    const faltas = m.pessoas.reduce((s, p) => s + p.faltas, 0);
    // ⚠ quem ficou fora ≥80% do próprio mês é afastamento longo. CONTA no índice (decisão do
    // Vitor), mas vai identificado: é o que explica um salto de 6% para 16% sem ninguém ter
    // faltado mais.
    const longos = m.pessoas.filter((p) => p.faltas >= p.uteis * 0.8);
    return {
      mes: m.mes,
      pessoas: m.pessoas.length,
      diasUteis: uteis,
      faltas: Math.round(faltas * 100) / 100,
      pct: uteis > 0 ? Math.round((faltas / uteis) * 1000) / 10 : null,
      afastamentoLongo: {
        pessoas: longos.map((p) => ({ nome: p.nome, setor: p.setor, dias: p.faltas })),
        faltas: Math.round(longos.reduce((s, p) => s + p.faltas, 0) * 100) / 100,
      },
      porSetor: [...m.porSetor.entries()]
        .map(([nome, dias]) => ({ setor: nome, faltas: Math.round(dias * 100) / 100 }))
        .filter((x) => x.faltas > 0)
        .sort((a, b) => b.faltas - a.faltas),
      detalhe: m.pessoas.filter((p) => p.faltas > 0)
        .map((p) => ({ nome: p.nome, funcao: p.funcao, setor: p.setor, dias: p.faltas, uteis: p.uteis }))
        .sort((a, b) => b.dias - a.dias),
    };
  });
  return { achou: true, folha: nomeFolha, meses };
}

/** Busca a planilha no servidor e interpreta o ano pedido. */
export async function absenteismoDoAno(ano) {
  try {
    const buffer = await downloadFileByPath({
      driveId: process.env.SHAREPOINT_DRIVE_ID,
      fullPath: `${PASTA}/${ARQUIVO}`,
    });
    return { ...interpretarPresenca(buffer, ano), arquivo: `${PASTA}/${ARQUIVO}` };
  } catch (e) {
    return { achou: false, erro: `Não consegui ler ${PASTA}/${ARQUIVO}: ${e?.message || e}`, meses: [] };
  }
}

/** A série de 12 posições para o indicador ISO. */
export function serieAbsenteismo(dados) {
  const serie = Array.from({ length: 12 }, () => null);
  for (const m of dados?.meses || []) serie[m.mes] = m.pct;
  return serie;
}
