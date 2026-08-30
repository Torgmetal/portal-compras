import "server-only";
import PizZip from "pizzip";
import { baixarModelo, mapearDocumento, textoDoParagrafo } from "./proposta-estrutura-modelo";
import { ELEMENTO_POR_ID, linhaDoCampo, blocosAplicaveis, numeroDaProposta } from "./proposta-estrutura";

// ─── MONTAGEM DO .DOCX ────────────────────────────────────────────────────────
// O documento é montado A PARTIR DO MODELO, escolhendo quais parágrafos entram e trocando os
// marcadores — não é um arquivo novo escrito do zero.
//
// ⚠⚠ POR QUE NÃO DOCXTEMPLATER AQUI. A proposta de serviço usa docxtemplater e funciona, porque lá
// o template já nasceu com as tags `{campo}` e `{#loop}`. Este modelo é um documento que o
// Comercial escreve e edita no Word: pôr tags nele obrigaria a manter uma cópia instrumentada em
// paralelo, e na primeira edição do Comercial as duas divergem. Selecionando parágrafos do arquivo
// original, o modelo continua sendo o modelo — e a formatação sai idêntica porque os parágrafos
// são copiados byte a byte, com estilo, numeração, cabeçalho e rodapé intactos.
//
// ⚠ SÓ O PARÁGRAFO COM MARCADOR É REESCRITO, e ainda assim herdando as propriedades da primeira
// run. Parágrafo sem `XXXXXX` é copiado como está: zero risco de perder formatação onde não há
// nada a preencher.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Reescreve um parágrafo com outro texto, mantendo `<w:pPr>` e o `<w:rPr>` da primeira run. */
function trocarTexto(xmlParagrafo, novoTexto) {
  const pPr = (xmlParagrafo.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  const rPr = (xmlParagrafo.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
  // ⚠ xml:space="preserve" é obrigatório: sem ele o Word come o espaço do fim de "Área: " e o
  // documento sai com as palavras coladas.
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(novoTexto)}</w:t></w:r></w:p>`;
}

/** Um parágrafo novo, clonando a aparência de outro. */
function paragrafoComoOutro(modelo, texto) {
  return trocarTexto(modelo, texto);
}

/**
 * Troca os `XXXXXX` de um parágrafo pelos valores.
 *
 * ⚠ o modelo usa o MESMO marcador para tudo (`XXXXXX`), então a substituição é POSICIONAL: a
 * n-ésima ocorrência recebe o n-ésimo valor. Sobrando marcador sem valor, ele vira "—" em vez de
 * ficar "XXXXXX" no documento que vai ao cliente.
 */
function preencherMarcadores(xmlParagrafo, valores = []) {
  const texto = textoDoParagrafo(xmlParagrafo);
  if (!/X{3,}/.test(texto)) return xmlParagrafo;
  let i = 0;
  const novo = texto.replace(/X{3,}/g, () => {
    const v = valores[i++];
    return v === undefined || v === null || v === "" ? "—" : String(v);
  });
  return trocarTexto(xmlParagrafo, novo);
}

/**
 * A "Descrição da obra" — os elementos lançados viram os parágrafos do documento.
 *
 * ⚠ o modelo traz UM exemplo de cada tipo (uma cobertura, um fechamento). Aqui ele é usado como
 * molde e repetido para cada elemento da obra: a ORCA tem nove escadas só na Área 300, e nenhuma
 * proposta tem exatamente os elementos do modelo.
 */
function paragrafosDaDescricao(moldes, areas = []) {
  const moldeTitulo = moldes.titulo;
  const moldeLinha = moldes.linha;
  if (!moldeTitulo || !moldeLinha) return [];
  const out = [];
  for (const area of areas) {
    if (area.nome) out.push(paragrafoComoOutro(moldeTitulo, String(area.nome).toUpperCase()));
    for (const el of area.elementos || []) {
      const def = ELEMENTO_POR_ID[el.tipo];
      if (!def) continue;
      const rotulo = def.numerado && el.numero
        ? `${def.nome.toUpperCase()} - ${String(el.numero).padStart(2, "0")}`
        : def.nome.toUpperCase() + (el.eixos ? ` – "${el.eixos}"` : "");
      out.push(paragrafoComoOutro(moldeTitulo, rotulo));
      for (const campo of def.campos) {
        const linha = linhaDoCampo(campo, el[campo.k]);
        if (linha) out.push(paragrafoComoOutro(moldeLinha, linha));
      }
      // ⚠ a observação livre do modelo ("- XXXXXX.") é onde entra a especificação que só aquela
      // obra tem; sem ela o orçamentista voltaria a editar o Word à mão.
      if (el.observacao) out.push(paragrafoComoOutro(moldeLinha, `- ${el.observacao}.`));
    }
  }
  return out;
}

/**
 * Monta a proposta.
 *
 * @param {object} p
 * @param {"PT"|"PC"|"PTC"} p.tipo
 * @param {boolean} p.comMontagem   escolhe qual dos dois modelos usar
 * @param {object} p.selecao        { BLOCO_ID: { incluso, variante } }
 * @param {object} p.dados          capa, listas e áreas
 * @returns {Promise<Buffer>} o .docx pronto
 */
export async function montarPropostaDocx({ tipo = "PTC", comMontagem = false, selecao = {}, dados = {} }) {
  const zip = new PizZip(await baixarModelo(comMontagem));
  const documentXml = zip.file("word/document.xml").asText();
  const { antes, paragrafos, depois } = mapearDocumento(documentXml);

  const permitidos = new Set(blocosAplicaveis({ tipo, comMontagem }).map((b) => b.id));
  // a capa e os dois divisores (PROPOSTA TÉCNICA / PROPOSTA COMERCIAL) não são escolha de ninguém
  permitidos.add("__CAPA__");
  if (tipo !== "PC") permitidos.add("__PT__");
  if (tipo !== "PT") permitidos.add("__PC__");
  permitidos.add("MODALIDADE");

  const querBloco = (id) => {
    if (id.startsWith("__") || id === "MODALIDADE") return true;
    if (!permitidos.has(id)) return false;
    const s = selecao[id];
    return s ? !!s.incluso : false;
  };

  // moldes da descrição da obra, tirados do próprio modelo
  const daDescricao = paragrafos.filter((p) => p.bloco === "DESCRICAO_OBRA" && !p.titulo);
  const moldes = {
    titulo: daDescricao.find((p) => p.texto && !p.texto.startsWith("-"))?.xml,
    linha: daDescricao.find((p) => p.texto.startsWith("-"))?.xml,
  };

  const corpo = [];
  let descricaoFeita = false;
  for (const p of paragrafos) {
    if (!querBloco(p.bloco)) continue;

    if (p.bloco === "DESCRICAO_OBRA" && !p.titulo) {
      // o miolo inteiro do bloco é substituído pelos elementos da obra, uma vez só
      if (!descricaoFeita) {
        corpo.push(...paragrafosDaDescricao(moldes, dados.areas || []));
        descricaoFeita = true;
      }
      continue;
    }

    // listas que viram uma linha por item ("XXXXXX;" repetido)
    const lista = p.bloco === "DOCUMENTOS_REF" ? dados.documentos
      : p.bloco === "PROJETOS_REF" ? dados.projetos
      : p.bloco === "ESCOPO" && /^X{3,}$/.test(p.texto) ? dados.escopo
      : null;
    if (lista && /X{3,}/.test(p.texto)) {
      for (const item of lista || []) corpo.push(paragrafoComoOutro(p.xml, `${item};`));
      continue;
    }

    corpo.push(preencherMarcadores(p.xml, dados.marcadores?.[p.bloco] || dados.capa?.[p.texto] || []));
  }

  zip.file("word/document.xml", antes + corpo.join("") + depois);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export { numeroDaProposta };
