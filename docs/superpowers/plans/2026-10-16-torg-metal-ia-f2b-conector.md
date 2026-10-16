# Torg Metal IA — F2b (conector torg-tekla) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o conector `torg-tekla` da F0 (7 ferramentas de leitura) para o conjunto da F2: ferramentas de "levar até", escrita, destrutivas e de verificação de desenho, cada uma com a sua CLASSE, para o app pedir confirmação só nas destrutivas.

**Architecture:** Mesma arquitetura da F0 — lista fechada, entrada validada por zod, `execFile` sem shell, contrato `--json`. Novidade: cada ferramenta declara `classe` (`leitura | levar_ate | escrita | destrutiva`), as anotações MCP saem da classe, e o módulo exporta `CLASSE_POR_FERRAMENTA` para o app (F2c) decidir a confirmação. Todo caminho de arquivo passa por um único `dentroDaSaida()`. A parte Mac (conector + testes com EXE falso) e a parte Windows (`--json` nos EXEs) são tarefas separadas.

**Tech Stack:** Node 20+, `@modelcontextprotocol/sdk` 1.32.1, zod 4, `node:test` (o que o conector já usa), C# 5 / .NET 4.x + Tekla Open API 2025 (Windows).

**Spec:** `docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md` (portal-compras) — "F2 em detalhe" §2, Etapas 1–6. Repositório: `Torgmetal/torg-engenharia`, pasta `conector/`.

## Global Constraints

- Sem shell, nunca: `execFile(arquivo, ["--json", ...args], { shell:false })`. Nada da entrada vira comando.
- Classes e confirmação (decisão do Vitor): confirma SÓ `destrutiva`. `levar_ate` não altera o modelo (só seleção/vista).
- Todo arquivo lido ou gravado fica dentro de `TORG_TEKLA_SAIDA` (anexos copiados pelo app em `<saida>/anexos/<obra>/`, specs em `<saida>/specs/<obra>/`, capturas em `<saida>/capturas/`).
- Pesos em kg, comprimentos em mm, decimal com ponto (CONTRATO-JSON.md, regra 6).
- Tudo que o `MontarSpec gerar` cria leva a TAG da obra (`USER_FIELD_4`); apagar só pela TAG.
- Teste no Tekla de verdade só numa CÓPIA de modelo e com ninguém usando aquele Tekla.

## Review Focus

- Nome de anexo/spec/subpasta com `..`, `C:`, `\\servidor` ou barra inicial → erro legível, EXE nunca chamado (teste na Task 1).
- Ferramenta nova esquecida sem `classe` → o servidor não sobe (teste na Task 1 percorre todas).
- `numerar_aplicar` chamado sem ter havido `numerar_simular` com os mesmos parâmetros na sessão → recusa com "rode numerar_simular antes" (teste na Task 4).
- EXE de escrita que demora (desenhos de obra grande) → timeout próprio maior que 120 s, mensagem dizendo para conferir janela modal (teste na Task 3).
- TAG com espaço ou acento → recusada pelo esquema (`^[A-Z0-9][A-Z0-9-]{1,30}$`), porque vira filtro de UDA no EXE (teste na Task 3).

---

### Task 1: Classes de ferramenta e `dentroDaSaida`

**Files:**
- Modify: `conector/src/ferramentas.js` (campo `classe` nas 7 de hoje; `anotacoesDa(classe)`; exportar `CLASSE_POR_FERRAMENTA`; trocar a checagem de `gerar_listas` por `dentroDaSaida`)
- Create: `conector/src/caminhos.js`
- Modify: `conector/src/servidor.js` (recusar subir se alguma ferramenta não tiver classe válida)
- Test: `conector/test/caminhos.test.js`, `conector/test/ferramentas.test.js`

**Interfaces:**
- Produces:
  - `export const CLASSES = ["leitura","levar_ate","escrita","destrutiva"]`
  - `export function anotacoesDa(classe) -> { readOnlyHint, destructiveHint, idempotentHint, openWorldHint:false }` — leitura `{true,false,true}`, levar_ate `{true,false,true}`, escrita `{false,false,false}`, destrutiva `{false,true,false}`
  - `export const CLASSE_POR_FERRAMENTA: Record<string, classe>` (gerado de `criarFerramentas` com dependências nulas)
  - `export function dentroDaSaida(pastaSaida: string, ...partes: string[]) -> string` — cada parte casa `^[A-Za-z0-9][A-Za-z0-9 ._-]{0,119}$` e não é `..`; lança `Error("caminho fora da pasta de saída")`

- [ ] **Step 1:** Testes: `dentroDaSaida("C:/saida","anexos","T112","planta.pdf")` → `"C:/saida/anexos/T112/planta.pdf"`; `..`, `C:`, `\\srv`, `/x`, `a/b` numa parte → lança; toda ferramenta de `criarFerramentas` tem `classe ∈ CLASSES` e `anotacoes` igual a `anotacoesDa(classe)`. → FAIL
- [ ] **Step 2:** Implementar → `cd conector && npm test` PASS (os 26 de antes continuam)
- [ ] **Step 3:** Commit `feat(conector): classes de ferramenta e caminho confinado à pasta de saída`

### Task 2: Ferramentas "levar até"

**Files:** Modify `conector/src/ferramentas.js`; Modify `conector/CONTRATO-JSON.md`; Test `conector/test/ferramentas.test.js`

**Interfaces (todas `classe:"levar_ate"`):**
- `selecionar({ ids })` → `SelecionarIds.exe <id...>`
- `destacar({ idConjunto, folgaMm? 0..5000 })` → `DestacarPeca.exe <id> [folga]`
- `limpar_destaque({})` → `DestacarPeca.exe limpar` e depois `LimparSelecao.exe` (as duas; erro de uma não esconde a outra: avisos somados)
- `enquadrar_e_capturar({ ids, nome })` → `ZoomCaptura.exe <dentroDaSaida(saida,"capturas",nome+".png")> <id...>`; `dados.imagem` = esse caminho. `nome` casa `^[A-Za-z0-9_-]{1,60}$`.

- [ ] **Step 1:** Testes de argumentos com o EXE falso (`test/falsos/programa.js` ecoa os args) e de validação (ids vazios, 501 ids, `nome` com barra). → FAIL
- [ ] **Step 2:** Implementar; acrescentar as 4 entradas no CONTRATO-JSON.md com o `dados` de cada (`{ selecionados:n }`, `{ destacados:n, ligados:n }`, `{}`, `{ imagem }`). → PASS
- [ ] **Step 3:** Commit `feat(conector): ferramentas levar até (selecionar, destacar, enquadrar)`

### Task 3: Ferramentas de escrita

**Files:** Modify `conector/src/ferramentas.js`, `conector/src/executar.js` (timeout por chamada), `conector/CONTRATO-JSON.md`; Test `conector/test/ferramentas.test.js`, `conector/test/executar.test.js`

**Interfaces:**
- `executar(exe, args, { timeoutMs? })` — terceiro argumento opcional; padrão continua o do executor.
- Leitura: `nomes_conjuntos_conferir({ arquivo })` → `NomearConjuntos.exe conferir <dentroDaSaida(saida,"nomes",arquivo)>` (arquivo `.csv`).
- Escrita (`classe:"escrita"`):
  - `nomes_conjuntos_aplicar({ arquivo })` → `NomearConjuntos.exe aplicar <dentroDaSaida(saida,"nomes",arquivo)>`
  - `montar_spec({ obra, spec, tag })` → `MontarSpec.exe gerar <dentroDaSaida(saida,"specs",obra,spec)> <tag>`; `spec` é um `.json` ou uma subpasta; `tag` `^[A-Z0-9][A-Z0-9-]{1,30}$`; timeout 600 s
  - `criar_croquis({ prefixo? })` → `Croquis.exe criar` (+ `prefixo=` se informado); timeout 900 s
  - `criar_conjuntos({ marca, preset })` → `Desenhos.exe conjunto <marca> <preset>`; `preset` de lista fechada lida de `TORG_TEKLA_PRESETS` (vírgulas), padrão `TORG_CONJ.ad`; timeout 900 s
  - `criar_diagrama_montagem({ preset?, escala? 10..500 })` → `Desenhos.exe montagem [preset] [escala]`; timeout 900 s
  - `aplicar_marcas_desenho({ preset, prefixo })` → `MarcasDesenho.exe <preset> <prefixo>`
  - `importar_ifc_referencia({ obra, arquivo, x0, x1, dx, dy, dz, prefConj, prefPeca })` → `IfcToTekla.exe <dentroDaSaida(saida,"anexos",obra,arquivo)> ...` (números finitos, `arquivo` termina em `.ifc`); timeout 900 s
- Mensagem de timeout das escritas: a mesma da F0 ("Confira se o Tekla não está com uma janela aberta esperando resposta").

- [ ] **Step 1:** Testes de argumentos, de TAG inválida (`op 123`, `ÓP1`), de `spec` fora da pasta, e de `timeoutMs` repassado ao `execFile` (executor com `comando` falso que dorme). → FAIL
- [ ] **Step 2:** Implementar; contratos no CONTRATO-JSON.md (`montar_spec` devolve `{ criados, erros, pesos:[{desenho, pesoKg, pesoEsperadoKg, difPct}] }`). → PASS
- [ ] **Step 3:** Commit `feat(conector): ferramentas de escrita (nomes, spec, croquis, conjuntos, diagrama, IFC)`

### Task 4: Ferramentas destrutivas e o par simular/aplicar

**Files:** Modify `conector/src/ferramentas.js`, `conector/CONTRATO-JSON.md`; Test `conector/test/ferramentas.test.js`

**Interfaces:**
- Leitura: `numerar_simular({ tag, prefixo })` → `NumerarBlanks.exe vincular <tag> <prefixo>` (sem `aplicar`); devolve o que mudaria.
- Destrutivas (`classe:"destrutiva"`):
  - `numerar_aplicar({ tag, prefixo })` → `NumerarBlanks.exe vincular <tag> <prefixo> aplicar` — recusa (`ok:false`, erro "rode numerar_simular com a mesma TAG e prefixo antes de aplicar") se não houve simulação com os mesmos parâmetros nesta instância do servidor (memória em `criarFerramentas`, `Set` de `"tag|prefixo"`; esvazia depois de aplicar).
  - `apagar_criados({ tag, desenho? })` → `MontarSpec.exe apagar <desenho|todos> <tag>`
  - `apagar_desenhos({ marcas })` → `Desenhos.exe apagar <marca...>` (marcas `PREFIXO`, 1..200)
- Cada destrutiva leva na `descricao` a frase que o app mostra na barra: "Vai <ação> — Confirmar / Ajustar".

- [ ] **Step 1:** Testes: aplicar sem simular → recusa sem chamar EXE; simular+aplicar → chama com `aplicar`; segunda aplicação sem nova simulação → recusa; `CLASSE_POR_FERRAMENTA.apagar_criados === "destrutiva"`. → FAIL
- [ ] **Step 2:** Implementar → PASS
- [ ] **Step 3:** Commit `feat(conector): ferramentas destrutivas com simulação obrigatória na numeração`

### Task 5: Ferramentas de verificação de desenho (leitura)

**Files:** Modify `conector/src/ferramentas.js`, `conector/CONTRATO-JSON.md`; Test `conector/test/ferramentas.test.js`

**Interfaces (`classe:"leitura"`):**
- `cotas_desenho({ marca })` → `Cotas.exe <marca>` → `dados.vistas[].cadeias[].valores`
- `auditar_desenhos({ marcas })` → `Auditar.exe <dentroDaSaida(saida,"auditoria")> <marca...>` → `dados.problemas[]`
- `conteudo_desenho({ marcas })` → `DesenhoConteudo.exe <marca...>` → contagens por desenho
- `capturar_desenho({ marca })` → `VerDesenho.exe <marca> <dentroDaSaida(saida,"capturas",marca+".png")>` → `dados.imagem`; timeout 180 s
- `resumo_ifc({ obra, arquivo })` → `RncCheck.exe resumo <dentroDaSaida(saida,"anexos",obra,arquivo)>`

- [ ] **Step 1:** Testes de argumentos/validação. → FAIL
- [ ] **Step 2:** Implementar → PASS; `npm test` inteiro verde
- [ ] **Step 3:** Commit `feat(conector): ferramentas de verificação de desenho e resumo de IFC`

### Task 6 (sessão do Windows): `--json` nos EXEs e build

**Files (repo torg-engenharia, raiz):** `build.ps1`; `src/SelecionarIds.cs`, `DestacarPeca.cs`, `ZoomCaptura.cs`, `LimparSelecao.cs`, `NomearConjuntos.cs`, `MontarSpec.cs`, `DesenhoCroquis.cs` (Croquis.exe), `Desenhos.cs`, `MarcasDesenho.cs`, `IfcToTekla.cs`, `NumerarBlanks.cs`, `DesenhoCotas.cs` (Cotas.exe), `DesenhoAuditar.cs` (Auditar.exe), `DesenhoConteudo.cs`, `VerDesenho.cs`, `IfcDump.cs` (RncCheck.exe)

- [ ] **Step 1:** `build.ps1` compila todos acima com o nome de EXE que o conector usa (os que faltam hoje: SelecionarIds, DestacarPeca, ZoomCaptura, LimparSelecao, NumerarBlanks, MontarSpec, Croquis, Cotas, Auditar).
- [ ] **Step 2:** Em cada EXE, `--json` como primeiro argumento → um JSON `{ok,dados,avisos,erro}` no stdout conforme CONTRATO-JSON.md (regras gerais 1–7); sem `--json`, comportamento de hoje intacto.
- [ ] **Step 3:** Rodar `conector/test` contra os EXEs reais NÃO é possível; validar cada ferramenta pelo Claude Code do PC (`claude mcp add torg-tekla …`) numa CÓPIA de modelo, anotando no CONTRATO-JSON.md o `dados` real de cada uma.
- [ ] **Step 4:** Commit por grupo (levar até · escrita · destrutivas · verificação) `feat(ferramentas): modo --json em <EXEs>`.
