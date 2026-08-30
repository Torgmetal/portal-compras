import "server-only";
import { getAccessToken } from "./sharepoint";

// ─── A CORRESPONDÊNCIA JÁ ESTÁ ARQUIVADA, E POR ORÇAMENTO ─────────────────────
// Vitor (30/08/2026): "seria possível criarmos um agente nos e-mails do comercial para vincularmos
// a cada proposta? (...) precisamos pegar o caminho do envio da proposta e vir buscando o histórico
// dos e-mails da Torg com o cliente e fechar a linha do tempo".
//
// ⚠⚠ O AGENTE DE CAIXA NÃO É O CAMINHO MAIS CURTO — e eu medi os dois antes de escolher.
//
//   · Ler as caixas do comercial está BLOQUEADO: `comercial@`, `orcamento@` e `matheus.lima@`
//     devolvem 403 "Blocked by tenant configured AppOnly Access Policy". Só as 6 da engenharia
//     estão liberadas. Depende do Matheus, não de código.
//
//   · E casar e-mail com orçamento por regra ERRA MUITO. Testado nos 359 e-mails que o portal já
//     tem: número do orçamento no assunto deu 4 acertos, dos quais 3 falsos ("RNC 010_26",
//     "OC 401541", "Kick Off OP 094"); o contato do cliente aponta em média para VÁRIOS orçamentos
//     — só o Rogério Porsch, da TMSA, tem 19.
//
//   · Mas o Comercial JÁ ARQUIVA o e-mail dentro da pasta do orçamento, em `1.Emails` (12 de 14
//     pastas recentes têm). Ali a vinculação foi feita por uma pessoa, com a obra na frente. Não
//     há o que adivinhar: o número do orçamento é o nome da pasta.
//
// Então a linha do tempo começa por aqui — de graça, sem depender de liberação — e o agente de
// caixa entra depois, para pegar o que não foi arquivado.
//
// ⚠ LÊ SÓ O CABEÇALHO. Um .eml desses tem 3 MB (imagens embutidas e anexos). Com `Range:
// bytes=0-32767` vem De/Para/Assunto/Data/Message-ID em 300 ms — baixar os 300 arquivos inteiros
// seria ~1 GB para usar 2 KB de cada.

const GRAPH = "https://graph.microsoft.com/v1.0";
const RAIZ = process.env.SHAREPOINT_ORCAMENTOS_BASE || "/Comercial/1. Orçamento";
const FASES = ["1. Solicitados", "2. Concluidos", "3. Declinados", "1.Solicitados", "2.Concluídos", "3.Declinados"];
const BYTES_CABECALHO = 32 * 1024;

const drive = () => process.env.SHAREPOINT_DRIVE_ID;

async function filhos(token, caminho, select = "id,name,folder,file,size,lastModifiedDateTime") {
  const r = await fetch(`${GRAPH}/drives/${drive()}/root:${encodeURI(caminho)}:/children?$select=${select}&$top=999`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const { value = [] } = await r.json();
  return value;
}

/** Número do orçamento a partir do nome da pasta: "288-26-TMSA-BIANCHINI" → "288-26". */
export function numeroDaPasta(nome) {
  const m = String(nome || "").match(/(?:^|\D)(\d{3})[-_ ]?(\d{2})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Mapa numero do orçamento → { fase, pasta } para o ano inteiro.
 * Três chamadas ao Graph, não trezentas.
 */
export async function pastasDoAno(ano = new Date().getFullYear()) {
  const token = await getAccessToken();
  const base = `${RAIZ}/ORÇAMENTOS_${ano}`;
  const out = new Map();
  for (const fase of FASES) {
    for (const it of await filhos(token, `${base}/${fase}`, "id,name,folder")) {
      if (!it.folder) continue;
      const num = numeroDaPasta(it.name);
      // ⚠ a primeira pasta vence: "1. Solicitados" vem antes de "2. Concluidos" na lista, e um
      // orçamento pode ter sobrado nas duas quando alguém copia em vez de mover.
      if (num && !out.has(num)) out.set(num, { fase, pasta: it.name, caminho: `${base}/${fase}/${it.name}` });
    }
  }
  return out;
}

// ── decodificação de cabeçalho ────────────────────────────────────────────────
// "=?Windows-1252?Q?Rog=E9rio_Porsch?=" → "Rogério Porsch". Sem isso o nome do cliente entra
// ilegível no dossiê — e dossiê é o que vai para o cliente.
function decodificarPalavra(txt) {
  // ⚠ RFC 2047: o espaço ENTRE duas palavras codificadas não é espaço, é separador — some na
  // junção. Sem isso o assunto sai "ESTRUTU RA METÁLICA", porque o Outlook quebra a palavra no
  // limite de 75 caracteres da linha. Assunto picado é o que vai para o dossiê do cliente.
  return String(txt || "").replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, charset, tipo, dado) => {
    try {
      const cs = /utf-?8/i.test(charset) ? "utf8" : "latin1";
      if (/^b$/i.test(tipo)) return Buffer.from(dado, "base64").toString(cs);
      const bytes = dado.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, "latin1").toString(cs);
    } catch { return dado; }
  }).trim();
}

/** "Fulano <a@b.c>, outro@x.y" → ["a@b.c", "outro@x.y"] */
function enderecos(valor) {
  return [...String(valor || "").matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map((m) => m[0].toLowerCase());
}

/** Nome de quem enviou, quando vem antes do <e-mail>. */
function nomeDe(valor) {
  const v = decodificarPalavra(valor);
  const m = v.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : null;
}

/** Cabeçalhos de um .eml, lendo só os primeiros KB do arquivo. */
export async function lerCabecalhoEml(caminho) {
  const token = await getAccessToken();
  const r = await fetch(`${GRAPH}/drives/${drive()}/root:${encodeURI(caminho)}:/content`, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${BYTES_CABECALHO - 1}` },
  });
  if (!r.ok && r.status !== 206) return null;
  const txt = Buffer.from(await r.arrayBuffer()).toString("latin1");
  const corte = txt.indexOf("\r\n\r\n");
  const cab = corte > 0 ? txt.slice(0, corte) : txt;

  // desdobra cabeçalho continuado (linha seguinte começando com espaço ou tab)
  const linhas = cab.split(/\r?\n(?![ \t])/);
  const pega = (nome) => {
    const rx = new RegExp(`^${nome}\\s*:`, "i");
    const l = linhas.find((x) => rx.test(x));
    return l ? l.replace(rx, "").replace(/\r?\n[ \t]+/g, " ").trim() : null;
  };

  const de = enderecos(pega("From"))[0] || null;
  const data = pega("Date");
  return {
    de,
    deNome: nomeDe(pega("From")),
    para: enderecos(pega("To")),
    cc: enderecos(pega("Cc")),
    assunto: decodificarPalavra(pega("Subject")) || null,
    data: data ? new Date(data) : null,
    messageId: (pega("Message-ID") || "").replace(/[<>]/g, "").trim() || null,
  };
}

/** Os .eml arquivados na pasta do orçamento. */
export async function emailsArquivados(caminhoPasta) {
  const token = await getAccessToken();
  const sub = await filhos(token, caminhoPasta, "id,name,folder");
  const pastaEmails = sub.find((x) => x.folder && /e[- ]?mails?/i.test(x.name));
  if (!pastaEmails) return [];
  return (await filhos(token, `${caminhoPasta}/${pastaEmails.name}`))
    .filter((x) => x.file && /\.(eml|msg)$/i.test(x.name))
    .map((x) => ({ nome: x.name, tamanho: x.size, caminho: `${caminhoPasta}/${pastaEmails.name}/${x.name}`,
                   modificado: x.lastModifiedDateTime }));
}

/**
 * Os arquivos que o cliente mandou para orçar.
 *
 * Vitor: "tente pegar referência dos arquivos enviados para orçamento, local da obra, enfim
 * qualquer forma que conseguir vincular". Os anexos do .eml ficam fundos no MIME (o arquivo tem
 * 3 MB), mas o Comercial salva tudo nas subpastas numeradas — 2.Projetos, 3.Documentos, 4.Cotações
 * — e listar isso custa uma chamada por pasta.
 */
export async function arquivosDoOrcamento(caminhoPasta, maxPastas = 4) {
  const token = await getAccessToken();
  const sub = await filhos(token, caminhoPasta, "id,name,folder");
  const out = [];
  for (const p of sub.filter((x) => x.folder && !/e[- ]?mails?/i.test(x.name)).slice(0, maxPastas)) {
    for (const f of await filhos(token, `${caminhoPasta}/${p.name}`, "id,name,file,size")) {
      if (f.file) out.push({ pasta: p.name, nome: f.name, tamanho: f.size });
    }
  }
  return out;
}

// ─── SOLICITAÇÕES AINDA SEM ORÇAMENTO ABERTO ──────────────────────────────────
// Vitor (30/08/2026): "inclusive preencher na aba de Acompanhamento as solicitações novas que
// chegarem desses e-mails".
//
// Elas já existem, e não na caixa: o Comercial cria a pasta em `1. Solicitados` assim que o pedido
// chega, ANTES de o orçamento ganhar número. São 13 pastas hoje e **9 não têm orçamento nenhum no
// portal** — trabalho já pedido pelo cliente que a aba de Acompanhamento não enxerga.
//
// ⚠⚠ O PREFIXO DA PASTA É O PRAZO, e é isso que faz a peça encaixar. "04_09 - TMSA-TRIPPER-MOVEL"
// foi criada em 28/08: 04/09 não é quando chegou, é quando a proposta tem que sair. Confere em
// todas as recentes (01_09 criada em 26/08, 18_08 em 17/08, 14_08 em 06/08 — sempre à frente). E
// prazo é exatamente o que a aba de Acompanhamento conta.
//
// ⚠ NÃO CRIA ORÇAMENTO SOZINHO. O número é do Comercial e sai da planilha; inventar um aqui
// duplicaria a numeração e sujaria a Central. A solicitação aparece como PENDENTE, para alguém
// abrir com o número certo.
const MES_DIA = /^(\d{2})[_./-](\d{2})/;

/** "04_09 - TMSA-TRIPPER-MOVEL" → { prazo: 04/09, cliente: "TMSA", obra: "TRIPPER MOVEL" } */
export function lerNomeSolicitacao(nome, ano = new Date().getFullYear()) {
  const bruto = String(nome || "").trim();
  const numero = numeroDaPasta(bruto);
  let prazo = null;
  const m = bruto.match(MES_DIA);
  if (m) {
    // dd_mm — o Comercial escreve o dia primeiro
    const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[1]), 12));
    if (!Number.isNaN(+d)) prazo = d;
  }
  // tira o prefixo de data e o número, sobra "CLIENTE-OBRA"
  const resto = bruto
    .replace(MES_DIA, "")
    .replace(/\b\d{3}[-_ ]?\d{2}\b/, "")
    .replace(/^[\s\-_.]+|[\s\-_.]+$/g, "")
    .trim();
  // ⚠ O CLIENTE NÃO SAI DO HÍFEN. "CLIMA-SPACE-ITAQUERA" não é cliente "CLIMA" e obra
  // "SPACE-ITAQUERA" — o cliente é "Clima Space". "RIO-VERDE-TOU" é "Rio Verde", não "Rio". Quebrar
  // no primeiro traço inventa um cliente novo a cada pasta e a lista da Central vira um cadastro
  // paralelo. Aqui devolvo o texto cru; quem resolve é `resolverCliente`, contra os clientes que já
  // existem no portal.
  return { prazo, numero, texto: resto.replace(/_/g, " ").trim() || null };
}

const semAcento = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const soLetras = (t) => semAcento(t).replace(/[^a-z0-9]/g, "");

/**
 * Casa o texto da pasta com um cliente que o portal já conhece.
 *
 * @param {string} texto      "CLIMA-SPACE-ITAQUERA"
 * @param {string[]} clientes nomes distintos vindos da tabela Orcamento
 *
 * ⚠⚠ O CASAMENTO É POR PALAVRA, E NOS DOIS SENTIDOS. A pasta abrevia ("TMSA", "CASP", "MSE") e o
 * portal escreve por extenso ("TMSA Tecnologia em movimentação", "Casp Indústria e Comércio",
 * "Construtora MSE"). Comparar o texto inteiro falha nas duas direções: "TMSA" não começa com o
 * nome longo, e "Construtora MSE" não começa com "MSE".
 *
 * ⚠ PALAVRA GENÉRICA NÃO IDENTIFICA NINGUÉM. Sem descartar "construtora", "engenharia" e
 * "indústria", a pasta "CONSTRUTORA X" casaria com as onze construtoras da base — e o portal
 * apontaria a solicitação para o cliente errado, que é pior que não apontar.
 */
const GENERICAS = new Set([
  "construtora", "engenharia", "industria", "industrial", "comercio", "servicos", "servico",
  "montagem", "montagens", "tecnologia", "sistemas", "metalicos", "metalica", "ltda", "sa", "eireli",
  "grupo", "do", "da", "de", "e", "em", "brasil", "consorcio", "projetos", "solucoes",
]);
const palavras = (t) => semAcento(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERICAS.has(w));

export function resolverCliente(texto, clientes = []) {
  const limpo = String(texto || "").replace(/[-–_]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = palavras(limpo);
  if (!tokens.length) return { cliente: null, obra: limpo || null };

  // a primeira palavra da pasta é quem manda: o Comercial escreve CLIENTE-OBRA, nessa ordem
  const primeira = tokens[0];
  let melhor = null, melhorPeso = 0;
  for (const c of clientes) {
    const pc = palavras(c);
    if (!pc.length) continue;
    // casa quando a primeira palavra da pasta é uma das palavras do cliente
    const bate = pc.includes(primeira);
    if (!bate) continue;
    // duas palavras batendo vale mais que uma ("CLIMA SPACE" ganha de "Clima")
    const peso = pc.filter((w) => tokens.includes(w)).length;
    if (peso > melhorPeso) { melhor = c; melhorPeso = peso; }
  }
  if (!melhor) return { cliente: null, obra: limpo || null };

  // a obra é o que sobra depois de tirar as palavras do cliente
  const doCliente = new Set(palavras(melhor));
  const sobra = limpo.split(/\s+/).filter((w) => !doCliente.has(semAcento(w).replace(/[^a-z0-9]/g, "")));
  return { cliente: melhor, obra: sobra.join(" ").trim() || null };
}

/** As pastas de `1. Solicitados`, já lidas. */
export async function solicitacoesEmAberto(ano = new Date().getFullYear()) {
  const token = await getAccessToken();
  const base = `${RAIZ}/ORÇAMENTOS_${ano}`;
  const out = [];
  for (const fase of ["1. Solicitados", "1.Solicitados"]) {
    for (const it of await filhos(token, `${base}/${fase}`, "id,name,folder,lastModifiedDateTime")) {
      if (!it.folder) continue;
      // a pasta-modelo não é solicitação de ninguém
      if (/^000[-_ ]/.test(it.name) || /CLIENTE[-_ ]OBRA/i.test(it.name)) continue;
      out.push({
        pasta: it.name,
        caminho: `${base}/${fase}/${it.name}`,
        modificadoEm: it.lastModifiedDateTime || null,
        ...lerNomeSolicitacao(it.name, ano),
      });
    }
  }
  return out.sort((a, b) => String(b.modificadoEm).localeCompare(String(a.modificadoEm)));
}
