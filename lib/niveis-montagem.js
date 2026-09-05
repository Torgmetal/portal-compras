// ─── NÍVEIS DE MONTAGEM (a lista que a Engenharia já faz) ─────────────────────
//
// Vitor (03/09/2026): "no modelo da 118 temos a lista de peças por nível (…) temos as peças para
// poder olhar isso" — e mandou o caminho no SharePoint.
//
// ⚠⚠ O NÍVEL DE VERDADE É O DO PROJETO, NÃO O QUE EU MEÇO. O visualizador sabe agrupar peças por
// altura, mas altura medida é aproximação: dá "+12,16 m" onde o projeto diz "EL +12400 @ +12762".
// Quem monta fala a segunda língua, e ela já existe em arquivo — uma planilha por nível, na pasta
// 2.5.4 Montagem. Ler dali é usar o dado da casa em vez de reinventá-lo com outro nome.
//
// ⚠ E É EM MILÍMETRO. Vitor: "usamos a medida em mm não em metros". O nome do arquivo já vem assim
// ("T118 LE - EL +3100 @ +3265"), então o rótulo sai do próprio arquivo, sem conversão nenhuma.
import * as XLSX from "xlsx";
import { acharPastaOp, listChildrenByPath, downloadFileByPath } from "@/lib/sharepoint";
import { log } from "@/lib/log";

const registro = log("niveis-montagem");

const DRIVE = () => process.env.SHAREPOINT_DRIVE_ID;

// Onde a Engenharia guarda. A primeira é a pasta de trabalho; a segunda é a que vai ao cliente e
// serve de reserva para obra que só publicou a versão do cliente.
const PASTAS = [
  "2. Engenharia/2.5 Projetos/2.5.4 Montagem/Lista de Peças por Nível",
  "2. Engenharia/2.5 Projetos/2.5.5 Cliente/Montagem/Lista de Peças por Nível",
  "2. Engenharia/2.5 Projetos/2.5.5 Cliente/Montagem/Lista de Peças por Nível, Eixo, Área e Etc",
];

// "T118 LE - EL +3100 @ +3265.xlsx" → { rotulo: "EL +3100 @ +3265", mm: 3100 }
export function lerNomeNivel(arquivo) {
  const semExt = String(arquivo || "").replace(/\.[a-z]+$/i, "").trim();
  // tudo que vem depois do último " - " é o nível; se não houver, vale o nome inteiro
  const corte = semExt.lastIndexOf(" - ");
  const rotulo = (corte >= 0 ? semExt.slice(corte + 3) : semExt).trim();
  const m = /([+-]?\s*\d[\d.]*)/.exec(rotulo.replace(/EL\.?/i, ""));
  const mm = m ? Number(String(m[1]).replace(/[\s.]/g, "")) : null;
  return { rotulo, mm: Number.isFinite(mm) ? mm : null };
}

// ⚠ o que NÃO é marca de peça na planilha: o segundo bloco lista os consumíveis da montagem, com a
// palavra no lugar da marca. Sem isto, "PARAFUSO" viraria uma marca inexistente no filtro.
// ⚠⚠ O SEGUNDO BLOCO DA PLANILHA É O QUE APERTA A PEÇA, e ele conta. Vitor (03/09/2026): "não
// lista os parafusos dos níveis". Cada lista tem dois blocos: as marcas fabricadas e, embaixo, os
// consumíveis de montagem — parafuso, porca e arruela, com quantidade, norma e acabamento. Quem vai
// montar o EL +3265 precisa dos dois: sem os 24 parafusos Ø5/8" a peça não sobe.
const CONSUMIVEL = /^(PARAFUSO|PORCA|ARRUELA|CHUMBADOR)$/i;
const NAO_MARCA = /^(MARCA|ITEM|TOTAL)$/i;

// ⚠⚠ CÉLULA NUMÉRICA JÁ VEM NÚMERO. O SheetJS devolve 237.735 (duzentos e trinta e sete vírgula
// setecentos e trinta e cinco) como número — e tratar isso como texto brasileiro, tirando o ponto
// de milhar que não existe, transformava 237,735 kg em 237.735 kg. Um nível da OP-118 apareceu com
// 27.353.835 kg. Só texto passa pela conversão de vírgula.
function numBR(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").trim();
  if (!t) return null;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const x = Number(limpo);
  return Number.isFinite(x) ? x : null;
}

export function lerPlanilha(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { pecas: [], consumiveis: [] };
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const pecas = [], consumiveis = [];
  for (const l of linhas) {
    // coluna A = item (número), coluna B = marca (ou a palavra do consumível)
    const item = String(l[0] ?? "").trim();
    const marca = String(l[1] ?? "").trim();
    if (!marca || NAO_MARCA.test(marca)) continue;
    if (!/^\d+$/.test(item)) continue;
    const qtd = numBR(l[2]) ?? 1;
    const descricao = String(l[3] ?? "").trim();
    if (CONSUMIVEL.test(marca)) {
      // ⚠ no bloco de consumível as duas últimas colunas mudam de sentido: onde a peça traz área e
      // peso, o parafuso traz norma e acabamento.
      consumiveis.push({
        tipo: marca.toUpperCase(), qtd, descricao,
        norma: String(l[4] ?? "").trim(), acabamento: String(l[5] ?? "").trim(),
      });
    } else {
      pecas.push({ marca, qtd, kg: numBR(l[5]), descricao });
    }
  }
  return { pecas, consumiveis };
}

/**
 * Lê a pasta de listas por nível de uma OP.
 * @returns {Promise<{achou:boolean, pasta?:string, niveis:Array, erro?:string}>}
 */
export async function niveisDaMontagem(opNumero) {
  const base = await acharPastaOp(opNumero);
  if (!base) return { achou: false, niveis: [], erro: "Pasta da OP não encontrada." };

  let pasta = null, arquivos = [];
  for (const p of PASTAS) {
    try {
      const filhos = await listChildrenByPath(DRIVE(), `${base}/${p}`);
      const xls = (filhos || []).filter((f) => f.file && /\.xlsx?$/i.test(f.name));
      if (xls.length) { pasta = p; arquivos = xls; break; }
    } catch (e) { registro.erro('[niveis] falha em', p, e?.message); }
  }
  if (!pasta) return { achou: false, niveis: [], erro: "Esta obra ainda não tem lista de peças por nível." };

  // ⚠ em paralelo: são 14 planilhas na OP-118 e uma de cada vez levaria a rota ao limite de tempo.
  const niveis = await Promise.all(arquivos.map(async (f) => {
    const { rotulo, mm } = lerNomeNivel(f.name);
    try {
      const buf = await downloadFileByPath({ driveId: DRIVE(), fullPath: `${base}/${pasta}/${f.name}` });
      const { pecas, consumiveis } = lerPlanilha(buf);
      return {
        rotulo, mm, arquivo: f.name,
        marcas: [...new Set(pecas.map((p) => p.marca))],
        pecas: pecas.reduce((t, p) => t + (p.qtd || 0), 0),
        kg: pecas.reduce((t, p) => t + (p.kg || 0) * (p.qtd || 1), 0) || null,
        consumiveis,
      };
    } catch (e) {
      return { rotulo, mm, arquivo: f.name, marcas: [], pecas: 0, kg: null, consumiveis: [], erro: String(e?.message || e).slice(0, 120) };
    }
  }));

  // ⚠ ordem de obra: de baixo para cima, e o que não tem cota (Cobertura) fecha a lista.
  niveis.sort((a, b) => (a.mm ?? 1e9) - (b.mm ?? 1e9) || a.rotulo.localeCompare(b.rotulo));
  return { achou: true, pasta, niveis };
}
