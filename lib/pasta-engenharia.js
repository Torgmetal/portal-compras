import "server-only";
import { getAccessToken, acharPastaOp } from "./sharepoint";

// O QUE EXISTE DE FATO NA PASTA DA ENGENHARIA — a contraprova da lista importada.
//
// Vitor (25/08/2026), depois de ver o painel da Diretoria dar a OP-106 como entregue: "não entendo
// o fato da OP-106 estar sem os projetos dentro das pastas do projeto, isso me quebra".
//
// ⚠⚠ O PORTAL SÓ SABIA DA LISTA, NÃO DO DESENHO. `PecaConjunto` com fonte LPC_IMPORT diz que
// alguém subiu a LPC; não diz que existe desenho para o setor abrir. Medido na OP-106: LPC no
// portal, 16 .nc1 e 11 .igs na pasta, e ZERO PDF de desenho. O programador conseguiu lançar porque
// a máquina lê NC1; a bancada ficou sem papel. Foi por isso que a impressão não foi.
//
// ⚠ ARQUIVO-MODELO NÃO É CONTEÚDO. As pastas nascem do template com "Mandar nessa pasta.docx",
// "Anexar memorial de cálculo e ART.docx", "TXX-...", "OP-000-...". Contar isso como entrega faz a
// pasta vazia parecer preenchida — que é exatamente o caso da 2.5.5 Cliente da OP-106.
const GRAPH = "https://graph.microsoft.com/v1.0";
const PROF_MAX = 6;
// ⚠ arquivo de MÁQUINA. NC1/DXF/CAM alimentam corte e dobra; IGS/STP são o modelo 3D. Nenhum deles
// serve à bancada. É o contraste com o PDF que revela o furo: OP-092 tem 812 .nc1 e 812 .cam contra
// 57 desenhos; OP-106, 16 .nc1 e nenhum.
const EXT_MAQUINA = /^(nc1|dxf|cam)$/;
const EXT_MODELO3D = /^(igs|iges|stp|step)$/;
// ⚠⚠ IFC É OUTRA COISA — E POR ISSO TEM BALDE PRÓPRIO. Vitor (03/09/2026): "o IFC é exatamente
// aquele que está nas pastas da engenharia da Obra", para o visualizador 3D em que se clica na peça
// e sai o dossiê dela.
// 🚫 NÃO PODE ENTRAR EM `EXT_MODELO3D`: aquele balde alimenta `temMaquina`, o portão que libera a
// marca para descer ao chão ("a máquina tem o que ler"). IFC é modelo de coordenação — nenhuma
// máquina corta a partir dele. Somá-lo ali faria uma obra com IFC e sem NC1 parecer pronta para
// cortar, que é exatamente o furo que esse portão existe para fechar.
const EXT_IFC = /^ifc$/;

// ⚠ SUBPASTAS DE 2.5.2 QUE NÃO SÃO DESENHO. A .5 guarda aproveitamento de chapa em PDF — contar
// aquilo como desenho fazia a OP-106, que não tem desenho NENHUM, aparecer como "parcial".
const NAO_DESENHO = /2\.5\.2\.(1|4|5)\b/;

// nome do arquivo casa a marca EXATA — "T89A1.pdf", "T89A1 - CROQUI.pdf", "T89A1_R01.pdf" casam;
// "T89A10.pdf" NÃO. (Era a mesma função copiada em desenhos-lote e na rota de desenhos.)
export function casaMarca(nome, marca) {
  const up = String(nome).toUpperCase();
  const m = String(marca).toUpperCase();
  if (!m || !up.startsWith(m)) return false;
  return /^(\.[A-Z0-9]+|[ ._-])/.test(up.slice(m.length));
}

// ⚠ A MARCA EM QUALQUER LUGAR DO NOME, delimitada. `casaMarca` exige a marca no COMEÇO porque a
// emissão precisa escolher o arquivo certo; para auditar, isso confunde "não existe" com "existe
// com nome fora do padrão" — e é a segunda que explica desenho que está lá e não imprime.
export function mencionaMarca(nome, marca) {
  const m = String(marca || "").trim();
  if (!m) return false;
  const esc = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`, "i").test(String(nome));
}

// arquivo que veio do template e nunca foi trocado por conteúdo de verdade
export function ehModelo(nome) {
  const n = String(nome || "");
  return /^(anexar|mandar|modelo)\b/i.test(n)
    || /\bT(XX|##)\b/i.test(n)
    || /\bOP-?(XX|000)\b/i.test(n)
    || /^logo_torg/i.test(n);
}

/**
 * Varre `2. Engenharia/2.5 Projetos` de uma OP e devolve o que há lá dentro, já separado por
 * natureza. Uma varredura só: com 500+ PDFs, perguntar arquivo por arquivo seria inviável.
 *
 * @returns {Promise<{achou:boolean, erro?:string, base?:string, pdfs:[], pdfsEnvio:[], outrosPdfs:number, nc1:[], igs:[], listas:[], cliente:[], modelos:number, ultimo:string|null}>}
 */
export async function inventarioEngenharia(opNumero) {
  const base = await acharPastaOp(opNumero);
  if (!base) return { achou: false, erro: "Pasta da OP não encontrada no SharePoint.", pdfs: [], pdfsEnvio: [], outrosPdfs: 0, nc1: [], igs: [], ifc: [], listas: [], cliente: [], modelos: 0, ultimo: null };

  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const raiz = `${base}/2. Engenharia/2.5 Projetos`;
  const arquivos = [];

  async function andar(caminho, pastaMae, prof) {
    if (/obsolet/i.test(pastaMae || "") || prof > PROF_MAX) return;
    const res = await fetch(
      `${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$select=name,folder,file,size,lastModifiedDateTime&$top=999`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return;
    const { value = [] } = await res.json();
    for (const it of value) {
      if (it.folder) { await andar(`${caminho}/${it.name}`, it.name, prof + 1); continue; }
      if (!it.file) continue;
      arquivos.push({
        nome: it.name,
        rel: caminho.slice(raiz.length + 1),
        pastaMae: pastaMae || "",
        ext: (it.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase(),
        kb: Math.round((it.size || 0) / 1024),
        em: it.lastModifiedDateTime || null,
        modelo: ehModelo(it.name),
      });
    }
  }
  await andar(raiz, "", 0);

  const vale = (a) => !a.modelo && !/obsolet/i.test(a.nome);
  const naFab = arquivos.filter((a) => /^2\.5\.2/.test(a.rel));
  // ⚠ a pasta do cliente pode vir com sufixo: a OP-067 usa "2.5.5 Cliente (ENC 326)". Casar o nome
  // exato deixaria 1.807 PDFs de fora e a obra apareceria como "sem desenho nenhum".
  const noCli = arquivos.filter((a) => /^2\.5\.5/.test(a.rel));
  const datas = arquivos.map((a) => a.em).filter(Boolean).sort();

  return {
    achou: true,
    base,
    // formato pela pasta-mãe (A1..A4), como na emissão em lote — croqui cai em A4
    pdfs: naFab.filter((a) => a.ext === "pdf" && vale(a) && !NAO_DESENHO.test(a.rel)).map((a) => ({
      ...a, formato: /^A[1-4]$/i.test(a.pastaMae) ? a.pastaMae.toUpperCase() : "A4",
    })),
    outrosPdfs: naFab.filter((a) => a.ext === "pdf" && vale(a) && NAO_DESENHO.test(a.rel)).length,
    // ⚠⚠ 2.5.5 É PASTA DE SAÍDA, NÃO DE ENTRADA. Vitor (25/08/2026): "é uma pasta que criamos para
    // enviar ao cliente, ou seja não será necessário estar ali". PDF ali NÃO cobre a fabricação — a
    // bancada não abre essa pasta. Continua sendo medido, porque achar 1.807 arquivos ali (OP-067)
    // explica onde o desenho foi parar; só não conta como desenho entregue à produção.
    pdfsEnvio: noCli.filter((a) => a.ext === "pdf" && vale(a)).map((a) => ({ ...a, formato: "envio" })),
    nc1: naFab.filter((a) => EXT_MAQUINA.test(a.ext)),
    igs: naFab.filter((a) => EXT_MODELO3D.test(a.ext)),
    // ⚠ o IFC costuma ficar na raiz da pasta da OP, não dentro da 2.5.2 — por isso varre `arquivos`
    // inteiro, e não só `naFab`. Guarda nome, caminho e tamanho (kb): é pelo tamanho que se decide
    // se o navegador aguenta abrir o modelo.
    ifc: arquivos.filter((a) => EXT_IFC.test(a.ext) && vale(a)),
    listas: naFab.filter((a) => /^xls[xm]?$/.test(a.ext) && vale(a)),
    cliente: noCli.filter(vale),
    modelos: arquivos.filter((a) => a.modelo).length,
    ultimo: datas[datas.length - 1] || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A CONFERÊNCIA EM SI — varre a pasta, casa com a lista e GRAVA o resultado.
//
// ⚠ GRAVA porque a varredura é cara (centenas de chamadas ao Graph por obra) e o painel precisa
// abrir pronto. O cron passa de madrugada; o botão da tela força uma obra na hora.
// ⚠ ERA 300, E O CORTE PASSOU A MENTIR. Enquanto isto só alimentava o painel da Diretoria, 300
// bastava para agir. Agora a lista de faltantes decide o que o Planejamento pode liberar — e um
// corte silencioso faria peça sem desenho passar por "não listada". Medido: 4 obras batiam
// exatamente em 300 (064, 092, 060, 067), ou seja, estavam truncadas.
const TETO_FALTA = 8000;

export async function conferirPastaDaOp(prisma, opId) {
  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) throw new Error("OP não encontrada.");

  const salvar = (dados) => prisma.pastaEngenharia.upsert({
    where: { opId: op.id },
    create: { opId: op.id, ...dados },
    update: { ...dados, checadoEm: new Date() },
  });

  let inv;
  try { inv = await inventarioEngenharia(op.numero); }
  catch (e) {
    // ⚠ o erro também é gravado: "não consegui ler" é informação diferente de "ainda não conferi",
    // e sem isso a obra ficaria eternamente em branco no painel sem ninguém saber por quê.
    const erro = e?.message || "Falha ao ler o SharePoint.";
    await salvar({ veredito: "ERRO", erro });
    return { op, erro };
  }
  if (!inv.achou) { await salvar({ veredito: "ERRO", erro: inv.erro }); return { op, erro: inv.erro }; }

  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId: op.id, fonte: "LPC_IMPORT" },
    select: { marca: true, tipoPeca: true },
  });
  // uma marca repete na LPC (sub-obras) — conferir desenho é por marca distinta
  const vistas = new Map();
  for (const p of pecas) {
    const m = String(p.marca || "").trim();
    if (m && !vistas.has(m.toUpperCase())) vistas.set(m.toUpperCase(), { marca: m, conjunto: p.tipoPeca === "CONJUNTO" });
  }
  const marcas = [...vistas.values()];

  // ⚠ DOIS PASSES. `casaMarca` é o que a emissão usa (nome começando pela marca). O que ela não acha
  // pode estar com o nome fora do padrão — o desenho existe e a impressão em lote não o encontra,
  // que é um problema DIFERENTE de não existir desenho.
  const comPdf = new Set(), soEnvio = new Set(), foraPadrao = new Map(), comNc1 = new Set();
  // ⚠ ARQUIVO DE MÁQUINA É OUTRA ENTREGA. Vitor (26/08/2026): "vamos colocar um status dos arquivos
  // nc1 ou igs que ficam na pasta da obra para poder garantir que todos os arquivos necessários
  // estão prontos para liberar". Desenho é o que a bancada abre; NC1/DXF é o que a máquina lê. Ter
  // um não é ter o outro, e faltar o segundo trava o corte do mesmo jeito.
  const comMaquina = new Set();
  for (const { marca } of marcas) {
    const k = marca.toUpperCase();
    if (inv.pdfs.some((a) => casaMarca(a.nome, marca))) comPdf.add(k);
    else {
      // ⚠ NÃO entra em comPdf: a marca segue sem desenho para a produção. Guarda-se só ONDE o
      // arquivo apareceu, que é o que faz a diferença entre "nunca foi desenhado" e "está na
      // pasta errada" — a OP-067 é inteira desse segundo tipo.
      if (inv.pdfsEnvio.some((a) => casaMarca(a.nome, marca))) soEnvio.add(k);
      const achado = inv.pdfs.find((a) => mencionaMarca(a.nome, marca));
      if (achado) foraPadrao.set(k, achado.nome);
    }
    if (inv.nc1.some((a) => casaMarca(a.nome, marca))) comNc1.add(k);
    // NC1/DXF/CAM ou o modelo 3D — qualquer um deles serve à máquina
    if (comNc1.has(k) || inv.igs.some((a) => casaMarca(a.nome, marca))) comMaquina.add(k);
  }

  // ⚠ CONJUNTO NÃO SE CORTA, então não se cobra arquivo de máquina dele: seria acusar falta de uma
  // coisa que nunca existiu e encher a lista de ruído. Só croqui e avulsa passam pela máquina.
  const cortaveis = marcas.filter((x) => !x.conjunto);
  const semMaquina = cortaveis
    .filter((x) => !comMaquina.has(x.marca.toUpperCase()))
    .map((x) => ({ marca: x.marca, desenho: comPdf.has(x.marca.toUpperCase()) }))
    .sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));

  const conta = (filtro) => {
    const alvo = marcas.filter(filtro);
    const com = alvo.filter((x) => comPdf.has(x.marca.toUpperCase()));
    return { total: alvo.length, comDesenho: com.length, semDesenho: alvo.length - com.length };
  };
  const conjuntos = conta((x) => x.conjunto);
  const croquis = conta((x) => !x.conjunto);

  const semDesenho = marcas
    .filter((x) => !comPdf.has(x.marca.toUpperCase()))
    .map((x) => ({
      marca: x.marca, conjunto: x.conjunto, nc1: comNc1.has(x.marca.toUpperCase()),
      foraPadrao: foraPadrao.get(x.marca.toUpperCase()) || null,
      soEnvio: soEnvio.has(x.marca.toUpperCase()),
    }))
    .sort((a, b) => (a.conjunto === b.conjunto ? String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }) : a.conjunto ? -1 : 1));

  // ⚠ "só máquina" é a assinatura da OP-106: NC1/IGS gerados, desenho nenhum emitido.
  const temMaquina = inv.nc1.length > 0 || inv.igs.length > 0;
  // ⚠ "só na pasta de envio" é estado PRÓPRIO. A Engenharia DESENHOU — o arquivo está em 2.5.5, de
  // onde a produção não tira desenho. Dizer "sem desenho" acusaria de não ter feito; dizer "ok"
  // esconderia que a bancada não tem o papel. São ações diferentes: uma é desenhar, outra é mover.
  const veredito =
    !marcas.length && !inv.pdfs.length && !inv.pdfsEnvio.length ? "VAZIA"
    : !inv.pdfs.length && soEnvio.size > 0 ? "SO_ENVIO"
    : !inv.pdfs.length && temMaquina ? "SO_MAQUINA"
    : !inv.pdfs.length ? "SEM_DESENHO"
    : !marcas.length ? "SEM_LISTA"
    : semDesenho.length === 0 ? "OK"
    : conjuntos.semDesenho > 0 && croquis.semDesenho === 0 ? "SEM_CONJUNTO"
    : "PARCIAL";

  const porFormato = Object.entries(inv.pdfs.reduce((a, p) => ({ ...a, [p.formato]: (a[p.formato] || 0) + 1 }), {})).sort();
  const detalhe = {
    soEnvio: soEnvio.size,
    maquinaTotal: cortaveis.length,
    maquinaCom: cortaveis.length - semMaquina.length,
    semMaquina: semMaquina.slice(0, TETO_FALTA),
    maquinaTruncado: Math.max(0, semMaquina.length - TETO_FALTA),
    pdfsEnvio: inv.pdfsEnvio.length,
    semDesenho: semDesenho.slice(0, TETO_FALTA),
    truncado: Math.max(0, semDesenho.length - TETO_FALTA),
    porFormato,
    // ⚠ a lista de IFC vai no `detalhe` (Json) para não exigir coluna nova em PastaEngenharia —
    // é informação de inventário, e quem for montar o visualizador precisa do caminho e do tamanho.
    ifc: (inv.ifc || []).slice(0, 20).map((a) => ({ nome: a.nome, rel: a.rel, kb: a.kb ?? null, em: a.em || null })),
    listas: inv.listas.map((a) => a.nome),
    clienteAmostra: inv.cliente.slice(0, 6).map((a) => a.nome),
    modelos: inv.modelos,
    ultimo: inv.ultimo,
  };

  await salvar({
    veredito, erro: null,
    pdfs: inv.pdfs.length, outrosPdfs: inv.outrosPdfs, nc1: inv.nc1.length, igs: inv.igs.length,
    cliente: inv.cliente.length, marcas: marcas.length,
    conjuntosTotal: conjuntos.total, conjuntosCom: conjuntos.comDesenho,
    croquisTotal: croquis.total, croquisCom: croquis.comDesenho,
    foraPadrao: foraPadrao.size, detalhe,
  });

  return { op, veredito, arquivos: { pdfs: inv.pdfs.length, pdfsEnvio: inv.pdfsEnvio.length, soEnvio: soEnvio.size, outrosPdfs: inv.outrosPdfs, nc1: inv.nc1.length, igs: inv.igs.length, cliente: inv.cliente.length, porFormato, clienteAmostra: detalhe.clienteAmostra, listas: detalhe.listas, modelos: inv.modelos, ultimo: inv.ultimo }, lista: { marcas: marcas.length, conjuntos, croquis, foraPadrao: foraPadrao.size }, semDesenho: detalhe.semDesenho, truncado: detalhe.truncado };
}

// a linha gravada, no mesmo formato que a conferência devolve — o painel não sabe qual das duas veio
export function formatarSalvo(r) {
  if (!r) return null;
  if (r.erro) return { veredito: "ERRO", erro: r.erro, checadoEm: r.checadoEm };
  const d = r.detalhe || {};
  return {
    veredito: r.veredito,
    checadoEm: r.checadoEm,
    arquivos: {
      pdfs: r.pdfs, pdfsEnvio: d.pdfsEnvio || 0, soEnvio: d.soEnvio || 0,
      outrosPdfs: r.outrosPdfs, nc1: r.nc1, igs: r.igs, cliente: r.cliente,
      porFormato: d.porFormato || [], clienteAmostra: d.clienteAmostra || [], listas: d.listas || [],
      modelos: d.modelos || 0, ultimo: d.ultimo || null,
    },
    lista: {
      marcas: r.marcas, foraPadrao: r.foraPadrao,
      conjuntos: { total: r.conjuntosTotal, comDesenho: r.conjuntosCom, semDesenho: r.conjuntosTotal - r.conjuntosCom },
      croquis: { total: r.croquisTotal, comDesenho: r.croquisCom, semDesenho: r.croquisTotal - r.croquisCom },
    },
    semDesenho: d.semDesenho || [],
    truncado: d.truncado || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O PORTÃO — quem pode ser liberado para a produção.
//
// Vitor (26/08/2026): "vamos ignorar os projetos da pasta 2.5.5, então precisamos disso na tela do
// planejamento, só pode ser liberado as marcas que possuem projetos nas pastas".
//
// ⚠ UMA FUNÇÃO SÓ porque a TELA e a GRAVAÇÃO precisam concordar. Se a tela marcasse por um critério
// e o POST barrasse por outro, a pessoa veria "pode" e levaria "não pode" — ou pior, o contrário.
//
// ⚠ 2.5.5 NÃO CONTA e nunca contou: `comPdf` só olha 2.5.2 Fabricação (ver `inventarioEngenharia`).
// `soEnvio` continua sendo MEDIDO — Vitor pode pedir —, mas não aparece em tela nenhuma:
// "o vinculo da pasta 2.5.5 não precisa ser mencionado em nada só se eu pedir" (26/08/2026).
export async function portaoDoDesenho(prisma, opId) {
  const p = await prisma.pastaEngenharia.findUnique({
    where: { opId },
    select: { veredito: true, checadoEm: true, detalhe: true, marcas: true, pdfs: true, erro: true },
  });

  const vazio = { conferida: false, confiavel: false, semDesenho: new Set(), foraPadrao: new Map(), soEnvio: new Set(),
                  maquinaMedida: false, semMaquina: new Set() };
  if (!p || !p.checadoEm || p.veredito === "ERRO") {
    return { ...vazio, veredito: p?.veredito || null, checadoEm: p?.checadoEm?.toISOString() || null, erroPasta: p?.erro || null };
  }

  const lista = Array.isArray(p.detalhe?.semDesenho) ? p.detalhe.semDesenho : [];
  const truncado = Number(p.detalhe?.truncado) || 0;
  const k = (m) => String(m || "").trim().toUpperCase();

  // ⚠⚠ CONFERÊNCIA ATRÁS DA LISTA = PORTÃO ABERTO DE GRAÇA. A lista guardada é só a dos FALTANTES:
  // marca que a conferência nunca viu não aparece nela e passaria por "tem desenho". Medido na
  // OP-105: conferida quando não havia LPC (veredito SEM_LISTA, faltantes = 0), a LPC chegou depois
  // — e as 146 peças / 23 t desciam inteiras sem um desenho conferido.
  //
  // `marcas` é quantas marcas distintas a conferência olhou. Se a LPC hoje tem mais, o retrato é
  // velho DEMAIS para decidir, e a saída é reconferir — não deixar passar.
  const [{ n } = { n: 0 }] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT UPPER(TRIM(marca)))::int AS n
    FROM "PecaConjunto" WHERE "opId" = ${opId} AND fonte = 'LPC_IMPORT' AND marca IS NOT NULL`;
  const marcasHoje = Number(n) || 0;
  const cobre = marcasHoje > 0 && (p.marcas || 0) >= marcasHoje;

  return {
    conferida: true,
    // ⚠ LISTA CORTADA = PORTÃO FECHADO. Se a conferência truncou os faltantes, as marcas que ficaram
    // de fora passariam por "tem desenho" — exatamente a brecha que o portão existe para não abrir.
    confiavel: truncado === 0 && cobre,
    truncado,
    marcasHoje, cobre,
    veredito: p.veredito,
    checadoEm: p.checadoEm.toISOString(),
    marcas: p.marcas || 0,
    pdfs: p.pdfs || 0,
    semDesenho: new Set(lista.map((x) => k(x.marca))),
    // ⚠ `semMaquina` só existe em conferência feita depois de 26/08/2026. `maquinaTotal` ausente
    // significa "não medido" — diferente de "medido e está tudo certo", que seria 0 faltantes.
    maquinaMedida: p.detalhe?.maquinaTotal != null,
    maquinaTotal: p.detalhe?.maquinaTotal ?? 0,
    maquinaCom: p.detalhe?.maquinaCom ?? 0,
    semMaquina: new Set((Array.isArray(p.detalhe?.semMaquina) ? p.detalhe.semMaquina : []).map((x) => k(x.marca))),
    foraPadrao: new Map(lista.filter((x) => x.foraPadrao).map((x) => [k(x.marca), x.foraPadrao])),
    soEnvio: new Set(lista.filter((x) => x.soEnvio).map((x) => k(x.marca))),
  };
}

// true = tem arquivo de máquina · false = não tem · null = não medido nesta conferência
export function temMaquinaNaPasta(portao, marca, conjunto) {
  if (!portao?.conferida || !portao.maquinaMedida) return null;
  if (conjunto) return null; // conjunto não passa na máquina — a pergunta não se aplica
  return !portao.semMaquina.has(String(marca || "").trim().toUpperCase());
}

// true = tem desenho · false = não tem · null = a obra nunca foi conferida (não dá para afirmar)
export function temDesenhoNaPasta(portao, marca) {
  if (!portao?.conferida) return null;
  return !portao.semDesenho.has(String(marca || "").trim().toUpperCase());
}
