import "server-only";
import { prisma } from "./prisma";
import { listChildrenByPath } from "./sharepoint";
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
  const [pessoas, certificados] = await Promise.all([
    prisma.funcionario.findMany({
      where: { cargo: { nome: { contains: "sold", mode: "insensitive" } } },
      select: { id: true, nome: true, matricula: true, ativo: true, cargo: { select: { nome: true } } },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    }),
    prisma.documentoQualidade.findMany({
      where: { ativo: true, categoria: "FUNCIONARIOS", nome: { contains: "SOLDADOR", mode: "insensitive" } },
      select: { nome: true, vinculo: true, dataValidade: true },
    }),
  ]);

  const norm = (t) => String(t || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const hoje = new Date();

  return pessoas.map((p) => {
    const alvo = norm(p.nome);
    const meus = certificados.filter((c) => {
      const v = norm(c.vinculo);
      return v && (alvo.startsWith(v) || v.startsWith(alvo));
    });
    const vencidos = meus.filter((c) => c.dataValidade && c.dataValidade < hoje).length;
    return {
      id: p.id,
      nome: p.nome,
      matricula: p.matricula || null,
      cargo: p.cargo?.nome || null,
      ativo: p.ativo,
      certificacoes: meus.map((c) => c.nome),
      // ⚠ vencido só quando TODAS vencem: ter a de arame sólido vencida não impede de soldar tubular
      vencido: meus.length > 0 && vencidos === meus.length,
      semCertificado: meus.length === 0,
    };
  });
}

// ── EPS ────────────────────────────────────────────────────────────────────────────────────────
//
// As especificações de procedimento de soldagem vivem no SGQ, em 12 Qualificações / Soldadores /
// EPS + RQPS — uma pasta por EPS. Ler dali é o que faz uma EPS nova aparecer sozinha no relatório.
//
// ⚠ Cache de 10 min: são dezenas de chamadas ao Graph e a lista muda uma vez por ano.

const PASTA_EPS = "/Administrativo/SGQ ISO 9001-2015/12 Qualificações/Soldadores/EPS + RQPS";
let cache = { em: 0, lista: [] };
const TTL = 10 * 60 * 1000;

/** "EPS 001_GMAW_Sólido_P1_A" → { codigo: "EPS 001", processo: "GMAW", detalhe: "Sólido P1 A" } */
export function lerNomeEPS(nome) {
  const m = String(nome).match(/^EPS\s*(\d{1,3})[_\s-]*(.*)$/i);
  if (!m) return null;
  const resto = (m[2] || "").split(/[_]/).filter(Boolean);
  return {
    codigo: `EPS ${m[1].padStart(3, "0")}`,
    processo: resto[0] || null,
    detalhe: resto.slice(1).join(" ") || null,
    nome,
  };
}

export async function listarEPS(forcar = false) {
  if (!forcar && Date.now() - cache.em < TTL && cache.lista.length) return cache.lista;
  const driveId = await resolveServidorDriveId();
  if (!driveId) return cache.lista;
  const filhos = await listChildrenByPath(driveId, PASTA_EPS).catch(() => []);
  const lista = filhos
    .filter((x) => x.folder && !/obsolet/i.test(x.name))
    .map((x) => lerNomeEPS(x.name))
    .filter(Boolean)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  if (lista.length) cache = { em: Date.now(), lista };
  return lista;
}
