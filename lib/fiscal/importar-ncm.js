import "server-only";
import { randomUUID } from "node:crypto";
import { prismaDirect } from "@/lib/prisma";
import { textoDeBusca } from "@/lib/fiscal/tipi-planilha";

// ─── A TABELA NCM DO SISCOMEX ────────────────────────────────────────────────
//
// ⚠⚠ ELA NÃO DÁ ALÍQUOTA, E ISSO É O PONTO. A NCM é a NOMENCLATURA: código, descrição, hierarquia e
// vigência. Quem dá alíquota de IPI é a TIPI. Confundir as duas é o erro que o briefing chama de
// "não usar a NCM como substituta da TIPI" — e é o mesmo tipo de erro de confundir Imposto de
// Importação com IPI.
//
// ⚠⚠ MAS ELA É MELHOR QUE A TIPI NUM PONTO: **declara a própria vigência**. Cada código vem com
// `Data_Inicio`, `Data_Fim` e o ato que o criou. Essa vigência é DELA — nunca é transferida para a
// alíquota, que continua sem cobertura temporal comprovada (ver o contrato 1 no `schema.prisma`).

export const PARSER_VERSAO = "ncm-1";
const LOTE = 500;

const so = (v) => (v == null ? "" : String(v).trim());

/**
 * `dd/mm/aaaa` → Date, em UTC.
 *
 * ⚠ UTC, não São Paulo: isto é VIGÊNCIA (um dia do calendário legal), não o carimbo de quando algo
 * aconteceu. É a mesma lição que o prazo do fornecedor já custou neste projeto — meia-noite em São
 * Paulo é o dia anterior em UTC, e a data mostrada saía um dia antes da digitada.
 */
export function dataBr(v) {
  const m = so(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, ano] = m;
  // ⚠ "31/12/9999" é o jeito do Siscomig dizer "sem fim" — vira null, não uma data no ano 9999.
  if (ano === "9999") return null;
  const dt = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * O JSON do Siscomex, lido.
 *
 * ⚠ A lista traz os NÍVEIS junto das folhas ("01", "01.01", "0101.21.00") — 15.156 registros, dos
 * quais só parte é NCM de 8 dígitos. Guardamos todos: é a hierarquia que dá sentido à descrição,
 * exatamente como na TIPI.
 */
export function lerNcm(dados) {
  const problemas = [];
  const itens = [];
  for (const n of dados?.Nomenclaturas ?? []) {
    const codigo = so(n.Codigo).replace(/\D/g, "");
    const descricao = so(n.Descricao);
    if (!codigo || !descricao) { problemas.push({ codigo: so(n.Codigo), motivo: "Registro sem código ou sem descrição." }); continue; }
    itens.push({
      codigo,
      codigoFormatado: so(n.Codigo),
      descricao,
      vigenciaInicio: dataBr(n.Data_Inicio),
      vigenciaFim: dataBr(n.Data_Fim),
      atoTipo: so(n.Tipo_Ato_Ini) || null,
      atoNumero: so(n.Numero_Ato_Ini) || null,
      atoAno: so(n.Ano_Ato_Ini) || null,
    });
  }
  return { itens, problemas };
}

async function carregar(versaoId, itens) {
  const lit = (vs) => `{${vs.map((v) => (v == null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
  const iso = (d) => (d ? d.toISOString() : null);
  for (let i = 0; i < itens.length; i += LOTE) {
    const f = itens.slice(i, i + LOTE);
    await prismaDirect.$executeRaw`
      INSERT INTO "FiscalNcmCodigo"
        ("id","versaoId","codigo","codigoFormatado","descricao","vigenciaInicio","vigenciaFim",
         "atoTipo","atoNumero","atoAno")
      SELECT t.id, t.versao, t.codigo, t.formatado, t.descricao,
             t.ini::timestamp, t.fim::timestamp, t.tipo, t.numero, t.ano
      FROM UNNEST(
        ${lit(f.map(() => randomUUID()))}::text[],
        ${lit(f.map(() => versaoId))}::text[],
        ${lit(f.map((x) => x.codigo))}::text[],
        ${lit(f.map((x) => x.codigoFormatado))}::text[],
        ${lit(f.map((x) => x.descricao))}::text[],
        ${lit(f.map((x) => iso(x.vigenciaInicio)))}::text[],
        ${lit(f.map((x) => iso(x.vigenciaFim)))}::text[],
        ${lit(f.map((x) => x.atoTipo))}::text[],
        ${lit(f.map((x) => x.atoNumero))}::text[],
        ${lit(f.map((x) => x.atoAno))}::text[]
      ) AS t(id, versao, codigo, formatado, descricao, ini, fim, tipo, numero, ano)`;
  }
  return itens.length;
}

/** Mesma promoção da TIPI: curta, condicionada, e a anterior vira `SUBSTITUIDA` em vez de sumir. */
export async function promoverNcm(versaoId) {
  return prismaDirect.$transaction(async (tx) => {
    const nova = await tx.fiscalNcmVersao.findUnique({ where: { id: versaoId } });
    if (!nova) return { erro: "Versão não encontrada." };
    if (nova.status === "ATIVA") return { jaEstava: true, versao: nova };
    if (nova.status !== "VALIDADA") return { erro: `Só uma versão VALIDADA pode ser promovida (esta está ${nova.status}).` };
    await tx.fiscalNcmVersao.updateMany({ where: { status: "ATIVA" }, data: { status: "SUBSTITUIDA" } });
    const { count } = await tx.fiscalNcmVersao.updateMany({
      where: { id: versaoId, status: "VALIDADA" }, data: { status: "ATIVA", aprovadoEm: new Date() },
    });
    if (!count) return { erro: "A versão mudou de estado durante a promoção — nada foi trocado." };
    return { versao: await tx.fiscalNcmVersao.findUnique({ where: { id: versaoId } }) };
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function importarNcm({ baixado, guardarArtefato }) {
  const { arquivo, jaExistia } = await guardarArtefato(baixado);
  if (jaExistia) {
    const anterior = await prismaDirect.fiscalNcmVersao.findFirst({
      where: { arquivoId: arquivo.id, parserVersao: PARSER_VERSAO, status: { in: ["ATIVA", "VALIDADA", "SUBSTITUIDA"] } },
      orderBy: { observadoEm: "desc" },
    });
    if (anterior) return { semMudanca: true, arquivo, versao: anterior };
  }

  const { itens, problemas } = lerNcm(baixado.dados);
  // ⚠ Mesmo teto folgado da TIPI: queda brusca é layout mudado, não a Receita apagando o mundo.
  const ativa = await prismaDirect.fiscalNcmVersao.findFirst({ where: { status: "ATIVA" } });
  const recusas = [...problemas];
  if (!itens.length) recusas.push({ motivo: "Nenhum código lido — o formato do Siscomex mudou." });
  if (ativa?.totalCodigos && itens.length && Math.abs(itens.length - ativa.totalCodigos) / ativa.totalCodigos > 0.4) {
    recusas.push({ motivo: `A quantidade de códigos saltou de ${ativa.totalCodigos} para ${itens.length} — revise antes de promover.` });
  }

  const versao = await prismaDirect.fiscalNcmVersao.create({
    data: {
      arquivoId: arquivo.id, parserVersao: PARSER_VERSAO, status: "IMPORTANDO",
      atoDeclarado: baixado.atoDeclarado ?? null, totalCodigos: itens.length,
    },
  });
  if (recusas.length) {
    await prismaDirect.fiscalNcmVersao.update({ where: { id: versao.id }, data: { status: "REJEITADA" } });
    return { rejeitada: true, arquivo, versao, recusas };
  }

  await carregar(versao.id, itens);
  const conferida = await prismaDirect.fiscalNcmCodigo.count({ where: { versaoId: versao.id } });
  if (conferida !== itens.length) {
    await prismaDirect.fiscalNcmVersao.update({ where: { id: versao.id }, data: { status: "REJEITADA" } });
    return { rejeitada: true, arquivo, versao, recusas: [{ motivo: `Carga incompleta: ${conferida} de ${itens.length}.` }] };
  }
  const validada = await prismaDirect.fiscalNcmVersao.update({ where: { id: versao.id }, data: { status: "VALIDADA" } });
  return { arquivo, versao: validada, gravadas: conferida };
}

export { textoDeBusca };
