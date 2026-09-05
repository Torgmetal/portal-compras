import "server-only";
import PizZip from "pizzip";
import { baixarModelo, mapearDocumento, textoDoParagrafo } from "./proposta-estrutura-modelo";
import { ELEMENTO_POR_ID, linhaDoCampo, blocosAplicaveis, numeroDaProposta,
         fraseDoEscopo, MODALIDADES } from "./proposta-estrutura";
import { textoDoBloco, BLOCOS_INSERIDOS } from "./proposta-estrutura-textos";
import { tabelaDePreco, tabelaDeFaturamento, temObjetoEmbutido } from "./proposta-tabela-preco";

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
 * O mesmo parágrafo, com respiro antes.
 *
 * ⚠ Vitor (30/08/2026): "precisa melhorar o espaçamento das descrições, pois está muito em cima um
 * do outro". O modelo traz UM exemplo de cada elemento, e ali o espaçamento entre grupos vem da
 * quebra de página do Word. Clonando o mesmo parágrafo dezoito vezes, tudo cola. O respiro entra
 * no TÍTULO de cada elemento — é o que separa "PLATAFORMAS" do bloco de linhas anterior.
 */
function comRespiro(xmlParagrafo, antesEmPontos = 6) {
  const twips = Math.round(antesEmPontos * 20);
  if (/<w:spacing[^>]*w:before=/.test(xmlParagrafo)) return xmlParagrafo;
  if (/<w:spacing\b/.test(xmlParagrafo)) {
    return xmlParagrafo.replace(/<w:spacing\b/, `<w:spacing w:before="${twips}"`);
  }
  if (/<w:pPr>/.test(xmlParagrafo)) {
    return xmlParagrafo.replace("<w:pPr>", `<w:pPr><w:spacing w:before="${twips}"/>`);
  }
  return xmlParagrafo.replace("<w:p>", `<w:p><w:pPr><w:spacing w:before="${twips}"/></w:pPr>`);
}

/**
 * Troca os marcadores de um pedaço do documento pelos valores.
 *
 * ⚠⚠ A TROCA É DENTRO DE CADA `<w:t>`, NUNCA REESCREVENDO O PEDAÇO. A primeira versão juntava todo
 * o texto e devolvia um `<w:p>` só — e a CAPA, que é uma TABELA, virou uma linha corrida
 * ("A/C:Responsável – DepartamentoE-mailFone/Cel."). Tabela achatada num parágrafo é destruição
 * silenciosa: o documento abre, só está errado.
 *
 * ⚠ O modelo usa o mesmo `XXXXXX` para tudo, então a substituição é POSICIONAL — a n-ésima
 * ocorrência recebe o n-ésimo valor, na ordem em que aparecem no XML. Marcador sem valor vira "—"
 * em vez de sair "XXXXXX" no documento que vai ao cliente.
 *
 * ⚠ E a capa tem placeholders que NÃO são XXXXXX: "EMPRESA", "Endereço.", "Obra referente." são
 * texto de exemplo. Eles são trocados por igualdade, pelo mapa `LITERAIS`.
 */
const LITERAIS = {
  "EMPRESA": "empresa",
  "Endereço.": "endereco",
  "Bairro – Cidade – Estado.": "bairroCidade",
  "Responsável – Departamento X": "contato",
  "E-mail": "email",
  "Obra referente.": "referencia",
  "Cidade – Estado": "cidadeEstado",
};

// ⚠ TRÊS LINHAS DA CAPA TÊM FORMATO PRÓPRIO e não cabem em substituição posicional:
//
//   "Fone/Cel.: (XX) XXXX-XXXX / (XX) XXXXX-XXXX"  — os "(XX)" têm dois X e escapam do `X{3,}`,
//        então os valores entravam nos buracos errados: saiu "(XX) 64-3406 / (XX) 1200-64".
//   "Proposta PTC-000-26-TORG-R00"                 — é o número do documento, não um marcador.
//   "Conchal, 00 de Mês de 2026"                   — é a data por extenso.
//
// Cada uma é reescrita inteira, pelo padrão da linha.
const PADROES = [
  { rx: /^Fone\/Cel\.:/i, chave: "telefone", monta: (v) => `Fone/Cel.: ${v}` },
  { rx: /^Proposta\s+P[TC]{1,3}-/i, chave: "numero", monta: (v) => `Proposta ${v}` },
  { rx: /^Conchal,\s/i, chave: "dataExtenso", monta: (v) => `Conchal, ${v}` },
];

function preencherMarcadores(xml, valores = [], capa = null) {
  let i = 0;

  // ⚠⚠ A TROCA É POR PARÁGRAFO, NÃO POR `<w:t>` — e não pelo pedaço inteiro.
  //
  // Por `<w:t>` não funciona: o Word quebra uma frase em várias runs ("Proposta PTC-000-2" +
  // "6-TORG-R00"), então o padrão casava só no primeiro pedaço e o resto sobrava colado
  // ("Proposta PTC-186-26-TORG-R006-TORG-R00").
  //
  // Pelo pedaço inteiro também não: a capa é uma TABELA, e reescrevê-la como um parágrafo só a
  // achatava numa linha corrida.
  //
  // Por parágrafo resolve os dois: junta as runs daquele parágrafo, troca, devolve o texto na
  // primeira run e esvazia as outras. A tabela mantém células e linhas; a frase quebrada é
  // remontada.
  const trocarNoParagrafo = (paragrafo) => {
    const runs = [...paragrafo.matchAll(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g)];
    if (!runs.length) return paragrafo;
    const inteiro = runs.map((m) => m[2]).join("");
    if (!inteiro.trim()) return paragrafo;

    let novo = inteiro;
    if (capa) {
      const t = inteiro.trim();
      const chave = LITERAIS[t] || LITERAIS[t.replace(/[–—]/g, "-")];
      // ⚠ só troca quando HÁ valor: sem isso o rótulo do modelo sumiria e ficaria em branco, que é
      // pior que o texto de exemplo — no exemplo dá para ver que falta preencher.
      if (chave && capa[chave]) novo = capa[chave];
      else {
        const pad = PADROES.find((p2) => p2.rx.test(t));
        if (pad && capa[pad.chave]) novo = pad.monta(capa[pad.chave]);
      }
    }
    if (/X{3,}/.test(novo)) {
      novo = novo.replace(/X{3,}/g, () => {
        const v = valores[i++];
        return v === undefined || v === null || v === "" ? "—" : String(v);
      });
    }
    if (novo === inteiro) return paragrafo;

    // o texto novo vai inteiro na primeira run; as demais ficam vazias (some o resto da frase
    // quebrada sem mexer na formatação de nenhuma delas)
    let n = 0;
    return paragrafo.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (todo, abre, _t, fecha) => {
      const conteudo = n++ === 0 ? esc(novo) : "";
      const abreOk = /xml:space/.test(abre) ? abre : abre.replace("<w:t", '<w:t xml:space="preserve"');
      return `${abreOk}${conteudo}${fecha}`;
    });
  };

  // se o pedaço é uma tabela, cada parágrafo de cada célula é tratado por si
  if (!/<w:p[ >]/.test(xml)) return xml;
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, trocarNoParagrafo);
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
    // a ÁREA respira mais que o elemento: é o degrau de hierarquia da lista
    if (area.nome) out.push(comRespiro(paragrafoComoOutro(moldeTitulo, String(area.nome).toUpperCase()), 12));
    for (const el of area.elementos || []) {
      const def = ELEMENTO_POR_ID[el.tipo];
      if (!def) continue;
      const rotulo = def.numerado && el.numero
        ? `${def.nome.toUpperCase()} - ${String(el.numero).padStart(2, "0")}`
        : def.nome.toUpperCase() + (el.eixos ? ` – "${el.eixos}"` : "");
      out.push(comRespiro(paragrafoComoOutro(moldeTitulo, rotulo), 6));
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

  // ⚠ O DIVISOR TAMBÉM OBEDECE À LISTA. A primeira versão liberava qualquer bloco começando com
  // "__" e a PT saía com o título "PROPOSTA COMERCIAL" no meio — o divisor passava porque era
  // interno, não porque pertencia ao documento. Interno quer dizer "ninguém escolhe", não
  // "entra sempre".
  const querBloco = (id) => {
    if (!permitidos.has(id)) return false;
    if (id.startsWith("__") || id === "MODALIDADE") return true;
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
  const marcaDoCorpo = []; // qual bloco gerou cada parágrafo — é o que permite inserir depois dele
  let descricaoFeita = false;
  for (const p of paragrafos) {
    if (!querBloco(p.bloco)) continue;

    // ⚠⚠ FORA AS PLANILHAS EMBUTIDAS DO MODELO. Vitor (30/08/2026): "você precisa excluir a
    // anterior que estava". O `PTC-000-26` carrega duas planilhas Excel coladas como EXEMPLO —
    // preço e impostos — e elas seguiam no documento gerado, ao lado das tabelas novas. Quem
    // abrisse veria os números de outra obra logo acima dos da sua, sem nada dizendo qual vale.
    if (temObjetoEmbutido(p.xml)) continue;

    if (p.bloco === "DESCRICAO_OBRA" && !p.titulo) {
      // o miolo inteiro do bloco é substituído pelos elementos da obra, uma vez só
      if (!descricaoFeita) {
        const desc = paragrafosDaDescricao(moldes, dados.areas || []);
        corpo.push(...desc); marcaDoCorpo.push(...desc.map(() => "DESCRICAO_OBRA"));
        descricaoFeita = true;
      }
      continue;
    }

    // ⚠⚠ O ESCOPO REESCREVE A PRÓPRIA FRASE. No modelo o item 1.1 é fixo e promete "cálculo
    // estrutural (…) tratamento de superfície, e transporte" mesmo quando a obra não tem nada
    // disso. Vitor (30/08/2026): "pode ter ocasiões que não vamos ter montagem, frete ou cálculo".
    // Proposta que promete no escopo o que não está no preço é a brecha mais cara que existe.
    if (p.bloco === "ESCOPO" && /^Servi[çc]os de /.test(p.texto) && dados.escopoItens?.length) {
      const frase = fraseDoEscopo(dados.escopoItens);
      if (frase) { corpo.push(paragrafoComoOutro(p.xml, frase)); marcaDoCorpo.push(p.bloco); continue; }
    }

    // ⚠ e o item 1.4 perde o "e cálculos estruturais" quando ninguém calcula — Vitor: "se for
    // falado no levantamento sobre cálculo ok, se não, esse escrito em vermelho deve sair".
    // Deixar a menção num escopo sem cálculo é assumir responsabilidade de engenharia de graça.
    if (p.bloco === "ELABORACAO_PROJETOS" && /c[áa]lculos? estruturais/i.test(p.texto)
        && dados.escopoItens && !dados.escopoItens.includes("CALCULO_ESTRUTURAL")) {
      const limpo = p.texto.replace(/\s*e\s+c[áa]lculos?\s+estruturais/i, "");
      corpo.push(paragrafoComoOutro(p.xml, limpo)); marcaDoCorpo.push(p.bloco); continue;
    }

    // ⚠ a modalidade é escolhida na elaboração, não fixa no modelo (Vitor, 30/08)
    if (p.bloco === "MODALIDADE" && dados.modalidade && /Pre[çc]o vari[áa]vel/i.test(p.texto)) {
      const m = MODALIDADES.find((x) => x.id === dados.modalidade);
      if (m) { corpo.push(paragrafoComoOutro(p.xml, m.texto)); marcaDoCorpo.push(p.bloco); continue; }
    }

    // listas que viram uma linha por item ("XXXXXX;" repetido)
    const lista = p.bloco === "DOCUMENTOS_REF" ? dados.documentos
      : p.bloco === "PROJETOS_REF" ? dados.projetos
      : p.bloco === "ESCOPO" && /^X{3,}$/.test(p.texto) ? dados.escopo
      : null;
    if (lista && /X{3,}/.test(p.texto)) {
      for (const item of lista || []) { corpo.push(paragrafoComoOutro(p.xml, `${item};`)); marcaDoCorpo.push(p.bloco); }
      continue;
    }

    corpo.push(preencherMarcadores(p.xml, dados.marcadores?.[p.bloco] || [], p.bloco === "__CAPA__" ? dados.capa : null));
    marcaDoCorpo.push(p.bloco);
  }

  // ─── A PLANILHA DE PREÇO ───────────────────────────────────────────────────
  // Vitor (30/08/2026): "no item 2.1 você não conseguiu trazer a planilha comercial da LQC".
  // Ela não existe no modelo — hoje o Comercial cola a tabela à mão, e é a colagem que perde o
  // vínculo: a proposta fica com um preço que ninguém rastreia até o estudo. Aqui a tabela é
  // CONSTRUÍDA do `resultado`, e vem logo depois do título do item.
  if (dados.resultado && querBloco("PLANILHA_PRECO")) {
    let pos = -1;
    for (let k = 0; k < corpo.length; k++) if (marcaDoCorpo[k] === "PLANILHA_PRECO") pos = k;
    if (pos >= 0) {
      const novos = [];
      const tbl = tabelaDePreco(dados.resultado);
      if (tbl) novos.push(tbl);
      // ⚠ e as frases de faturamento LOGO ABAIXO da tabela, não perdidas nas notas: material em
      // faturamento direto o cliente compra e paga — se a proposta não disser, ele entende que
      // está no preço da Torg.
      // ⚠ e a de impostos/faturamento logo em seguida — na proposta de verdade são duas planilhas
      // separadas, e é a segunda que diz qual CFOP e qual alíquota incidem sobre cada parcela.
      const moldeLinha = paragrafos.find((p2) => p2.bloco === "NORMAS" && !p2.titulo && p2.texto.length > 40)?.xml;
      if (moldeLinha) novos.push(paragrafoComoOutro(moldeLinha, "Impostos e condições de faturamento:"));
      const tblFat = tabelaDeFaturamento(dados.resultado, dados.parcelas);
      if (tblFat) novos.push(tblFat);
      if (novos.length) {
        corpo.splice(pos + 1, 0, ...novos);
        marcaDoCorpo.splice(pos + 1, 0, ...novos.map(() => "PLANILHA_PRECO"));
      }
    }
  }

  // ─── OS BLOCOS QUE O PORTAL INSERE ─────────────────────────────────────────
  // Pré-montagem, modularização, premissas de cálculo e premissas comerciais não existem no modelo
  // 000-26 — são as seções que só apareciam quando alguém escrevia à mão, e é justamente por isso
  // que a proposta padrão ficava com brecha. Entram DEPOIS do bloco âncora, na ordem em que o
  // Vitor as pôs na proposta da VALE.
  //
  // ⚠ o molde visual sai do próprio documento: o título clona um título de seção e as linhas
  // clonam uma linha de lista. Assim o trecho inserido não se distingue do que veio do modelo.
  const moldeTituloSecao = paragrafos.find((p) => p.titulo)?.xml;
  const moldeLinhaTexto = paragrafos.find((p) => p.bloco === "NORMAS" && !p.titulo && p.texto.length > 40)?.xml;
  if (moldeTituloSecao && moldeLinhaTexto) {
    for (const id of BLOCOS_INSERIDOS) {
      const escolha = selecao[id];
      if (!escolha?.incluso) continue;
      const t = textoDoBloco(id, dados.campos || {});
      if (!t) continue;
      // ⚠ a primeira âncora QUE EXISTIR no documento vence. Sem a cadeia, um bloco cuja âncora
      // não está no modelo some em silêncio — e leva junto quem ancorava nele.
      const cadeia = Array.isArray(t.ancora) ? t.ancora : [t.ancora];
      let pos = -1;
      for (const anc of cadeia) {
        for (let k = 0; k < corpo.length; k++) if (marcaDoCorpo[k] === anc) pos = k;
        if (pos >= 0) break;
      }
      if (pos < 0) continue;
      const novos = [];
      if (t.titulo) novos.push(comRespiro(paragrafoComoOutro(moldeTituloSecao, t.titulo), 12));
      for (const l of t.linhas) novos.push(paragrafoComoOutro(moldeLinhaTexto, l));
      // ⚠ O CRONOGRAMA NÃO ENTRA AQUI. Foi tentado como seção da proposta (tabela de etapas +
      // quadro de entregas) e Vitor reprovou em 05/09/2026: "acho que terá que ser uma folha à
      // parte mesmo, pois a tabela no arquivo Word tá bem ruim". Uma tabela de oito etapas com
      // descrição longa não cabe bem na largura do modelo. Ele vira folha avulsa, em
      // lib/cronograma-previo-pdf, anexada à proposta.
      corpo.splice(pos + 1, 0, ...novos);
      marcaDoCorpo.splice(pos + 1, 0, ...novos.map(() => id));
    }
  }

  zip.file("word/document.xml", antes + corpo.join("") + depois);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export { numeroDaProposta };
