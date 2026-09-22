// POST /api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio
// Gera o FORM 22 do romaneio a partir do romaneio prévio do lote (marcas + peso),
// com os dados do transportador, salva na pasta 4.2 Romaneios da OP no SharePoint
// e devolve o arquivo (base64) pra download.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRomaneioForm22 } from "@/lib/romaneio-form22";
import { salvarRomaneioNoServidor } from "@/lib/sharepoint-lista";
import { itensDeObra } from "@/lib/expedido-por-romaneio";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placa: z.string().max(20).nullable().optional(),
  placaCarreta: z.string().max(20).nullable().optional(),
  contato: z.string().max(100).nullable().optional(),
  data: z.string().nullable().optional(),
  marcas: z.array(z.string()).optional(), // (legado) subconjunto de marcas — sem quantidade
  // marcas + quantidade. ⚠ `avulso` é o item que NÃO é peça da obra (tinta de retoque, um item
  // específico): ele não existe na Lista de Expedição nem no prévio, então se descreve aqui.
  itensSel: z.array(z.object({
    marca: z.string().min(1), qtd: z.number().min(0),
    avulso: z.boolean().optional(),
    descricao: z.string().max(300).nullable().optional(),
    unidade: z.string().max(10).nullable().optional(),
    pesoKg: z.number().min(0).nullable().optional(),
  })).optional(),
  mudanca: z.string().max(2000).nullable().optional(), // o que mudou (obrigatório na revisão)
  previa: z.boolean().optional(), // true = só gera pra conferir (não salva, não emite)
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, cliente: true, obra: true, clienteRazaoSocial: true,
      clienteEndereco: true, clienteCidade: true, clienteUF: true, clienteCep: true,
      clienteCnpj: true, clienteIE: true, clienteContato: true, clienteEmail: true,
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const lote = await prisma.loteExpedicao.findFirst({ where: { id: params.loteId, opId: op.id } });
  if (!lote) return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });

  // Marcas vêm do romaneio prévio (mais recente) vinculado ao lote.
  const previo = await prisma.romaneioPrevio.findFirst({
    where: { opId: op.id, loteId: params.loteId },
    orderBy: { numero: "desc" },
  });
  if (!previo) return NextResponse.json({ error: "Este lote não tem romaneio prévio com marcas." }, { status: 400 });
  const marcasPrevio = Array.isArray(previo.itens) ? previo.itens : [];
  if (!marcasPrevio.length) return NextResponse.json({ error: "O romaneio prévio está sem marcas." }, { status: 400 });

  // Transportador: usa o do corpo; se ausente, cai pro salvo no lote.
  const transportadora = (body.transportadora ?? lote.transportadora) || null;
  const motorista = (body.motorista ?? lote.motorista) || null;
  const placa = (body.placa ?? lote.placaVeiculo) || null;
  const placaCarreta = (body.placaCarreta ?? lote.placaCarreta) || null;
  const contato = (body.contato ?? lote.contatoTransporte) || null;

  const numero = `R${previo.numero}`;
  const data = body.data ? new Date(body.data) : (previo.dataPrevista || new Date());
  let itens, ignoradas = [];
  if (body.itensSel?.length) {
    // Seleção com quantidade: o prévio traz o peso da qtd cheia; ao mudar a
    // quantidade, o peso vai proporcional (pesoUnit = pesoTotal / qte).
    // Universo = marcas do prévio + TODAS as da Lista de Expedição (permite INCLUIR
    // peça nova na revisão, não só as que já estavam no romaneio). pesoUnit = pesoTotal/qte.
    const daLista = new Map();
    const listasOP = await prisma.listaExpedicao.findMany({ where: { OR: [{ opId: op.id }, { opNumero: String(op.numero) }] }, select: { frente: true, marcasJson: true } });
    for (const l of listasOP) for (const mm of (Array.isArray(l.marcasJson) ? l.marcasJson : [])) {
      const kk = String(mm.marca || "").trim().toUpperCase();
      if (kk && !daLista.has(kk)) daLista.set(kk, { marca: mm.marca, descricao: mm.descricao, frente: l.frente, qte: mm.qte, pesoTotal: mm.pesoTotal });
    }
    const doPrevio = new Map();
    for (const m of marcasPrevio) if (m?.marca) doPrevio.set(String(m.marca).trim().toUpperCase(), m);
    itens = body.itensSel
      .map((s) => {
        // ⚠⚠ ITEM AVULSO NÃO SE PROCURA — ele é o que a pessoa digitou. Vitor (22/09/2026):
        // "acontece o caso de enviar tinta para retoque, algum item específico, e precisamos
        // colocar na mão". Ele fica SÓ na carga: a Lista de Expedição continua espelho do arquivo
        // ("o caminho vai ser reimportar"), e nenhuma conta de peso da obra o enxerga.
        if (s.avulso) {
          const nome = String(s.marca || "").trim(), desc = String(s.descricao || "").trim();
          // ⚠ linha de romaneio sem dizer O QUE É não serve para conferir carga nenhuma
          if (!nome || !desc) return { erro: "avulso" };
          const qtd = Number(s.qtd) || 0;
          return { marca: nome, descricao: desc, frente: null, avulso: true,
            unidade: String(s.unidade || "").trim().toUpperCase() || "UN",
            qtd, qte: qtd, pesoKg: Number(s.pesoKg) || 0, pesoTotal: Number(s.pesoKg) || 0 };
        }
        const k = String(s.marca).trim().toUpperCase();
        const pv = doPrevio.get(k), lst = daLista.get(k);
        const base = pv || lst;
        if (!base) return null;
        // ⚠⚠ O PESO UNITÁRIO É DA MARCA, NÃO DA CARGA. Vitor (22/09/2026): "as peças da OP-67 não
        // está puxando para o romaneio". As marcas que o portal dava por expedidas entraram no
        // prévio com `qte: 0` e `pesoTotal: 0`; derivando o unitário desse item, a peça saía no
        // FORM 22 pesando ZERO mesmo depois de alguém corrigir a quantidade na tela. Quando o item
        // do prévio não tem de onde tirar o peso, quem responde é a Lista de Expedição.
        const comPeso = Number(pv?.qte) > 0 && Number(pv?.pesoTotal) > 0 ? pv : (Number(lst?.qte) > 0 ? lst : base);
        const qteOrig = Number(comPeso?.qte) || 0;
        const pesoOrig = Number(comPeso?.pesoTotal) || 0;
        const pesoUnit = qteOrig > 0 ? pesoOrig / qteOrig : pesoOrig;
        const qtd = Number(s.qtd) || 0;
        // grava os dois nomes (qtd/pesoKg p/ o FORM 22; qte/pesoTotal/frente p/ o cruzamento de expedido)
        return { marca: base.marca, descricao: base.descricao || lst?.descricao || null, frente: base.frente || lst?.frente || null, qtd, qte: qtd, pesoKg: pesoUnit * qtd, pesoTotal: pesoUnit * qtd };
      })
      .filter(Boolean);
    if (itens.some((it) => it.erro === "avulso")) {
      return NextResponse.json({ error: "Item avulso precisa de nome e descrição — é o que identifica a linha no romaneio." }, { status: 400 });
    }
    // ⚠⚠ ITEM SEM QUANTIDADE NÃO SOME CALADO. Ele era descartado aqui mesmo — e o prévio é
    // REESCRITO com o que foi emitido (mais abaixo), então a marca sumia do romaneio E da carga,
    // sem nada na tela. Agora ela volta nomeada, para quem emitiu saber o que ficou de fora.
    ignoradas = itens.filter((it) => !(it.qtd > 0)).map((it) => it.marca);
    itens = itens.filter((it) => it.qtd > 0);
  } else {
    itens = marcasPrevio.filter((m) => m?.marca).map((m) => ({
      marca: m.marca, descricao: m.descricao || null, frente: m.frente || null,
      qtd: Number(m.qte) || 0, qte: Number(m.qte) || 0,
      pesoKg: Number(m.pesoTotal) || 0, pesoTotal: Number(m.pesoTotal) || 0,
    }));
    // Ajuste de marcas (legado): se veio uma seleção sem quantidade, exporta só essas.
    if (body.marcas?.length) {
      const sel = new Set(body.marcas.map((s) => String(s).trim().toUpperCase()));
      itens = itens.filter((it) => sel.has(String(it.marca).trim().toUpperCase()));
    }
  }
  if (!itens.length) {
    return NextResponse.json({
      error: ignoradas.length
        ? `Sem quantidade para ${ignoradas.slice(0, 5).join(", ")}${ignoradas.length > 5 ? "…" : ""} — informe quantas peças de cada marca entram nesta carga.`
        : "Nenhuma marca/quantidade selecionada.",
      ignoradas,
    }, { status: 400 });
  }

  // Persiste o transportador no lote (vale pra prévia e final — conveniência).
  await prisma.loteExpedicao.update({ where: { id: lote.id }, data: { transportadora, motorista, placaVeiculo: placa, placaCarreta, contatoTransporte: contato } }).catch(() => {});
  const cli = (op.cliente || "").slice(0, 40).trim();

  // PRÉVIA: só gera o FORM 22 pra conferir — não salva no SharePoint, não marca
  // emitido, não vira revisão.
  if (body.previa) {
    const buf = await gerarRomaneioForm22({ op, romaneio: { numero, data, transportadora, motorista, placa, placaCarreta, contatoTransporte: contato }, itens });
    return NextResponse.json({ ok: true, previa: true, numero, ignoradas, nome: `PREVIA Romaneio ${numero} - OP-${op.numero}${cli ? ` - ${cli}` : ""}.xlsx`, arquivo: buf.toString("base64") });
  }

  // Emissão × revisão: 1ª vez emite R00; se já foi emitido, é revisão (exige motivo).
  const jaEmitido = !!previo.emitidoEm;
  const novaRevisao = jaEmitido ? (previo.revisao || 0) + 1 : 0;
  if (jaEmitido && !(body.mudanca && body.mudanca.trim())) {
    return NextResponse.json({ error: "Descreva o que mudou nesta revisão." }, { status: 400 });
  }
  const agora = new Date();
  const histAtual = Array.isArray(previo.historico) ? previo.historico : [];
  const historico = [...histAtual, {
    revisao: novaRevisao,
    emitidoEm: agora.toISOString(),
    mudanca: novaRevisao === 0 ? "Primeira emissão" : body.mudanca.trim(),
    porQuem: user.name || user.email || null,
  }];

  const buf = await gerarRomaneioForm22({
    op,
    romaneio: { numero, data, transportadora, motorista, placa, placaCarreta, contatoTransporte: contato },
    itens,
    historico: novaRevisao > 0 ? historico : null, // aba Histórico só na revisão
  });
  const prefixo = `Romaneio ${numero} - OP-${op.numero}`; // base do nome (acha a versão anterior na revisão)
  const fileNome = `${prefixo}${cli ? ` - ${cli}` : ""}.xlsx`;

  let sharepoint = null;
  try {
    // Na revisão, move a versão anterior desse romaneio pra Obsoleto antes de salvar.
    const r = await salvarRomaneioNoServidor({ opNumero: op.numero, fileNome, buffer: buf, moverPrefixo: jaEmitido ? prefixo : undefined });
    sharepoint = { ok: true, nome: r.nome, caminho: r.caminho, webUrl: r.webUrl };
  } catch (e) {
    sharepoint = { ok: false, erro: e?.message || "Falha ao salvar no SharePoint." };
  }

  // Marca como emitido / atualiza a revisão + histórico no prévio.
  // Guarda a URL do arquivo no SharePoint (quando salvou) — o Fiscal usa pra abrir o FORM 22.
  // Salva os ITENS realmente emitidos (incluir/tirar peça na revisão) + o peso real,
  // pra a lista de expedição (expedido/pendente) e o peso do card baterem com a realidade.
  // ⚠⚠ O PESO DA CARGA QUE A OBRA MEDE É SÓ O DAS PEÇAS. `RomaneioPrevio.pesoKg` alimenta o
  // "expedido" da obra (lib/expedido-mes.js, status-obra) e o card da carga; somar a tinta de
  // retoque aqui inflaria o embarcado contra um contratado que não a tem. O peso dela sai impresso
  // na linha do FORM 22, que é onde ela precisa aparecer.
  const pesoKgReal = itensDeObra(itens).reduce((s, it) => s + (Number(it.pesoKg ?? it.pesoTotal) || 0), 0);
  await prisma.romaneioPrevio.update({
    where: { id: previo.id },
    data: {
      itens, pesoKg: pesoKgReal,
      emitidoEm: agora, emitidoPorId: user.id, revisao: novaRevisao, historico,
      ...(sharepoint?.ok && sharepoint.webUrl ? { arquivoUrl: sharepoint.webUrl } : {}),
    },
  }).catch(() => {});

  await prisma.auditLog.create({ data: { userId: user.id, action: novaRevisao === 0 ? "EMITIR_ROMANEIO" : "REVISAR_ROMANEIO", entity: "RomaneioPrevio", entityId: previo.id, diff: { numero, revisao: novaRevisao, itens: itens.length, ...(ignoradas.length ? { ignoradasSemQuantidade: ignoradas } : {}) } } }).catch(() => {});

  return NextResponse.json({ ok: true, numero, revisao: novaRevisao, ignoradas, nome: fileNome, arquivo: buf.toString("base64"), sharepoint });
}
