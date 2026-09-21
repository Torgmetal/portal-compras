---
name: torg_vagas_recrutamento
description: RH › Vagas/Recrutamento — e-mail de aprovação (RH↔aprovadores) + gerador de arte p/ redes sociais
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-18T11:25:39.010Z
---

`/rh/vagas` (model **`Vaga`**: status SOLICITADA→APROVADA→EM_RECRUTAMENTO→PREENCHIDA/CANCELADA; setor/cargo/quantidade/tipo/prioridade/salarioFaixa/justificativa/requisitos). Tela = `VagasClient.jsx`. Fluxo de status já existia (botões Aprovar/Iniciar Recrutamento/Marcar Preenchida/Cancelar via PATCH `/[id]`).

**EDITAR vaga depois de aberta (18/08, commit 4ea2797):** antes o form SÓ criava (POST) — não dava pra corrigir o **nome do cargo/título** depois (Vitor pediu). Agora cada card tem botão **Editar (lápis)** no topo → abre o MESMO modal pré-preenchido (`editandoId`+`abrirEdicao`) e salva via **PATCH `/api/rh/vagas/[id]`**. O `patchVagaSchema` ganhou `setorId/cargoId/tipo/nivelCargo` (já tinha titulo/prioridade/quantidade/justificativa/requisitos/salarioFaixa). No cliente, `""` de cargo/nível vira `null` (limpa). A lista já vem com todos os escalares (GET usa `include` sem `select`), então o pré-preenchimento é completo. Lista atualiza no lugar.

**Adicionado 13/08 (commit dff06b2), a pedido do Vitor:**

1. **E-mails de aprovação** — rota `POST /api/rh/vagas/[id]/notificar {tipo}`:
   - `SOLICITAR_APROVACAO` → e-mail aos **aprovadores = usuários tipo ADMIN** (RH pede a liberação). Botão "Solicitar aprovação" aparece na vaga **SOLICITADA**.
   - `APROVADA` → e-mail ao **time de RH = usuários com módulo RH** (libera o recrutamento). Botão "Avisar RH" aparece na vaga **APROVADA**.
   - Padrão de e-mail do portal: `cabecalhoEmail()` (navy+laranja) + botão #006EAB + tabela com os dados da vaga + link p/ `/rh/vagas`. `requireRole(["ADMIN","RH"])`, auditLog. Destinatários filtrados em JS (modulos vêm como objetos no DB) — `norm()`.
   - **Destinatários hoje**: ADMIN = Vitor, Matheus, Fabrine, Caio, Guilherme · Módulo RH = Charles (charlesccrepaldi@gmail.com), Pamela (adm@torg.com.br), Eduarda (financeiro@torg.com.br). Se o Vitor quiser estreitar (ex.: avisar só a Pamela), é ajuste de filtro.

2. **Gerador de arte** (redes sociais) — botão "Gerar arte" nas vagas APROVADA/EM_RECRUTAMENTO → `ArteModal` **100% client-side (canvas)**, a foto **não sai do dispositivo**:
   - Formatos **Feed 1080×1080** e **Story 1080×1920**; baixa PNG (`canvas.toDataURL`).
   - Fundo = **banco de imagens EXCLUSIVO do RH** em **`/public/rh/banco`** (12 fundos por cargo/setor: producao, soldador, operador-maquina, qualidade, engenharia, expedicao, auxiliar, auxiliar-soldador, engenharia-qualidade-adm + variantes -2) + upload avulso (FileReader→dataURL). Lista = `FUNDOS_RH` em `VagasClient.jsx`; rótulo "Imagem de fundo". **Trocado 18/08** (commit 10fc0fc): antes usava `/public/obras` (planta-industrial/ponte-sunset/ponte-trelica/torre-escada) — que é COMPARTILHADA com login/fornecedores/home e não fazia sentido pra vaga; Vitor mandou 12 imagens de fábrica (nomeadas por cargo), otimizadas PNG→JPEG (25MB→5MB). **Como adicionar/trocar:** Vitor manda os arquivos (não dá pra puxar imagem colada no chat — só recebo preview, sem bytes), eu otimizo (sips PNG→JPEG q80, same-origin p/ canvas.toDataURL não tainar) e registro em `FUNDOS_RH`. IDEIA não pedida: auto-selecionar o fundo pelo setor/cargo da vaga (nomes já batem).
   - Composição (**enxugada a pedido do Vitor 13/08**): gradiente navy + logo `/torg-logo-white.png` (topo-esq) + acento laranja + pill "ESTAMOS CONTRATANDO" (editável) + título=cargo (wrap ≤3 linhas c/ elipse) + **só o setor** (SEM salário, SEM tipo/CLT, SEM quantidade de vagas) + **mensagem** (editável, wrap ≤2, default de pertencimento "Venha fazer parte de uma equipe engajada em crescer e construir grandes obras.") + **selos de benefícios** (chips de vidro c/ check laranja, campo "Benefícios" separado por vírgula, default "Plano de Saúde, Vale Refeição", wrap automático — `chipsLayout`/`drawChips`) + contato. Cores navy `#0D1F3C` / laranja `#F4801F`.
   - **Contato padrão dos currículos = `rh@torg.com.br`**.
   - **Campo "Requisitos (um por linha)" (18/08, commit cda1235):** pré-preenchido de `vaga.requisitos`; `parseReqs` aceita um-por-linha, `;` ou vírgula (texto corrido). Renderiza bloco **"REQUISITOS"** (título laranja + bullets, entre mensagem e benefícios) E entra na legenda. **Auto-ajuste do canvas (pra nunca invadir o logo):** título de cargo LONGO que precisa de 3 linhas encolhe **90→70px** (passa a caber inteiro, sem "…"); requisitos que não couberem viram **"+N requisitos"** (Feed 1080² é apertado — mostra ~2-4; Story mostra mais). O bloco inferior é medido (`fixoH`+trim) e alinhado à base com guarda de `M+90` abaixo do logo. Validado headless (napi-canvas): Feed título curto=4/4, título longo=2/4+"+2", Story=4/4.
   - **Não repete o setor (05515e9):** a linha do setor (`setorTxt`) só aparece quando AGREGA; some quando o cargo já contém o setor (`semAcento(titulo).includes(semAcento(setor))`) — ex.: "Inspetor de Qualidade" + "Qualidade" mostrava "Qualidade" 2× (Vitor: "tire essa repetição"). Vale na arte e na legenda. Bônus: sem a linha, sobra espaço → cabem mais requisitos.
   - Campo **"Legenda para o post"** (textarea + botão Copiar): caption pré-montada (vaga + setor + mensagem de pertencimento + **requisitos** + rh@ + hashtags), sem salário/quantidade, pronta p/ colar no Insta/Face/LinkedIn.
   - Histórico do tom: Vitor primeiro pediu "benefícios além do salário", depois preferiu **tirar salário/CLT/quantidade** e usar mensagem de pertencimento/engajamento. Tudo é editável no modal.
   - Validado headless com `@napi-rs/canvas` (Arial cai p/ fallback no headless; no navegador é Arial real).

**Status 13/08:** rodando em prod, aprovado pelo Vitor ("ok está rodando, vamos finalizar depois"). Fluxo de e-mail + Gerar arte (com benefícios) funcionando.

**Ofertado p/ "finalizar depois" (não pedido ainda):** ícones por tipo de benefício (🩺/🍽️); lista fixa de benefícios da empresa pré-preenchida em toda vaga; estreitar destinatário do "Avisar RH" (hoje vai p/ todo o módulo RH); página pública de candidatura (hoje o contato é o e-mail rh@torg.com.br na arte/legenda).

Verificação de canvas/arte offline: `@napi-rs/canvas` **precisa do binário explícito** `@napi-rs/canvas-darwin-arm64` (bug de optionalDeps do npm) — senão "Cannot find native binding". Browser pane bloqueia localhost e roda file:// como snapshot estático (CSP script-src none) — não serve p/ testar canvas.
