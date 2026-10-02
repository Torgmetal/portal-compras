// "Gerar relatórios de teste para garantir que não tenha nenhum erro" (Vitor, 02/10/2026). A verificação
// dos modelos achou o mesmo defeito nos OITO geradores: um TAB colado do Excel, uma quebra de linha num
// campo de uma linha, um caractere C1 de texto mal decodificado ou um "≥" derrubavam o PDF inteiro —
// prévia, link de assinatura, arquivamento e data book. Aqui cada tipo é gerado com esse texto em
// TODOS os campos de texto que ele lê.
import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

const H = "a\tb\nc\r\nd \u0096 ≥ ≤ Δ μ → ✓ 😀"; // o pior de cada família
const texto = async (bytes) => (await extractText(new Uint8Array(bytes), { mergePages: true })).text;

/** Põe o texto hostil em toda folha de string do objeto (inclusive dentro de listas). */
function hostilizar(o) {
  if (typeof o === "string") return `${o} ${H}`;
  if (Array.isArray(o)) return o.map(hostilizar);
  if (o && typeof o === "object" && !(o instanceof Date)) return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hostilizar(v)]));
  return o;
}

const comum = { opNumero: "112", revisao: 1, emitidoEm: new Date("2026-10-02T12:00:00Z"), marcas: ["T112A1"], observacoes: "obs", inspetor: "Geraldo" };
const equipamentos = [{ id: "e1", nome: "Trena", certificado: "C-1", vencido: false }];
const CASOS = {
  DIMENSIONAL: { linhas: [{ letra: "A", descricao: "Cota", projetoMm: "100", tolerancia: "± 3", encontradoMm: "101", marca: "T112A1", obs: "x" }], resultados: { procedimento: "PO-04", tiposPeca: { T112A1: "COLUNA" }, qtdPeca: { T112A1: 1 } } },
  VISUAL_SOLDA: { linhas: [{ desenho: "D1", eps: "EPS 01", soldador: "S-02 Fulano", descontinuidade: "Mordedura", laudo: "A", descricao: "Topo", obs: "x" }], resultados: { procedimento: "PO-06", metalBase: "ASTM A36", eps: "EPS 001", tipoPeca: "Viga" } },
  ULTRASSOM: { linhas: [{ peca: "T112A1", numero: "1", angulo: "70", face: "A", db_indicacao: "50", db_referencia: "48", laudo: "A", obs: "x" }], resultados: { procedimento: "PI-QUA-003", acoplante: "Metilcelulose", tag: "TAG" } },
  PINTURA: { linhas: [], resultados: { abrasivo: "Granalha", rugosidade: { especificada: "50-75", leituras: ["60", "", "70"] }, demaos: { 1: { produto: "Primer", cor: "Cinza", espessuras: ["120", "", "130"] } }, obsFotos: "x", descricao: "Pintura" } },
  LP: { linhas: [{ junta: "J1", numero: "1", local: "Alma", tamanho: "2", tipo: "Linear", laudo: "A", obs: "x" }], resultados: { procedimento: "PO-15", juntaSoldada: "Topo", penetrante: "Magnaflux" } },
};

describe("nenhum relatório derruba com texto estranho em qualquer campo", () => {
  for (const [tipo, caso] of Object.entries(CASOS)) {
    it(tipo, async () => {
      // o tipo, o código e a OP são chaves do sistema, não texto digitado: ficam limpos
      const rel = { ...hostilizar({ ...comum, ...caso, equipamentos }), tipo, codigo: "X-112-001", opNumero: "112", emitidoEm: comum.emitidoEm, revisao: 1 };
      const assinaturas = [{ papel: "inspetor", nome: `Fulano ${H}`, assinadoEm: new Date("2026-10-02T13:00:00Z") }];
      const bytes = await gerarPDFdoRelatorio({ rel, fotos: [{ url: null, observacao: `legenda ${H}`, marca: "T112A1" }], assinaturas, cliente: `Cliente ${H}`, obra: `Obra ${H}`, refCliente: `REF ${H}` });
      expect(bytes.length).toBeGreaterThan(1000);
      const t = await texto(bytes);
      expect(t).toContain(">="); // o símbolo virou equivalente, não sumiu
      expect(t).not.toMatch(/\t/);
    });
  }
});
