---
name: torg_app_ia_rotas
description: Rotas /api/engenharia-ia/app/* do app Torg Metal IA (F2a) — auth por token do aparelho, regras do roteiro de 6 etapas, download em stream
metadata:
  type: project
---

O app desktop da Engenharia fala com o portal só por `/api/engenharia-ia/app/*`.

| Rota | Faz |
|---|---|
| `GET documentos` / `documentos/arquivo` | lista e baixa os documentos da obra (a lista segue a paginação do SharePoint por dentro) |
| `POST listas` | importa LE/LPC e devolve recibo **previsto × gravado** (`lib/app-listas.js`) |
| `GET/POST roteiro` | roteiro de 6 etapas da obra (`lib/roteiro-engenharia.js`) |
| `GET grd?op=&desde=` | confirma que a GRD (FORM 09) entrou; devolve `ultimaLeitura` do cron `grd-sincronizar` (11/17/21h) |

⚠⚠ **Auth**: token do APARELHO pareado (F1), nunca sessão. Toda rota é `comAparelho(req, fn)`
(`lib/ia-aparelho-auth.js`); o `middleware.js` deixa passar o prefixo `/api/engenharia-ia/app/` justamente
porque a checagem é feita ali. Erro sempre `{ ok:false, error }`.

**OP**: "89" e "089" são a mesma obra — casar as duas formas, nunca "189".

### Roteiro (regras)
- 6 etapas; **por fase** são as 4–6; **opcionais** a 2 e a 6.
- ⚠ **Divergência nunca some**: ao mesclar, a que já existe aberta não desaparece por o app não reenviá-la.
- **Aceite limpa ao reabrir** a etapa (aceite vale só para a CONCLUIDA).
- **Trava por OP** (`comTravaDaObra`) em toda gravação; mudança grava `AuditLog`; pendentes devolvem 409.

### Listas (LE/LPC) — o que é recusado ANTES de gravar
- ⚠⚠ **LPC só com chave de FASE** (`T94A`, no nome do arquivo ou nas marcas) **e da MESMA OP** pedida
  (`T094A` serve para a OP 94, não para a 89). Sem fase ela cairia no número da OP e duplicaria as peças que já
  estão sob a fase (incidente OP-094, 591 marcas); fase de outra OP faria banco, pasta do SharePoint e recibo
  discordarem. Ambos = 400.
- **LPC + `sobrescrever:true` = 400**: o merge da LPC só complementa (preserva progresso de produção).
- **LE para OP que não existe = 404** "OP <n> não encontrada no portal", antes de qualquer escrita. A regra é a do
  import da tela (`resolverOpDaLe` de `lib/importar-le-core.js`: exato, senão número sem zero à esquerda, só
  com match único) — a tela continua gravando órfã e avisando; o app não.
- O recibo traz `opEncontrada`, `opCadastrada` ("089") e `chaveGravada` ("089" na LE, a fase na LPC).

### Arquivos
⚠ A Vercel corta corpo/resposta em ~4,5 MB: o download do documento sai em **stream**, o upload de lista
tem teto de 4 MB em base64 (413 legível), e a lista segue a paginação do SharePoint por dentro.

### Antes do deploy
⚠⚠ Rodar **`scripts/ensure-roteiro-engenharia.mjs` em produção ANTES** de liberar a versão do app que usa
`/roteiro` (cria a tabela e o índice único de expressão); sem isso `roteiro` dá **500 "falha interna"**.
⚠ O índice único (`COALESCE(fase,-1)`) mora **só no script** — `prisma db push` o derruba; rode o script de novo
depois de qualquer push.
