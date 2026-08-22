import "server-only";
import * as XLSX from "xlsx";
import { listChildrenByPath, downloadFileById } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";

// ─── LER O PLP DA PASTA DA OBRA ───────────────────────────────────────────────
// Vitor (22/08/2026): "esse será sempre o caminho" — apontando para
//   <OP>/8. Qualidade/PLP
// "e também pode ser criado no relatório como você deixou".
//
// Então a ordem é esta: o PLP É a planilha controlada da Torg (PLP Nº T067, Rev 0),
// que a Qualidade já emite por obra. O portal LÊ de lá; o formulário do relatório
// existe para a obra que ainda não tem planilha e para corrigir o que a leitura não
// entendeu. Um segundo cadastro paralelo ao documento oficial seria pior que nenhum.
//
// A planilha tem três folhas:
//   FL 1  capa — PLP nº, revisão, empreendimento, cliente
//   FL 2  §1 sistemas de pintura (preparação + fundo/intermediária/acabamento com
//         "demão / espessura") e §2 especificações das tintas (o produto de verdade)
//   FL 3  §3 os itens da estrutura, com o sistema aplicado e a cor
//
// ⚠ SheetJS, não ExcelJS: o .xls antigo é lido direto e sem carregar a pasta inteira
// em memória — a mesma escolha do import do CMR (ver [[torg_qualidade_import_cmr]]).

const OP_BASE = process.env.SHAREPOINT_OP_BASE_FOLDER || "/Ordem de Servico/01. OP";
const t = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/** A pasta PLP da OP, no caminho que o Vitor fixou. */
async function pastaPlp(driveId, opNumero) {
  const num = parseInt(String(opNumero).match(/\d+/)?.[0] || "", 10);
  if (!num) return null;
  const root = await listChildrenByPath(driveId, OP_BASE).catch(() => []);
  const op = root.filter((c) => c.folder).find((c) => new RegExp(`^OP\\s*-?\\s*0*${num}(?!\\d)`, "i").test(c.name || ""));
  if (!op) return null;
  const kids = await listChildrenByPath(driveId, `${OP_BASE}/${op.name}`).catch(() => []);
  const qual = kids.filter((c) => c.folder).find((c) => /qualidade/i.test(c.name || ""));
  if (!qual) return null;
  const subs = await listChildrenByPath(driveId, `${OP_BASE}/${op.name}/${qual.name}`).catch(() => []);
  const plp = subs.filter((c) => c.folder).find((c) => /^plp$/i.test(t(c.name)));
  return plp ? { caminho: `${OP_BASE}/${op.name}/${qual.name}/${plp.name}`, opFolder: op.name } : null;
}

/**
 * "Jateamento ao Metal quase Branco Padrão Sa 2 1/2" → método + grau.
 *
 * O texto vem escrito à mão em cada PLP; casar por trecho é o único jeito que
 * sobrevive à variação de redação de uma obra para outra.
 */
export function lerPreparacao(texto) {
  const s = t(texto).toLowerCase();
  if (!s || s === "-") return {};
  const metodo = /jateament|jatead/.test(s) ? "Jateamento abrasivo"
    : /qu[íi]mic/.test(s) ? "Produtos químicos"
    : /manual|mec[âa]nic|lixament|escovament|raspagem/.test(s) ? "Ferramentas manuais e/ou mecânicas"
    : null;
  // ⚠ "sa 2 1/2" vem antes de "sa 2": testar na ordem errada classifica tudo como SA2.
  const grau = /sa\s*3|metal branco/.test(s) ? "SA3"
    : /sa\s*2\s*1\/2|sa\s*2[.,]5|quase branco/.test(s) ? "SA2.5"
    : /sa\s*2|comercial/.test(s) ? "SA2"
    : /sa\s*1|brush|ligeir/.test(s) ? "SA1"
    : /st\s*3/.test(s) ? "ST3"
    : /st\s*2/.test(s) ? "ST2"
    : null;
  return { preparoMetodo: metodo, grauLimpeza: grau };
}

/** "´1 / 100" → { demaos: 1, espessura: 100 }. O ´ é marca de texto do Excel. */
export function lerDemaoEspessura(celula) {
  const s = t(celula).replace(/^´/, "");
  if (!s || s === "-") return null;
  const m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return { demaos: Number(m[1]), espessura: Number(m[2]) };
  const so = s.match(/(\d+)\s*µ?m?/);
  return so ? { demaos: 1, espessura: Number(so[1]) } : null;
}

/** Onde está a linha que começa com este texto (procura na 1ª coluna preenchida). */
const acharLinha = (linhas, rx) => linhas.findIndex((l) => rx.test(t((l || []).filter(Boolean)[0])));

export function interpretarPlanilha(buffer) {
  const wb = XLSX.read(buffer);
  const folha = (nome) => {
    const k = wb.SheetNames.find((n) => t(n).toUpperCase() === nome);
    return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, blankrows: false, defval: "" }) : [];
  };
  const fl1 = folha("FL 1"), fl2 = folha("FL 2"), fl3 = folha("FL 3");

  // ⚠ AS CÉLULAS SÃO MESCLADAS. "PLP Nº" está na coluna 36 e "T067" na 40 — as colunas
  // entre elas existem e vêm vazias. Ler "a próxima célula" pega vazio; o que vale é a
  // próxima célula PREENCHIDA. Mesma armadilha no resto da planilha, resolvida abaixo
  // indexando pelo CABEÇALHO em vez de por posição fixa: assim outro PLP com layout
  // diferente continua sendo lido.
  const aoLado = (linhas, rx) => {
    for (const l of linhas) {
      const cols = (l || []).map(t);
      const i = cols.findIndex((c) => rx.test(c));
      if (i < 0) continue;
      const v = cols.slice(i + 1).find(Boolean);
      if (v) return v;
    }
    return null;
  };
  const numero = aoLado([...fl1, ...fl2], /^PLP\s*N/i);
  const revisao = aoLado([...fl1, ...fl2], /^Revis[ãa]o:?$/i);

  // ── §2: especificações das tintas — "Tinta Poliuretano Dupla Função" → o produto ──
  // Vem ANTES no código porque §1 cita a especificação e é aqui que ela vira produto.
  const especs = new Map();
  const i2 = acharLinha(fl2, /^2-\s*Especifica/i);
  if (i2 >= 0) {
    const cab = (fl2[i2 + 1] || []).map(t);
    const col = (rx) => cab.findIndex((c) => rx.test(c));
    const cEspec = Math.max(0, col(/^Especifica/i));
    const cProd = col(/^Produto/i);
    const cDil = col(/^Dilui/i);
    for (const l of fl2.slice(i2 + 2)) {
      const c = (l || []).map(t);
      const chave = c[cEspec];
      if (!chave || /^3-/.test(chave)) break;
      especs.set(chave.toLowerCase(), {
        produto: (cProd >= 0 ? c[cProd] : null) || null,
        diluicao: (cDil >= 0 ? c[cDil] : null) || null,
      });
    }
  }

  // ── §1: o sistema de pintura ──────────────────────────────────────────────
  // Colunas: sistema | preparação | fundo(tinta, dem/esp) | intermediária | acab. fábrica | acab. campo
  const demaos = [];
  let preparacao = null;
  const i1 = acharLinha(fl2, /^1-\s*Sistemas/i);
  if (i1 >= 0) {
    const linha = fl2.slice(i1 + 3).find((l) => t((l || [])[0]) === "1");
    if (linha) {
      const c = linha.map(t);
      preparacao = c[1] || null;
      // pares (tinta, demão/espessura) a partir da coluna 2; o acabamento de CAMPO fica
      // de fora: ele é retoque em obra, não demão de fabricação.
      const rotulos = ["Fundo", "Intermediária", "Acabamento"];
      for (let k = 0; k < 3; k++) {
        const tinta = c[2 + k * 2];
        const de = lerDemaoEspessura(c[3 + k * 2]);
        if (!tinta || tinta === "-") continue;
        const esp = especs.get(tinta.toLowerCase());
        for (let n = 0; n < (de?.demaos || 1); n++) {
          demaos.push({
            ordem: demaos.length + 1,
            nome: rotulos[k],
            // o produto real quando a §2 descreve; senão a própria especificação
            produto: esp?.produto || tinta,
            fabricante: null,
            cor: null,
            espessuraMin: de?.espessura ?? null,
            espessuraMax: null,
          });
        }
      }
    }
  }

  // ── §3: cores por item da estrutura ───────────────────────────────────────
  const itens = [];
  const i3 = acharLinha(fl3, /^3-\s*Sistema de Pintura da Estrutura/i);
  if (i3 >= 0) {
    const cab = (fl3[i3 + 1] || []).map(t);
    const col = (rx) => cab.findIndex((c) => rx.test(c));
    const cEquip = col(/^Equipamento/i), cSist = col(/^Sistema/i), cCor = col(/^Cor/i), cObs = col(/^Observa/i);
    for (const l of fl3.slice(i3 + 2)) {
      const c = (l || []).map(t);
      if (!c[0] || !/^\d+$/.test(c[0])) continue;
      const equip = cEquip >= 0 ? c[cEquip] : null;
      if (!equip) continue;
      const obs = cObs >= 0 ? c[cObs] : null;
      itens.push({
        item: equip,
        sistema: (cSist >= 0 ? c[cSist] : null) || null,
        cor: (cCor >= 0 ? c[cCor] : null) || null,
        obs: obs === "-" ? null : obs || null,
      });
    }
  }
  // uma cor só na obra inteira vira a cor do acabamento; várias ficam na observação
  const cores = [...new Set(itens.map((i) => i.cor).filter(Boolean))];
  if (demaos.length && cores.length === 1) demaos[demaos.length - 1].cor = cores[0];

  const prep = lerPreparacao(preparacao);
  return {
    revisao: numero ? `${numero}${revisao != null && revisao !== "" ? ` R${revisao}` : ""}` : (revisao != null ? `R${revisao}` : null),
    ...prep,
    demaos,
    itens,
    espessuraTotal: demaos.reduce((s, d) => s + (d.espessuraMin || 0), 0) || null,
    observacoes: [
      preparacao ? `Preparação (PLP): ${preparacao}` : null,
      itens.length ? `Itens (PLP): ${itens.map((i) => `${i.item}${i.cor ? ` — ${i.cor}` : ""}`).join("; ")}` : null,
    ].filter(Boolean).join("\n") || null,
  };
}

/** Busca, baixa e interpreta o PLP da obra. `{ achou, arquivo, dados }`. */
export async function lerPlpDaObra(opNumero) {
  const driveId = await resolveServidorDriveId();
  if (!driveId) return { achou: false, erro: "Drive SERVIDOR não resolvido." };
  const pasta = await pastaPlp(driveId, opNumero);
  if (!pasta) return { achou: false, erro: `Pasta "8. Qualidade/PLP" não encontrada na OP-${String(opNumero).padStart(3, "0")}.` };

  const kids = await listChildrenByPath(driveId, pasta.caminho).catch(() => []);
  const arq = kids.filter((c) => c.file).find((c) => /\.xlsx?$/i.test(c.name || ""));
  if (!arq) return { achou: false, erro: "Nenhuma planilha de PLP na pasta.", caminho: pasta.caminho };

  const { buffer } = await downloadFileById(driveId, arq.id);
  try {
    return { achou: true, arquivo: arq.name, caminho: pasta.caminho, url: arq.webUrl || null, dados: interpretarPlanilha(buffer) };
  } catch (e) {
    return { achou: false, erro: `Não consegui ler "${arq.name}": ${e.message}`, caminho: pasta.caminho };
  }
}
