import "server-only";
import { getAccessToken } from "./sharepoint";

// ─── EXPORTAR O ESTUDO NO MODELO LQC ──────────────────────────────────────────
// Vitor (22/08/2026): "quando eu pedir para extrair uma planilha, você iria trazer exatamente o
// mesmo modelo preenchido".
//
// ⚠ "EXATAMENTE O MESMO MODELO" SÓ SE FOR O MODELO. Recriar a planilha do zero produziria um
// arquivo parecido e morto: sem as fórmulas, sem as tabelas nomeadas (ESTIMATIVAS, IND_MAT_PRIMA,
// MDO_GALV…), sem as validações das listas e sem a formatação que o Comercial reconhece. Então o
// caminho é o contrário: abrir o `LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx` que está no servidor,
// escrever nas células de ENTRADA e devolver o arquivo. O Excel recalcula o resto sozinho.
//
// ⚠ E POR ISSO SÓ SE ESCREVE ONDE NÃO HÁ FÓRMULA. A LQC se calcula: INDUSTRIALIZAÇÃO puxa peso da
// RESUMOS_EM, preço da PARÂMETROS e tinta da MC_TINTAS. Escrever um valor em cima de uma fórmula
// mataria a corrente inteira — e o estudo passaria a mentir na primeira alteração que alguém
// fizesse no arquivo. Mapa das entradas abaixo, conferido célula a célula no modelo.

const NOME_MODELO = /^LQC-000-00-CLIENTE-OBRA-TORG-R00\.xlsx$/i;
const TTL_MS = 30 * 60 * 1000;
let cacheModelo = null; // { em, buffer, nome }

/** Baixa (e guarda) o modelo em branco do servidor. */
export async function baixarModeloLqc(forcar = false) {
  if (!forcar && cacheModelo && Date.now() - cacheModelo.em < TTL_MS) return cacheModelo;
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const busca = await (await fetch(
    `https://graph.microsoft.com/v1.0/drives/${drive}/root/search(q='LQC-000-00')?$select=id,name,lastModifiedDateTime&$top=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  )).json();
  const achados = (busca.value || []).filter((x) => NOME_MODELO.test(x.name));
  if (!achados.length) throw new Error("Modelo LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx não encontrado no servidor.");
  achados.sort((a, b) => new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime));
  const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${drive}/items/${achados[0].id}/content`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
  });
  if (!r.ok) throw new Error(`Download do modelo LQC: HTTP ${r.status}`);
  cacheModelo = { em: Date.now(), buffer: Buffer.from(await r.arrayBuffer()), nome: achados[0].name };
  return cacheModelo;
}

// Mapa das células de ENTRADA, conferido no modelo. Fórmula nenhuma aparece aqui — de propósito.
const RESUMOS = { primeiraLinha: 4, ultimaLinha: 14, cols: { item: "A", area: "B", estrutura: "C", elemento: "D", metodo: "E", classificacao: "F", un: "G", quantidade: "H", unidades: "I", pesoUnit: "J", perfil: "L", coef: "M" } };
const QTDS = { primeiraLinha: 5, ultimaLinha: 10, area: "A", estrutura: "B", familias: { TELHA_TERMO: "C", TELHA_SIMPLES: "D", CALHAS: "E", RUFOS: "F", LANTERNIM: "G", VENEZIANAS: "H", CHUMBADORES: "I", STEEL_DECK: "J", LINHA_VIDA: "K", GRADE_PISO: "L" } };
// FATURAMENTO (coluna D) e PREÇO UNITÁRIO (coluna F) de cada grupo da INDUSTRIALIZAÇÃO.
const IND = {
  faturamento: { materiaPrima: "D5", fixadores: "D19", tintas: "D21", CALCULO: "D26", GALVANIZACAO: "D28", QUALIDADE: "D31", FRETE: "D33", OUTROS: "D35", fabricacao: "D40", pintura: "D46", preMontagem: "D52" },
  preco: { tubo: "F18", fixadores: "F20", CALCULO: "F27", GALVANIZACAO: "F29", GALV_FRETE: "F30", QUALIDADE: "F32", FRETE: "F34" },
};
// MC_TINTAS: duas linhas de tinta no modelo, uma por fator de perda (45% e 85%).
const TINTAS = { linhas: [5, 8], cols: { camada: "B", produto: "C", cor: "D", solidos: "E", peliculaSeca: "F", precoLitro: "J", qtdDiluente: "L", precoDiluente: "M" } };

const val = (v) => (v === undefined || v === null || v === "" ? null : v);

/**
 * Preenche o modelo com o estudo.
 * @returns {{ buffer: Buffer, nome: string, avisos: string[] }}
 */
export async function gerarPlanilhaLqc(estudo) {
  const ExcelJS = (await import("exceljs")).default;
  const { buffer } = await baixarModeloLqc();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const avisos = [];
  const c = estudo.composicao || {};
  const escrever = (ws, addr, v) => { if (val(v) !== null) ws.getCell(addr).value = v; };

  // ── RESUMOS_EM: o quantitativo. É daqui que a INDUSTRIALIZAÇÃO tira o peso por classe e por
  //    categoria de perfil — por isso é a primeira aba a preencher.
  const wsR = wb.getWorksheet("RESUMOS_EM");
  const resumos = Array.isArray(c.resumos) ? c.resumos : [];
  const cabem = RESUMOS.ultimaLinha - RESUMOS.primeiraLinha + 1;
  if (wsR) {
    resumos.slice(0, cabem).forEach((l, i) => {
      const linha = RESUMOS.primeiraLinha + i;
      const col = RESUMOS.cols;
      escrever(wsR, `${col.item}${linha}`, l.item || `1.${i + 1}`);
      escrever(wsR, `${col.area}${linha}`, l.area);
      escrever(wsR, `${col.estrutura}${linha}`, l.estrutura);
      escrever(wsR, `${col.elemento}${linha}`, l.elemento);
      escrever(wsR, `${col.metodo}${linha}`, l.metodo || estudo.metodo || "ESTIMATIVA");
      escrever(wsR, `${col.classificacao}${linha}`, l.classificacao);
      escrever(wsR, `${col.un}${linha}`, l.un || "unid");
      escrever(wsR, `${col.quantidade}${linha}`, Number(l.quantidade) || 0);
      escrever(wsR, `${col.unidades}${linha}`, Number(l.unidades) || 1);
      escrever(wsR, `${col.pesoUnit}${linha}`, Number(l.pesoUnit) || 0);
      escrever(wsR, `${col.perfil}${linha}`, l.perfil);
      escrever(wsR, `${col.coef}${linha}`, val(l.coef) === null ? null : Number(l.coef));
    });
    // ⚠ nada de corte silencioso: se não coube, tem que estar escrito.
    if (resumos.length > cabem) avisos.push(`RESUMOS_EM tem ${cabem} linhas no modelo e o estudo tem ${resumos.length} — as ${resumos.length - cabem} últimas não entraram.`);
  } else avisos.push("Aba RESUMOS_EM não encontrada no modelo.");

  // ── INDUSTRIALIZAÇÃO: só faturamento e os preços que a planilha NÃO calcula sozinha.
  const wsI = wb.getWorksheet("INDUSTRIALIZAÇÃO");
  if (wsI) {
    const fat = c.faturamento || {};
    for (const [k, addr] of Object.entries(IND.faturamento)) escrever(wsI, addr, fat[k] || "N/A");
    escrever(wsI, IND.preco.tubo, Number(c.precos?.perfil?.Tubo) || null);
    escrever(wsI, IND.preco.fixadores, Number(c.fixadoresRsKg) || null);
    for (const k of ["CALCULO", "GALVANIZACAO", "GALV_FRETE", "QUALIDADE", "FRETE"]) {
      escrever(wsI, IND.preco[k], Number(c.terceirizados?.[k]?.precoKg) || null);
    }
  } else avisos.push("Aba INDUSTRIALIZAÇÃO não encontrada no modelo.");

  // ── MC_TINTAS: as duas linhas de tinta do modelo (45% e 85% de perda).
  const wsT = wb.getWorksheet("MC_TINTAS");
  if (wsT) {
    (c.tintas || []).slice(0, TINTAS.linhas.length).forEach((t, i) => {
      const linha = TINTAS.linhas[i], col = TINTAS.cols;
      escrever(wsT, `${col.camada}${linha}`, t.camada);
      escrever(wsT, `${col.produto}${linha}`, t.produto);
      escrever(wsT, `${col.cor}${linha}`, t.cor);
      escrever(wsT, `${col.solidos}${linha}`, Number(t.solidos) || null);
      escrever(wsT, `${col.peliculaSeca}${linha}`, Number(t.peliculaSeca) || null);
      escrever(wsT, `${col.precoLitro}${linha}`, Number(t.precoLitro) || null);
      escrever(wsT, `${col.qtdDiluente}${linha}`, Number(t.qtdDiluente) || null);
      escrever(wsT, `${col.precoDiluente}${linha}`, Number(t.precoDiluente) || null);
    });
    if ((c.tintas || []).length > TINTAS.linhas.length) avisos.push(`MC_TINTAS tem ${TINTAS.linhas.length} linhas no modelo e o estudo tem ${c.tintas.length}.`);
  }

  // ── QTDS ITENS COMERCIAIS: quantidade por área (telha, calha, rufo…).
  const wsQ = wb.getWorksheet("QTDS ITENS COMERCIAIS");
  if (wsQ) {
    const areas = Array.isArray(c.areasComerciais) ? c.areasComerciais : [];
    const cabemQ = QTDS.ultimaLinha - QTDS.primeiraLinha + 1;
    areas.slice(0, cabemQ).forEach((a, i) => {
      const linha = QTDS.primeiraLinha + i;
      escrever(wsQ, `${QTDS.area}${linha}`, a.area);
      escrever(wsQ, `${QTDS.estrutura}${linha}`, a.estrutura);
      for (const [k, col] of Object.entries(QTDS.familias)) escrever(wsQ, `${col}${linha}`, Number(a[k]) || null);
    });
    if (areas.length > cabemQ) avisos.push(`QTDS ITENS COMERCIAIS comporta ${cabemQ} áreas e o estudo tem ${areas.length}.`);
  }

  // ⚠ sem isto o arquivo abre mostrando os valores VELHOS do modelo até alguém mexer numa célula:
  // as fórmulas guardam o último resultado calculado, e o Excel só refaz a conta se mandarem.
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

  const nome = `LQC-${String(estudo.numero || 0).padStart(3, "0")}-${String(estudo.ano || new Date().getFullYear()).slice(-2)}-${(estudo.cliente || "CLIENTE")}-${(estudo.obra || "OBRA")}-TORG-R${String(estudo.revisao || 0).padStart(2, "0")}`
    .toUpperCase().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 120);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nome: `${nome}.xlsx`, avisos };
}
