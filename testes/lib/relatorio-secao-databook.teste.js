// Em que seção do data book cada relatório de inspeção entra (02/10/2026). As §04, §05 e §15 são de
// CERTIFICADOS: o cron vincula sozinho o que chega depois da "última montagem" da seção — medida pelo
// documento mais novo dela — e o PDF lista tudo ali como rastreabilidade (R, corrida, nº do
// certificado). Um relatório vinculado numa delas apareceria como "material" na tabela e empurraria a
// data da montagem para a frente: o certificado que chegou entre a montagem de verdade e a assinatura do
// relatório nunca entraria sozinho. Por isso o recebimento de tintas vai na §14, com a pintura.
import { describe, it, expect } from "vitest";
import { TIPOS_RELATORIO } from "@/lib/qualidade-campo";
import { SECOES_AUTOMATICAS } from "@/lib/databook-certificados-novos";

describe("seção do data book de cada relatório", () => {
  it("nenhum relatório de inspeção cai numa seção de vínculo automático de certificados", () => {
    for (const t of TIPOS_RELATORIO) expect(SECOES_AUTOMATICAS, `${t.id} → §${t.secao}`).not.toContain(t.secao);
  });

  it("o recebimento de tintas e o pull-off entram na §14, com os outros relatórios da pintura", () => {
    const secao = Object.fromEntries(TIPOS_RELATORIO.map((t) => [t.id, t.secao]));
    expect(secao.RECEBIMENTO_TINTA).toBe("14");
    expect(secao.PULL_OFF).toBe("14");
    expect(secao.PINTURA).toBe("14");
  });
});
