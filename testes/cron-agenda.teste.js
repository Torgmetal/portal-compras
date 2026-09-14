import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { maiorIntervaloHoras, toleranciaDe, AGENDA } from "@/lib/cron-agenda";
import { CRONS_ESPERADOS, conferirAgenda } from "@/lib/cron-monitor";
import { escaparHtml } from "@/lib/email-layout";

// ─── O QUE ESTES TESTES EXISTEM PARA IMPEDIR (13/09/2026) ────────────────────
//
// O e-mail diário do monitor acusou 5 crons com problema. DOIS eram alarme falso, e os dois pela
// mesma causa: `maxHoras` era um número escrito à mão, que ninguém revisou quando a agenda mudou.
// OUTROS TRÊS estavam agendados na Vercel, fora do cadastro do monitor, e quebrados havia meses —
// o middleware mandava o cron para o `/entrar` e ninguém era avisado, porque ninguém os cobrava.

describe("maiorIntervaloHoras — o buraco que a agenda deixa", () => {
  it("de hora em hora, todo dia, é 1h", () => {
    expect(maiorIntervaloHoras("10 * * * *")).toBe(1);
  });

  it("de 6h às 20h todo dia: o buraco é a madrugada, 10h", () => {
    expect(maiorIntervaloHoras("0 6-20 * * *")).toBe(10);
  });

  // ⚠⚠ ESTE É O CASO DO `rnc-abertas`. Sexta 08:00 → segunda 08:00. O limite era 30h, então ele
  // aparecia como problema TODO DOMINGO — e alarme falso semanal ensina a arquivar o e-mail.
  it("só dias úteis: o fim de semana vale 72h", () => {
    expect(maiorIntervaloHoras("0 8 * * 1-5")).toBe(72);
  });

  // ⚠⚠ E ESTE É O DO `data-book`, que mudou de agenda em 11/09 e ficou com o limite de 2h de antes.
  it("horário comercial em dias úteis: sexta 21:15 → segunda 10:15 são 61h", () => {
    expect(maiorIntervaloHoras("15 10-21 * * 1-5")).toBe(61);
  });

  it("semanal (domingo) é 168h", () => {
    expect(maiorIntervaloHoras("0 4 * * 0")).toBe(168);
  });

  it("a tolerância sempre sobra sobre o intervalo, e nunca menos de 2h", () => {
    expect(toleranciaDe("10 * * * *")).toBeGreaterThanOrEqual(3);
    expect(toleranciaDe("0 8 * * 1-5")).toBeGreaterThan(72);
  });
});

describe("o cadastro do monitor e a agenda da Vercel dizem a mesma coisa", () => {
  // ⚠⚠ O TESTE QUE FALTAVA. Cron agendado e fora do cadastro morre calado; cron cadastrado e fora
  // da agenda alerta para sempre. Os dois aconteceram de verdade.
  it("todo cron agendado é cobrado, e todo cron cobrado está agendado", () => {
    const { agendadosSemCadastro, cadastradosSemAgenda } = conferirAgenda();
    expect(agendadosSemCadastro).toEqual([]);
    expect(cadastradosSemAgenda).toEqual([]);
  });

  it("nenhum cron tem limite menor que o buraco da própria agenda", () => {
    const apertados = CRONS_ESPERADOS
      .map((c) => ({ job: c.job, limite: c.maxHoras, buraco: maiorIntervaloHoras(AGENDA.get(c.path)) }))
      .filter((c) => c.limite <= c.buraco);
    expect(apertados).toEqual([]);
  });
});

describe("middleware — o cron chega ao handler", () => {
  // ⚠ TESTE DE TEXTO, de propósito. Importar o `middleware.js` puxa o `next-auth/middleware` e o
  // runtime de edge inteiro; o que precisa ser garantido aqui é mais simples e mais duro: que
  // NENHUM caminho agendado fique de fora da allowlist. Quem acrescentar um cron fora de
  // `/api/cron/` sem liberar o caminho vê este teste falhar — em vez de descobrir meses depois,
  // por um 307 que ninguém olha.
  const fonte = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
  const PREFIXOS_LIBERADOS = ["/api/cron/", "/api/producao/sync-sharepoint"];

  it.each([...AGENDA.keys()])("%s passa pelo middleware", (path) => {
    const porPrefixo = PREFIXOS_LIBERADOS.some((p) => path.startsWith(p));
    const porCaminhoExato = fonte.includes(`"${path}"`);
    expect(porPrefixo || porCaminhoExato).toBe(true);
  });
});

describe("escaparHtml — o alerta não deixa texto de fora virar marcação", () => {
  it("escapa os cinco caracteres que importam", () => {
    expect(escaparHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });

  it("nome de arquivo com < não quebra a formatação do e-mail", () => {
    expect(escaparHtml("HTTP 404 ao baixar /PCP/<Gestão>.xlsx"))
      .toBe("HTTP 404 ao baixar /PCP/&lt;Gestão&gt;.xlsx");
  });

  it("nulo e indefinido viram string vazia, não 'null'", () => {
    expect(escaparHtml(null)).toBe("");
    expect(escaparHtml(undefined)).toBe("");
  });
});
