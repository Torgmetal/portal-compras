---
name: torg-acesso-notificacoes
description: "Portal Compras Torg — modelo de acesso (modulos[]) e gotcha das notificações in-app serem só de Compras"
metadata: 
  node_type: memory
  type: reference
  originSessionId: f0eb7362-df04-4e12-8b97-4a78c7f30111
---

Arquitetura de **controle de acesso e notificações** do Portal de Compras (descoberto 2026-06).

**Acesso = `user.modulos[]` (lista), não um campo `role` único.**
- `user.tipo` é só `ADMIN` vs `USUARIO`. O acesso real vem do array `user.modulos` (ex: `PRODUCAO`, `ENGENHARIA`, `COMPRAS`, `COMERCIAL`, `FINANCEIRO`, `EXPEDICAO`, `RH`, `ALMOXARIFADO`, `REQUISICOES`, `PLANEJAMENTO`, `PCP`).
- `requireRole(["ADMIN","PRODUCAO"])` (lib/session.js): ADMIN (tipo) sempre passa; senão precisa ter **algum** dos módulos listados em `modulos[]`. Ou seja, as strings em `requireRole` são **nomes de módulo**, não roles. Para liberar engenharia: adicionar `"ENGENHARIA"` à lista.
- `middleware.js` faz o gate por prefixo de rota usando `token.modulos` (helper `temModulo(...)`). Ex: `/producao/*` exige módulo `PRODUCAO`; `/rm` é aberto a qualquer logado. Para abrir um subcaminho a outro módulo, inserir a exceção **antes** do gate geral (ex: `/producao/consulta-estoque` liberado p/ PRODUCAO ou ENGENHARIA).
- **Inconsistência pré-existente**: guards de página às vezes listam módulos que o middleware bloqueia (ex: COMERCIAL no guard de `app/producao/consulta-estoque/page.js` mas middleware `/producao` só deixa PRODUCAO). O middleware vence.
- **Gotcha PCP × `/api/producao/pecas/*`**: o gate de `/pcp` libera **PCP+PLANEJAMENTO+PRODUCAO**, mas vários endpoints de peças eram `["ADMIN","PRODUCAO"]` só → o pessoal do PCP levava **"Forbidden" ao subir a LPC** (e ao liberar corte/montagem/mover setor). Corrigido 2026-06-16 (commit 8fda7a1): `importar-lpc`, `liberar-corte`, `liberar-montagem`, `mover-setor` → `["ADMIN","PCP","PLANEJAMENTO","PRODUCAO"]`, alinhando com `atribuir-maquina`/`importar-lpc-revisao`/`marcar-conjunto`. **Regra:** endpoint novo do fluxo de produção/PCP deve aceitar essas 4 roles. **Ainda PRODUCAO-only** (fluxo de import via SharePoint, não o upload): `sharepoint-drives`, `sync-lpc-sharepoint` — ampliar se o PCP usar a importação por SharePoint.
- **Gotcha — módulo novo precisa ser declarado em 4+ lugares.** `Modulo` enum (schema) + `MODULOS_VALIDOS` (Zod) em **AMBOS** `/api/admin/usuarios/route.js` (POST) **e** `[id]/route.js` (PUT) + `MODULOS_OPCOES` (front `app/admin/usuarios/novo/_form.jsx` e `[id]/page.js`) + gate no `middleware.js`. Em 2026-06-16 o **QUALIDADE** estava no enum/front/middleware mas faltava nos dois `MODULOS_VALIDOS` → liberar Qualidade dava **400 "Dados inválidos"** (corrigido commit 22d518a). Ao criar módulo novo, conferir os 4.

**Gotcha — o sino/feed de notificação in-app é só COMPRAS+ADMIN.**
- `GET /api/notificacoes` e a tela `/compras/notificacoes` têm `requireRole(["ADMIN","COMPRAS"])`. `criarNotificacao()` (lib/notificacoes.js) grava uma linha **global, sem destinatário**.
- Logo, **Produção e Engenharia NÃO veem notificação in-app** — o gatilho real pra eles é **e-mail** (Resend). Ao criar fluxo que avisa não-Compras, mandar e-mail; não confiar no sino.

**Fluxo Consulta de Estoque** (contexto): Compras abre consulta numa RM (`POST /api/rm/[id]/consulta-estoque`, guard COMPRAS) → e-mail aos usuários PRODUCAO **e ENGENHARIA** com link `/producao/consulta-estoque/[id]` → respondem em `ConsultaEstoqueResponder` (`POST .../responder`). Engenharia passou a responder em 2026-06. Ver [[torg-rh-documentos]] para o outro padrão de guard ADMIN/RH.

🚨 **`QUALIDADE_CAMPO` e `FISCAL` existiam no código e NÃO no enum `Modulo` (corrigido 24/08/2026).** Vitor precisava criar login de **inspetor externo** com acesso só ao portal de campo; `lib/qualidade-campo.js` já dizia *"os 5 inspetores (3 internos, 2 externos) têm SÓ este"*, mas o valor não existia no banco — a única saída era dar `QUALIDADE` inteiro, que abre **todas** as obras, relatórios, certificados e data books. O `FISCAL` era pior: a tela de admin **oferecia** no seletor e estourava na gravação.

- Os dois entraram no enum (`ALTER TYPE "Modulo" ADD VALUE`, já em produção).
- ⚠️ A lista de módulos saiu das DUAS telas do admin para **`lib/modulos.js`** (`MODULOS_OPCOES`). Duplicada foi exatamente como o "Fiscal" existiu nos seletores e em lugar nenhum do banco.
- Quem tem **só** `QUALIDADE_CAMPO` cai em **`/campo`** ao entrar (antes ia para "/" e batia em página sem permissão). O portal de campo tem login próprio em `/campo/entrar`.
- ⚠️ **Não há escopo por OP**: quem tem um módulo vê todas as obras dele. Para alguém de fora que só precisa CONSULTAR, o caminho é o portal por token ([[torg_auditorias_externas]], [[torg_apresentacao_cliente]]), não um login.
