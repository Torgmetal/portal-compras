import "server-only";
import { PIT_PADRAO } from "./pit-padroes";

// ─── ACEITE DO CLIENTE NO PIT E NO PLP ────────────────────────────────────────
// Vitor (26/08/2026): "não quero que gere apenas o excel, quero que mande para assinatura como te
// disse, e será através de um e-mail que será enviado, e já fique mostrando o status no portal do
// cliente; o PIT também deve conter o aceite por parte do cliente, não pode deixar de ter esse
// aceite".
//
// ⚠⚠ SÃO OS DOIS DOCUMENTOS QUE O CLIENTE APROVA ANTES DE FABRICAR. O PIT diz o que vai ser
// inspecionado e com que critério; o PLP diz como a peça vai ser preparada e pintada. Emitir sem o
// aceite é fabricar contra um plano que o cliente ainda pode recusar — e a recusa, quando vem,
// chega depois da peça pronta.
//
// ⚠ REAPROVEITA O MOTOR QUE JÁ EXISTE (EnvioAssinatura / AssinaturaDocumento / /assinar/[token]),
// o mesmo do Plano de Treinamentos e do Cronograma de Auditoria. O que muda é que estes dois são
// DE UMA OBRA — daí a coluna `opNumero` no envio.
//
// ⚠ O NÚMERO E A REVISÃO SÃO OS DO DOCUMENTO, não um contador do portal. O PLP tem o seu ("PLP Nº
// T112, Rev 0", da planilha controlada) e o PIT tem `OP.pitRevisao`. Inventar numeração aqui foi
// exatamente o erro que o portal do cliente cometeu com a lista de expedição (26/08).
export const DOCS = {
  PLP: {
    tipo: "PLP", nome: "Plano de Pintura", sigla: "PLP",
    resumo: "Preparação de superfície, esquema de pintura e as cores por item.",
  },
  PIT: {
    tipo: "PIT", nome: "Plano de Inspeção e Testes", sigla: "PIT",
    resumo: "O que é inspecionado em cada etapa, com critério de aceitação e percentual.",
  },
};

/** "T112" — o número do documento nesta obra. O zero à esquerda cai; "T67" seria outra obra. */
// ─── AS DUAS ETAPAS ───────────────────────────────────────────────────────────
// Vitor (26/08/2026): "deixar o campo de elaborado e verificado para poder ser preenchido e enviar
// para esses e-mails antes, para depois ir até o cliente".
//
// ⚠⚠ A ORDEM É A REGRA, NÃO UMA SUGESTÃO. Documento controlado que chega ao cliente sem passar por
// quem elabora e quem verifica não tem como voltar: o que ele leu, leu. Por isso o envio ao cliente
// é RECUSADO no servidor enquanto a verificação interna daquela revisão não estiver assinada.
export const ETAPAS = {
  INTERNA: { id: "INTERNA", nome: "verificação interna", papel: "elaboração e verificação" },
  CLIENTE: { id: "CLIENTE", nome: "aceite do cliente", papel: "inspetor do cliente" },
};
/** O `tipo` do envio: "PIT" é o do cliente; "PIT_INTERNO" é a verificação da casa. */
export const tipoDoEnvio = (doc, etapa) => (etapa === "INTERNA" ? `${doc}_INTERNO` : doc);
export const docDoTipo = (tipo) => String(tipo || "").replace(/_INTERNO$/, "");
export const ehTipoDePlano = (tipo) => ["PIT", "PLP", "PIT_INTERNO", "PLP_INTERNO"].includes(String(tipo || ""));

export const numeroDoDoc = (sigla, opNumero) => `${sigla} T${String(opNumero || "").replace(/\D/g, "").padStart(3, "0")}`;

/**
 * A revisão como INTEIRO, que é o que o envio guarda. "0" → 0 · "R01" → 1 · "Rev. 2" → 2
 *
 * ⚠⚠ O "R" MANDA. O campo de revisão do PLP às vezes guarda o rótulo inteiro do documento — a
 * OP-067 tem "T067 R0" gravado. Pegando o primeiro número, isso vira revisão 67 (e "T112 R00"
 * vira 99, pelo teto): o portão do aceite passaria a comparar revisões que não existem, e o
 * documento aceito nunca casaria com o vigente. Quando há "R" seguido de número, é ele.
 */
export const revisaoInt = (v) => {
  const s = String(v ?? "");
  const comR = s.match(/\bR(?:ev\.?)?\s*(\d+)/i);
  const m = comR ? comR[1] : (s.match(/\d+/) || [])[0];
  return m ? Math.min(99, parseInt(m, 10)) : 0;
};

/**
 * O documento pronto para enviar: título, revisão e o SNAPSHOT do que o cliente vai aceitar.
 *
 * ⚠ O SNAPSHOT É O DOCUMENTO. Depois de enviado, o PLP pode mudar de cor e o PIT de padrão — o que
 * o cliente aceitou não pode mudar junto. É a mesma razão do snapshot do Plano de Treinamentos.
 */
/**
 * O cabeçalho da obra, como ele tem de sair em QUALQUER documento controlado.
 *
 * Vitor (26/08/2026): "as informações de número do pedido, local da obra, cliente, número da OP —
 * várias você consegue puxar do portal ou da pasta da OP, deixe isso certo já".
 *
 * ⚠ UM LUGAR SÓ. O Excel do PLP montava isto por conta própria; se o PDF que o cliente aceita
 * montasse de novo, os dois divergiriam no dia em que um deles mudasse — e o que ele aceitou não
 * seria o que a gente emitiu.
 */
export async function dadosDaObra(prisma, opNumero) {
  const op = await prisma.oP.findFirst({
    where: { numero: opNumero },
    select: {
      id: true, numero: true, cliente: true, clienteRazaoSocial: true, obra: true, refCliente: true,
      clienteCidade: true, clienteUF: true, pitPadrao: true, pitRevisao: true, clienteContatos: true,
    },
  });
  if (!op) return null;
  const kick = await prisma.oPKickOff.findFirst({
    where: { opId: op.id },
    select: { pedidoCompraCliente: true, entregaEndereco: true },
    orderBy: { updatedAt: "desc" },
  }).catch(() => null);
  // ⚠ o local cai para a cidade/UF do cliente só quando o Kick Off não tem endereço de entrega —
  // é a melhor aproximação disponível, e vazio é melhor que errado.
  return {
    ...op,
    // razão social é o nome que vai em documento controlado; o apelido fica de reserva
    cliente: op.clienteRazaoSocial || op.cliente,
    local: kick?.entregaEndereco || [op.clienteCidade, op.clienteUF].filter(Boolean).join(" - ") || "",
    pedidoCliente: kick?.pedidoCompraCliente || "",
  };
}

/**
 * Quem elabora e quem verifica este documento nesta obra — e, se já assinaram, quando.
 *
 * ⚠ A DATA VEM DA ASSINATURA, não do cadastro. O nome no campo é uma intenção; a data ao lado dele
 * é o que prova que a pessoa leu. Preencher as duas coisas à mão faria o documento afirmar uma
 * verificação que ninguém fez.
 */
export async function responsaveisDoPlano(prisma, doc, opNumero, { revisao = null } = {}) {
  let r = await prisma.planoResponsavel.findUnique({ where: { opNumero_doc: { opNumero, doc } } }).catch(() => null);
  // ⚠⚠ QUEM ELABORA O PIT ELABORA O PLP. Vitor (27/08/2026): "conforme mencionado lá em cima, o
  // nome das pessoas vamos já deixar preenchidos — trazer para aqui também essa informação". Ele
  // preencheu no PIT e o PLP saiu com "—" nas aprovações: o cadastro é por documento, mas as
  // pessoas são as mesmas da obra. Sem nada gravado neste, vale o do outro plano da mesma OP —
  // preencher os dois com os mesmos nomes é trabalho que o portal pode poupar.
  if (!r?.elaboradoNome && !r?.verificadoNome) {
    const outro = await prisma.planoResponsavel.findFirst({
      where: { opNumero, doc: { not: doc }, OR: [{ elaboradoNome: { not: null } }, { verificadoNome: { not: null } }] },
      orderBy: { atualizadoEm: "desc" },
    }).catch(() => null);
    if (outro) r = outro;
  }
  const base = {
    elaborado: { nome: r?.elaboradoNome || null, email: r?.elaboradoEmail || null, assinadoEm: null },
    verificado: { nome: r?.verificadoNome || null, email: r?.verificadoEmail || null, assinadoEm: null },
    // ⚠ os outros destinatários seguem o documento, não a pessoa: quem foi posto em cópia no PIT
    // não vira automaticamente cópia do PLP. Por isso NÃO entram no fallback do outro documento.
    outros: Array.isArray(r?.outros) ? r.outros.filter((x) => x?.email) : [],
  };
  const envio = await prisma.envioAssinatura.findFirst({
    where: { tipo: tipoDoEnvio(doc, "INTERNA"), opNumero, ...(revisao === null ? {} : { revisao }) },
    orderBy: { enviadoEm: "desc" },
    select: { assinaturas: { select: { email: true, nome: true, setor: true, assinadoEm: true } } },
  }).catch(() => null);
  for (const a of envio?.assinaturas || []) {
    // ⚠ o papel gravado no envio é quem manda: "Elaboração", "Verificação" ou o setor livre de um
    // convidado. Sem isso, a assinatura de um terceiro sobrescreveria a data do elaborador.
    if (/verific/i.test(a.setor || "")) {
      if (a.assinadoEm) base.verificado.assinadoEm = a.assinadoEm;
      if (!base.verificado.nome) base.verificado.nome = a.nome;
    } else if (/elabora/i.test(a.setor || "")) {
      if (a.assinadoEm) base.elaborado.assinadoEm = a.assinadoEm;
      if (!base.elaborado.nome) base.elaborado.nome = a.nome;
    } else {
      const o = base.outros.find((x) => String(x.email).toLowerCase() === String(a.email).toLowerCase());
      if (o) { o.assinadoEm = a.assinadoEm || null; o.nome = o.nome || a.nome; }
    }
  }
  return base;
}

/**
 * O snapshot com os responsáveis GARANTIDOS.
 *
 * ⚠⚠ ENVIO ANTIGO NÃO TEM O CAMPO. Vitor (27/08/2026): "no PIT da qualidade você só está trazendo o
 * nome do cliente, preciso que coloque o nome do elaborador e do verificador que já preenchi". O
 * PIT dele foi enviado ANTES de o cadastro de elaborado/verificado existir, então o snapshot saiu
 * sem eles e o quadro de aprovações imprimia "—".
 *
 * ⚠ ISSO NÃO REESCREVE O QUE FOI ENVIADO. O snapshot guarda o CONTEÚDO do plano (escopo, demãos,
 * itens) — é ele que não pode mudar depois de aceito. Quem elabora e quem verifica é cadastro da
 * obra, e um quadro em branco não é uma verdade preservada: é um campo que ainda não existia.
 */
export async function comResponsaveis(prisma, doc, opNumero, snapshot) {
  const snap = snapshot || {};
  if (snap.responsaveis?.elaborado?.nome || snap.responsaveis?.verificado?.nome) return snap;
  const op = String(opNumero || snap.opNumero || "").replace(/\D/g, "").padStart(3, "0");
  if (!op) return snap;
  const responsaveis = await responsaveisDoPlano(prisma, doc, op).catch(() => null);
  return responsaveis ? { ...snap, responsaveis } : snap;
}

export async function montarPlano(prisma, doc, opNumero) {
  const def = DOCS[doc];
  if (!def) return { erro: "Documento desconhecido." };

  const op = await dadosDaObra(prisma, opNumero);
  if (!op) return { erro: `OP-${opNumero} não encontrada.` };

  if (doc === "PIT") {
    if (!op.pitPadrao || !PIT_PADRAO[op.pitPadrao]) {
      return { erro: "Escolha o padrão do PIT antes de enviar para aceite do cliente." };
    }
    const padrao = PIT_PADRAO[op.pitPadrao];
    const revisao = revisaoInt(op.pitRevisao);
    const responsaveis = await responsaveisDoPlano(prisma, "PIT", opNumero, { revisao });
    return {
      op, revisao,
      numero: numeroDoDoc("PIT", op.numero),
      titulo: `${numeroDoDoc("PIT", op.numero)} — Plano de Inspeção e Testes · ${op.obra || op.cliente || ""}`.trim(),
      snapshot: {
        doc: "PIT", opNumero: op.numero, padrao: op.pitPadrao, revisao: op.pitRevisao || "0",
        numero: numeroDoDoc("PIT", op.numero), nomePadrao: padrao.nome, snqc: !!padrao.snqc,
        linhas: padrao.linhas,
        obra: op.obra || null, cliente: op.cliente || null, local: op.local || null,
        refCliente: op.refCliente || null, pedidoCliente: op.pedidoCliente || null,
        responsaveis,
      },
      responsaveis,
    };
  }

  const plp = await prisma.planoPintura.findUnique({ where: { opNumero } });
  if (!plp) {
    return { erro: "Esta obra ainda não tem o plano de pintura. Leia o PLP da pasta da obra ou preencha o plano antes de enviar." };
  }
  const revisao = revisaoInt(plp.revisao);
  const responsaveis = await responsaveisDoPlano(prisma, "PLP", opNumero, { revisao });
  return {
    op, revisao,
    numero: numeroDoDoc("PLP", op.numero),
    titulo: `${numeroDoDoc("PLP", op.numero)} — Plano de Pintura · ${op.obra || op.cliente || ""}`.trim(),
    snapshot: {
      doc: "PLP", opNumero: op.numero, revisao: plp.revisao || "0", numero: numeroDoDoc("PLP", op.numero),
      preparoMetodo: plp.preparoMetodo, grauLimpeza: plp.grauLimpeza, abrasivo: plp.abrasivo,
      rugosidadeMin: plp.rugosidadeMin, rugosidadeMax: plp.rugosidadeMax, metodoAplicacao: plp.metodoAplicacao,
      demaos: plp.demaos || [], itens: plp.itens || [], espessuraTotal: plp.espessuraTotal,
      observacoes: plp.observacoes || null,
      documentosReferencia: plp.documentosReferencia || null, revisoes: plp.revisoes || [],
      obra: op.obra || null, cliente: op.cliente || null, local: op.local || null,
      refCliente: op.refCliente || null, pedidoCliente: op.pedidoCliente || null,
      responsaveis,
    },
    responsaveis,
  };
}

/**
 * Como está o aceite dos dois documentos nesta obra.
 *
 * ⚠ VALE O ÚLTIMO ENVIO DE CADA DOCUMENTO. Um PIT aceito na revisão 0 não vale para a revisão 1 —
 * e o portal do cliente precisa dizer "aguardando aceite" quando a revisão nova saiu, mesmo com a
 * anterior aceita, senão a tela afirma um aceite que não existe para o documento vigente.
 */
export async function statusDosPlanos(prisma, opNumero) {
  const envios = await prisma.envioAssinatura.findMany({
    where: { opNumero, tipo: { in: ["PLP", "PIT", "PLP_INTERNO", "PIT_INTERNO"] } },
    orderBy: { enviadoEm: "desc" },
    select: {
      id: true, tipo: true, revisao: true, titulo: true, enviadoEm: true, status: true,
      assinaturas: { select: { nome: true, email: true, setor: true, assinadoEm: true, ip: true, ordem: true, convidadoEm: true, revisaoPedidaEm: true, motivo: true }, orderBy: { nome: "asc" } },
    },
    take: 60,
  });

  const daEtapa = (doc, etapa) => {
    // ⚠ envio com revisão pedida não é o estado atual: ele foi devolvido, o documento subiu de
    // revisão e o ciclo recomeça. Continua no histórico, fora do "onde estamos".
    const meus = envios.filter((e) => e.tipo === tipoDoEnvio(doc, etapa) && e.status !== "REVISAO_PEDIDA");
    const ultimo = meus[0] || null;
    const ass = (ultimo?.assinaturas || []).slice().sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    const assinadas = ass.filter((a) => a.assinadoEm);
    return {
      enviado: !!ultimo,
      envioId: ultimo?.id || null,
      titulo: ultimo?.titulo || null,
      revisao: ultimo?.revisao ?? null,
      enviadoEm: ultimo?.enviadoEm || null,
      total: ass.length,
      aceites: assinadas.length,
      // ⚠ A CONTA MUDA COM A ETAPA. Na verificação interna TODOS têm de assinar — elaborar e
      // verificar são papéis distintos, e um sem o outro não fecha o documento. No aceite do
      // cliente, UM basta: quem assina é o inspetor dele, não um colegiado; exigir todos faria um
      // e-mail de cópia sem resposta segurar um plano já aprovado por quem responde.
      aceito: etapa === "INTERNA" ? ass.length > 0 && assinadas.length === ass.length : assinadas.length > 0,
      aceitoEm: assinadas[assinadas.length - 1]?.assinadoEm || null,
      aceitoPor: assinadas[0]?.nome || null,
      assinantes: ass.map((a) => ({
        nome: a.nome, email: a.email, papel: a.setor, ordem: a.ordem ?? null,
        assinadoEm: a.assinadoEm, convidadoEm: a.convidadoEm,
      })),
      pendentes: ass.filter((a) => !a.assinadoEm).map((a) => a.nome || a.email),
      // de quem se espera AGORA: o primeiro da fila que ainda não assinou
      vez: ass.find((a) => !a.assinadoEm)
        ? { nome: ass.find((a) => !a.assinadoEm).nome, papel: ass.find((a) => !a.assinadoEm).setor, convidado: !!ass.find((a) => !a.assinadoEm).convidadoEm }
        : null,
      // o último pedido de revisão desta etapa, para a tela dizer por que voltou
      revisaoPedida: (() => {
        const dev = envios.find((e) => e.tipo === tipoDoEnvio(doc, etapa) && e.status === "REVISAO_PEDIDA");
        const quem = dev?.assinaturas?.find((a) => a.revisaoPedidaEm);
        return quem ? { por: quem.nome, papel: quem.setor, em: quem.revisaoPedidaEm, motivo: quem.motivo, revisao: dev.revisao } : null;
      })(),
    };
  };

  const porDoc = {};
  for (const doc of ["PIT", "PLP"]) {
    const interna = daEtapa(doc, "INTERNA");
    const cliente = daEtapa(doc, "CLIENTE");
    porDoc[doc] = {
      interna, cliente,
      // ⚠ compatibilidade: o portal do cliente e a tela leem o aceite DELE por estes campos.
      ...cliente,
      historico: envios.filter((e) => docDoTipo(e.tipo) === doc).map((e) => ({
        id: e.id, etapa: e.tipo.endsWith("_INTERNO") ? "INTERNA" : "CLIENTE", revisao: e.revisao,
        enviadoEm: e.enviadoEm,
        aceito: e.assinaturas.length > 0 && e.assinaturas.every((a) => a.assinadoEm),
        quem: e.assinaturas.filter((a) => a.assinadoEm).map((a) => ({ nome: a.nome, em: a.assinadoEm })),
      })),
    };
  }
  return porDoc;
}

/**
 * O PDF do plano — o documento, e o único formato.
 *
 * ⚠⚠ O EXCEL SAIU. Vitor (27/08/2026): "não será necessário o excel nem no PIT nem no PLP, pois o
 * PDF que criou ficou muito mais bonito". Ele era o entregável até ontem (a exigência original era
 * "no formato excel para ficar mais sério, preservar os campos de assinatura") — o PDF passou a
 * cumprir os dois papéis, e manter os dois lados criaria duas versões do mesmo plano circulando.
 * Os geradores de planilha (lib/pit-excel, lib/plp-excel) saíram junto; estão no histórico do git
 * se um cliente pedir a planilha algum dia.
 *
 * ⚠ SAI DO SNAPSHOT quando existe envio: quem abrir o link amanhã vê o que recebeu para aceitar,
 * não o cadastro de hoje.
 */
export async function pdfDoPlano(prisma, doc, opNumero, { snapshot = null, assinaturas = null, minuta = false } = {}) {
  const { gerarPlanoClientePDF } = await import("./plano-cliente-pdf");
  const snap = snapshot || (await montarPlano(prisma, doc, opNumero))?.snapshot;
  if (!snap) return null;
  return {
    nome: `${doc}-T${opNumero}.pdf`,
    bytes: await gerarPlanoClientePDF({ snapshot: snap, assinaturas, minuta }),
  };
}

// ─── ARQUIVAR O PLANO APROVADO ────────────────────────────────────────────────
// Vitor (26/08/2026): "o PIT e PLP devem ser gerados aqui no portal e você deve salvar na pasta da
// qualidade do SharePoint e anexar ao Data Book depois de todos terem aprovado".
//
// ⚠⚠ SÓ DEPOIS DE TODOS. Arquivar antes coloca na pasta da obra — e no Data Book, que é o dossiê que
// vai ao cliente no fim — um plano que ainda pode mudar. O Data Book não tem "versão de trabalho":
// o que está lá é o que valeu.
//
// ⚠ UM ARQUIVO SÓ, O PDF. Era Excel + PDF até 27/08/2026, quando o Vitor tirou a planilha dos dois
// documentos. Guardar um formato só é o certo aqui: duas cópias do mesmo plano na pasta da obra é
// como alguém acaba anexando a versão errada ao Data Book.
const PASTA_DO_DOC = { PIT: "1. PIT", PLP: "2. PLP" };
// A seção do Data Book de cada plano (o `tipo` do documento É o título da seção, com "Anexo — ").
const SECAO_DO_DOC = {
  PIT: "Anexo — PIT/ITP — plano de inspeção e testes",
  PLP: "Anexo — Tratamento de superfície e pintura (DFT)",
};

export async function arquivarPlano(prisma, doc, opNumero, { snapshot = null, usuario = null } = {}) {
  const { acharPastaOp, uploadFileToFolder } = await import("./sharepoint");
  const { gerarPlanoClientePDF } = await import("./plano-cliente-pdf");

  const base = await acharPastaOp(opNumero);
  if (!base) return { ok: false, erro: `Pasta da OP-${opNumero} não encontrada no SharePoint.` };

  const envio = await prisma.envioAssinatura.findFirst({
    where: { tipo: doc, opNumero },
    orderBy: { enviadoEm: "desc" },
    select: { id: true, snapshot: true, revisao: true },
  });
  const snap = snapshot || envio?.snapshot || {};
  const assinaturas = envio
    ? await prisma.assinaturaDocumento.findMany({
        where: { envioId: envio.id },
        select: { nome: true, setor: true, assinadoEm: true, ip: true },
        orderBy: { nome: "asc" },
      })
    : [];

  const rev = `R${String(envio?.revisao ?? 0).padStart(2, "0")}`;
  const nomeBase = `${doc}-T${opNumero}-${rev}`;

  // ⚠⚠ O NOME DA SUBPASTA VARIA ENTRE OBRAS: hoje é "1. PIT" e "2. PLP", mas a OP-067 tem "PLP"
  // sem número. Gravar no nome fixo criaria uma SEGUNDA pasta ao lado da que a Qualidade usa — e o
  // documento aprovado ficaria onde ninguém procura. Usa a que existe; cria a padrão só se não há.
  const { listChildrenByPath } = await import("./sharepoint");
  const naQualidade = await listChildrenByPath(process.env.SHAREPOINT_DRIVE_ID, `${base}/8. Qualidade`).catch(() => []);
  const rx = new RegExp(`^(\\d+\\s*[.\\-]\\s*)?${doc}\\b`, "i");
  const achada = (naQualidade || []).filter((c) => c.folder).find((c) => rx.test(String(c.name || "").trim()));
  const pasta = `${base}/8. Qualidade/${achada?.name || PASTA_DO_DOC[doc]}`;

  const pdf = await gerarPlanoClientePDF({ snapshot: snap, assinaturas });
  const doPdf = await uploadFileToFolder({
    folderPath: pasta, fileName: `${nomeBase}.pdf`, buffer: Buffer.from(pdf), contentType: "application/pdf",
  });

  // ── e no Data Book ──
  //
  // ⚠ O VÍNCULO É PELO `tipo`: é assim que o Data Book acha o documento da seção (ver
  // lib/databook-secoes, `docCasaSecao`). Cadastrar sem ele deixa o arquivo no Controle de
  // Documentos e fora do dossiê — que é justamente o que ele pediu para não acontecer.
  const nomeDoc = `${doc === "PIT" ? "Plano de Inspeção e Testes" : "Plano de Pintura"} ${nomeBase.replace(/^\w+-/, "")}`;
  const jaTem = await prisma.documentoQualidade.findFirst({
    where: { opNumero, categoria: "ANEXO", tipo: SECAO_DO_DOC[doc], nome: nomeDoc },
    select: { id: true },
  });
  const dados = {
    nome: nomeDoc, categoria: "ANEXO", tipo: SECAO_DO_DOC[doc], opNumero,
    arquivoUrl: doPdf.webUrl || null, arquivoNome: `${nomeBase}.pdf`,
    numeroDocumento: `${doc} T${opNumero}`, ativo: true,
  };
  const registro = jaTem
    ? await prisma.documentoQualidade.update({ where: { id: jaTem.id }, data: dados })
    : await prisma.documentoQualidade.create({ data: dados });

  return { ok: true, pasta, arquivos: [doPdf?.name].filter(Boolean), documentoId: registro.id, url: doPdf.webUrl || null };
}

/**
 * Todos aprovaram? (verificação interna assinada por todos + aceite do cliente)
 *
 * ⚠ NA MESMA REVISÃO. Interna assinada na R00 não vale para a R01 do documento — e é justamente na
 * revisão que a checagem por documento, sem olhar o número, deixaria passar.
 */
export async function tudoAprovado(prisma, doc, opNumero) {
  const st = await statusDosPlanos(prisma, opNumero);
  const d = st?.[doc];
  if (!d?.interna?.aceito || !d?.cliente?.aceito) return false;
  return d.interna.revisao === d.cliente.revisao;
}
