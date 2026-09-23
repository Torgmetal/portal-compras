import { describe, it, expect } from "vitest";
import { textoDaPagina, corpoLegal, conferir, dispositivos, sha256 } from "@/lib/fiscal/texto-legislacao";

// ─── O TEXTO DA LEI, EXTRAÍDO DA PÁGINA ──────────────────────────────────────
//
// ⚠⚠ O QUE ESTE ARQUIVO PROTEGE É A PROCEDÊNCIA. O briefing (22/09/2026) exige que o portal
// fundamente cada recomendação num documento oficial baixado e guardado — e o caminho entre "a
// página respondeu" e "isto é a lei" tem três armadilhas: página de erro com HTTP 200, chrome do
// site entrando no corpo, e dispositivo perdido na extração.

const pagina = (corpo) => `<html><head><title>x</title><style>a{}</style></head><body>
  <div id="menu">Ativar o modo mais acessível Comando para Ignorar Faixa de Op&ccedil;&otilde;es</div>
  <script>var x = 1;</script>
  ${corpo}</body></html>`;

describe("textoDaPagina", () => {
  it("tira script, style e tags, e desescapa entidades", () => {
    const t = textoDaPagina(pagina("<p>Artigo 1&ordm; - Da opera&ccedil;&atilde;o.</p>"));
    expect(t).toMatch(/Artigo 1º - Da operação\./);
    expect(t).not.toMatch(/var x = 1/);
    expect(t).not.toMatch(/<p>/);
  });

  // ⚠ `&#186;` e `&ordm;` são o "º" dos artigos — perder isso vira "Artigo 1 -" onde é "Artigo 1º".
  it.each(["&ordm;", "&#186;", "&#xBA;"])("desescapa %s como º", (e) => {
    expect(textoDaPagina(`<p>Artigo 1${e}</p>`)).toBe("Artigo 1º");
  });

  it("<br> e fim de parágrafo viram quebra de linha", () => {
    expect(textoDaPagina("<p>um</p><p>dois</p>")).toBe("um\ndois");
  });
});

describe("corpoLegal — o chrome do site não entra no banco", () => {
  // ⚠⚠ MEDIDO NA PÁGINA REAL: das ~12.900 letras de `art404.aspx`, a maior parte é menu do
  // SharePoint. Guardar isso faria a busca casar com o CHROME do site, e o hash mudaria a cada
  // redesenho do portal da SEFAZ — falso "a lei mudou".
  it("começa no primeiro artigo declarado, não no topo", () => {
    const t = textoDaPagina(pagina("<p>Artigo 406 - Quando um estabelecimento mandar industrializar</p>"));
    const c = corpoLegal(t, { artigos: ["406"] });
    expect(c.startsWith("Artigo 406 -")).toBe(true);
    expect(c).not.toMatch(/modo mais acessível/);
  });

  it("sem artigo, usa o marcador do documento", () => {
    const t = textoDaPagina(pagina("<p>RESPOSTA À CONSULTA 5788/2015</p><p>corpo</p>"));
    expect(corpoLegal(t, { marcadores: ["RESPOSTA À CONSULTA"] })).toMatch(/^RESPOSTA À CONSULTA/);
  });

  it("sem o início esperado, devolve null em vez de gravar a página inteira", () => {
    expect(corpoLegal("nada aqui", { artigos: ["406"] })).toBeNull();
  });
});

describe("conferir — uma página de erro devolve 200", () => {
  const longo = (t) => t + " ".padEnd(500, "x");

  // ⚠⚠ É A VALIDAÇÃO ESTRUTURAL DO BRIEFING. Sem ela, a página de erro do SharePoint entraria no
  // banco como se fosse a lei, com hash e tudo — e o portal passaria a fundamentar apontamentos
  // fiscais num "Desculpe, ocorreu um erro".
  it("recusa quando falta um dos artigos declarados", () => {
    const r = conferir(longo("Artigo 404 - x Artigo 405 - y"), { artigos: ["404", "405", "406"] });
    expect(r.valido).toBe(false);
    expect(r.faltam).toEqual(["Artigo 406"]);
  });

  it("aceita quando todos estão presentes", () => {
    expect(conferir(longo("Artigo 406 - x"), { artigos: ["406"] }).valido).toBe(true);
  });

  // ⚠ Marcador sem acento na página tem de casar com o marcador com acento na fonte.
  it("compara sem acento dos dois lados", () => {
    expect(conferir(longo("RESPOSTA A CONSULTA 5788"), { marcadores: ["RESPOSTA À CONSULTA"] }).valido).toBe(true);
  });

  // ⚠⚠ TAMANHO MÍNIMO É DEFESA CONTRA PÁGINA MUTILADA: um HTML que perdeu o corpo mas manteve o
  // título passaria por todos os marcadores.
  it("corpo curto demais é recusado mesmo com o marcador presente", () => {
    const r = conferir("Artigo 406 - curto", { artigos: ["406"] });
    expect(r.valido).toBe(false);
    expect(r.faltam.join()).toMatch(/400 caracteres/);
  });

  // ⚠ Os motivos vêm por extenso: sem eles, a única saída é abrir a URL na mão e comparar.
  it("diz O QUE faltou, não só que falhou", () => {
    expect(conferir("x", { artigos: ["406"], marcadores: ["industrialização"] }).faltam)
      .toEqual(["Artigo 406", '"industrialização"', "corpo com menos de 400 caracteres"]);
  });
});

describe("dispositivos — é o inciso que fundamenta", () => {
  const corpo = [
    "Artigo 406 - Quando um estabelecimento mandar industrializar mercadoria:",
    "I - o estabelecimento fornecedor deverá:",
    "a) emitir Nota Fiscal em nome do adquirente;",
    "II - o estabelecimento autor da encomenda deverá:",
    "a) emitir Nota Fiscal relativa à remessa simbólica;",
    "Parágrafo único - O estabelecimento fornecedor fica dispensado da emissão.",
    "Artigo 407 - Na hipótese do artigo anterior:",
    "I - primeiro inciso do 407;",
  ].join("\n");

  it("separa artigo, inciso e parágrafo com o rótulo completo", () => {
    expect(dispositivos(corpo).map((d) => d.rotulo)).toEqual([
      "Artigo 406", "Artigo 406, I", "Artigo 406, II", "Artigo 406, Parágrafo único",
      "Artigo 407", "Artigo 407, I",
    ]);
  });

  // ⚠⚠ O TEXTO DA ALÍNEA FICA DENTRO DO INCISO. Citar "art. 406, II" e entregar só a primeira
  // linha obrigaria quem confere a abrir a lei para achar a alínea "a" — e é aí que a
  // rastreabilidade se perde.
  it("a alínea acompanha o inciso a que pertence", () => {
    const ii = dispositivos(corpo).find((d) => d.rotulo === "Artigo 406, II");
    expect(ii.texto).toMatch(/remessa simbólica/);
    expect(ii.tipo).toBe("INCISO");
    expect(ii.artigo).toBe("406");
  });

  // ⚠⚠ O INCISO É QUALIFICADO PELO PARÁGRAFO EM QUE ESTÁ. Sem isso o art. 125 gerava "Artigo 125,
  // I" mais de uma vez, e os repetidos eram DESCARTADOS em silêncio na gravação: 138 dispositivos
  // extraídos viravam 92 gravados.
  it("inciso dentro de parágrafo leva o parágrafo no rótulo", () => {
    const d = dispositivos([
      "Artigo 125 - Caput.",
      "I - inciso do caput;",
      "§ 1º - Primeiro parágrafo:",
      "I - inciso do parágrafo;",
    ].join("\n"));
    expect(d.map((x) => x.rotulo)).toEqual([
      "Artigo 125", "Artigo 125, I", "Artigo 125, § 1º", "Artigo 125, § 1º, I",
    ]);
  });

  // ⚠⚠ E O QUE AINDA COLIDIR GANHA SUFIXO EM VEZ DE SUMIR. Nenhum parser conservador cobre todos
  // os formatos de texto legal; o que ele NÃO pode fazer é apagar o que não entendeu.
  it("rótulo repetido é desambiguado, nunca descartado", () => {
    const d = dispositivos(["Artigo 9 - a", "I - x", "I - y"].join("\n"));
    expect(d.map((x) => x.rotulo)).toEqual(["Artigo 9", "Artigo 9, I", "Artigo 9, I (2)"]);
  });

  it("a ordem é preservada e sequencial", () => {
    expect(dispositivos(corpo).map((d) => d.ordem)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("texto sem artigo nenhum não vira dispositivo", () => {
    expect(dispositivos("linha solta\noutra linha")).toEqual([]);
  });
});

describe("sha256 — é o que diz se a lei mudou", () => {
  it("é estável para o mesmo texto e muda com um caractere", () => {
    expect(sha256("Artigo 406")).toBe(sha256("Artigo 406"));
    expect(sha256("Artigo 406")).not.toBe(sha256("Artigo 407"));
    expect(sha256("x")).toHaveLength(64);
  });
});

describe("entidades acentuadas — texto legal em português", () => {
  // ⚠⚠ SEM ISSO, "operação" CHEGA AO BANCO COMO "opera&ccedil;&atilde;o": quebra a busca textual e
  // a leitura de quem confere o fundamento. Apareceu na primeira bateria de teste deste arquivo.
  it.each([
    ["opera&ccedil;&atilde;o", "operação"],
    ["ind&uacute;stria", "indústria"],
    ["par&aacute;grafo &uacute;nico", "parágrafo único"],
    ["mercadoria n&atilde;o &eacute; servi&ccedil;o", "mercadoria não é serviço"],
    ["&sect; 1&ordm;", "§ 1º"],
    ["INSCRI&Ccedil;&Atilde;O", "INSCRIÇÃO"],
  ])("%s vira %s", (entrada, esperado) => {
    expect(textoDaPagina(`<p>${entrada}</p>`)).toBe(esperado);
  });

  // ⚠ Entidade desconhecida fica como veio: inventar um caractere seria pior que mostrar o código.
  it("entidade que não existe é preservada", () => {
    expect(textoDaPagina("<p>&naoexiste;</p>")).toBe("&naoexiste;");
  });
});
