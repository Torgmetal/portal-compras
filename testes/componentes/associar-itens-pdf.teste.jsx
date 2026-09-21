// @vitest-environment jsdom
// O FORNECEDOR APONTA QUAL ITEM DO PDF É QUAL LINHA DA RM.
//
// ⚠⚠ NASCEU DO CASO SOUFER (RM T122-001, 21/09/2026): PDF lido certo — 9 itens, preços, ICMS 12%,
// IPI 0% — e o casamento automático acertou ZERO. O portal então mandava redigitar 27 campos com
// os 9 preços já na memória; ele anexou o PDF e foi embora, e a cotação ficou "Aguardando".
//
// ⚠ Não dá para validar isto subindo um PDF no dev: a rota de anexo GRAVA, e o dev aponta para
// produção — um teste de tela viraria anexo de verdade na cotação de um fornecedor.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ⚠ O repositório não carrega os matchers do jest-dom, e `cleanup` não é automático aqui —
// sem ele, o render anterior fica no documento e "vários combobox" quebra a busca por papel.
afterEach(cleanup);
import AssociarItensPdf from "@/app/fornecedores/c/[token]/AssociarItensPdf";

const SOBRAS = [
  { descricao: "FERRO CANT. 2 X 3/16 6MT.", precoUnit: 6.19, qtd: 3630, unidade: "KG", icmsPct: 12, ipiPct: 0 },
  { descricao: "PERFIL W 250 X 38,5 - 12M", precoUnit: 7.35, qtd: 20790, unidade: "KG", icmsPct: 12, ipiPct: 0 },
];
const LINHAS = [
  { id: "l1", descricao: "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2POL", precoUnit: "", semEstoque: false },
  { id: "l2", descricao: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 38,5KG/M", precoUnit: "", semEstoque: false },
  { id: "l3", descricao: "JÁ PREENCHIDA PELO FORNECEDOR", precoUnit: "7,80", semEstoque: false },
  { id: "l4", descricao: "MARCADA COMO NÃO TENHO", precoUnit: "", semEstoque: true },
];

describe("associar itens do PDF", () => {
  it("não aparece quando não sobrou nada", () => {
    const { container } = render(<AssociarItensPdf sobras={[]} linhas={LINHAS} onAssociar={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  // ⚠⚠ O PONTO DA TELA: os valores JÁ estão lidos, e é isso que ela precisa deixar claro — senão
  // o fornecedor acha que vai ter de digitar de novo e desiste, que foi o que aconteceu.
  it("mostra o que foi lido: preço, quantidade e impostos", () => {
    render(<AssociarItensPdf sobras={SOBRAS} linhas={LINHAS} onAssociar={vi.fn()} />);
    expect(screen.getByText(/Lemos 2 itens no seu PDF/)).toBeTruthy();
    expect(screen.getByText("FERRO CANT. 2 X 3/16 6MT.")).toBeTruthy();
    // ⚠ Um assert sobre a linha inteira, e não quatro buscas: os detalhes ficam todos no mesmo
    // parágrafo, e "ICMS 12%" aparece nos DOIS itens — buscar por texto solto acha dois nós.
    const detalhes = screen.getByText("FERRO CANT. 2 X 3/16 6MT.").parentElement.textContent;
    expect(detalhes).toContain("6,19");
    expect(detalhes).toContain("3630 KG");
    expect(detalhes).toContain("ICMS 12%");
    expect(detalhes).toContain("IPI 0%");
  });

  // ⚠⚠ SÓ LINHA LIVRE É OFERECIDA. Oferecer uma já preenchida convidaria a sobrescrever em
  // silêncio o que o fornecedor acabou de digitar; e linha "Não tenho" é recusa, não destino.
  it("oferece só as linhas livres — nem preenchida, nem recusada", () => {
    render(<AssociarItensPdf sobras={[SOBRAS[0]]} linhas={LINHAS} onAssociar={vi.fn()} />);
    const opcoes = [...screen.getByRole("combobox").options].map((o) => o.textContent);
    expect(opcoes.join(" ")).toContain("CANTONEIRA ACO CARBONO");
    expect(opcoes.join(" ")).toContain("PERFIL W ACO CARBONO");
    expect(opcoes.join(" ")).not.toContain("JÁ PREENCHIDA");
    expect(opcoes.join(" ")).not.toContain("NÃO TENHO");
  });

  it("escolher a linha devolve o item do PDF e o id da linha", () => {
    const onAssociar = vi.fn();
    render(<AssociarItensPdf sobras={[SOBRAS[1]]} linhas={LINHAS} onAssociar={onAssociar} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "l2" } });
    expect(onAssociar).toHaveBeenCalledWith(SOBRAS[1], "l2");
  });

  // ⚠ Sem linha livre a tela não finge que dá para associar — manda corrigir na tabela.
  it("com todas as linhas ocupadas, explica em vez de mostrar um seletor vazio", () => {
    const ocupadas = LINHAS.map((l) => ({ ...l, precoUnit: "1,00" }));
    render(<AssociarItensPdf sobras={SOBRAS} linhas={ocupadas} onAssociar={vi.fn()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/Todas as linhas já estão preenchidas/)).toBeTruthy();
  });
});
