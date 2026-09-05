import "server-only";
import { listChildrenByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";
import { RX_ANEXAVEL } from "./databook-anexo";

// ONDE CADA SEÇÃO DO DATA BOOK BUSCA SEUS ARQUIVOS NO SHAREPOINT.
//
// Vitor (19/08/2026) mandou o caminho de cada seção e pediu, seção a seção, "deixar navegar na
// pasta e selecionar os arquivos que quero colocar" — o mesmo jeito do portal da Qualidade.
//
// Os caminhos vieram da estrutura `OP-000 - PADRÃO`, que é o molde de toda OP. Por isso há dois
// tipos:
//
//   escopo "OP"      → o caminho é RELATIVO à pasta da OP. `OP-000 - PADRÃO/8. Qualidade/1. PIT`
//                      vira `OP-070 - SNEF/8. Qualidade/1. PIT`. A pasta real da OP é achada por
//                      número, porque o nome completo muda (cliente, obra) e ninguém digita isso.
//   escopo "GLOBAL"  → caminho fixo, fora da OP: certificados do Almoxarifado, EPS/RQPS,
//                      qualificações, calibração. Valem pra qualquer data book.
//
// ⚠ O NOME DA PASTA NÃO É EXATO. No SharePoint aparecem "3.2 DM - Dimensional", "3.2 DM –
// Dimensional" (travessão), com e sem acento. Por isso cada nível casa por REGEX no nome, não por
// igualdade — a mesma lição de `buscarDesenhosOP`, que já achava a pasta de projetos assim.
//
// 🚫 Nada aqui COPIA arquivo. O data book aponta pro item no SharePoint (`sharepointItemId`), que
// continua sendo o original. Duplicar criaria duas verdades — e a revisão do arquivo lá não
// chegaria no data book.

/** Cada nível é um regex, ou `{ rx, nao }` quando precisa excluir um irmão parecido. */
const P = (...niveis) => niveis;
// "2.1 Projetos Orçados" x "2.5 Projetos": sem excluir o orçado, desce na pasta errada.
const PROJETOS = { rx: /projetos/i, nao: /or[çc]ad/i };

export const SECAO_PASTAS = {
  "02": {
    escopo: "OP",
    titulo: "Desenhos as-built",
    // Vitor (21/08/2026): "para a etapa 02 desenhos as-built, deixar navegar na pasta TODA da
    // engenharia". As duas primeiras continuam como atalho — é onde estão 90% dos desenhos — mas a
    // raiz da Engenharia entra como fonte pra dar acesso ao resto (detalhamento, revisões, croquis
    // fora do padrão). Sem ela o navegador travava fora dessas duas subpastas.
    //
    // ⚠ DUAS ARRUMAÇÕES CONVIVEM. As pastas do molde (2.5.2.3 Conjunto, 2.5.4 Montagem) valem para
    // OP-083, 084, 092, 105… mas em obra antiga elas existem VAZIAS e o material está sob
    // `2.5.5 Cliente (ENC ###)/Fabricação` e `.../Montagem/Projetos de Montagem` — é o caso da
    // OP-067, onde os 38 diagramas de montagem estavam lá. Por isso as duas variantes entram, e as
    // do cliente são `opcional` (só aparecem na OP que as tem, sem virar botão morto nas outras).
    caminhos: [
      { label: "Conjunto", niveis: P(/engenharia/i, PROJETOS, /fabrica/i, /conjunto/i) },
      { label: "Montagem", niveis: P(/engenharia/i, PROJETOS, /montagem/i) },
      { label: "Conjunto (pasta do cliente)", niveis: P(/engenharia/i, PROJETOS, /cliente/i, /fabrica/i), opcional: true },
      { label: "Montagem (pasta do cliente)", niveis: P(/engenharia/i, PROJETOS, /cliente/i, /montagem/i), opcional: true },
      { label: "Engenharia (toda)", niveis: P(/engenharia/i) },
    ],
  },
  "03": {
    escopo: "OP",
    titulo: "ARTs",
    // "DATABOOOK" com três O existe na OP-070 — o regex tolera qualquer número de "o"
    caminhos: [{ label: "ART", niveis: P(/qualidade/i, /data\s*bo+k/i, /art/i) }],
  },
  "07": {
    escopo: "GLOBAL",
    titulo: "EPS/WPS e RQPS/PQR",
    caminhos: [{ label: "EPS + RQPS", path: "/Qualidade/Workspace/EPS + RQPS" }],
  },
  "08": {
    escopo: "GLOBAL",
    titulo: "Qualificação dos soldadores",
    caminhos: [{ label: "Soldadores", path: "/Qualidade/Workspace/Qualificações/3. Soldadores" }],
  },
  "09": {
    escopo: "OP",
    titulo: "Mapa de soldagem",
    caminhos: [{ label: "Mapa de Juntas", niveis: P(/qualidade/i, /mapa\s*de\s*juntas/i) }],
  },
  "10": {
    escopo: "OP",
    titulo: "PIT/ITP",
    caminhos: [{ label: "PIT", niveis: P(/qualidade/i, /\bpit\b/i) }],
  },
  "11": {
    escopo: "OP",
    titulo: "Inspeção dimensional",
    caminhos: [{ label: "DM — Dimensional", niveis: P(/qualidade/i, /relat[óo]rios?\s*de\s*inspe/i, /dimensional/i) }],
  },
  "12": {
    escopo: "OP",
    titulo: "Ensaios (END)",
    // Vitor: "listar as duas pastas e selecionar os arquivos delas"
    caminhos: [
      { label: "EVS — Ensaio Visual de Solda", niveis: P(/qualidade/i, /relat[óo]rios?\s*de\s*inspe/i, /\bevs\b|visual\s*de\s*solda/i) },
      { label: "LP — Líquido Penetrante", niveis: P(/qualidade/i, /relat[óo]rios?\s*de\s*inspe/i, /\blp\b|l[íi]quido\s*penetrante/i) },
    ],
  },
  "13": {
    escopo: "GLOBAL",
    titulo: "Qualificação dos inspetores",
    caminhos: [{ label: "Inspetores", path: "/Qualidade/Workspace/Qualificações/1. Inspetores" }],
  },
  "14": {
    escopo: "OP",
    titulo: "Tratamento de superfície e pintura",
    caminhos: [{ label: "Relatório de Pintura", niveis: P(/qualidade/i, /relat[óo]rios?\s*de\s*inspe/i, /pintura/i) }],
  },
  "19": {
    escopo: "GLOBAL",
    titulo: "Certificados de calibração",
    caminhos: [{ label: "Calibração Instrumentos", path: "/Qualidade/Workspace/Calibração Instrumentos" }],
  },
  // §04, §05, §06 e §15 saem dos certificados do Almoxarifado, casados com o CMR. A pasta é a
  // mesma pras quatro; o que muda é o QUE se procura nela (aço, fixador, consumível, tinta).
  "04": { escopo: "GLOBAL", titulo: "Certificados de matéria-prima", caminhos: [CERTIFICADOS()] },
  "05": { escopo: "GLOBAL", titulo: "Certificados de fixadores", caminhos: [CERTIFICADOS()] },
  "06": { escopo: "GLOBAL", titulo: "Certificados de consumíveis de solda", caminhos: [CERTIFICADOS()] },
  "15": { escopo: "GLOBAL", titulo: "Certificados das tintas", caminhos: [CERTIFICADOS()] },
};

function CERTIFICADOS() {
  // ⚠ O ANO ESTÁ NO CAMINHO ("Certificados 2026"). Resolver na hora, e não fixar, senão em janeiro
  // o data book para de achar certificado sem ninguém entender por quê.
  return { label: "Certificados digitalizados", pathTemplate: "/Almoxarifado/01. Rastreabilidade/Certificados {ANO}/Certificados Digitalizados", porAno: true };
}

export const secaoNavega = (numero) => Object.prototype.hasOwnProperty.call(SECAO_PASTAS, numero);

const norm = (s) => String(s || "");

/**
 * Desce nível a nível casando por regex.
 *
 * ⚠ DESCE O QUE DER. As pastas que o Vitor mandou vêm do molde `OP-000 - PADRÃO`, mas OP antiga
 * não segue: a OP-070 tem `8. Qualidade/DATABOOOK` (com três O) e não tem "Relatórios de
 * Inspeção". Se o caminho quebrar no meio, devolve o nível MAIS FUNDO que alcançou, marcado como
 * parcial — a pessoa navega a partir dali. Devolver `null` deixaria a seção sem nada justamente
 * nas obras antigas, que é quando o data book mais é consultado.
 *
 * ⚠ Cada nível pode EXCLUIR: em "2. Engenharia" existem "2.1 Projetos Orçados" e "2.5 Projetos",
 * e /projetos/ pega o orçado primeiro (ordem alfabética) — descia na pasta errada e não achava
 * nada. É a mesma armadilha que `buscarDesenhosOP` já tratava.
 */
async function descer(driveId, base, niveis) {
  let atual = base;
  let completo = true;
  for (const nivel of niveis) {
    const rx = nivel.rx || nivel;
    const nao = nivel.nao || null;
    const filhos = await listChildrenByPath(driveId, atual).catch(() => []);
    const achou = filhos.find((c) => c.folder && rx.test(norm(c.name)) && !(nao && nao.test(norm(c.name))));
    if (!achou) { completo = false; break; }
    atual = `${atual}/${achou.name}`;
  }
  return { path: atual, completo, mudou: atual !== base };
}

const OP_BASE = process.env.SHAREPOINT_OP_BASE_FOLDER || "/Ordem de Servico/01. OP";

/**
 * Pasta real da OP no servidor — achada pelo NÚMERO, porque o nome completo varia.
 *
 * ⚠ PROCURA TAMBÉM EM "Finalizadas". Obra concluída sai da raiz e vai pro arquivo: são 98 pastas
 * lá dentro, e a OP-070 é uma delas — justamente a que o Vitor estava olhando. Sem esse fallback,
 * data book de obra entregue não acha arquivo nenhum, que é quando ele mais é consultado.
 *
 * ⚠ E O NOME NÃO SEGUE UM PADRÃO SÓ: "OP-070 - Snef", "OP 067 26-03-2026", "O.S.01-24 - Danpower".
 * Por isso o casamento é por número, tolerando hífen, espaço ou nada entre "OP" e o número.
 */
export async function pastaDaOP(driveId, opNumero) {
  const num = parseInt(String(opNumero).match(/\d+/)?.[0] || "", 10);
  if (!num) return null;
  const rx = new RegExp(`^(?:OP|O\\.?S\\.?)\\s*[-.]?\\s*0*${num}(?!\\d)`, "i");

  const root = await listChildrenByPath(driveId, OP_BASE).catch(() => []);
  const naRaiz = root.find((c) => c.folder && rx.test(norm(c.name)));
  if (naRaiz) return `${OP_BASE}/${naRaiz.name}`;

  const arquivo = root.find((c) => c.folder && /finalizad/i.test(norm(c.name)));
  if (!arquivo) return null;
  const base = `${OP_BASE}/${arquivo.name}`;
  const antigas = await listChildrenByPath(driveId, base).catch(() => []);
  const f = antigas.find((c) => c.folder && rx.test(norm(c.name)));
  return f ? `${base}/${f.name}` : null;
}

/**
 * Resolve os caminhos reais de uma seção.
 * @returns {Promise<{driveId:string, fontes:Array<{label,path}>, erros:string[]}>}
 */
export async function resolverPastasDaSecao(numero, opNumero) {
  const cfg = SECAO_PASTAS[numero];
  if (!cfg) return { driveId: null, fontes: [], erros: ["Seção sem pasta configurada."] };

  const driveId = await resolveServidorDriveId();
  if (!driveId) return { driveId: null, fontes: [], erros: ["Drive SERVIDOR não resolvido."] };

  let base = "";
  if (cfg.escopo === "OP") {
    base = await pastaDaOP(driveId, opNumero);
    if (!base) return { driveId, fontes: [], erros: [`Pasta da OP-${String(opNumero).padStart(3, "0")} não encontrada em ${OP_BASE}.`] };
  }

  const fontes = [];
  const erros = [];
  const ano = new Date().getFullYear();
  // ⚠ EM PARALELO. A §02 tem cinco caminhos e cada um desce a árvore; em série eram 2,5 s só para
  // saber onde procurar — e isso entra na conta de cada prévia de relatório dimensional.
  const resolvidos = await Promise.all(cfg.caminhos.map(async (c) => {
    if (c.path || c.pathTemplate) return null;
    return descer(driveId, base, c.niveis);
  }));
  let iCaminho = -1;
  for (const c of cfg.caminhos) {
    iCaminho++;
    if (c.path) { fontes.push({ label: c.label, path: c.path }); continue; }
    if (c.pathTemplate) {
      // tenta o ano corrente e cai pro anterior — certificado de dezembro fica na pasta do ano dele
      let achou = null;
      for (const a of [ano, ano - 1]) {
        const p = c.pathTemplate.replace("{ANO}", String(a));
        const ok = await listChildrenByPath(driveId, p).then(() => true).catch(() => false);
        if (ok) { achou = p; break; }
      }
      if (achou) fontes.push({ label: `${c.label} (${achou.match(/(\d{4})/)?.[1] || ""})`, path: achou });
      else erros.push(`Pasta de certificados não encontrada (${c.pathTemplate.replace("{ANO}", ano)}).`);
      continue;
    }
    const r = resolvidos[iCaminho];
    if (r.completo) fontes.push({ label: c.label, path: r.path });
    // caminho OPCIONAL só entra quando existe inteiro: é variante de arrumação, não o caminho
    // esperado — anunciar "pasta aproximada" pra uma alternativa que a OP não usa só confunde.
    else if (c.opcional) continue;
    else if (r.mudou) {
      // achou parte do caminho — abre onde chegou, dizendo que é aproximação
      fontes.push({ label: `${c.label} (pasta aproximada)`, path: r.path, parcial: true });
      erros.push(`Esta OP não tem a pasta "${c.label}" no padrão; abrindo o nível mais próximo encontrado.`);
    } else {
      erros.push(`Pasta "${c.label}" não encontrada nesta OP.`);
    }
  }
  // ⚠ FONTE OPCIONAL VAZIA NÃO VIRA BOTÃO. A OP-105 tem `2.5.5 Cliente/Fabricação` criada e sem
  // nada dentro; oferecer o atalho ali é o "botão que não traz informação" que o Vitor reprovou.
  // Uma listagem rasa por fonte opcional resolve — se não tem nem arquivo nem subpasta, cai fora.
  const opcionais = new Set(cfg.caminhos.filter((c) => c.opcional).map((c) => c.label));
  if (opcionais.size) {
    const vivos = await Promise.all(fontes.map(async (f) => {
      if (!opcionais.has(f.label)) return true;
      const filhos = await listChildrenByPath(driveId, f.path).catch(() => []);
      return filhos.length > 0;
    }));
    return { driveId, fontes: fontes.filter((_, i) => vivos[i]), erros };
  }

  return { driveId, fontes, erros };
}

/** Lista uma pasta: subpastas (pra descer) + arquivos (pra escolher). */
// ── CACHE CURTO DA LISTAGEM ─────────────────────────────────────────────────────────────────
//
// Montar um relatório dimensional percorre a MESMA árvore várias vezes: procura o desenho em cada
// fonte da seção, depois varre a pasta de NC1. Sem cache, a prévia da OP-089 levava 15 s só de
// idas ao Graph — e a tela, que pedia dados e depois o PDF, ficava 30 s parada parecendo travada.
//
// ⚠ 60 s de propósito: o suficiente para uma operação inteira aproveitar, curto o bastante para
// arquivo novo aparecer sem ninguém precisar recarregar nada.
const CACHE_LISTA = new Map(); // `${driveId}|${path}` → { em, dados }
const TTL_LISTA = 60 * 1000;

export async function listarPasta(driveId, path) {
  const chave = `${driveId}|${path}`;
  const c = CACHE_LISTA.get(chave);
  if (c && Date.now() - c.em < TTL_LISTA) return c.dados;
  const dados = await listarPastaDireto(driveId, path);
  // teto simples: a memória da função é compartilhada entre requisições
  if (CACHE_LISTA.size > 800) CACHE_LISTA.clear();
  CACHE_LISTA.set(chave, { em: Date.now(), dados });
  return dados;
}

async function listarPastaDireto(driveId, path) {
  const itens = await listChildrenByPath(driveId, path);
  const pastas = itens
    .filter((x) => x.folder)
    .map((x) => ({ nome: x.name, path: `${path.replace(/\/+$/, "")}/${x.name}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const arquivos = itens
    .filter((x) => x.file)
    .map((x) => ({
      id: x.id, nome: x.name, url: x.webUrl || null,
      // ⚠⚠ O ARQUIVO LEVA O CAMINHO, IGUAL À PASTA — e não levava.
      // Vitor (24/08/2026): "quando anexamos um novo projeto dá esse erro" — "Escolha um PDF.",
      // com a lista de PDFs na tela. A pasta sempre teve `path`; o arquivo, não. Quem escolhia
      // mandava `arq.path`, que era `undefined`, e a rota recusava um caminho vazio dizendo à
      // pessoa para escolher um PDF — que era exatamente o que ela tinha acabado de fazer.
      // Sem o `path` a chave do React também era `undefined` em todos os arquivos da lista.
      path: `${path.replace(/\/+$/, "")}/${x.name}`,
      mime: x.file?.mimeType || null, tamanho: x.size || null,
      modificadoEm: x.lastModifiedDateTime || null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return { path, pastas, arquivos };
}

/**
 * Todos os ARQUIVOS de uma pasta, descendo as subpastas.
 *
 * Vitor (21/08/2026): "vou precisar poder selecionar pastas inteiras de projetos". Uma pasta de
 * projeto tem subpastas (revisões, formatos, detalhamento), então marcar a pasta tem de trazer o
 * que está dentro delas também — senão a pessoa marca "Projeto X" e leva três arquivos da raiz.
 *
 * ⚠ COM TETO. Sem limite, marcar a raiz da Engenharia por engano anexaria a obra inteira ao data
 * book — milhares de itens, e desfazer é um a um. Para no `max` e devolve `truncado`, pra tela
 * dizer o que ficou de fora em vez de fingir que trouxe tudo.
 */
// O que ENTRA num data book. ⚠ A pasta de projetos da Engenharia é dominada por .dwg (o fonte do
// CAD), mais .ifc do modelo 3D e planilhas de controle. Varrer "2.5 Projetos" da OP-067 sem filtro
// dá 500 arquivos e nenhum deles é desenho pra ler: o livro mescla PDF, e um .dwg anexado vira uma
// página de "não foi possível anexar". Documento é o que dá pra abrir e assinar.
// ⚠ a lista mora em lib/databook-anexo — é a MESMA que o gerador sabe mesclar. Duplicar aqui já
// deixou entrar .webp, que o pdf-lib não embute.

export async function arquivosDaPasta(driveId, path, { max = 1000, profundidade = 6 } = {}) {
  const out = [];
  const ignorados = new Map(); // extensão → quantos
  let truncado = false;

  const descer = async (atual, nivel) => {
    if (truncado || nivel > profundidade) return;
    let itens;
    try { itens = await listChildrenByPath(driveId, atual); } catch { return; }
    const subs = [];
    for (const x of itens) {
      if (x.folder) { subs.push(`${atual.replace(/\/+$/, "")}/${x.name}`); continue; }
      if (!x.file) continue;
      if (!RX_ANEXAVEL.test(x.name || "")) {
        const ext = (String(x.name).match(/\.([a-z0-9]+)$/i)?.[1] || "?").toLowerCase();
        ignorados.set(ext, (ignorados.get(ext) || 0) + 1);
        continue;
      }
      if (out.length >= max) { truncado = true; return; }
      out.push({
        id: x.id, nome: x.name, url: x.webUrl || null,
        tamanho: x.size || null, modificadoEm: x.lastModifiedDateTime || null,
        pasta: atual,
      });
    }
    // em série: a varredura é de rede, e paralelizar aqui atrapalha o corte no `max`
    for (const sub of subs) { if (truncado) break; await descer(sub, nivel + 1); }
  };

  await descer(path, 0);
  return {
    arquivos: out, truncado, max,
    // pra tela dizer o que deixou pra trás — "anexei tudo" quando ficou .dwg de fora é meia verdade
    ignorados: [...ignorados.entries()].sort((a, b) => b[1] - a[1]).map(([ext, n]) => ({ ext, n })),
  };
}
