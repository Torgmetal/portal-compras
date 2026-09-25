import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { condicoesDoRelatorio, CAMPOS_CONDICAO_CAMPO } from "@/lib/campo-condicoes";
import { CAMPO_DO_JATO } from "@/lib/pintura-campos";

// ⚠⚠ O QUE A TELA DO CAMPO LÊ PRECISA SER CARREGADO AO REABRIR (23/09/2026). A lista de campos
// carregados vivia escrita à mão dentro de app/campo/Medir.jsx e ficou para trás quando o ultrassom
// ganhou processo de soldagem, metal de adição, junta, chanfro e a marca do cabeçote: gravava, mas
// voltava em branco. Este teste varre as telas e cobra cada `cond.X` delas.

// ⚠ TODAS as telas do campo, não uma lista: a tela nova (a junta soldada, 23/09) é justamente a que
// uma lista fixa esqueceria.
const TELAS = readdirSync("app/campo").filter((n) => n.endsWith(".jsx"))
  .map((n) => readFileSync(`app/campo/${n}`, "utf8"));

/** Todo campo de `cond` que alguma tela do campo lê ou escreve. */
function camposUsadosPelasTelas() {
  const usados = new Set();
  const achar = (re, fonte) => { for (const m of fonte.matchAll(re)) usados.add(m[1]); };
  for (const fonte of TELAS) {
    achar(/\bcond\??\.([A-Za-z_]\w*)/g, fonte); // leitura: cond.tipoJunta
    achar(/\.\.\.c,\s*([A-Za-z_]\w*)\s*:/g, fonte); // escrita: setCond((c) => ({ ...c, iluminacao: … }))
    achar(/\bmudar\("([A-Za-z_]\w*)"\)/g, fonte); // escrita no US: mudar("processoSolda")
  }
  // Pintura e os parâmetros do LP escrevem por `set("campo", v)`, que é o do `cond`. ⚠ No LP só o
  // bloco dos PARÂMETROS: na indicação, `set` é o da LINHA (nº, local, tamanho, tipo, laudo).
  const lp = readFileSync("app/campo/Lp.jsx", "utf8");
  const parametrosLp = lp.slice(lp.indexOf("export function ParametrosLP"), lp.indexOf("export function IndicacaoLP"));
  for (const fonte of [readFileSync("app/campo/Pintura.jsx", "utf8"), parametrosLp]) achar(/\bset\("([A-Za-z_]\w*)"/g, fonte);
  // o bloco do jato escreve pelos nomes de CAMPO_DO_JATO (umidade → prepUmidade…)
  for (const k of Object.values(CAMPO_DO_JATO)) usados.add(k);
  return usados;
}

describe("as condições do ensaio no portal de campo", () => {
  it("todo campo que as telas do campo usam é carregado ao reabrir", () => {
    const carregados = new Set(Object.keys(condicoesDoRelatorio({})));
    const faltando = [...camposUsadosPelasTelas()].filter((k) => !carregados.has(k));
    expect(faltando).toEqual([]);
  });

  it("reabrir o ultrassom devolve a junta ensaiada e a marca do cabeçote", () => {
    const cond = condicoesDoRelatorio({
      processoSolda: "FCAW", metalAdicao: "E71T-1", tipoJunta: "Topo", chanfro: "X", cbFabricante: "Doppler",
    });
    expect(cond).toMatchObject({ processoSolda: "FCAW", metalAdicao: "E71T-1", tipoJunta: "Topo", chanfro: "X", cbFabricante: "Doppler" });
  });

  it("zero é leitura, não campo vazio", () => {
    expect(condicoesDoRelatorio({ prepTAmb: 0 }).prepTAmb).toBe(0);
  });

  it("não carrega o que nenhuma tela do campo edita — voltaria na gravação, cortado em 120", () => {
    const cond = condicoesDoRelatorio({ desenhoCliente: "SE-001", revisaoCliente: "R2" });
    expect(cond).not.toHaveProperty("desenhoCliente");
    expect(cond).not.toHaveProperty("revisaoCliente");
  });

  // ⚠ Desde 25/09/2026 o ultrassom edita TODO o cabeçalho no celular — desenho e procedimento
  // inclusive (Vitor: "todos os campos precisamos deixar para ser possível ajustar"). O desenho
  // aceita até 500 caracteres nas duas rotas, então a lista não volta cortada.
  it("o ultrassom recarrega todo o cabeçalho ao reabrir", async () => {
    const { CAMPOS_CABECALHO_US } = await import("@/lib/us-campos");
    const gravado = Object.fromEntries(CAMPOS_CABECALHO_US.map((c) => [c.k, `v-${c.k}`]));
    const cond = condicoesDoRelatorio(gravado);
    const perdidos = CAMPOS_CABECALHO_US.map((c) => c.k).filter((k) => cond[k] !== `v-${k}`);
    expect(perdidos).toEqual([]);
  });

  it("o especificado do PLP vai à parte, para conferência", () => {
    const cond = condicoesDoRelatorio({ rugEspec: "50 a 100 µm", espessuraMinima: "220" });
    expect(cond.__espec).toMatchObject({ rugEspec: "50 a 100 µm", espessuraMinima: "220" });
    expect(CAMPOS_CONDICAO_CAMPO).not.toContain("__espec");
  });
});
