# Torg Engenharia — app de projeto por prompt no Tekla

**Data:** 14/10/2026 · **Pedido:** Vitor · **Status:** F0 aprovada para começar

## O que é

Um aplicativo da Torg para os 4 projetistas (Tekla Structures 2025) em que o projetista escreve o pedido
("crie as terças do eixo A ao F com U 150", "gere as listas da fase 2") e o Claude executa **no Tekla do
computador dele** — como a sessão "Tekla project automation setup" faz hoje no PC do Vitor.

Vitor (14/10/2026): *"quero um app de respeito com uma interface notória e com um visual autêntico"*.

## Arquitetura (3 blocos)

1. **Conector `torg-tekla` (Windows, no PC de cada projetista)** — servidor MCP (Node 20+, `@modelcontextprotocol/sdk`,
   stdio) com uma **lista fechada** de ferramentas. Cada ferramenta chama um dos EXEs C# que já existem
   (Tekla Open API, .NET Framework 4.x). **Sem terminal livre**: é o que mantém o uso dentro da Engenharia e
   protege o PC.
2. **App "Torg Engenharia" (Windows)** — Electron + Claude Agent SDK (o harness do Claude Code), com interface
   própria (ver *Direção visual*). Confere o estado do Tekla antes de agir e pede confirmação antes de alterar o
   modelo.
3. **Portão no portal (nuvem, workspace.torg.com.br)** — o app entra com o login do portal; toda chamada ao
   Claude passa por uma rota do portal que confere setor (ENGENHARIA), saldo do mês, registra uso e encaminha à
   Anthropic com a chave da empresa (`ANTHROPIC_BASE_URL` do Agent SDK apontando para o portão). **A chave nunca
   fica no PC.** Tela de admin com teto e consumo por projetista.

⚠ **Assinatura não é motor de app próprio.** O app é cobrado pela API (Console). O plano Team inclui
"até US$ 500/mês em créditos de API compartilhados" — condições não publicadas; **confirmar com a Anthropic**
se valem para app próprio antes de contar com eles.

## Fases

| Fase | Entrega | Onde |
|---|---|---|
| **F0** | `Tekla-Ferramentas` no git + build reproduzível + conector `torg-tekla` com ferramentas de **leitura**, testado com o Claude Code no PC do Vitor | Windows (sessão do Tekla) |
| F1 | Portão no portal (auth por dispositivo, setor, saldo, log) + tela de limites | Mac (portal) |
| F2 | App Electron, piloto com 1 projetista, ferramentas de **escrita** com confirmação | Windows + Mac |
| F3 | Os 4 projetistas, instalador, atualização automática | Windows |

## F0 em detalhe

**Base (fatos da sessão do Tekla, 14/10/2026):** EXEs de console em `C:\Users\VitorCosta\Desktop\Tekla-Ferramentas`
(`src\*.cs`, `bin\*.exe`, `build.ps1` desatualizado — o ListasTORG precisa também de `ChapasCompra.cs`), compilados
com o `csc.exe` do .NET Framework 4.x (C# 5), referenciando `C:\TeklaStructures\2025.0\bin\Tekla.Structures*.dll`;
utilitários soltos em `C:\Temp\des` e `C:\Temp\pref`. Não é repositório git. Não há MCP server.

1. **Repositório git** com fontes, `build.ps1` corrigido (compila tudo, inclusive ListasTORG com ChapasCompra.cs)
   e os utilitários de `C:\Temp\des`/`C:\Temp\pref` que o conector usar. Binários fora do git (gerados pelo build).
2. **Saída padronizada dos EXEs que o conector chama:** modo `--json` → stdout com
   `{ "ok": bool, "dados": …, "avisos": [], "erro": null }`, código de saída ≠ 0 em erro. Texto humano continua
   no modo normal (não quebrar quem usa hoje).
3. **Conector `torg-tekla` — ferramentas de LEITURA (F0):**
   - `estado_tekla` — Tekla aberto? quantas instâncias? modelo aberto (nome, caminho)? licença (edição × Graphite)?
     janela modal aberta (título)? → mensagem clara em português quando algo impede.
   - `ler_selecao` — objetos selecionados com tipo, perfil, material, comprimento, peso, UDAs principais.
   - `propriedades` — report properties de objetos por id.
   - `listar_conjuntos` — conjuntos/peças de uma fase ou filtro (marca, perfil, peso).
   - `conferir_numeracao` — lacunas, peças sem número, "(?)".
   - `verificar_colisoes` — clash check (só leitura do resultado).
   - `gerar_listas` — ListasTORG (LE/LPC/RM/MAT/APV/MJ) em arquivo; não altera o modelo.
4. **Guardas no conector:** só executa EXEs de uma lista fixa (caminho absoluto), timeout por ferramenta,
   detecção de diálogo modal (devolve "o Tekla está esperando você responder: <título>" em vez de travar),
   recusa se houver duas instâncias do Tekla, nunca mexe em `.locked`.
5. **Teste:** registrar o conector no Claude Code do PC do Vitor (`claude mcp add`) e validar cada ferramenta numa
   **cópia** de um modelo (nunca no modelo de produção de uma obra).

**Fora da F0:** ferramentas de escrita (montar_spec, numerar, nomear_conjuntos, desenhos), app, portão.

## Direção visual (F2) — "de respeito, notória, autêntica"

Ferramenta de engenharia, não chat genérico. Identidade Torg: navy `#002945`, azul `#006EAB`, laranja `#F4801F`,
cinza `#576D7E`, fonte Saira.

- **Tela escura de trabalho** (projetista fica horas nela), com o laranja reservado para ação e confirmação.
- **Três colunas:** conversas/obras à esquerda; ao centro o pedido e o **plano do Claude como cartões de etapas**
  (cada ferramenta usada vira um cartão com o que leu ou vai alterar); à direita o **contexto vivo do modelo**
  (obra aberta, fase, seleção atual, estado da licença).
- **Barra de confirmação** antes de alterar o modelo: "Vai criar 12 terças U150 nos eixos A–F · Confirmar / Ajustar".
- Estado do Tekla sempre visível (chip verde/âmbar/vermelho), em português, dizendo o que fazer.
- Mockup para aprovação do Vitor antes da F2.

## Decisões pendentes (Vitor)

- Repositório: separado (`torg-engenharia`, privado) ou dentro do portal-compras.
- Confirmação: toda alteração (recomendado no piloto) ou só destrutivas.
- Teto inicial por projetista/mês (sugestão US$ 100) e projetista do piloto.
- Créditos de API do Team: confirmar com a Anthropic.
