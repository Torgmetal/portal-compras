import "server-only";
import { listChildrenByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";

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
    // duas fontes: os conjuntos (2.5.2.3) e os projetos de montagem (2.5.4)
    caminhos: [
      { label: "Conjunto", niveis: P(/engenharia/i, PROJETOS, /fabrica/i, /conjunto/i) },
      { label: "Montagem", niveis: P(/engenharia/i, PROJETOS, /montagem/i) },
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
  for (const c of cfg.caminhos) {
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
    const r = await descer(driveId, base, c.niveis);
    if (r.completo) fontes.push({ label: c.label, path: r.path });
    else if (r.mudou) {
      // achou parte do caminho — abre onde chegou, dizendo que é aproximação
      fontes.push({ label: `${c.label} (pasta aproximada)`, path: r.path, parcial: true });
      erros.push(`Esta OP não tem a pasta "${c.label}" no padrão; abrindo o nível mais próximo encontrado.`);
    } else {
      erros.push(`Pasta "${c.label}" não encontrada nesta OP.`);
    }
  }
  return { driveId, fontes, erros };
}

/** Lista uma pasta: subpastas (pra descer) + arquivos (pra escolher). */
export async function listarPasta(driveId, path) {
  const itens = await listChildrenByPath(driveId, path);
  const pastas = itens
    .filter((x) => x.folder)
    .map((x) => ({ nome: x.name, path: `${path.replace(/\/+$/, "")}/${x.name}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const arquivos = itens
    .filter((x) => x.file)
    .map((x) => ({
      id: x.id, nome: x.name, url: x.webUrl || null,
      mime: x.file?.mimeType || null, tamanho: x.size || null,
      modificadoEm: x.lastModifiedDateTime || null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return { path, pastas, arquivos };
}
