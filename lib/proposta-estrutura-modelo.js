import "server-only";
import { getAccessToken } from "./sharepoint";

// ─── O MODELO DE PROPOSTA, LIDO DO SHAREPOINT ─────────────────────────────────
// Vitor (30/08/2026): "temos o template, está na pasta dentro do orçamentos, o modelo não precisa
// criar nada".
//
// ⚠⚠ O MODELO NÃO VEM EMBUTIDO NO CÓDIGO, E ISSO É DE PROPÓSITO. A proposta de serviço guarda o
// dela em base64 (`lib/proposta-template-b64.js`) — funciona, mas congela a formatação no commit:
// para mudar uma vírgula do texto padrão alguém precisa de um deploy. Aqui o documento continua
// sendo do Comercial: mexeu no `.docx` da pasta 000-26, a próxima proposta já sai com a mudança.
//
// ⚠ São DOIS modelos, e a diferença entre eles não é uma seção — são 21 parágrafos espalhados por
// nove seções (escopo, ART, garantias, qualidade, inclusos, responsabilidades, pagamento…). Por
// isso o portal escolhe o ARQUIVO conforme o escopo, em vez de tentar remendar um só.
const PASTA = "/Comercial/1. Orçamento/ORÇAMENTOS_2026/1. Solicitados/000-26-CLIENTE-OBRA/6.Propostas";
const GRAPH = "https://graph.microsoft.com/v1.0";

export const MODELOS = {
  COM_MONTAGEM: "PTC-000-26-CLIENTE-OBRA-TORG-R00.docx",
  SEM_MONTAGEM: "PTC-000-26-CLIENTE-OBRA-TORG-R00 - SEM MONTAGEM.docx",
};

// ⚠ o modelo muda de mês em mês, não de minuto em minuto: 10 min de cache poupa o download de
// 160 KB a cada prévia da tela sem esconder uma edição do Comercial por muito tempo.
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

/** Baixa o .docx do modelo (com ou sem montagem). Devolve o Buffer do arquivo inteiro. */
export async function baixarModelo(comMontagem = true) {
  const nome = comMontagem ? MODELOS.COM_MONTAGEM : MODELOS.SEM_MONTAGEM;
  const guardado = cache.get(nome);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.buffer;

  const token = await getAccessToken();
  const caminho = `${PASTA}/${nome}`;
  // ⚠ a pasta no SharePoint tem um espaço no fim ("6.Propostas ") em algumas obras; tenta os dois
  for (const p of [caminho, caminho.replace("/6.Propostas/", "/6.Propostas /")]) {
    const r = await fetch(`${GRAPH}/drives/${process.env.SHAREPOINT_DRIVE_ID}/root:${encodeURI(p)}:/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const buffer = Buffer.from(await r.arrayBuffer());
      cache.set(nome, { buffer, em: Date.now() });
      return buffer;
    }
  }
  throw new Error(`Modelo de proposta não encontrado no SharePoint: ${nome}`);
}

// ─── DE PARÁGRAFO PARA BLOCO ──────────────────────────────────────────────────
// O modelo não usa estilo de título: as seções são parágrafos comuns em negrito. Então o corte é
// pelo TEXTO do título — conferido contra o arquivo real, onde os 23 títulos abaixo aparecem e
// cobrem os 297 parágrafos sem sobrar nenhum órfão.
//
// ⚠ o casamento é por texto NORMALIZADO e só em parágrafo curto: "Escopo" é título, mas "Escopo e
// premissas do cálculo estrutural" dentro de um parágrafo de 400 caracteres não é.
const TITULOS = {
  "proposta tecnica": "__PT__", "proposta comercial": "__PC__",
  "escopo": "ESCOPO", "documentos referentes": "DOCUMENTOS_REF", "projetos referentes": "PROJETOS_REF",
  "descricao da obra": "DESCRICAO_OBRA", "descricao tecnica dos itens": "DESCRICAO_TECNICA",
  "telhas calhas e rufos": "ITENS_COMERCIAIS", "telhas rufos steel deck grade e degraus": "ITENS_COMERCIAIS",
  "normas utilizadas": "NORMAS", "elaboracoes dos projetos": "ELABORACAO_PROJETOS",
  "anotacao da responsabilidade tecnica": "ART", "materiais empregados": "MATERIAIS",
  "tratamento de superficie": "TRATAMENTO", "dimensionamento e resistencia": "DIMENSIONAMENTO",
  "garantias": "GARANTIAS", "consideracoes gerais": "CONSIDERACOES",
  "controle de qualidade": "CONTROLE_QUALIDADE", "prazo de execucao": "PRAZO",
  "inclusos": "INCLUSOS", "exclusos": "EXCLUSOS",
  "responsabilidades da contratante": "RESP_CONTRATANTE", "montagem": "MONTAGEM",
  "planilha de quantidade e preco": "PLANILHA_PRECO", "planilha de quantidade e precos": "PLANILHA_PRECO",
  "notas": "NOTAS_COMERCIAIS", "impostos torg metal": "IMPOSTOS", "faturamento direto": "IMPOSTOS",
  "medicoes": "MEDICOES", "pagamentos": "PAGAMENTO", "horas ociosas": "HORAS_OCIOSAS",
  "validade da proposta": "VALIDADE", "modalidade da proposta": "MODALIDADE",
};

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Texto de um parágrafo, juntando todos os `<w:t>`. */
export function textoDoParagrafo(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

/**
 * Quebra o `document.xml` em parágrafos e diz a que bloco cada um pertence.
 * @returns {{ antes: string, paragrafos: Array<{xml,texto,bloco,titulo}>, depois: string }}
 */
export function mapearDocumento(documentXml) {
  const iBody = documentXml.indexOf("<w:body>");
  const fim = documentXml.lastIndexOf("<w:sectPr");
  const corte = fim > 0 ? fim : documentXml.lastIndexOf("</w:body>");
  const antes = documentXml.slice(0, iBody + "<w:body>".length);
  const depois = documentXml.slice(corte);
  const meio = documentXml.slice(iBody + "<w:body>".length, corte);

  // ⚠ só parágrafos de PRIMEIRO NÍVEL: `<w:p>` dentro de célula de tabela é do parágrafo pai, e
  // pegar os dois duplicaria o conteúdo das tabelas (a de impostos e a de horas ociosas).
  const pedacos = meio.match(/<w:(p|tbl)[ >][\s\S]*?<\/w:\1>/g) || [];
  const paragrafos = [];
  let atual = "__CAPA__";
  for (const xml of pedacos) {
    const texto = textoDoParagrafo(xml);
    const n = norm(texto);
    let titulo = false;
    if (xml.startsWith("<w:p") && n && texto.length < 60 && TITULOS[n]) { atual = TITULOS[n]; titulo = true; }
    paragrafos.push({ xml, texto, bloco: atual, titulo });
  }
  return { antes, paragrafos, depois };
}
