import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { gerarDimensionalPDF } from "@/lib/relatorio-dimensional-pdf";
import { gerarEVSPDF } from "@/lib/relatorio-evs-pdf";
import { gerarPinturaPDF } from "@/lib/relatorio-pintura-pdf";

// ⚠⚠ QUEM ASSINA EM QUAL QUADRO. Vitor (23/09/2026): "notei que alguns [relatórios de inspeção]
// estão com o Geraldo duplicando a assinatura". Eram os cinco RPM (pré-montagem): UMA assinatura —
// um registro, uma data, um IP — desenhada em "Inspetor Torg Metal" E em "Fiscalização Torg Metal".
//
// Os dados têm o formato dos RPM-103-001..004 e RPM-105-002: o papel do convite é o da tela de
// envio ("Torg Metal", "Inspetor", "Cliente"), a lista vem em ordem de nome (como a rota lê), e quem
// assinou como "Torg Metal" é o próprio inspetor do relatório. Sem imagem (`imagemUrl: null`) para
// o teste não sair pela rede — a imagem vai sempre no quadro do nome.

const quando = new Date("2026-09-17T10:23:00Z");
const ass = (nome, setor, assinou = true) => ({
  nome, setor, email: `${nome.split(" ")[0].toLowerCase()}@teste.invalido`,
  assinadoEm: assinou ? quando : null, ip: "10.0.0.1", imagemUrl: null,
});

const dimensional = (tipo, inspetor, assinaturas, fotos = []) => gerarDimensionalPDF({
  rel: {
    tipo, codigo: "RPM-999-001", opNumero: "999", inspetor, marcas: ["C1"], desenhos: [], resultados: {},
    linhas: [{ marca: "C1", descricao: "Cota A", letra: "A", projetoMm: 100, encontradoMm: 100, tolerancia: "± 2" }],
  },
  assinaturas, fotos,
});

/** O texto de cada folha, na ordem em que foi desenhado. */
async function folhas(bytes) {
  const { text } = await extractText(new Uint8Array(bytes), { mergePages: false });
  return text;
}

/** Rótulo do quadro → a primeira linha escrita nele (o nome de quem assinou, ou a linha em branco). */
function quadros(folha, rotulos) {
  const l = folha.split("\n").map((s) => s.trim());
  return Object.fromEntries(rotulos.map((r) => {
    const i = l.indexOf(`${r}:`);
    return [r, i >= 0 ? l[i + 1] : "(quadro ausente)"];
  }));
}

const vezes = (folha, s) => folha.split(s).length - 1;

describe("quadro de assinaturas dos relatórios de inspeção", () => {
  it("RPM: o inspetor que assina como Torg Metal sai UMA vez, num quadro com os dois papéis", async () => {
    const [folha1, fotos] = await folhas(await dimensional("PRE_MONTAGEM", "Geraldo Tank",
      [ass("Davi Pinho", "Cliente"), ass("Geraldo Tank", "Torg Metal")],
      [{ marca: "C1", url: null }]));

    // uma assinatura no banco → um nome e uma data na folha
    expect(vezes(folha1, "Geraldo Tank")).toBe(1);
    expect(vezes(folha1, "assinado eletronicamente")).toBe(2);
    // e nenhum dos dois papéis some: o quadro diz que ele respondeu pelos dois
    expect(quadros(folha1, ["Inspetor Torg Metal · Fiscalização Torg Metal", "Inspetor Cliente"])).toEqual({
      "Inspetor Torg Metal · Fiscalização Torg Metal": "Geraldo Tank",
      "Inspetor Cliente": "Davi Pinho",
    });

    // a folha de fotos repete o quadro pela MESMA regra
    expect(vezes(fotos, "Geraldo Tank")).toBe(1);
    expect(quadros(fotos, ["Realizado por · Aprovado por", "Cliente / Fiscalização"])).toEqual({
      "Realizado por · Aprovado por": "Geraldo Tank",
      "Cliente / Fiscalização": "Davi Pinho",
    });
  });

  it("o quadro só une quando é a MESMA pessoa: inspetor que não assinou fica com o quadro em branco", async () => {
    const [folha1] = await folhas(await dimensional("PRE_MONTAGEM", "Alexandre Stival",
      [ass("Davi Pinho", "Cliente"), ass("Geraldo Tank", "Torg Metal")]));

    expect(vezes(folha1, "Geraldo Tank")).toBe(1);
    expect(quadros(folha1, ["Inspetor Torg Metal", "Fiscalização Torg Metal", "Inspetor Cliente"])).toEqual({
      "Inspetor Torg Metal": "Controle de Qualidade",
      "Fiscalização Torg Metal": "Geraldo Tank",
      "Inspetor Cliente": "Davi Pinho",
    });
  });

  it("convite padrão (Torg Metal, Inspetor, Cliente) no dimensional: cada um no seu quadro, e o cliente não some", async () => {
    const [folha1] = await folhas(await dimensional("DIMENSIONAL", "Alexandre Stival",
      [ass("Alexandre Stival", "Inspetor"), ass("Davi Pinho", "Cliente"), ass("Geraldo Tank", "Torg Metal")]));

    expect(quadros(folha1, ["Inspetor Torg Metal", "Fiscalização Torg Metal", "Inspetor Cliente"])).toEqual({
      "Inspetor Torg Metal": "Alexandre Stival",
      "Fiscalização Torg Metal": "Geraldo Tank",
      "Inspetor Cliente": "Davi Pinho",
    });
  });

  it("o quadro não depende da ordem alfabética de quem assina", async () => {
    const [dim] = await folhas(await dimensional("DIMENSIONAL", "Lais Stival",
      [ass("Davi Pinho", "Cliente"), ass("Geraldo Tank", "Torg Metal"), ass("Lais Stival", "Inspetor")]));
    expect(quadros(dim, ["Inspetor Torg Metal", "Fiscalização Torg Metal", "Inspetor Cliente"])).toEqual({
      "Inspetor Torg Metal": "Lais Stival",
      "Fiscalização Torg Metal": "Geraldo Tank",
      "Inspetor Cliente": "Davi Pinho",
    });

    const [evs] = await folhas(await gerarEVSPDF({
      rel: { tipo: "VISUAL_SOLDA", codigo: "EVS-999-001", opNumero: "999", inspetor: "Lais Stival", resultados: {}, linhas: [] },
      assinaturas: [ass("Geraldo Tank", "Torg Metal"), ass("Lais Stival", "Inspetor")],
    }));
    expect(quadros(evs, ["Realizado por", "Aprovado por"])).toEqual({
      "Realizado por": "Lais Stival",
      "Aprovado por": "Geraldo Tank",
    });
  });

  it("Torg Metal não vira inspetor de uma inspeção que foi de outro (caso do RIP-089-002)", async () => {
    const [folha1] = await folhas(await gerarPinturaPDF({
      rel: { codigo: "RIP-999-001", opNumero: "999", revisao: 0, inspetor: "Alexandre Stival", resultados: {} },
      assinaturas: [ass("Davi Pinho", "Cliente", false), ass("Geraldo Tank", "Torg Metal")],
    }));
    expect(quadros(folha1, ["Inspetor de Qualidade", "Qualidade / Documentação", "Cliente / Fiscalização"])).toEqual({
      "Inspetor de Qualidade": "nome / assinatura / data",
      "Qualidade / Documentação": "Geraldo Tank",
      "Cliente / Fiscalização": "nome / assinatura / data",
    });
  });
});
