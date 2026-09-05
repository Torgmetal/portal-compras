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
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ⚠ A DESCRIÇÃO DA PLANILHA É LIVRE, o cadastro do portal não. "Fornecimento de TELHA ZIPADA
// TERMOACÚSTICA 0,50 × 0,43" é a mesma coisa que o item TELHA_TERMO — casar por palavra-chave é o
// que permite trazer a quantidade sem obrigar ninguém a renomear a planilha. O que não casar sai
// nos avisos, com o nome que veio: item inventado vale menos que item cobrado.
const CHAVE_COMERCIAL = [
  [/telha.*(termo|zipada|pir)/, "TELHA_TERMO"],
  [/telha/, "TELHA_SIMPLES"],
  [/calha/, "CALHAS"],
  [/rufo/, "RUFOS"],
  [/lanternim/, "LANTERNIM"],
  [/grade/, "GRADE_PISO"],
  [/chumbador/, "CHUMBADORES"],
  [/veneziana/, "VENEZIANAS"],
  [/steel\s*deck/, "STEEL_DECK"],
  [/linha de vida/, "LINHA_VIDA"],
];
function chaveItemComercial(desc) {
  const d = norm(desc);
  return CHAVE_COMERCIAL.find(([rx]) => rx.test(d))?.[1] || null;
}

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

  // ⚠ A MESMA TABELA MUDA DE NOME DE ABA CONFORME A GERAÇÃO DA LQC. Vitor (30/08/2026): "a 227-26
  // não conseguimos transformar ela em LQC?". A LQC-227-26 (Danpower ENC 0336) é de um modelo
  // anterior: a tabela de resumo se chama "ESTIMATIVAS" ali, e "RESUMOS_EM" (ou "RESUMO_EM", na
  // 228-26 TECHNIK) nas mais novas. É o MESMO cabeçalho e as MESMAS colunas — recusar por causa do
  // nome da aba jogava fora um levantamento pronto.
  //
  // ⚠ Sem risco de pegar a aba errada: logo abaixo o cabeçalho tem que ter "classificação" e "peso
  // total", senão a importação para. O nome só decide por onde começar a procurar.
  const linhas = acharAba(wb, "RESUMOS_EM") || acharAba(wb, "RESUMO") || acharAba(wb, "ESTIMATIV");
  if (!linhas) return { ok: false, erro: "A planilha não tem a aba de resumo (RESUMOS_EM / RESUMO_EM / ESTIMATIVAS)." };

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
      // ⚠⚠ O PESO É O DA PLANILHA, NÃO UMA CONTA MINHA. A coluna "Peso Total Estimado" já vinha
      // sendo LIDA (é ela que decide se a linha entra) e era JOGADA FORA — `calcularLqc` então caía
      // no recálculo `quantidade × unidades × peso unit.`, que não é como a LQC funciona:
      //
      //   · ORCA 186-26: a linha 1.9 tem quantidade 143,64 e a planilha NÃO multiplica por ela —
      //     o peso unitário já é o total da área. Recalculando dava 5.382 t onde são 594 t.
      //   · MSE-DC 252-26: os 810 m estão na coluna de UNIDADE, não na de quantidade — o peso
      //     de 38,8 t virava 48 kg.
      //
      // Conferido nas 56 planilhas contra a linha "Total" que cada uma declara. Peso errado aqui
      // vira preço errado na proposta, e preço errado assinado não se desfaz.
      pesoTotal: peso,
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

  // ── o preço do aço (INDUSTRIALIZAÇÃO) ──
  //
  // ⚠⚠ A ABA TEM DUAS ORGANIZAÇÕES, E EU SÓ TRATAVA A RARA. Vitor (30/08/2026): "os custos das
  // obras estão errados; no caso da Orca o preço sugerido está em 3,68 o kg". Estava mesmo, e o
  // motivo era este: `aco: 0` e `material: 0` em TODAS as áreas — R$ 3,68 era só fabricação e
  // pintura, sem a matéria-prima, que é a maior parcela de uma estrutura metálica.
  //
  //   · POR ÁREA — a coluna B traz "APOIOS E ARTICULAÇÕES", "GALERIA", cada uma com seu R$/kg.
  //     É a LQC-081-26-TMSA, o arquivo em cima do qual esta leitura foi escrita.
  //   · POR MATERIAL — a coluna B traz "W laminado", "Chapa Lisa", "Tubo", e o preço da obra sai
  //     na linha "1.1 MATÉRIA PRIMA", em R$/kg sobre o peso inteiro.
  //
  // Medido nas 57 planilhas de 2026: **56 são por MATERIAL e 1 é por área**. Eu tinha construído
  // em cima da exceção, então o aço saía zerado em 56 de 57 estudos.
  //
  // ⚠ O BLENDADO NÃO É CHUTE: é o mesmo R$/kg que a planilha usa para fechar o subtotal dela. Só
  // é menos detalhado que o por área — e por isso o por área continua tendo preferência.
  const precosPorArea = {};
  let precoMateriaPrima = null, fixadoresRsKg = null;
  const ind = acharAba(wb, "INDUSTRIALIZ");
  if (ind) {
    // as colunas vêm do cabeçalho, não de posição fixa: "Preço Unit. (R$/kg)" já apareceu em
    // colunas diferentes entre gerações da planilha
    const iCabInd = acharCabecalho(ind, ["descricao", "preco unit"], 8);
    const cInd = iCabInd >= 0
      ? colunas(ind[iCabInd], { desc: ["descricao"], peso: ["peso total"], precoKg: ["preco unit"], subtotal: ["subtotal"] })
      : { desc: 1, peso: 4, precoKg: 5, subtotal: 6 };
    const numDe = (l, j) => (j >= 0 ? (typeof l[j] === "number" ? l[j] : numeroBr(String(l[j] ?? ""))) : 0);

    const nomes = new Set(resumos.map((r) => norm(r.area)).filter(Boolean));
    for (const l of ind) {
      const desc = norm(l[cInd.desc]);
      if (!desc) continue;
      // (a) por área
      if (nomes.has(desc)) {
        const preco = numDe(l, cInd.precoKg);
        if (preco > 0) {
          const orig = resumos.find((r) => norm(r.area) === desc);
          if (orig) precosPorArea[orig.area] = preco;
        }
        continue;
      }
      // (b) por material: as linhas-resumo do bloco 1
      // ⚠ "materia prima" e não "material para industrializacao": a segunda é o TOTAL do bloco, já
      // com fixadores e tintas dentro. Usá-la cobraria tinta duas vezes — o portal calcula a
      // pintura por conta própria, a partir do esquema da MC_TINTAS.
      if (/^materia\s*prima$/.test(desc)) precoMateriaPrima = numDe(l, cInd.precoKg) || precoMateriaPrima;
      else if (/^fixadores$/.test(desc)) fixadoresRsKg = numDe(l, cInd.precoKg) || fixadoresRsKg;
    }
    if (!Object.keys(precosPorArea).length && !precoMateriaPrima)
      avisos.push("Não achei o preço do aço na INDUSTRIALIZAÇÃO — a matéria-prima ficou zerada.");
  } else avisos.push("Sem aba INDUSTRIALIZAÇÃO — os preços do aço vieram vazios.");

  // ── BDI: os percentuais que a planilha usou ──
  //
  // ⚠⚠ SEM ISSO O ESTUDO MOSTRA CUSTO NO LUGAR DE PREÇO. Sem `bdi`, `calcularLqc` fecha com
  // preço = custo — e a tela dizia "preço sugerido R$ 12,08/kg" quando aquilo era o CUSTO. Número
  // de custo apresentado como preço é o erro que vira proposta no prejuízo.
  //
  // ⚠ A conta do portal é a mesma da planilha: (1+adm+seguro+risco)/(1−(impostos+financeiras+
  // margem+comissões))−1. Na ORCA: 1/(1−0,22) = 0,28205 — exatamente a célula "BDI" do arquivo.
  // Confirmado antes de escrever, e é o que garante que importar não inventa margem nenhuma.
  //
  // ⚠ Percentual vem em DECIMAL na planilha (0,055) e o portal trabalha em pontos (5,5).
  const bdi = {};
  const abaBdi = acharAba(wb, "BDI");
  if (abaBdi) {
    const DE_PARA = [
      [/administra/, "administracao"], [/^seguro/, "seguro"], [/^risco/, "risco"],
      [/^impostos/, "impostos"], [/financeir|factoring/, "factoring"],
      [/margem de lucro/, "margem"], [/^comiss/, "comissoes"],
    ];
    for (const l of abaBdi) {
      // o rótulo pode estar na coluna A ou B conforme a geração da planilha
      const rot = norm(l[1]) || norm(l[0]);
      if (!rot) continue;
      const alvo = DE_PARA.find(([rx]) => rx.test(rot))?.[1];
      if (!alvo || bdi[alvo] !== undefined) continue;
      // o percentual é a coluna à direita do valor em R$; aceita 0 (adm/seguro/risco zerados)
      const v = typeof l[3] === "number" ? l[3] : numeroBr(String(l[3] ?? ""));
      if (Number.isFinite(v)) bdi[alvo] = Math.round(v * 100 * 10000) / 10000;
    }
    if (!Object.keys(bdi).length) avisos.push("Não achei os percentuais na aba BDI — o preço sai igual ao custo.");
  }

  // ── o que a planilha fechou (PLANILHA COMERCIAL) ──
  // Não entra na conta: entra como CONFERÊNCIA. É o número que foi ao cliente, e ter ele ao lado do
  // que o portal calcula é o que denuncia na hora um custo que saiu errado — como os R$ 3,68/kg.
  let precoPlanilha = null;
  const blocos = { fornecimento: 0, comerciais: 0, montagem: 0, outros: 0 };
  const itensComerciais = {};
  const comerciaisNaoMapeados = [];
  const pc = acharAba(wb, "PLANILHA COMERCIAL");
  if (pc) {
    const iCabPc = acharCabecalho(pc, ["descricao", "valor"], 8);
    const cPc = iCabPc >= 0
      ? colunas(pc[iCabPc], { desc: ["descricao"], un: ["un."], quant: ["quant"], unit: ["unit"], valor: ["valor r$", "valor"] })
      : { desc: 1, un: 2, quant: 3, unit: 4, valor: 5 };
    const numDe = (l, j) => (j >= 0 ? (typeof l[j] === "number" ? l[j] : numeroBr(String(l[j] ?? ""))) : 0);

    // ── ⚠⚠ A PLANILHA TEM TRÊS BLOCOS, E O PORTAL SÓ CALCULA UM ────────────────────────────────
    //
    // Auditoria de 05/09/2026, comparando o preço do portal com o da planilha em 54 estudos: só 4
    // ficavam dentro de ±5%, e 44 saíam ABAIXO — a mediana em −25%. A causa não era erro de conta:
    // é escopo. A LQC-253 (A.YOSHII/SESI) fecha em R$ 16,96 mi assim:
    //
    //     1. FORNECIMENTO DE ESTRUTURAS ... R$  6.924.628   ← o único que o portal calcula
    //     2. FORNECIMENTO ITENS COMERCIAIS  R$  4.757.836   ← telha, calha, rufo, steel deck…
    //     3. MONTAGEM ..................... R$  5.276.017   ← montagem em campo e equipamentos
    //
    // Somar os três num `precoPlanilha` e comparar com o portal era comparar escopos diferentes —
    // e a conclusão saía errada ("o portal calcula 25% a menos"). Agora cada bloco é guardado à
    // parte: o de fornecimento é o que se confere contra a conta do portal, e os outros dois
    // aparecem como escopo que o estudo AINDA não modela (montagem) ou que ele modela e a
    // importação não trazia (itens comerciais).
    // ⚠ o título do bloco vem na coluna da DESCRIÇÃO (o "1", "2", "3" fica na coluna do item), e a
    // coluna A da planilha é vazia. Procurar o título em l[1] achava só o número.
    let bloco = null;
    for (const l of pc) {
      const rot = norm(l[cPc.desc]) || norm(l[1]);
      const item = norm(l[1]) || norm(l[0]);
      if (/itens comerciais/.test(rot)) { bloco = "comerciais"; continue; }
      if (/^montagem/.test(rot)) { bloco = "montagem"; continue; }
      if (/fornecimento de estruturas/.test(rot)) { bloco = "fornecimento"; continue; }

      if (/^subtotal$/.test(item) || /^subtotal$/.test(rot)) {
        const v = numDe(l, cPc.valor);
        if (v > 0) {
          precoPlanilha = (precoPlanilha || 0) + v;
          blocos[bloco || "outros"] = r2(blocos[bloco || "outros"] + v);
        }
        continue;
      }

      // ── itens comerciais: quantidade e preço unitário, um por linha ──
      if (bloco === "comerciais") {
        const desc = String(l[cPc.desc] ?? "");
        const qtd = numDe(l, cPc.quant), unit = numDe(l, cPc.unit);
        if (!(qtd > 0) || !(unit > 0)) continue;
        const key = chaveItemComercial(desc);
        if (key) itensComerciais[key] = { qtd: r2((itensComerciais[key]?.qtd || 0) + qtd), preco: unit };
        else comerciaisNaoMapeados.push(String(desc).trim().slice(0, 60));
      }
    }
  }
  if (comerciaisNaoMapeados.length)
    avisos.push(`Itens comerciais sem correspondência no portal: ${comerciaisNaoMapeados.join(", ")}.`);
  if (blocos.montagem > 0)
    avisos.push(`A planilha tem R$ ${Math.round(blocos.montagem).toLocaleString("pt-BR")} de MONTAGEM em campo — escopo que o estudo ainda não calcula.`);

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
    ok: true, resumos, precosPorArea, precoMateriaPrima, fixadoresRsKg, precoPlanilha, bdi, tintas, avisos,
    // os três blocos da PLANILHA COMERCIAL, separados — ver o comentário na leitura
    blocosPlanilha: blocos, itensComerciais,
    resumo: {
      areas: resumos.length,
      // ⚠ o peso do RESUMO é o mesmo da conta: a coluna "Peso Total" da planilha. Antes era
      // recalculado aqui (qtd × unidades × peso unit.) e podia divergir do que o estudo mostrava.
      pesoKg: Math.round(resumos.reduce((a, r) => a + numeroBr(r.pesoTotal), 0)),
      areaM2: Math.round(resumos.reduce((a, r) => a + (numeroBr(r.areaM2) || 0), 0)),
      comPreco: Object.keys(precosPorArea).length,
      precoMateriaPrima, precoPlanilha, blocosPlanilha: blocos,
      itensComerciais: Object.keys(itensComerciais).length,
      cores: [...new Set(resumos.map((r) => r.cor).filter(Boolean))],
      camadas: tintas.length,
      perda85: resumos.filter((r) => perdaDaEstrutura(r.estrutura) === 85).length,
    },
  };
}
