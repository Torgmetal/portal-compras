import "server-only";
import { listarProdutosOmie } from "./omie-produtos";
import { listChildrenByPath, downloadFileById, uploadFileToFolder } from "./sharepoint";
import {
  PASTA_TEKLA, PREFIXO_ARQUIVO, linhasDaPlanilha, gerarPlanilhaMateriaisTekla, codigosDaPlanilha, codigosNovos, nomeDoArquivo,
} from "./materiais-tekla";

// ─── PUBLICA A PLANILHA DE MATERIAIS DO TEKLA QUANDO O OMIE GANHA PERFIL OU PARAFUSO ──────────
//
// Vitor (24/09/2026): "cadastrou vc cria uma planilha nova". O cadastro é lido direto do Omie (o
// cache `ProdutoOmie` só sincroniza às segundas) e comparado com os códigos da ÚLTIMA planilha da
// pasta — a pasta é o estado: sem tabela nova no banco, e quem quiser saber o que foi publicado
// olha a mesma pasta que o Tekla lê. Código que não estava lá → arquivo novo. Nada novo → nada.
//
// ⚠ Pasta vazia publica a primeira planilha. Última planilha ilegível LANÇA em vez de publicar:
// publicar "na dúvida" faria sair um arquivo novo a cada rodada do cron.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ehPlanilhaNossa = (f) => f?.file && String(f.name || "").startsWith(PREFIXO_ARQUIVO) && /\.xlsx$/i.test(f.name);

async function ultimaPlanilha(drive) {
  let filhos;
  try { filhos = await listChildrenByPath(drive, PASTA_TEKLA); }
  catch (e) {
    // pasta apagada: a publicação recria (uploadFileToFolder garante a pasta)
    if (/not ?found|itemNotFound|could not be found/i.test(e.message || "")) return null;
    throw e;
  }
  // o nome leva data e hora (AAAA-MM-DD HHhMM): a ordem alfabética é a cronológica
  return filhos.filter(ehPlanilhaNossa).sort((a, b) => a.name.localeCompare(b.name)).at(-1) || null;
}

/**
 * @param {{forcar?:boolean, agora?:Date}} [op]  forcar: publica mesmo sem cadastro novo (botão manual)
 */
export async function publicarMateriaisTekla({ forcar = false, agora = new Date() } = {}) {
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  if (!drive) throw new Error("SHAREPOINT_DRIVE_ID não configurado");

  const { perfis, parafusos } = linhasDaPlanilha(await listarProdutosOmie());
  // o Omie fora do ar devolve lista vazia antes de devolver erro: não publicar planilha vazia
  if (!perfis.length && !parafusos.length) throw new Error("O Omie não devolveu nenhum perfil nem parafuso — nada foi publicado.");

  const ultimo = await ultimaPlanilha(drive);
  const anteriores = ultimo ? await codigosDaPlanilha((await downloadFileById(drive, ultimo.id)).buffer) : null;
  const novos = codigosNovos([...perfis, ...parafusos].map((l) => l.codigo), anteriores);

  const resumo = { perfis: perfis.length, parafusos: parafusos.length, novos: novos.length, anterior: ultimo?.name || null };
  if (ultimo && !novos.length && !forcar) return { publicado: false, ...resumo };

  const buffer = await gerarPlanilhaMateriaisTekla({
    perfis, parafusos, novos: anteriores ? new Set(novos) : null, geradoEm: agora, anterior: ultimo?.name || null,
  });
  const up = await uploadFileToFolder({ folderPath: PASTA_TEKLA, fileName: nomeDoArquivo(agora), buffer, contentType: XLSX });
  return { publicado: true, arquivo: up.name, url: up.webUrl, ...resumo, codigosNovos: novos.slice(0, 50) };
}
