import "server-only";
import { prisma } from "./prisma";
import { listChildrenByPath, downloadFileByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";

// SOLDADORES E EPS — as duas listas que o ensaio visual de solda consulta.
//
// Vitor (21/08/2026): "selecionar o soldador, listar todos do nosso banco de dados e sempre que
// incluir um novo você traz ele aqui nos registros, e trazer as EPS que temos cadastrado".
//
// ⚠ O SOLDADOR VEM DO RH, NÃO DO CERTIFICADO. Era do Controle de Documentos, e ali só aparece quem
// já tem certificação lançada — 6 de 9. Contratou soldador ontem, ele não existia para o relatório,
// e o inspetor teria de digitar o nome à mão. Vindo do cadastro de funcionários, quem entra na
// empresa aparece aqui no mesmo dia; a certificação vira um AVISO, não um filtro.

/**
 * Todos os soldadores, com o estado da certificação.
 *
 * ⚠ O nome do certificado é abreviado ("VANDO MAXIMO") e o do RH é completo ("VANDO MAXIMO
 * RODRIGUES DE JESUS"). O casamento é por prefixo — comparar string inteira daria "sem certificado"
 * para quem tem.
 */
export async function listarSoldadores() {
  const [pessoas, rsq] = await Promise.all([
    prisma.funcionario.findMany({
      where: { cargo: { nome: { contains: "sold", mode: "insensitive" } } },
      select: { id: true, nome: true, matricula: true, ativo: true, cargo: { select: { nome: true } } },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    }),
    lerRSQ().catch(() => []),
  ]);

  const norm = (t) => String(t || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

  // ⚠ o nome na RSQ e no RH podem divergir numa letra ("CHRISTIAN" × "CHRISTHIAN"). O casamento é
  // por prefixo dos dois lados; sem isso o soldador apareceria sem sinete, e o sinete é o que
  // identifica quem soldou.
  const casa = (a, b) => {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
    // primeiro nome + último sobrenome, para o caso da letra trocada no meio
    const px = x.split(" "), py = y.split(" ");
    return px[0].slice(0, 5) === py[0].slice(0, 5) && px[px.length - 1] === py[py.length - 1];
  };

  const lista = pessoas.map((p) => {
    const quals = rsq.filter((q) => casa(p.nome, q.nome));
    return {
      id: p.id,
      nome: p.nome,
      matricula: p.matricula || null,
      cargo: p.cargo?.nome || null,
      ativo: p.ativo,
      // ⚠ o sinete vem da RSQ e é o mesmo para todas as qualificações da pessoa
      sinete: quals[0]?.sinete || null,
      processos: [...new Set(quals.map((q) => q.processo).filter(Boolean))],
      cqs: quals.map((q) => q.cqs),
      qualificado: quals.length > 0,
    };
  });

  // ⚠ quem está na RSQ mas não no RH entra assim mesmo: é gente que solda para a Torg, e o
  // relatório precisa poder citá-la. Some da lista seria pior que aparecer sem matrícula.
  for (const q of rsq) {
    if (lista.some((s) => casa(s.nome, q.nome))) continue;
    lista.push({
      id: `rsq-${q.cqs}`, nome: q.nome, matricula: null, cargo: null, ativo: true,
      sinete: q.sinete, processos: [q.processo].filter(Boolean), cqs: [q.cqs],
      qualificado: true, foraDoRH: true,
    });
  }

  return lista.sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── EPS ────────────────────────────────────────────────────────────────────────────────────────
//
// As especificações de procedimento de soldagem vivem no SGQ, em 12 Qualificações / Soldadores /
// EPS + RQPS — uma pasta por EPS. Ler dali é o que faz uma EPS nova aparecer sozinha no relatório.
//
// ⚠ Cache de 10 min: são dezenas de chamadas ao Graph e a lista muda uma vez por ano.

// ── EPS ────────────────────────────────────────────────────────────────────────────────────────
//
// Vitor (21/08/2026) apontou a pasta: Qualidade / Workspace / EPS + RQPS. Aqui as EPS são ARQUIVOS
// (EPS-RQPS 01 GMAW.pdf), não pastas — eu estava lendo um espelho antigo em 12 Qualificações, com
// nomes diferentes ("EPS 001_GMAW_Sólido_P1_A"). Duas listas para a mesma coisa é como um relatório
// cita uma EPS que ninguém encontra depois.
//
// ⚠ Cache de 10 min: a lista muda uma vez por ano e a varredura custa chamadas ao Graph.

const PASTA_EPS = "/Qualidade/Workspace/EPS + RQPS";
const PASTA_RSQ = "/Qualidade/Workspace/Qualificações/3. Soldadores";

let cacheEPS = { em: 0, lista: [] };
let cacheRSQ = { em: 0, lista: [] };
const TTL = 10 * 60 * 1000;

/** "EPS-RQPS 01 GMAW.pdf" → { codigo: "EPS-RQPS 01", processo: "GMAW" } */
export function lerNomeEPS(nome) {
  const base = String(nome).replace(/\.pdf$/i, "").trim();
  const m = base.match(/^EPS[-\s]*RQPS\s*(\d{1,3})\s*(.*)$/i);
  if (!m) return null;
  return {
    codigo: `EPS-RQPS ${m[1].padStart(2, "0")}`,
    processo: (m[2] || "").trim() || null,
    nome: base,
  };
}

export async function listarEPS(forcar = false) {
  if (!forcar && Date.now() - cacheEPS.em < TTL && cacheEPS.lista.length) return cacheEPS.lista;
  const driveId = await resolveServidorDriveId();
  if (!driveId) return cacheEPS.lista;
  const filhos = await listChildrenByPath(driveId, PASTA_EPS).catch(() => []);
  const lista = filhos
    .filter((x) => x.file && /\.pdf$/i.test(x.name) && !/resumida/i.test(x.name))
    .map((x) => lerNomeEPS(x.name))
    .filter(Boolean)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  if (lista.length) cacheEPS = { em: Date.now(), lista };
  return lista;
}

/**
 * A RELAÇÃO DE SOLDADORES QUALIFICADOS (RSQ) — a fonte de verdade do sinete.
 *
 * ⚠ É DELA QUE SAI O SINETE (S-01, S-04…), e o sinete é o que identifica quem soldou a junta no
 * relatório. Não existe em lugar nenhum do portal: nem no RH, nem no Controle de Documentos. Sem
 * ler a RSQ, o campo "Sinete do Soldador" do ensaio por ultrassom seria digitado à mão.
 *
 * ⚠ A aba FL-2 é a da Torg (RSQ 001/25). A FL-3 é outra relação, de terceiros, com sinetes D-xx —
 * misturar as duas colocaria na lista gente que não é da fábrica.
 */
export async function lerRSQ(forcar = false) {
  if (!forcar && Date.now() - cacheRSQ.em < TTL && cacheRSQ.lista.length) return cacheRSQ.lista;
  const driveId = await resolveServidorDriveId();
  if (!driveId) return cacheRSQ.lista;

  const filhos = await listChildrenByPath(driveId, PASTA_RSQ).catch(() => []);
  const arq = filhos.find((x) => x.file && /^Rela.*Soldadores_Qualificados/i.test(x.name));
  if (!arq) return cacheRSQ.lista;

  let linhas;
  try {
    const XLSX = (await import("xlsx")).default || (await import("xlsx"));
    const bytes = await downloadFileByPath({ driveId, fullPath: `${PASTA_RSQ}/${arq.name}` });
    const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
    const aba = wb.Sheets["FL-2"];
    if (!aba) return cacheRSQ.lista;
    linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: "" });
  } catch { return cacheRSQ.lista; }

  // ⚠ o cabeçalho ocupa várias linhas mescladas; a linha de dado é a que começa com "NNN/NN"
  const out = [];
  for (const l of linhas) {
    const cqs = String(l[0] || "").trim();
    if (!/^\d{1,3}\/\d{2}$/.test(cqs)) continue;
    // ⚠ AS COLUNAS NÃO SÃO CONSECUTIVAS. A planilha usa células mescladas, então entre um dado e o
    // seguinte há colunas vazias: CQS em 0, sinete em 2, nome em 4 e processo em 10. Ler 0,1,2,3
    // devolvia o sinete no lugar do nome — e a lista saía com "S-01" como se fosse gente.
    const sinete = String(l[2] || "").trim();
    const nome = String(l[4] || "").trim();
    const processo = String(l[10] || "").trim();
    if (!nome) continue;
    out.push({ cqs, sinete: sinete || null, nome, processo: processo || null });
  }
  if (out.length) cacheRSQ = { em: Date.now(), lista: out };
  return out;
}
