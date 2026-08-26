// Desenhos (projetos) da peça no SharePoint da Engenharia + controle de liberação (GRD).
// GET  ?opNumero=&marca= — busca os PDFs da marca em {OP}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação
//        (conjunto em .../2.5.2.3 Conjunto/{frente}/{A1..A4}/{marca}.pdf → formato = pasta-mãe;
//         croqui em .../2.5.2.2 Croqui/{frente}/{marca} - CROQUI.pdf → A4) + as liberações GRD já
//        registradas da marca. Ignora OBSOLETOS.
// POST { acao } — EMITIR: carimba o PDF com a rastreabilidade + quem/quando, arquiva na pasta da
//        OP e amarra na §02 do Data Book (SEM GRD — abrir o desenho não é controle de liberação).
//        IMPRIMIR: o mesmo + registra a GRD; reimprimir a mesma marca/arquivo/setor soma no
//        contador de impressões em vez de criar outra GRD. (Vitor 19/08.)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { casaMarca } from "@/lib/pasta-engenharia";
import { requireRole } from "@/lib/session";
import { getAccessToken, acharPastaOp, uploadFileToFolder } from "@/lib/sharepoint";
import { rastreioDoConjunto } from "@/lib/rastreio-peca";
import { amarracoesDaOp, amarracaoDoPerfil } from "@/lib/r-amarrado";
import { novaEntradaGrd } from "@/lib/grd-registro";
import { conferirRComCroquis } from "@/lib/conferir-r";
import { analisarMaterial } from "@/lib/material-liberacao";
import { carimbarDesenho } from "@/lib/carimbo-desenho";
import { dataHoraBR } from "@/lib/data-br";
import { consumivelDoConjunto } from "@/lib/consumivel-solda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // baixar A1 do SharePoint + carimbar + subir

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];
const GRAPH = "https://graph.microsoft.com/v1.0";

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const opNumero = sp.get("opNumero");
  const marca = (sp.get("marca") || "").trim();
  if (!opNumero || !marca) return NextResponse.json({ error: "Informe opNumero e marca." }, { status: 400 });

  // Liberações GRD já registradas (independem do SharePoint responder).
  const liberacoes = (await prisma.grdLiberacao.findMany({
    where: { opNumero: String(opNumero).replace(/\D/g, "").padStart(3, "0"), marca },
    orderBy: { createdAt: "desc" },
    select: { id: true, arquivo: true, formato: true, setor: true, liberadoPorNome: true, createdAt: true, impressoItemId: true, impressoes: true, ultimaImpressaoEm: true, historico: true },
  })).map((l) => ({
    ...l,
    // ⚠ do mais RECENTE para o mais antigo: quem abre quer ver a última cópia primeiro
    copias: (Array.isArray(l.historico) ? l.historico : []).slice().reverse(),
    historico: undefined,
  }));

  let arquivos = [];
  let erroSp = null;
  try {
    const base = await acharPastaOp(opNumero);
    if (!base) throw new Error("Pasta da OP não encontrada no SharePoint.");
    const fab = `${base}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
    const token = await getAccessToken();
    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(fab)}:/search(q='${encodeURIComponent(marca)}')?$select=id,name,size,file,parentReference&$top=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`SharePoint HTTP ${res.status}`);
    const data = await res.json();
    // ⚠⚠ O CARIMBADO NÃO É DESENHO PARA IMPRIMIR — é o RESULTADO de uma impressão. Vitor
    // (26/08/2026) viu "105A-P34 - RASTREADO 26-08 17-38.pdf" listado com botão de imprimir do
    // lado do croqui: imprimir aquilo criaria uma GRD de um arquivo que já É uma GRD, e a segunda
    // via nasceria como liberação nova em vez de somar na existente. O emitido se abre pelo "ver
    // emitido" da própria GRD, que é onde ele significa alguma coisa.
    const ehCarimbado = (n) => /\bRASTREADO\b/i.test(n) || /^LOTE\s/i.test(n);
    const pdfs = (data.value || []).filter((x) => x.file && /\.pdf$/i.test(x.name) && casaMarca(x.name, marca)
      && !/obsolet/i.test(x.name) && !ehCarimbado(x.name));

    // formato = nome da pasta-mãe (A1..A4); croqui identifica pelo nome. Resolve o pai por id
    // (o search não devolve o path) e descarta o que estiver em OBSOLETOS.
    // Os PDFs de uma marca quase sempre dividem a MESMA pasta — resolver por arquivo era uma ida
    // ao Graph por item e deixava o modal lento. Resolve uma vez por pasta. (Vitor 19/08.)
    const nomePasta = new Map();
    const resolvePasta = async (id) => {
      if (!id) return "";
      if (nomePasta.has(id)) return nomePasta.get(id);
      let nome = "";
      try {
        const rp = await fetch(`${GRAPH}/drives/${driveId}/items/${id}?$select=name`, { headers: { Authorization: `Bearer ${token}` } });
        if (rp.ok) nome = (await rp.json()).name || "";
      } catch {}
      nomePasta.set(id, nome);
      return nome;
    };
    await Promise.all([...new Set(pdfs.map((x) => x.parentReference?.id).filter(Boolean))].map(resolvePasta));
    arquivos = (await Promise.all(pdfs.map(async (x) => {
      const pastaMae = await resolvePasta(x.parentReference?.id);
      if (/obsolet/i.test(pastaMae)) return null;
      const formato = /^A[1-4]$/i.test(pastaMae) ? pastaMae.toUpperCase() : (/croqui/i.test(x.name) ? "A4 (croqui)" : null);
      return { itemId: x.id, nome: x.name, formato, sizeKb: Math.round((x.size || 0) / 1024) };
    }))).filter(Boolean).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  } catch (e) {
    erroSp = e?.message || "Falha ao consultar o SharePoint.";
  }

  return NextResponse.json({ arquivos, liberacoes, erroSp });
}

const schema = z.object({
  opNumero: z.string().min(1),
  opId: z.string().nullable().optional(),
  marca: z.string().min(1),
  arquivo: z.string().min(1),
  formato: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  setor: z.string().nullable().optional(),
  // EMITIR = gera/atualiza o PDF carimbado na pasta da OP e no Data Book, sem GRD (abrir o
  // desenho não é controle de liberação). IMPRIMIR = isso + registra a GRD; reimpressão da mesma
  // marca/arquivo/setor SOMA no contador em vez de criar outra GRD. (Vitor 19/08.)
  acao: z.enum(["EMITIR", "IMPRIMIR"]).default("EMITIR"),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const opNumero = String(body.opNumero).replace(/\D/g, "").padStart(3, "0");
  const marca = body.marca.trim();
  const quando = new Date();

  // OP (pra achar as peças e a pasta) — o opId pode não vir da tela.
  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true, numero: true } });
  const opId = body.opId || op?.id || null;

  // 1) rastreabilidade da marca AGORA (croqui = a própria peça; conjunto = os croquis dele)
  let itens = [];
  // ⚠⚠ SEM MATERIAL NÃO SE IMPRIME. Vitor (26/08/2026): "não será possível liberar desenhos se
  // estoque e R definido, não foi isso?" — foi, e a regra estava só metade aplicada.
  //
  // A sequência que ele desenhou em 25/08: "o pcp recebe a solicitação, manda separar o material,
  // analisa se está tudo em estoque, caso seja usado um material de estoque informa o R usado e
  // caso não tenha o material NÃO LIBERA aquele projeto para preparar; avaliou isso IMPRIME os
  // desenhos para o setor já marca o R". A impressão vem DEPOIS da conferência de material — e
  // esta rota não tinha uma linha sobre material.
  //
  // ⚠ SÓ NO IMPRIMIR (GRD). "Emitir carimbado" é consulta e continua livre; o que se controla é a
  // LIBERAÇÃO para o chão de fábrica.
  // ⚠ SÓ PARA PEÇA COM PERFIL (croqui/avulsa). O conjunto não tem material próprio — ele é montado
  // do que já foi cortado, e cobrar material dele travaria a Montagem por uma pergunta que não é
  // dela.
  if (body.acao === "IMPRIMIR" && opId) {
    try {
      const pc = await prisma.pecaConjunto.findFirst({ where: { opId, marca }, select: { id: true, perfil: true, tipoPeca: true } });
      if (pc?.perfil && pc.tipoPeca !== "CONJUNTO") {
        const { porPeca } = await analisarMaterial(opNumero, [pc]);
        const v = porPeca.get(pc.id);
        // ⚠ ESTOQUE PASSA COM O R INFORMADO — é a etapa do PCP, não uma exceção à regra.
        const ok = v && (v.estado === "NA_OP" || (v.estado === "ESTOQUE" && v.rInformado));
        if (!ok) {
          const porque = !v ? "material não medido"
            : v.estado === "ESTOQUE" ? `existe material igual em estoque (R ${(v.rs || []).slice(0, 3).join(", ") || "—"}), mas ninguém informou qual R foi usado`
            : v.faltaRotulo || "sem entrada no CMR desta obra";
          return NextResponse.json({
            error: `${marca} não pode ser liberada: ${porque}. O desenho só é impresso depois de o material estar conferido e o R definido — informe o R no painel do PCP ou aguarde a entrega.`,
            semMaterial: true, perfil: pc.perfil, estado: v?.estado || null,
          }, { status: 409 });
        }
      }
    } catch {
      // ⚠ falha na ANÁLISE não vira bloqueio: travar a impressão por um erro de leitura pararia a
      // fábrica por um problema que não é dela. (O `return` acima sai da função sem passar aqui.)
    }
  }

  try { if (opId) itens = await rastreioDoConjunto(opNumero, opId, marca); } catch {}
  // ⚠⚠ O R AMARRADO ENTRA NO CARIMBO. `rastreioDoConjunto` só dá R a peça JÁ CORTADA e o desenho é
  // impresso ANTES de cortar — o papel saía "sem R" exatamente quando ele é necessário. Vitor
  // (25/08/2026): "imprime os desenhos para o setor já marca o R". Mesma regra do lote.
  try {
    const semR = !itens.some((i) => (i.usadas || []).some((u) => u.rastreio));
    if (semR && opId) {
      const pc = await prisma.pecaConjunto.findFirst({ where: { opId, marca }, select: { perfil: true } });
      const am = pc?.perfil ? amarracaoDoPerfil(await amarracoesDaOp(opNumero), pc.perfil) : null;
      if (am) itens = [...itens, { marca, perfil: pc.perfil, situacao: "R_INDICADO", usadas: [{ rastreio: am.r, indicado: true, por: am.por || null }] }];
    }
  } catch {}

  // 2) baixa o desenho original, carimba e arquiva. Se qualquer passo falhar, a liberação (GRD)
  //    ainda é registrada e a tela cai no PDF original — o controle não pode parar por causa do
  //    carimbo.
  let carimbado = null, avisoCarimbo = null;
  if (body.itemId) {
    try {
      const token = await getAccessToken();
      const driveId = process.env.SHAREPOINT_DRIVE_ID;
      const res = await fetch(`${GRAPH}/drives/${driveId}/items/${body.itemId}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
      if (!res.ok) throw new Error(`SharePoint HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // consumível de solda vigente na data da emissão (muda quando entra lote novo no CMR)
      let consumivel = null;
      // pela data em que o conjunto foi SOLDADO — reemitir hoje não troca o arame de julho
      try { consumivel = await consumivelDoConjunto({ opId: op.id, marca, quando }); } catch {}
      const pdfOut = await carimbarDesenho(bytes, {
        opNumero, marca, setor: body.setor || null, formato: body.formato || null,
        arquivo: body.arquivo, usuario: user.name || user.email || "—", quando, itens, consumivel,
      });
      // ⚠ SALVA NA MESMA PASTA DO DESENHO ORIGINAL (onde a Engenharia guarda os PDFs e às vezes
      // os DWGs) — não numa pasta separada. Nada é apagado: só entra o carimbado ao lado do
      // original. (Vitor 19/08: "a pasta que você precisa salvar no servidor tem que ser a pasta
      // onde temos os desenhos anexos da engenharia... você não vai excluir, só vai salvar lá".)
      let pasta = null;
      try {
        const rp = await fetch(`${GRAPH}/drives/${driveId}/items/${body.itemId}?$select=parentReference,name`, { headers: { Authorization: `Bearer ${token}` } });
        if (rp.ok) {
          const info = await rp.json();
          const path = info?.parentReference?.path || ""; // "/drive/root:/Ordem de Servico/..."
          const rel = decodeURIComponent(path.replace(/^\/drive(s\/[^/]+)?\/root:/, ""));
          if (rel) pasta = rel;
        }
      } catch {}
      if (!pasta) {
        const base = await acharPastaOp(opNumero);
        pasta = `${base || `/Ordem de Servico/01. OP/OP-${opNumero}`}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
      }
      // nome do arquivo com a hora de BRASÍLIA (o servidor é UTC)
      const carimbo = dataHoraBR(quando).replace(/\/\d{4}/, "").replace(/[/:]/g, "-");
      carimbado = await uploadFileToFolder({
        folderPath: pasta,
        fileName: `${marca} - RASTREADO ${carimbo}.pdf`,
        buffer: Buffer.from(pdfOut), contentType: "application/pdf",
      });
    } catch (e) { avisoCarimbo = e?.message || "Não consegui carimbar o desenho."; }
  }

  // ── GRD só quando IMPRIME ─────────────────────────────────────────────────────────────────
  // Abrir/emitir o desenho não é controle de liberação. E imprimir a mesma coisa duas ou três
  // vezes não são três GRDs: é a mesma liberação, reimpressa — some no contador, com a data da
  // última. (Vitor 19/08.)
  let reg = null;
  if (body.acao === "IMPRIMIR") {
    const agora = new Date();
    const jaTem = await prisma.grdLiberacao.findFirst({
      where: { opNumero, marca, arquivo: body.arquivo.trim(), setor: body.setor || null },
      orderBy: { createdAt: "desc" },
      select: { id: true, impressoes: true, historico: true },
    });
    reg = jaTem
      ? await prisma.grdLiberacao.update({
          where: { id: jaTem.id },
          data: {
            impressoes: { increment: 1 }, ultimaImpressaoEm: agora,
            rastreio: itens.length ? itens : undefined,
            historico: novaEntradaGrd({ anterior: jaTem.historico, quando: agora, usuario: user.name || user.email || null, itemId: carimbado?.id || null, itens }),
            impressoItemId: carimbado?.id || undefined,
            impressoUrl: carimbado?.webUrl || undefined,
          },
        })
      : await prisma.grdLiberacao.create({
          data: {
            opId, opNumero, marca,
            arquivo: body.arquivo.trim(),
            formato: body.formato || null,
            setor: body.setor || null,
            itemId: body.itemId || null,
            // snapshot do casamento na emissão — é a prova do que foi pro chão de fábrica
            rastreio: itens.length ? itens : undefined,
            impressoItemId: carimbado?.id || null,
            impressoUrl: carimbado?.webUrl || null,
            impressoes: 1, ultimaImpressaoEm: agora,
            historico: novaEntradaGrd({ anterior: [], quando: agora, usuario: user.name || user.email || null, itemId: carimbado?.id || null, itens }),
            liberadoPorId: user.id,
            liberadoPorNome: user.name || null,
          },
        });
  }

  // ⚠ CONJUNTO: o R de cada posição tem de bater com o que já foi para o papel do croqui.
  // Vitor (26/08/2026): "no data book não podemos informar um R no croqui e outro no conjunto".
  let divergenciaR = [];
  if (itens.length > 1) divergenciaR = await conferirRComCroquis(opNumero, itens).catch(() => []);

  // 3) amarra no Data Book: o MESMO arquivo carimbado vira documento da §02 (Desenhos as-built).
  //    Um documento por marca+arquivo — reemitir atualiza o ponteiro pro PDF mais novo, em vez de
  //    encher a seção com uma cópia por impressão (o histórico completo fica na GRD).
  //
  // ⚠⚠ CROQUI NÃO ENTRA NO DATA BOOK. Vitor (26/08/2026): "garanta que está importando as peças
  // avulsa que vamos chamar de MARCA e os CONJUNTOS — sempre lembre-se disso".
  //
  // O Data Book é o documento do CLIENTE: ele registra o que foi entregue, e o que se entrega é o
  // conjunto e a marca avulsa. O croqui é peça-componente — ele vira parte de um conjunto e não
  // existe sozinho na obra. Amarrar croqui na §02 enchia a seção de desenho interno e afogava o
  // que o cliente precisa achar (a OP-105 sozinha tem 103 croquis para 20 conjuntos).
  //
  // ⚠ A GRD CONTINUA REGISTRANDO O CROQUI. Imprimir croqui é liberação de fabricação e tem de ser
  // controlado — o que muda é só o destino no Data Book. Controle interno e documento do cliente
  // são coisas diferentes.
  let documentoId = null;
  let ehCroqui = false;
  try {
    if (opId) {
      const pc = await prisma.pecaConjunto.findFirst({ where: { opId, marca }, select: { tipoPeca: true } });
      ehCroqui = pc?.tipoPeca === "CROQUI";
    }
  } catch {}
  if (carimbado && !ehCroqui) {
    try {
      const nomeDoc = `${marca} — ${body.arquivo.replace(/\.pdf$/i, "")} (rastreado)`;
      const existente = await prisma.documentoQualidade.findFirst({
        where: { opNumero, categoria: "PROJETO", origem: "impressao_rastreada", nome: nomeDoc },
        select: { id: true },
      });
      const dados = {
        nome: nomeDoc, categoria: "PROJETO", tipo: "Desenho de fabricação (emissão rastreada)",
        norma: "NBR 16775", opNumero, vinculo: `OP-${opNumero} · ${marca}`,
        observacao: `Emitido por ${user.name || "—"} em ${dataHoraBR(quando)}${body.setor ? ` · setor ${body.setor}` : ""}.`,
        origem: "impressao_rastreada",
        sharepointUrl: carimbado.webUrl, sharepointItemId: carimbado.id,
        arquivoNome: carimbado.name, arquivoTipo: "application/pdf",
      };
      const doc = existente
        ? await prisma.documentoQualidade.update({ where: { id: existente.id }, data: dados })
        : await prisma.documentoQualidade.create({ data: { ...dados, createdById: user.id } });
      documentoId = doc.id;
      // vincula na §02 do Data Book da OP, se ela já existir (não cria Data Book do nada)
      const secao = await prisma.dataBookSecao.findFirst({
        where: { numero: "02", dataBook: { opNumero } },
        select: { id: true },
      });
      if (secao) {
        await prisma.dataBookSecaoDoc.upsert({
          where: { secaoId_documentoId: { secaoId: secao.id, documentoId: doc.id } },
          create: { secaoId: secao.id, documentoId: doc.id },
          update: {},
        });
        await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { estado: "ANEXADO" } }).catch(() => {});
      }
      if (reg) await prisma.grdLiberacao.update({ where: { id: reg.id }, data: { documentoId } }).catch(() => {});
    } catch (e) { avisoCarimbo = avisoCarimbo || `Carimbou, mas não consegui amarrar no Data Book: ${e?.message || e}`; }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: body.acao === "IMPRIMIR" ? "GRD_IMPRIMIR_DESENHO" : "EMITIR_DESENHO_RASTREADO",
      entity: reg ? "GrdLiberacao" : "DocumentoQualidade", entityId: reg?.id || documentoId || opNumero,
      diff: { op: opNumero, marca, arquivo: body.arquivo, formato: body.formato, setor: body.setor, carimbado: !!carimbado, documentoId, impressoes: reg?.impressoes ?? null },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, avisoCarimbo, acao: body.acao,
    // ⚠ dizer que NÃO foi para o Data Book, e por quê — silêncio aqui viraria "sumiu"
    dataBook: ehCroqui ? { entrou: false, motivo: "croqui não entra no Data Book — a §02 leva conjunto e marca avulsa" } : { entrou: !!documentoId },
    divergenciaR,
    liberacao: reg && { arquivo: reg.arquivo, formato: reg.formato, setor: reg.setor, liberadoPorNome: reg.liberadoPorNome, createdAt: reg.createdAt, impressoItemId: reg.impressoItemId, impressoes: reg.impressoes, ultimaImpressaoEm: reg.ultimaImpressaoEm },
    // é ESTE arquivo que a pessoa abre/imprime — o mesmo que foi pro Data Book
    abrirItemId: carimbado?.id || body.itemId || null,
    abrirNome: carimbado?.name || body.arquivo,
  });
}
