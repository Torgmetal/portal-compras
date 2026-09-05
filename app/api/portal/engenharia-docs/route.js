// GET  /api/portal/engenharia-docs?opNumero=&area=&tipo=&caminho=  → navega a pasta da OP
// POST /api/portal/engenharia-docs {opNumero, area, tipo, docs}    → grava a SELEÇÃO
//
// Vitor (26/08/2026): "para cada parte aqui me permita acessar o servidor e selecionar o que eu
// quero colocar, e me dê a opção de podermos renomear os arquivos para que o cliente veja um nome
// mais adequado do que o nome original do documento".
//
// ⚠⚠ A ENGENHARIA NÃO NAVEGA A OP — ela tem QUATRO PORTAS. Vitor (26/08/2026): "vamos restringir a
// permissão de importação de arquivos; na Engenharia apenas permitir o Modelo 3D, memorial de
// cálculo, ART e Diagramas de montagem". Cada tipo abre nas suas pastas e não sai delas: `caminho`
// fora das raízes do tipo é recusado no servidor, não só escondido na tela. As outras quatro áreas
// seguem navegando a OP inteira, que é como elas foram pedidas.
//
// ⚠ NADA É PUBLICADO SOZINHO — a pasta tem revisão obsoleta e arquivo de trabalho. Escolher
// continua obrigatório; o que a tela faz é baratear o esforço.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { acharPastaOp, getAccessToken, listAllFilesRecursive } from "@/lib/sharepoint";
import { AREA, AREAS_COM_SELETOR, TIPO_ENG, TIPOS_ENGENHARIA, tipoDoDocEng } from "@/lib/portal-cliente";
import { raizesDoTipo, conteudoDoTipo, caminhosDasRaizes } from "@/lib/portal-eng-pastas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0";
const ROLES = ["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO", "ENGENHARIA"];
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
const so = (v) => (v === null || v === undefined ? "" : String(v).trim());

// ⚠ ONDE CADA ÁREA COMEÇA. Fora da Engenharia não é trava — dá para subir e navegar a OP toda; é só
// o ponto de partida, para não obrigar a pessoa a achar a pasta certa toda vez.
const RAIZ_DA_AREA = {
  COMPRAS: "3. Compras",
  PLANEJAMENTO: "5. Planejamento",
  QUALIDADE: "8. Qualidade",
  EXPEDICAO: "4. Expedição",
};

// ⚠ O QUE VAI AO CLIENTE É O DOCUMENTO FECHADO. Vitor (27/08/2026): "na aba qualidade apenas deixar
// para buscar os arquivos em pdf". A pasta da Qualidade tem modelo em .xls
// (MODELO-RELATORIO-FOTOGRAFICO-OPXX_DATA.xls) e planilha de trabalho no meio dos relatórios — e
// arquivo editável publicado é revisão que sai da nossa mão sem carimbo.
//
// ⚠⚠ E NA ENGENHARIA TAMBÉM SE FILTRA. Vitor (03/09/2026): "só leve para o portal arquivos pdf, dwg
// e excel; word ou txt você deve ignorar". Faz sentido: o cliente recebe desenho (pdf/dwg), lista
// (excel) e o modelo (ifc/step). Word e txt na pasta de projeto são rascunho, ata, anotação — coisa
// nossa que nunca foi feita para sair daqui, e que aparecia no seletor pedindo para ser marcada por
// engano.
const EXTENSOES_DA_AREA = {
  QUALIDADE: ["pdf"],
  ENGENHARIA: ["pdf", "dwg", "dxf", "xlsx", "xls", "xlsm", "ifc", "step", "stp"],
};

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const opNumero = so(u.searchParams.get("opNumero")).replace(/\D/g, "").padStart(3, "0");
  const area = so(u.searchParams.get("area")).toUpperCase() || "ENGENHARIA";
  const tipo = so(u.searchParams.get("tipo")).toUpperCase();
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  if (!AREA[area]) return NextResponse.json({ error: "Área desconhecida." }, { status: 400 });
  // ⚠ esconder o seletor na tela não impede uma chamada: a recusa é aqui.
  if (!AREAS_COM_SELETOR.includes(area)) {
    return NextResponse.json({ error: `${AREA[area].nome} não escolhe documento do servidor — o portal publica o conteúdo dessa aba sozinho.` }, { status: 400 });
  }
  if (area === "ENGENHARIA" && !TIPO_ENG[tipo]) {
    return NextResponse.json({ error: "Escolha o tipo de documento da Engenharia.", tipos: TIPOS_ENGENHARIA.map((t) => t.id) }, { status: 400 });
  }

  const base = await acharPastaOp(opNumero);
  if (!base) return NextResponse.json({ error: "Pasta da OP não encontrada no SharePoint.", pastas: [], arquivos: [] });

  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const listar = async (path) => {
    const r = await fetch(`${GRAPH}/drives/${drive}/root:/${enc(path)}:/children?$select=id,name,size,file,folder,lastModifiedDateTime&$top=999&$orderby=name`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return (await r.json()).value || [];
  };
  const listarRel = (rel) => listar(rel ? `${base}/${rel}` : base);

  // ⚠ o caminho vem RELATIVO à pasta da OP e é saneado: sem isso, um "../.." na barra de endereço
  // navegaria o servidor inteiro a partir de uma tela do portal.
  const pedido = so(u.searchParams.get("caminho")).replace(/^\/+|\/+$/g, "");
  const rel = pedido.split("/").filter((x) => x && x !== "." && x !== "..").join("/");

  // ⚠⚠ LEVAR A PASTA INTEIRA. Vitor (03/09/2026): "o seletor da pasta em si não foi criado, vc só
  // dá a opção de selecionar o arquivo, não a pasta para que fique ela toda dentro para ele baixar —
  // pensa assim: teria uma pasta dentro da aba da engenharia com o nome dela e dentro dela os
  // projetos". Marcar arquivo por arquivo numa pasta de 240 desenhos não é escolha, é digitação.
  //
  // ⚠ A pasta é EXPANDIDA na hora da escolha, não guardada como "pasta". O portal publica uma lista
  // de arquivos escolhidos — e é isso que garante que revisão nova que aparecer depois NÃO entre
  // sozinha no portal do cliente. Quem publica decide o que sai; a pasta é o atalho, não a regra.
  const tudoDe = so(u.searchParams.get("tudoDe"));
  if (tudoDe) {
    const relTudo = tudoDe.replace(/^\/+|\/+$/g, "").split("/").filter((x) => x && x !== "." && x !== "..").join("/");
    if (!relTudo) return NextResponse.json({ error: "Informe a pasta." }, { status: 400 });
    // ⚠ na Engenharia a pasta tem de estar DENTRO das raízes do tipo — o mesmo cerco da navegação.
    if (area === "ENGENHARIA") {
      const raizes = await raizesDoTipo(tipo, listarRel);
      const permitidas = caminhosDasRaizes(raizes);
      const dentro = permitidas.some((p) => relTudo === p || relTudo.startsWith(`${p}/`));
      if (!dentro) return NextResponse.json({ error: "Essa pasta está fora deste tipo de documento." }, { status: 400 });
    }
    const exts0 = EXTENSOES_DA_AREA[area] || null;
    const achados = await listAllFilesRecursive(process.env.SHAREPOINT_DRIVE_ID, `${base}/${relTudo}`, {
      maxDepth: 4, supportedTypes: exts0 || null,
    });
    // ⚠ teto: pasta com milhares de arquivos derruba a tela e o portal. Acima disso, quem publica
    // desce um nível e leva as subpastas uma a uma.
    if (achados.length > 1500) {
      return NextResponse.json({ error: `Esta pasta tem ${achados.length} arquivos — leve as subpastas uma a uma.` }, { status: 400 });
    }
    const nomePasta = relTudo.split("/").filter(Boolean).pop() || "";
    return NextResponse.json({
      pasta: nomePasta,
      arquivos: achados.map((a) => ({
        id: a.id, nome: a.name, tamanho: a.size, em: a.lastModified,
        // ⚠ a `pasta` é o que o cliente vê como nome do pacote (ver subpastasDe na rota do portal):
        // guardo o caminho relativo, e é o último pedaço dele que vira o título da pasta lá.
        pasta: String(a.folderPath || "").replace(`${base}/`, ""),
      })),
    });
  }

  // ── Engenharia: só as pastas dos quatro tipos ──
  if (area === "ENGENHARIA") {
    const raizes = await raizesDoTipo(tipo, listarRel);
    if (!raizes.length) {
      return devolver({
        base, atual: "", arquivos: [], pastas: [], opNumero, area, tipo, raizes,
        aviso: `Esta obra ainda não tem a pasta de ${TIPO_ENG[tipo].nome} (${TIPO_ENG[tipo].onde}).`,
      });
    }
    const c = await conteudoDoTipo(tipo, raizes, rel, listarRel);
    if (c.erro === "fora") {
      // recusa e volta ao topo do tipo: caminho de fora não se navega nem por engano de URL
      const topo = await conteudoDoTipo(tipo, raizes, "", listarRel);
      return devolver({ base, atual: "", arquivos: topo.arquivos, pastas: topo.pastas, opNumero, area, tipo, raizes,
        aviso: "Esse caminho está fora das pastas deste tipo de documento." });
    }
    return devolver({ base, atual: rel, arquivos: c.arquivos, pastas: c.pastas, opNumero, area, tipo, raizes });
  }

  // ── demais áreas: navega a OP inteira, a partir da pasta natural ──
  const inicial = RAIZ_DA_AREA[area] || "";
  const atual = pedido === "" && !u.searchParams.has("caminho") ? inicial : rel;
  const itens = await listarRel(atual);
  if (itens === null) {
    // ⚠ pasta padrão que não existe nesta obra não é erro: cai na raiz da OP e diz por quê.
    const naRaiz = (await listarRel("")) || [];
    return devolver({ base, atual: "", opNumero, area, tipo: null, raizes: null,
      aviso: `A obra não tem a pasta "${atual}" — mostrando a raiz da OP.`,
      pastas: naRaiz.filter((x) => x.folder).map((x) => ({ nome: x.name, caminho: x.name, itens: x.folder?.childCount ?? null })),
      arquivos: naRaiz.filter((x) => !x.folder).map((x) => ({ item: x, pasta: "" })) });
  }
  const exts = EXTENSOES_DA_AREA[area] || null;
  const daExtensao = (x) => !exts || exts.includes((String(x.name).split(".").pop() || "").toLowerCase());
  return devolver({
    base, atual, opNumero, area, tipo: null, raizes: null,
    aviso: exts ? `Só arquivos ${exts.map((e) => e.toUpperCase()).join(" / ")} — é o que se publica ao cliente.` : null,
    pastas: itens.filter((x) => x.folder).map((x) => ({ nome: x.name, caminho: atual ? `${atual}/${x.name}` : x.name, itens: x.folder?.childCount ?? null })),
    arquivos: itens.filter((x) => !x.folder && daExtensao(x)).map((x) => ({ item: x, pasta: atual })),
  });
}

async function devolver({ base, atual, pastas, arquivos, opNumero, area, tipo, raizes, aviso }) {
  const portal = await prisma.portalCliente.findUnique({ where: { opNumero }, select: { docsPorArea: true, docsEngenharia: true } });
  const mapa = portal?.docsPorArea || (portal?.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
  const daArea = Array.isArray(mapa?.[area]) ? mapa[area] : [];
  // ⚠ na Engenharia a seleção é POR TIPO: a tela do Modelo 3D não pode salvar por cima da ART.
  // Documento antigo sem `tipo` é classificado pelo nome (ver tipoDoDocEng) — ele foi escolhido
  // antes desta regra existir e não pode sumir da tela de quem o escolheu.
  const escolhidos = tipo ? daArea.filter((d) => tipoDoDocEng(d) === tipo) : daArea;
  const foraDoPadrao = tipo ? daArea.filter((d) => tipoDoDocEng(d) === null) : [];
  const porId = new Map(escolhidos.map((d) => [String(d.id), d]));

  return NextResponse.json({
    raizOp: base, caminho: atual, caminhoCompleto: atual ? `${base}/${atual}` : base, aviso,
    tipo: tipo || null, raizes: raizes ? caminhosDasRaizes(raizes) : null,
    pastas,
    arquivos: (arquivos || []).map(({ item: x, pasta }) => ({
      id: x.id, nome: x.name, tamanho: x.size || 0, em: x.lastModifiedDateTime || null, pasta: pasta || "",
      escolhido: porId.has(x.id), nomeExibicao: porId.get(x.id)?.nomeExibicao || null,
    })),
    // a seleção INTEIRA (do tipo, na Engenharia) vai junto: a tela mostra o que já está publicado
    // mesmo estando noutra pasta, senão a pessoa acha que perdeu o que escolheu ontem.
    selecionados: escolhidos,
    // ⚠ o que ficou fora dos quatro tipos aparece para ELE decidir — e não vai ao portal.
    foraDoPadrao: foraDoPadrao.map((d) => ({ id: d.id, nome: d.nome, nomeExibicao: d.nomeExibicao || null })),
  });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opNumero: raw, area: rawArea, tipo: rawTipo, docs, limparForaDoPadrao } = await req.json().catch(() => ({}));
  const opNumero = so(raw).replace(/\D/g, "").padStart(3, "0");
  const area = so(rawArea).toUpperCase() || "ENGENHARIA";
  const tipo = so(rawTipo).toUpperCase();
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  if (!AREA[area]) return NextResponse.json({ error: "Área desconhecida." }, { status: 400 });
  if (!AREAS_COM_SELETOR.includes(area)) {
    return NextResponse.json({ error: `${AREA[area].nome} não escolhe documento do servidor.` }, { status: 400 });
  }
  if (area === "ENGENHARIA" && !TIPO_ENG[tipo]) return NextResponse.json({ error: "Escolha o tipo de documento da Engenharia." }, { status: 400 });
  if (!Array.isArray(docs)) return NextResponse.json({ error: "Envie a lista de documentos." }, { status: 400 });

  // ⚠ guarda id, nome do arquivo, NOME DE EXIBIÇÃO e pasta. O nome de exibição é o que o cliente
  // lê; o nome do arquivo fica para quem for procurá-lo no servidor depois — os dois precisam
  // conviver, senão ninguém acha o original quando o cliente pergunta sobre "Projeto de montagem".
  // ⚠⚠ O TETO É POR OBRA INTEIRA, e 300 era pouco. Vitor (03/09/2026): "só consigo colocar 300
  // arquivos de uma vez, preciso colocar muito mais". A OP-118 tem pasta de fabricação com mais de
  // 500 desenhos, e o corte silencioso era o pior dos mundos: a pessoa marcava tudo, salvava, e o
  // que passou de 300 simplesmente não estava lá. Agora vão 3.000 — o que limita de verdade é o
  // tamanho do JSON no registro, e nesse porte ele ainda é pequeno (3.000 × ~200 B ≈ 600 KB).
  const limpo = docs.slice(0, 3000)
    .filter((d) => d?.id && d?.nome)
    .map((d) => ({
      id: String(d.id), nome: so(d.nome).slice(0, 200),
      nomeExibicao: so(d.nomeExibicao).slice(0, 160) || null,
      pasta: so(d.pasta).slice(0, 200), tamanho: Number(d.tamanho) || 0, em: d.em || null,
      ...(area === "ENGENHARIA" ? { tipo } : {}),
    }));

  // ⚠⚠ LPC/LE CRUA NÃO SE PUBLICA COM O PESO FECHADO. Vitor (26/08/2026): "as planilhas que estamos
  // conseguindo baixar não estão na formatação da Torg (…) a LPC precisa estar na aba da
  // Engenharia, a que está lá foi a que anexei da pasta e ela não está no nosso template, tanto que
  // não vamos fornecer pesos por hora".
  //
  // O portal JÁ publica a LPC e a LE geradas no servidor, no template Torg, e a coluna de PESO
  // simplesmente não existe no arquivo quando a obra não liberou (Vitor, 22/08: "peso é preço").
  // Publicar o xlsx da pasta por cima disso passa por fora da regra inteira — o arquivo original
  // tem o peso item a item, e o que o cliente já baixou não tem volta.
  const atual = await prisma.portalCliente.findUnique({ where: { opNumero }, select: { docsPorArea: true, docsEngenharia: true, mostrarPeso: true } });
  const RX_LISTA = /(^|[^A-Z])(LPC|LE)([^A-Z]|$)|lista de (pe[çc]a|produ|expedi)/i;
  const crua = limpo.filter((d) => /\.xls[xm]?$/i.test(d.nome) && RX_LISTA.test(d.nome));

  // ⚠⚠ AVISA, NÃO BARRA. Vitor (03/09/2026): "mas ele não está deixando publicar os projetos".
  // Estava mesmo: seis planilhas com cara de LPC bloqueavam a gravação INTEIRA — os 1.319 desenhos
  // de fabricação junto. Guarda que impede o trabalho legítimo por causa de um caso duvidoso é
  // guarda mal desenhada.
  //
  // E o risco que ela protegia deixou de existir na entrega: quando a obra não liberou o peso, a
  // COLUNA DE PESO é removida da planilha na hora em que o cliente baixa (ver lib/excel-padronizar
  // e a rota /api/portal/[token]/eng). O arquivo continua íntegro no servidor; o que sai é sem
  // peso, igual à LPC que o portal gera. Aqui fica o aviso, para quem publica saber o que vai.
  const avisoLista = crua.length && atual?.mostrarPeso !== true
    ? `${crua.length} planilha(s) da Engenharia vão com a coluna de peso removida na entrega ao cliente (${crua.slice(0, 3).map((d) => d.nome).join(", ")}${crua.length > 3 ? "…" : ""}), porque esta obra não liberou o peso. Para enviá-las com peso, ligue "divulgar o peso" no portal da obra.`
    : null;
  const mapa = { ...(atual?.docsPorArea || (atual?.docsEngenharia ? { ENGENHARIA: atual.docsEngenharia } : {})) };

  // ⚠⚠ O MESMO ARQUIVO, DE DUAS PASTAS, É UM SÓ PARA O CLIENTE. A OP-112 tinha 29 documentos na
  // Engenharia e 17 nomes: os 12 diagramas de montagem estavam duas vezes — uma da via do cliente,
  // outra de 2.5.4 — porque a seleção guarda o que foi marcado noutra pasta (para navegar não
  // desmarcar) e o mesmo desenho foi marcado nos dois lugares, com ids diferentes. No portal isso
  // aparece como a lista repetida, e quem lê acha que são revisões diferentes.
  //
  // Vence o ÚLTIMO: a tela lista primeiro o que já estava escolhido e depois o que foi marcado
  // agora, então o último é a escolha mais recente — a que a pessoa acabou de fazer.
  const semRepetido = (lista) => {
    const porNome = new Map();
    for (const d of lista) porNome.set(String(d.nomeExibicao || d.nome).trim().toLowerCase(), d);
    return [...porNome.values()];
  };

  if (area === "ENGENHARIA") {
    // ⚠ SALVA SÓ O TIPO ABERTO. Trocar o array inteiro apagaria a ART ao salvar o Modelo 3D — e o
    // sumiço só apareceria no portal do cliente, dias depois.
    const antigos = Array.isArray(mapa.ENGENHARIA) ? mapa.ENGENHARIA : [];
    const outros = antigos.filter((d) => {
      const t = tipoDoDocEng(d);
      if (t === tipo) return false;                       // o tipo aberto vem inteiro de `limpo`
      if (t === null) return !limparForaDoPadrao;         // fora dos quatro tipos: só sai se ele mandar
      return true;
    });
    mapa.ENGENHARIA = semRepetido([...outros, ...limpo]);
  } else {
    mapa[area] = semRepetido(limpo);
  }

  await prisma.portalCliente.upsert({
    where: { opNumero },
    create: { opNumero, docsPorArea: mapa, criadoPorId: user?.id || null },
    update: { docsPorArea: mapa },
  });
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PORTAL_DOCS_AREA", entity: "PortalCliente", entityId: opNumero,
      diff: { op: opNumero, area, tipo: tipo || null, documentos: limpo.length, nomes: limpo.slice(0, 20).map((d) => d.nomeExibicao || d.nome) } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, area, tipo: tipo || null, escolhidos: limpo.length, total: (mapa[area] || []).length, aviso: avisoLista || undefined });
}
