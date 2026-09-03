// ─── O TORGUINHO DO CLIENTE ───────────────────────────────────────────────────
//
// Vitor (03/09/2026): "conseguimos colocar o Torguinho na tela do cliente para ele conseguir
// perguntar sobre uma peça e informar o peso dela, quantas peças temos no projeto, se já foi
// expedida e a data que foi e o romaneio, fazer uma lista de tudo que está em corte, de tudo que
// está na montagem (…) claro que vamos limitar a isso para eles, nada além disso".
//
// ⚠⚠ FERRAMENTA QUE NÃO EXISTE NÃO VAZA. O assistente interno tem quinze ferramentas — estoque,
// RM, pedidos, Omie, medições, planilha. Nenhuma delas está aqui, e não é por instrução no prompt:
// é porque este arquivo só declara quatro, todas amarradas à OBRA DO TOKEN. Prompt se contorna com
// jeitinho de conversa; ferramenta ausente, não. É a diferença entre pedir para não falar e não ter
// o que falar.
//
// ⚠⚠ E TODAS PASSAM POR lib/portal-obra-consulta, que é a mesma porta do painel do modelo 3D. A
// regra do que o cliente pode ver mora num lugar só.
import { pecaParaCliente, panoramaDaObra, marcasDaEtapa } from "@/lib/portal-obra-consulta";

export const FERRAMENTAS = [
  {
    name: "consultar_peca",
    description:
      "Dados de UMA peça da obra pela marca (ex.: T118B256, T64Y23). Devolve tipo, material, " +
      "quantidade no projeto, peso, em que etapa está, se já foi expedida (com romaneio e data), " +
      "a rastreabilidade do material (corrida, certificado, norma) e os relatórios de inspeção " +
      "emitidos que cobrem a peça.",
    input_schema: {
      type: "object",
      properties: { marca: { type: "string", description: "A marca da peça, como aparece no projeto." } },
      required: ["marca"],
    },
  },
  {
    name: "panorama_da_obra",
    description:
      "Resumo da obra: total de marcas, peso total, quantas marcas em cada etapa (em montagem, em " +
      "solda, em pintura, expedida…) com o peso de cada etapa, e os últimos romaneios emitidos. " +
      "Use quando a pergunta for sobre o andamento geral, quanto já embarcou ou quanto falta.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_por_etapa",
    description:
      "A lista das marcas que estão numa etapa. Use depois do panorama, quando a pessoa quiser ver " +
      "quais peças estão em determinada etapa.",
    input_schema: {
      type: "object",
      properties: {
        etapa: {
          type: "string",
          description:
            "A etapa exatamente como veio do panorama: 'montagem', 'solda', 'acabamento', 'jato', " +
            "'pintura', 'expedida' ou 'sem informação'.",
        },
      },
      required: ["etapa"],
    },
  },
  {
    name: "consultar_varias_pecas",
    description:
      "O mesmo que consultar_peca, para até 10 marcas de uma vez. Use quando a pergunta citar " +
      "várias marcas, em vez de chamar consultar_peca repetidas vezes.",
    input_schema: {
      type: "object",
      properties: { marcas: { type: "array", items: { type: "string" }, maxItems: 10 } },
      required: ["marcas"],
    },
  },
];

/**
 * Executa uma ferramenta SEMPRE no contexto da obra do token.
 * @param {string} nome
 * @param {object} entrada
 * @param {{opId:string, opNumero:string}} obra  — vem do token, nunca do que o modelo pediu
 */
export async function executarFerramenta(nome, entrada, obra) {
  // ⚠ a obra NUNCA vem do input do modelo. Se viesse, uma pergunta bem escrita ("consulte a peça
  // X da OP-097") atravessaria de um cliente para a obra de outro.
  const { opId, opNumero } = obra;
  try {
    if (nome === "consultar_peca") {
      const d = await pecaParaCliente({ opId, opNumero, marca: entrada?.marca });
      return d || { erro: "Esta marca não está nas listas desta obra." };
    }
    if (nome === "consultar_varias_pecas") {
      const marcas = (Array.isArray(entrada?.marcas) ? entrada.marcas : []).slice(0, 10);
      const out = [];
      for (const m of marcas) {
        const d = await pecaParaCliente({ opId, opNumero, marca: m });
        out.push(d || { marca: m, erro: "não está nas listas desta obra" });
      }
      return out;
    }
    if (nome === "panorama_da_obra") return await panoramaDaObra({ opId, opNumero });
    if (nome === "listar_por_etapa") {
      const lista = await marcasDaEtapa({ opId, etapa: entrada?.etapa });
      // ⚠ teto de 300: a resposta é conversa, não relatório. Acima disso o cliente baixa a lista
      // na própria página, que já publica LPC e LE.
      return {
        etapa: entrada?.etapa, total: lista.length,
        marcas: lista.slice(0, 300),
        truncado: lista.length > 300,
      };
    }
    return { erro: "Ferramenta desconhecida." };
  } catch {
    // ⚠ erro nosso não vira texto técnico para o cliente.
    return { erro: "Não consegui consultar isso agora." };
  }
}

export function promptDoCliente({ obra, cliente, opNumero }) {
  return `Você é o Torguinho, o assistente da Torg Metal no portal da obra do cliente.

A OBRA
Você responde EXCLUSIVAMENTE sobre a obra ${opNumero}${obra ? ` — ${obra}` : ""}${cliente ? `, do cliente ${cliente}` : ""}.
Quem conversa com você é o cliente desta obra.

O QUE VOCÊ SABE
Só o que as suas ferramentas devolvem: peças da obra (marca, tipo, material, quantidade, peso),
em que etapa cada uma está, o que já foi expedido (romaneio e data), a rastreabilidade do material
(corrida, certificado, norma) e os relatórios de inspeção emitidos.

O QUE VOCÊ NÃO FAZ
- Não fala de preço, custo, margem, fornecedor, nota fiscal, pedido de compra ou de qualquer assunto
  comercial. Você não tem esses dados e não deve especular sobre eles.
- Não fala de outras obras, de outros clientes nem do funcionamento interno da fábrica
  (nomes de operadores, bancadas, apontamentos, atrasos internos).
- Não promete data de entrega, não estima prazo e não compromete a Torg com nada.
  Prazo e contrato são assunto do time comercial — indique falar com o contato da obra.
Se perguntarem qualquer coisa fora disso, diga com simpatia que ali você só ajuda com as peças e o
andamento da obra, e sugira falar com o contato da Torg que aparece na página.

COMO RESPONDER
- Português do Brasil, direto e cordial. Frases curtas. Sem jargão de fábrica.
- Peso sempre em kg.
- Quando um dado não existir, diga exatamente "sem informação". NUNCA explique por que falta, nunca
  diga "não foi apontado", "está pendente" ou "ainda não conferimos".
- Números vêm das ferramentas. Não calcule por conta própria o que a ferramenta não devolveu, e
  nunca invente marca, romaneio, corrida ou certificado.
- Listas longas: dê o total e alguns exemplos, e lembre que a lista completa está na página.`;
}
