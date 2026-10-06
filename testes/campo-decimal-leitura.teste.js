// ─── O TEXTO DO CAMPODECIMAL SE LÊ COM numeroBR ──────────────────────────────
// ⚠⚠ O CAMPO VIROU TEXTO EM 16/09/2026 E UMAS 27 TELAS CONTINUARAM LENDO COMO NÚMERO. Matheus
// (06/10/2026), no modal de receita da OP: "Valor da receita deve ser maior que zero" com
// R$ 519.539,62 digitados. O CampoDecimal entrega "519539,62" e o modal fazia `Number()` — NaN.
//
// A varredura achou o mesmo defeito no portal inteiro, com três caras diferentes:
//   · `Number("1500,50")` é NaN → valor recusado (Financeiro) ou gravado vazio/zero (salário do
//     cargo, custo do treinamento, limite da calibração, fator do custo-hora);
//   · `parseFloat("1.500,00")` é 1,5 → valor mil vezes menor, sem erro nenhum (frete e estudo
//     cotados pelo FORNECEDOR, valor do orçamento);
//   · `parseInt("12.000")` é 12 → a meta de 12 mil kg/dia virava 12.
//
// Este teste olha o código das telas: texto cru de CampoDecimal só sai do estado por `numeroBR`.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { leiturasSemNumeroBR } from "@/testes/apoio/leituras-campo-decimal";

// O MESMO NOME, MAS OUTRO DADO: o que vem do banco ou da leitura do PDF já é número.
const PERMITIDAS = {
  "app/fornecedores/c/[token]/CotacaoFornecedorForm.jsx": ["Number(it.precoUnit)"], // itens lidos do PDF
  "app/rh/treinamentos/TreinamentosClient.jsx": ["Number(t.cargaHoraria)"], // linha da lista (banco)
  "app/comercial/[id]/EditarPlp.jsx": ["Number(p.espessuraTotal)"], // PLP gravado (banco)
  "app/comercial/[id]/OPDetailClient.jsx": ["Number(r.quantidade)"], // receita gravada (banco)
};

function telas(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) telas(caminho, saida);
    else if (/\.(jsx?|tsx?)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

describe("a varredura", () => {
  const tela = (onChange, leitura) => `
    <CampoDecimal value={form.valor || ""} onChange={${onChange}} />
    const payload = { valor: ${leitura} };`;

  it("acusa o texto cru lido com Number, parseFloat ou parseInt", () => {
    for (const leitura of ["Number(form.valor)", "parseFloat(form.valor)", "parseInt(form.valor, 10)", "Number(form.valor) || 0"]) {
      expect(leiturasSemNumeroBR(tela('(txt) => set("valor", txt)', leitura)), leitura).toHaveLength(1);
    }
  });

  it("aceita o texto lido com numeroBR", () => {
    expect(leiturasSemNumeroBR(tela('(txt) => set("valor", txt)', "numeroBR(form.valor, NaN)"))).toEqual([]);
  });

  it("aceita Number quando o campo já guarda número", () => {
    expect(leiturasSemNumeroBR(tela('(txt) => set("valor", numeroBR(txt))', "Number(form.valor)"))).toEqual([]);
  });
});

describe("as telas do portal", () => {
  it("nenhuma lê o texto do CampoDecimal com Number/parseFloat/parseInt", () => {
    const erradas = [];
    for (const raiz of ["app", "components"]) {
      for (const arquivo of telas(raiz)) {
        const codigo = readFileSync(arquivo, "utf8");
        if (!codigo.includes("<CampoDecimal")) continue;
        const ok = PERMITIDAS[arquivo] || [];
        for (const a of leiturasSemNumeroBR(codigo)) {
          if (!ok.includes(a.expressao)) erradas.push(`${arquivo}:${a.linha}  ${a.expressao}`);
        }
      }
    }
    expect(erradas).toEqual([]);
  });
});
