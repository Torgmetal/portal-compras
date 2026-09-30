import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAMPANHAS, campanhaDoMes, campanhaHoje, campanhaExibida } from "@/lib/campanha";

// Vitor (30/09/2026): "para amanhã precisamos mudar nossa campanha de marketing pois começa o Outubro
// Rosa (…) deixar isso programado para que no dia 01/10 já mude, tem que ser horário de Brasília".

describe("calendário das campanhas", () => {
  afterEach(() => vi.useRealTimers());

  it("setembro é Setembro Amarelo, outubro é Outubro Rosa", () => {
    expect(campanhaDoMes("2026-09-30").id).toBe("setembro-amarelo");
    expect(campanhaDoMes("2026-10-01").id).toBe("outubro-rosa");
    expect(campanhaDoMes("2026-10-31").id).toBe("outubro-rosa");
  });

  it("mês sem campanha não mostra nada", () => {
    expect(campanhaDoMes("2026-08-15")).toBeNull();
  });

  it("vale para qualquer ano — no ano que vem volta sozinha", () => {
    expect(campanhaDoMes("2027-10-10").id).toBe("outubro-rosa");
  });

  it("a virada é à meia-noite de BRASÍLIA, não à meia-noite UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T02:59:00Z")); // 23h59 de 30/09 em Brasília
    expect(campanhaHoje().id).toBe("setembro-amarelo");
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z")); // 00h00 de 01/10 em Brasília
    expect(campanhaHoje().id).toBe("outubro-rosa");
  });
});

describe("prévia (?campanha=…)", () => {
  it("pelo nome, mostra a campanha antes da data", () => {
    expect(campanhaExibida("outubro-rosa", "2026-09-30").id).toBe("outubro-rosa");
  });

  it("'1' mostra a do mês", () => {
    expect(campanhaExibida("1", "2026-10-05").id).toBe("outubro-rosa");
  });

  it("'1' fora de campanha mostra a próxima", () => {
    expect(campanhaExibida("1", "2026-08-15").id).toBe("setembro-amarelo");
  });

  it("sem prévia, só a do mês", () => {
    expect(campanhaExibida(null, "2026-08-15")).toBeNull();
    expect(campanhaExibida(null, "2026-10-02").id).toBe("outubro-rosa");
  });
});

describe("o que cada campanha precisa para não aparecer quebrada", () => {
  it("laço e Torguinho existem em public/", () => {
    for (const c of CAMPANHAS) {
      expect(fs.existsSync(path.join("public", c.laco)), c.laco).toBe(true);
      expect(fs.existsSync(path.join("public", c.torguinho)), c.torguinho).toBe(true);
    }
  });

  // ⚠ o laço aparece na tela de LOGIN, no portal do CLIENTE e no E-MAIL — lugares sem sessão. Sem a
  // exceção, o middleware manda o PNG para o /entrar e a campanha vira um ícone de imagem quebrada.
  it("o middleware libera as imagens de toda campanha sem sessão", () => {
    const mw = fs.readFileSync("middleware.js", "utf8");
    const excecoes = mw.match(/"\/\(\(\?!([^)]*)\)\.\*\)"/)[1].split("|").map((p) => p.replace(".*", ""));
    for (const c of CAMPANHAS) {
      for (const arq of [c.laco, c.torguinho]) {
        expect(excecoes.some((p) => arq.slice(1).startsWith(p)), arq).toBe(true);
      }
    }
  });

  it("toda campanha tem nome, slogan e as cores das telas", () => {
    for (const c of CAMPANHAS) {
      expect(c.nome && c.slogan && c.altLaco).toBeTruthy();
      expect(c.partes.join(" ")).toBe(c.nome);
      for (const k of ["destaque", "brilho", "faixaBorda", "faixaFundo", "faixaTexto", "faixaTitulo"]) expect(c.cor[k], `${c.id}.${k}`).toBeTruthy();
    }
  });
});
