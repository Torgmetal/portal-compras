import "server-only";
import { listarProdutosOmie } from "./omie-produtos";
import { listChildrenByPath, downloadFileById, uploadFileToFolder } from "./sharepoint";
import {
  PASTA_TEKLA, PREFIXO_ARQUIVO, linhasDaPlanilha, gerarPlanilhaMateriaisTekla, descricoesDaPlanilha, mudancasDoCadastro, nomeDoArquivo,
} from "./materiais-tekla";

// ─── PUBLICA A PLANILHA DE MATERIAIS DO TEKLA QUANDO O CADASTRO DE PERFIS E PARAFUSOS MUDA ─────
//
// Vitor (24/09/2026): "cadastrou vc cria uma planilha nova". O cadastro é lido direto do Omie (o
// cache `ProdutoOmie` só sincroniza às segundas) e comparado com a ÚLTIMA planilha da pasta — a
// pasta é o estado: sem tabela nova no banco, e quem quiser saber o que foi publicado olha a mesma
// pasta que o Tekla lê. Código que entrou, saiu (inativado) ou mudou de descrição → arquivo novo.
// Nada mudou → nada. Por que sair também conta: ver mudancasDoCadastro (lib/materiais-tekla.js).
//
// ⚠ Pasta vazia publica a primeira planilha. Última planilha ilegível LANÇA em vez de publicar:
// publicar "na dúvida" faria sair um arquivo novo a cada rodada do cron.
//
// ⚠⚠ SUMIÇO EM MASSA É LEITURA RUIM, NÃO LIMPEZA DE CADASTRO. Uma família renomeada no Omie ou uma
// resposta incompleta tiraria centenas de códigos de uma vez — e o Tekla passaria a ler uma planilha
// pela metade. Acima do limite o cron LANÇA (o monitor avisa) e nada vai para a pasta; limpeza
// grande de propósito se publica com `forcar`. A limpeza dos duplicados de 24/09 são 14 códigos.
const SAIDA_MAXIMA = { codigos: 20, fracao: 0.15 };

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

const semMudanca = (m) => !m.novos.length && !m.sairam.length && !m.alterados.length;
const amostra = (lista) => lista.map((x) => x.codigo ?? x).slice(0, 50);

function barrarSumicoEmMassa(sairam, anteriores) {
  if (sairam.length <= Math.max(SAIDA_MAXIMA.codigos, anteriores.size * SAIDA_MAXIMA.fracao)) return;
  throw new Error(`${sairam.length} de ${anteriores.size} perfis e parafusos sumiram do Omie de uma vez — parece leitura incompleta, não limpeza de cadastro. Nada foi publicado; se a limpeza foi de propósito, publique com "forçar".`);
}

async function lerUltima(drive) {
  const ultimo = await ultimaPlanilha(drive);
  if (!ultimo) return { nome: null, anteriores: null };
  return { nome: ultimo.name, anteriores: await descricoesDaPlanilha((await downloadFileById(drive, ultimo.id)).buffer) };
}

/**
 * @param {{forcar?:boolean, agora?:Date}} [op]  forcar: publica mesmo sem mudança, e mesmo com
 *   sumiço acima do limite (botão manual, decisão de quem olhou o cadastro)
 */
export async function publicarMateriaisTekla({ forcar = false, agora = new Date() } = {}) {
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  if (!drive) throw new Error("SHAREPOINT_DRIVE_ID não configurado");

  const { perfis, parafusos } = linhasDaPlanilha(await listarProdutosOmie());
  // o Omie fora do ar devolve lista vazia antes de devolver erro: não publicar planilha vazia
  if (!perfis.length && !parafusos.length) throw new Error("O Omie não devolveu nenhum perfil nem parafuso — nada foi publicado.");

  const { nome: anterior, anteriores } = await lerUltima(drive);
  const mud = mudancasDoCadastro([...perfis, ...parafusos], anteriores);
  const resumo = {
    perfis: perfis.length, parafusos: parafusos.length, novos: mud.novos.length, sairam: mud.sairam.length, alterados: mud.alterados.length, anterior,
  };
  if (!forcar && anteriores) {
    if (semMudanca(mud)) return { publicado: false, ...resumo };
    barrarSumicoEmMassa(mud.sairam, anteriores);
  }

  const buffer = await gerarPlanilhaMateriaisTekla({
    perfis, parafusos, novos: anteriores ? new Set(mud.novos) : null, sairam: mud.sairam, alterados: mud.alterados, geradoEm: agora, anterior,
  });
  const up = await uploadFileToFolder({ folderPath: PASTA_TEKLA, fileName: nomeDoArquivo(agora), buffer, contentType: XLSX });
  return {
    publicado: true, arquivo: up.name, url: up.webUrl, ...resumo,
    codigosNovos: amostra(mud.novos), codigosQueSairam: amostra(mud.sairam), codigosAlterados: amostra(mud.alterados),
  };
}
