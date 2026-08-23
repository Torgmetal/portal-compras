import "server-only";
import * as XLSX from "xlsx";
import { numeroBr, perdaDaEstrutura } from "./lqc";

// ─── IMPORTAR A LQC PARA DENTRO DO ESTUDO ─────────────────────────────────────
// Vitor (23/08/2026): "a possibilidade de importarmos áreas levantadas nessa planilha e
// importarmos ela no portal, para preencher apenas os custos — acha que funcionaria?".
//
// Funciona, e é o corte certo. As duas metades da LQC têm naturezas diferentes:
//
//   O QUANTITATIVO é trabalho de engenharia feito com o projeto na mão — medir a estrutura,
//   separar por área, classificar por kg/m, tirar o coeficiente de superfície. Isso se faz uma
//   vez, no Excel, com o desenho aberto do lado. Redigitar no portal seria retrabalho puro, e
//   retrabalho é o motivo nº 1 de uma ferramenta não ser usada.
//
//   O CUSTO muda toda semana — cotação de fornecedor, imposto, margem, cenário. É aí que o portal
//   ganha: histórico, comparação entre obras, três cenários, e a amarração com a OP quando fecha.
//
// ⚠ IMPORTAÇÃO NÃO INVENTA. Coluna que não for reconhecida volta vazia e aparece no relatório do
// que entrou. Estudo é base de proposta: um peso lido errado vira preço errado, e preço errado
// assinado não se desfaz.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Acha a aba pelo prefixo do nome (o Comercial renomeia: "PESO PROJETO (2)"). */
function acharAba(wb, prefixo) {
  const p = norm(prefixo);
  const nome = wb.SheetNames.find((n) => norm(n) === p) || wb.SheetNames.find((n) => norm(n).startsWith(p));
  // ⚠ `raw: true` PROPOSITALMENTE. Com `raw: false` o SheetJS devolve a célula JÁ FORMATADA, e a
  // LQC real está formatada em padrão americano: 390.354,61 kg sai como "390,354.6". Lido por um
  // parser brasileiro, isso vira 390,35 — a obra encolhe mil vezes e ninguém percebe, porque o
  // número continua parecendo um número. Em modo cru vem o valor de verdade, sem formatação no meio.
  return nome ? XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, blankrows: false, defval: "", raw: true }) : null;
}

/** Linha de cabeçalho = a primeira que contém todos os rótulos pedidos. */
function acharCabecalho(linhas, rotulos, ate = 12) {
  for (let i = 0; i < Math.min(linhas.length, ate); i++) {
    const cel = (linhas[i] || []).map(norm);
    if (rotulos.every((r) => cel.some((c) => c.includes(norm(r))))) return i;
  }
  return -1;
}

/** Mapa rótulo → índice da coluna, casando por SUBSTRING (o cabeçalho tem quebra de linha). */
function colunas(cab, alias) {
  const idx = {};
  (cab || []).forEach((v, i) => { idx[i] = norm(v); });
  // ⚠ COLUNA JÁ USADA NÃO SE REAPROVEITA. "Coef. p/ área de superfície (m²)" CONTÉM "área de
  // superfície" — sem excluir a que já casou, a área de pintura pegava o coeficiente (0,035) e a
  // obra inteira ficava com 0,4 m². Como a ordem do alias é a ordem da planilha, quem vem antes
  // reserva a sua coluna.
  const usadas = new Set();
  const achar = (chaves) => {
    for (const [i, txt] of Object.entries(idx)) {
      if (!txt || usadas.has(Number(i))) continue;
      if (chaves.some((k) => txt.includes(norm(k)))) { usadas.add(Number(i)); return Number(i); }
    }
    return -1;
  };
  const out = {};
  for (const [campo, chaves] of Object.entries(alias)) out[campo] = achar(chaves);
  return out;
}

const ALIAS_RESUMOS = {
  item: ["item"], area: ["area"], estrutura: ["estrutura"], elemento: ["elementos estruturais"],
  metodo: ["metodo"], classificacao: ["classificacao"], un: ["uni. (m"], quantidade: ["quantidade"],
  unidades: ["unidades"], pesoUnit: ["peso unit"], pesoTotal: ["peso total"],
  perfil: ["perfil predominante"], coef: ["coef"], areaM2: ["area de superficie"],
  perda: ["% perda", "perda de tintas"],
};

/**
 * Lê o quantitativo (RESUMOS_EM) e, quando já preenchidos, os preços do aço por área.
 * @returns {{ ok, resumos, precosPorArea, resumo, avisos }}
 */
export function importarLqc(buffer) {
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellFormula: false }); }
  catch (e) { return { ok: false, erro: `Não consegui abrir o arquivo: ${e.message}` }; }

  const linhas = acharAba(wb, "RESUMOS_EM") || acharAba(wb, "RESUMO");
  if (!linhas) return { ok: false, erro: "A planilha não tem a aba RESUMOS_EM." };

  const iCab = acharCabecalho(linhas, ["classificacao", "peso total"]);
  if (iCab < 0) return { ok: false, erro: "Não reconheci o cabeçalho da RESUMOS_EM." };
  const col = colunas(linhas[iCab], ALIAS_RESUMOS);
  if (col.classificacao < 0 || col.pesoTotal < 0) return { ok: false, erro: "A RESUMOS_EM não tem as colunas de classificação e peso." };

  // ⚠ a COR vem numa coluna sem rótulo, logo depois do % de perda — é o que agrupa a demão de
  // acabamento. Sem rótulo não dá para casar por nome; casa por posição, e só se estiver lá.
  const colCor = col.perda >= 0 ? col.perda + 1 : -1;

  const avisos = [];
  const resumos = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const cel = (j) => (j >= 0 ? String(l[j] ?? "").trim() : "");
    const numCel = (j) => (j >= 0 ? (typeof l[j] === "number" ? l[j] : numeroBr(cel(j))) : 0);
    const item = cel(col.item);
    // a linha "Total" fecha a tabela
    if (norm(item) === "total" || norm(cel(col.area)) === "total") break;
    const peso = numCel(col.pesoTotal);
    if (!peso) continue;

    const area = cel(col.area);
    const estrutura = cel(col.estrutura);
    resumos.push({
      item: item || `1.${resumos.length + 1}`,
      area, estrutura: estrutura === "." ? "" : estrutura,
      elemento: cel(col.elemento) === "-" ? "" : cel(col.elemento),
      metodo: cel(col.metodo) || "ESTIMATIVA",
      classificacao: cel(col.classificacao).toUpperCase(),
      un: cel(col.un) || "unid",
      quantidade: numCel(col.quantidade) || 1,
      unidades: numCel(col.unidades) || 1,
      pesoUnit: numCel(col.pesoUnit) || peso,
      perfil: cel(col.perfil),
      coef: numCel(col.coef) || null,
      areaM2: numCel(col.areaM2) || null,
      // ⚠ o % de perda vem LIDO, não deduzido. Na LQC real a coluna "Estrutura" é só um ponto e
      // quem identifica o guarda-corpo é o nome da ÁREA — deduzir pela estrutura daria 45% em
      // tudo, e o guarda-corpo (que consome quase 6× mais tinta) sairia barato demais.
      perda: (() => {
        const v = numCel(col.perda);
        return v > 1 ? v : v > 0 ? Math.round(v * 100) : null;
      })(),
      cor: colCor >= 0 ? cel(colCor) : "",
    });
  }
  if (!resumos.length) return { ok: false, erro: "Não encontrei nenhuma linha com peso na RESUMOS_EM." };

  // ── preços do aço por área (INDUSTRIALIZAÇÃO, item 1.1) ──
  // Vem de brinde: se o estudo já foi cotado, o portal não pede de novo.
  const precosPorArea = {};
  const ind = acharAba(wb, "INDUSTRIALIZ");
  if (ind) {
    const nomes = new Set(resumos.map((r) => norm(r.area)).filter(Boolean));
    for (const l of ind) {
      const desc = norm(l[1]);
      if (!nomes.has(desc)) continue;
      const preco = typeof l[5] === "number" ? l[5] : numeroBr(String(l[5] ?? ""));
      if (preco > 0) {
        const orig = resumos.find((r) => norm(r.area) === desc);
        if (orig) precosPorArea[orig.area] = preco;
      }
    }
  } else avisos.push("Sem aba INDUSTRIALIZAÇÃO — os preços do aço vieram vazios.");

  // ── MC_TINTAS: o esquema de pintura que o projeto definiu ──
  // Vitor (23/08/2026): "na parte da pintura não está trazendo as informações que estão no estudo
  // — tipo de tinta, quantidade, película que foi mencionada no projeto". Não estava mesmo: a
  // importação só lia o quantitativo. Produto, cor, sólidos e película são decisão de PROJETO,
  // não de custo — vêm prontos do estudo e ninguém deveria redigitar.
  const tintas = [];
  const mc = acharAba(wb, "MC_TINTAS");
  if (mc) {
    const iC = acharCabecalho(mc, ["camada", "solidos"], 8);
    if (iC >= 0) {
      const cT = colunas(mc[iC], {
        perda: ["perda"], camada: ["camada"], produto: ["produto"], cor: ["cor"],
        solidos: ["solidos"], peliculaSeca: ["pelicula"], areaM2: ["area de"],
        rendimento: ["rendimento"], litros: ["qtd. tinta", "qtd tinta"], precoLitro: ["preco/litro tinta", "preco/litro\ntinta"],
        litrosDiluente: ["qtd. diluente", "qtd diluente"], precoDiluente: ["preco/litro diluente", "preco/litro\ndiluente"],
      });
      let perdaAtual = 45;
      for (let i = iC + 1; i < mc.length; i++) {
        const l = mc[i] || [];
        const txt = (j) => (j >= 0 ? String(l[j] ?? "").trim() : "");
        const nu = (j) => (j >= 0 ? (typeof l[j] === "number" ? l[j] : numeroBr(txt(j))) : 0);
        const primeira = String(l[0] ?? "").trim();
        // ⚠ a linha de titulo do grupo ("ESTRUTURA — FATOR DE PERDA: 85%") define a perda das
        // linhas seguintes; sem ela, todas as camadas cairiam no grupo de 45%.
        const mPerda = /(\d{2})\s*%/.exec(primeira);
        if (/fator de perda/i.test(primeira) && mPerda) { perdaAtual = Number(mPerda[1]); continue; }
        if (/^total/i.test(primeira)) break;
        const camada = txt(cT.camada).toUpperCase();
        if (!camada || camada === "N/A") continue;
        const p = nu(cT.perda);
        tintas.push({
          perda: p > 1 ? Math.round(p) : p > 0 ? Math.round(p * 100) : perdaAtual,
          camada, produto: txt(cT.produto), cor: txt(cT.cor),
          solidos: nu(cT.solidos) || null, peliculaSeca: nu(cT.peliculaSeca) || null,
          // ⚠ a área NÃO vem junto: ela é do escopo cheio da planilha e viraria número fixo,
          // ignorando quem desmarcar uma área depois. Fica só como referência do que foi lido.
          areaImportada: nu(cT.areaM2) || null,
          precoLitro: nu(cT.precoLitro) || null,
          precoDiluente: nu(cT.precoDiluente) || null,
        });
      }
    }
  }
  if (!tintas.length) avisos.push("Sem esquema de pintura na MC_TINTAS — as camadas ficaram em branco.");

  const semCoef = resumos.filter((r) => !r.coef && !r.areaM2).length;
  if (semCoef) avisos.push(`${semCoef} ${semCoef === 1 ? "área veio" : "áreas vieram"} sem coeficiente nem área de pintura — a área será estimada pelo perfil.`);
  const semClasse = resumos.filter((r) => !r.classificacao || r.classificacao === "N/A").length;
  if (semClasse) avisos.push(`${semClasse} sem classificação — fabricação e pintura ficam zeradas nessas linhas.`);

  return {
    ok: true, resumos, precosPorArea, tintas, avisos,
    resumo: {
      areas: resumos.length,
      pesoKg: Math.round(resumos.reduce((a, r) => a + numeroBr(r.pesoUnit) * numeroBr(r.quantidade || 1) * numeroBr(r.unidades || 1), 0)),
      areaM2: Math.round(resumos.reduce((a, r) => a + (numeroBr(r.areaM2) || 0), 0)),
      comPreco: Object.keys(precosPorArea).length,
      cores: [...new Set(resumos.map((r) => r.cor).filter(Boolean))],
      camadas: tintas.length,
      perda85: resumos.filter((r) => perdaDaEstrutura(r.estrutura) === 85).length,
    },
  };
}
