// Etiquetas de carregamento — as que hoje saem do BarTender.
//
// GET  ?opId=xxx   → as marcas daquela OP, para a tela montar a seleção
// POST { opId, marcas[], modelo? } → o PDF, uma página de 100×50 mm por PEÇA
//   `modelo` é "padrao" (o desenho de sempre) ou "qws" (o do cliente da OP-102, que pede TAG
//   Petrobras e referência de desenho — ver `lib/etiqueta-qws-pdf.js`).
//
// ⚠ NÃO EXISTE UPLOAD DE PLANILHA AQUI, E ISSO É DE PROPÓSITO. O fluxo do BarTender era exportar
// planilha → importar no BarTender → imprimir. A Lista de Expedição já está no portal (ver
// `lib/itens-expedicao.js`); a planilha intermediária só existia porque o BarTender não enxerga o
// banco. Tirar esse pulo tira junto a chance de imprimir com dado velho.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODELOS, gerarEtiquetasCarregamentoPDF } from "@/lib/etiqueta-carregamento-pdf";
import { camposExtrasDaOP, juntarCamposExtras, juntarTagsCliente, tagsPorUnidade, caixasComDestinosDiferentes } from "@/lib/etiqueta-campos-extras";
import { conferirCobertura, tagsDaOP } from "@/lib/etiqueta-tag-cliente";
import { chaveMarca } from "@/lib/itens-expedicao";
import { contarEtiquetas, recusaPorBytes, recusaPorTamanho } from "@/lib/etiquetas-carregamento-limites";
import { itensExpediveisDaOP, opsComItensExpediveis } from "@/lib/itens-expedicao";
import { lerCalibragem } from "@/lib/etiqueta-calibragem";
import { log } from "@/lib/log";
import { chaveHistorico, historicoDaMarca, impressoes, registrarImpressao, ultimaTagDaObra }
  from "@/lib/etiqueta-historico";

const registro = log("api/expedicao/etiquetas");
const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "PCP", "PLANEJAMENTO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Um lote grande de etiquetas é muita geração de QR: sai do teto padrão de 10 s da Vercel.
// ⚠⚠ 300s, E NÃO 60 (14/09/2026). A OP-105 inteira são 1.793 etiquetas; a função morria em 504
// antes de terminar. O conserto de verdade foi gerar UM QR por marca em vez de um por etiqueta
// (29,3s → 3,3s, medido), mas o teto de 60s não tinha folga nenhuma para obra grande — e obra
// grande aqui chega a dezenas de milhares de adesivos.
export const maxDuration = 300;

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });


/**
 * A CHAVE DO HISTÓRICO É A MARCA, NÃO O ID DA PEÇA.
 *
 * ⚠⚠ O id da linha de `PecaConjunto` não sobrevive à reimportação da lista — é a mesma lição já
 * gravada no schema, em `LiberacaoProducao.pecaMarcas`: "o id da peça não sobrevive à
 * reimportação/exclusão da lista; a marca sim". E desde que a lista passou a ser definida pela
 * Lista de Expedição, existe item legítimo SEM nenhuma linha no cadastro (a OP-67 tem 1.519), que
 * por id não teria onde ser registrado.
 *
 * ⚠ Registros ANTIGOS foram gravados por id (`entity: "PecaConjunto"`). São lidos também, senão a
 * coluna diria "nunca impressa" para etiqueta que saiu — ver `historicoDaMarca`.
 */
async function carregar(opId) {
  // ⚠ QUEM DEFINE A LISTA É A LISTA DE EXPEDIÇÃO — a regra e o porquê moram em
  // `lib/itens-expedicao.js`, a mesma fonte usada pela Conferência de Peça.
  const dados = await itensExpediveisDaOP(prisma, opId);
  if (!dados) return null;

  const chaves = dados.pecas.map((p) => chaveHistorico(dados.op.numero, p.marca));
  const [hist, tagObra] = await Promise.all([
    impressoes(chaves, dados.pecas.flatMap((p) => p.ids)),
    ultimaTagDaObra(dados.op.numero),
  ]);
  return {
    op: dados.op,
    tagObra,
    pecas: dados.pecas.map(({ ids, id: _id, naPlanilha: _naPlanilha, ...p }, i) => {
      const h = historicoDaMarca(hist, chaves[i], ids);
      return { ...p, id: chaves[i], impressaEm: h.em, impressoes: h.vezes };
    }),
  };
}

export async function GET(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const opId = new URL(req.url).searchParams.get("opId");

  // Sem opId, a tela está abrindo: devolve as OPs que TÊM peça cadastrada. OP sem peça não
  // rende etiqueta nenhuma e só faria a lista crescer.
  // Sem opId, a tela está abrindo: devolve as obras que TÊM item expedível.
  if (!opId) return NextResponse.json({ success: true, ops: await opsComItensExpediveis(prisma) });

  const dados = await carregar(opId);
  if (!dados) return NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, ...dados });
}

/**
 * A TAG DO CLIENTE NA FRENTE DA DESCRIÇÃO (Padrão Torg). Obra sem mapa importado segue exatamente
 * como antes: a consulta devolve vazio e nada muda.
 *
 * ⚠⚠ A COBERTURA É CONFERIDA NO SERVIDOR, E NÃO SÓ NA TELA (pedido do Codex). Uma confirmação dada
 * sobre quatro peças não pode encobrir a quinta que a revisão da L.E. criou depois: a etiqueta dela
 * sairia sem TAG e ninguém veria. A conferência é só sobre o que foi ESCOLHIDO para imprimir.
 */
async function camposDoModelo(op, pecas, modelo, confirmado) {
  // Só o modelo do cliente lê os campos do QWS — o padrão não faria nada com eles, e a consulta
  // seria um round-trip ao Neon por impressão sem serventia nenhuma.
  if (modelo === "qws") return { pecas: juntarCamposExtras(pecas, await camposExtrasDaOP(prisma, op.numero)) };

  const mapa = await tagsDaOP(prisma, op.numero);
  if (!mapa.length) return { pecas };

  // ⚠⚠ A COBERTURA CONFERIDA AQUI É A DESTE LOTE, não a da obra. O mapa tem as 96 marcas da OP e a
  // impressão costuma ser de uma; comparando o mapa inteiro contra a seleção, TODA impressão
  // parcial acusaria 95 marcas "fora da lista" e pediria confirmação sempre — e confirmação que
  // sempre aparece é confirmação que ninguém lê. Filtrar pelo que foi escolhido é o que faz a
  // pergunta significar o que ela diz.
  const escolhidas = new Set(pecas.map((p) => chaveMarca(p.marca)));
  const doLote = mapa.filter((u) => escolhidas.has(chaveMarca(u.marca)));
  const cobertura = conferirCobertura(doLote, pecas);
  const porUnidade = tagsPorUnidade(mapa);
  // A caixa com peças de dois destinos sai sem TAG — a cobertura não vê isso, porque para ela a
  // marca está coberta. Ver `caixasComDestinosDiferentes`.
  const caixas = caixasComDestinosDiferentes(pecas, porUnidade);
  if ((!cobertura.completa || caixas.length) && !confirmado) {
    return {
      recusa: NextResponse.json(
        { success: false, precisaConfirmar: true, error: frasedaCobertura(cobertura, caixas), cobertura, caixas },
        { status: 409 }),
    };
  }
  return { pecas: juntarTagsCliente(pecas, porUnidade) };
}

/** A frase da recusa por cobertura: diz QUANTAS etiquetas sairiam sem TAG, e de quais marcas. */
function frasedaCobertura({ semTag, foraDaLista }, caixas = []) {
  const faltando = semTag.reduce((n, m) => n + (m.qte - m.comTag), 0);
  const quais = semTag.slice(0, 4).map((m) => `${m.marca} (${m.qte - m.comTag} de ${m.qte})`).join(", ");
  const resto = semTag.length > 4 ? ` e mais ${semTag.length - 4} marca(s)` : "";
  const fora = foraDaLista.length ? ` A planilha tem ${foraDaLista.length} marca(s) que não estão na Lista de Expedição.` : "";
  // A caixa misturada é problema DIFERENTE de falta de TAG, e a saída também: ali se separa a
  // caixa por destino; aqui se completa a planilha. Dizer "sem TAG" nos dois casos confundiria.
  const caixa = caixas.length
    ? ` ${caixas.length} caixa(s) levam peças de destinos diferentes e sairão SEM TAG: ` +
      `${caixas.slice(0, 3).map((c) => `${c.marca} (${c.destinos.join(" e ")})`).join(", ")}.`
    : "";
  if (!faltando) {
    return caixa
      ? `${caixa.trim()} Separe por destino, ou confirme para imprimir assim.${fora}`
      : `A planilha de TAGs não bate com esta obra.${fora}`;
  }
  return `${faltando} etiqueta(s) sairão SEM TAG: ${quais}${resto}.${fora}${caixa} Confirme para imprimir assim.`;
}

const erro400 = (msg) => NextResponse.json({ success: false, error: msg }, { status: 400 });

/**
 * A TAG que o cliente pede na frente da OBRA, digitada na tela.
 *
 * ⚠⚠ NORMALIZADA NO SERVIDOR, NÃO NA TELA. Ela vai impressa em centenas de adesivos que saem no
 * caminhão: um espaço sobrando ou uma minúscula viram duas "TAGs" diferentes no olho de quem
 * confere no recebimento. Maiúsculas e sem espaço nas pontas é o mínimo — e o servidor é o único
 * lugar por onde TODA impressão passa.
 *
 * ⚠ 24 caracteres é o que a célula da OBRA aguenta sem espremer o nome da obra a ponto de não se
 * ler. Passar disso é quase certamente colar errado, não uma TAG legítima.
 */
const TAG_MAX = 24;
function normalizarTagObra(bruto) {
  const tag = String(bruto ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!tag) return { tag: null };
  if (tag.length > TAG_MAX) return { erro: `A TAG da obra tem no máximo ${TAG_MAX} caracteres.` };
  return { tag };
}

/**
 * Qual desenho usar e com qual TAG.
 *
 * ⚠ Modelo vindo da tela é validado contra a lista, não usado direto: um valor qualquer no corpo
 * não pode escolher um caminho de desenho que não existe.
 *
 * ⚠ A TAG É SÓ DO MODELO PADRÃO. O QWS já usa a célula de cima para "cliente | obra" e identifica a
 * peça pela TAG Petrobras — mais um código ali brigaria por espaço com o que o cliente confere.
 * Mandar a tag com modelo qws é ignorado em silêncio, não é erro: a tela nem mostra o campo, então
 * isso só acontece em chamada feita fora dela.
 */
function resolverDesenho(corpo) {
  const modelo = MODELOS.includes(corpo?.modelo) ? corpo.modelo : "padrao";
  const { tag, erro } = normalizarTagObra(modelo === "padrao" ? corpo?.tagObra : null);
  return { modelo, tagObra: tag ?? null, erro };
}

/**
 * O que vai ser impresso, ou a mensagem de por que não vai.
 *
 * ⚠ A QUANTIDADE VEM DO BANCO, NÃO DO NAVEGADOR. A tela manda quais marcas; quantas etiquetas cada
 * uma rende é decisão do dado. Aceitar um número vindo da tela seria deixar a etiqueta dizer
 * "003/5" para uma marca que tem 2 peças.
 */
/**
 * As peças que a tela escolheu, já com o carimbo de caixa.
 *
 * ⚠⚠ A TELA MANDA UM SIM/NÃO POR MARCA, NUNCA UM NÚMERO — e a distinção é a regra desta rota.
 * "A quantidade vem do banco, não do navegador": aceitar um número deixaria a etiqueta dizer "3/5"
 * para uma marca que tem 2 peças. `emCaixa` só troca a REGRA de contagem (uma etiqueta para o lote,
 * dizendo "N/N"); o N continua saindo da Lista de Expedição.
 */
function pecasEscolhidas(dados, marcas, corpo) {
  const escolhidas = new Set(marcas.map(String));
  const emCaixa = new Set((Array.isArray(corpo?.emCaixa) ? corpo.emCaixa : []).map(String));
  return dados.pecas
    .filter((p) => escolhidas.has(p.marca))
    .map((p) => (emCaixa.has(p.marca) ? { ...p, emCaixa: true } : p));
}

async function selecionar(corpo) {
  const opId = corpo?.opId;
  const marcas = Array.isArray(corpo?.marcas) ? corpo.marcas : [];
  if (!opId || !marcas.length) return { recusa: erro400("Escolha a OP e ao menos uma marca.") };
  // ⚠ Modelo vindo da tela é validado contra a lista, não usado direto: um valor qualquer no corpo
  // não pode escolher um caminho de desenho que não existe.
  const { modelo, tagObra, erro: erroDoDesenho } = resolverDesenho(corpo);
  if (erroDoDesenho) return { recusa: erro400(erroDoDesenho) };

  const dados = await carregar(opId);
  if (!dados) return { recusa: NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 }) };

  const pecas = pecasEscolhidas(dados, marcas, corpo);
  if (!pecas.length) return { recusa: erro400("Nenhuma das marcas enviadas existe nesta OP.") };

  const extras = await camposDoModelo(dados.op, pecas, modelo, corpo?.confirmarSemTag === true);
  if (extras.recusa) return extras;
  return { op: dados.op, pecas: extras.pecas, modelo, tagObra };
}

/** O PDF em si — fora do POST só para ele caber no teto de statements. */
async function desenhar({ op, pecas, modelo, tagObra }) {
  return gerarEtiquetasCarregamentoPDF({
    cliente: op.cliente,
    obra: op.obra,
    // ⚠⚠ O NÚMERO VAI CRU, e isso é decisão, não descuido.
    //
    // Cheguei a usar o `fmtOP` da casa aqui. Está errado para ESTA tela por dois motivos que só
    // apareceram olhando o dado: (1) o `fmtOP` REMOVE um "T" inicial — decisão do Vitor em
    // `58bc140e5c`, certa para a exibição no portal, mas aqui apagaria justamente o "T89" que a
    // etiqueta em uso mostra; (2) ele completa com zeros ("89" -> "089"), e a etiqueta impressa
    // hoje diz "T89", sem zero à esquerda.
    //
    // Hoje nenhuma das 35 OPs tem prefixo — são todas "121", "120". Então o "T89" da etiqueta
    // antiga foi DIGITADO na planilha do BarTender, não veio do cadastro. Mandar cru faz a
    // etiqueta mostrar exatamente o que está na OP, seja lá qual for a convenção que ela use.
    opNumero: op.numero,
    pecas,
    modelo,
    tagObra,
    // ⚠ Lida a CADA impressão, não cacheada: quem está calibrando imprime, mede, ajusta e
    // imprime de novo. Um cache de segundos faria a etiqueta seguinte sair com o valor velho e a
    // pessoa concluir que o ajuste não funciona.
    calibragem: await lerCalibragem(prisma),
  });
}

/**
 * Gera, confere o tamanho, carimba e devolve o PDF.
 *
 * ⚠ Fora do POST só para ele caber no teto de statements — a ORDEM aqui dentro é que importa, e
 * está comentada onde acontece.
 */
async function gerarEResponder(user, { op, pecas, modelo, tagObra }) {
  try {
    const pdf = await desenhar({ op, pecas, modelo, tagObra });

    // ⚠⚠ OS BYTES SÃO CONFERIDOS ANTES DA AUDITORIA (pedido do Codex). A plataforma recusa corpo
    // de resposta acima de ~4,5 MB; carimbando primeiro, o portal registraria como impressa uma
    // etiqueta que a pessoa NUNCA recebeu — e a coluna "Etiqueta" passaria a mentir.
    const pesado = recusaPorBytes(pdf.byteLength ?? pdf.length);
    if (pesado) {
      registro.info(`OP ${op.numero}: PDF de ${pesado.bytes} bytes recusado (limite ${pesado.limite})`);
      return NextResponse.json({ success: false, ...pesado }, { status: 413 });
    }

    // ⚠ SÓ DEPOIS DE O PDF EXISTIR. Carimbar antes marcaria como impressa uma marca cuja geração
    // falhou — e a tela ficaria dizendo "já saiu" para uma etiqueta que ninguém viu.
    await registrarImpressao(user, { op, pecas, modelo, tagObra });
    // ⚠ A CONTA É A DO MÓDULO, NÃO UMA SOMA LOCAL: a que morava aqui ignorava `emCaixa` e contava
    // 50 etiquetas numa marca que rende 1.
    registro.info(`OP ${op.numero}: ${pecas.length} marca(s), ${contarEtiquetas(pecas)} etiqueta(s)`);

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiquetas-OP-${op.numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    registro.erro("falha ao gerar:", e?.message);
    return NextResponse.json({ success: false, error: "Não consegui gerar as etiquetas: " + e.message }, { status: 500 });
  }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const { recusa, op, pecas, modelo, tagObra } = await selecionar(corpo);
  if (recusa) return recusa;

  // ⚠⚠ RECUSA ANTES DE GERAR. Marcar tudo na OP-067 são 60.281 etiquetas: ~12 minutos de função e
  // ~113 MB. Sem esta barreira, a pessoa espera o tempo inteiro para receber um 504.
  const grande = recusaPorTamanho(pecas);
  if (grande) return NextResponse.json({ success: false, ...grande }, { status: 413 });
  return gerarEResponder(user, { op, pecas, modelo, tagObra });
}
