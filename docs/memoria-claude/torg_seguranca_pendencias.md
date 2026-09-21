---
name: torg-seguranca-pendencias
description: "Portal Compras Torg — estado da segurança: o que foi corrigido, o que continua aberto e as decisões que não podem ser reabertas por engano"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-29T14:21:15.744Z
---

Varredura ampla em 2026-06-09 e nova varredura em 2026-08-28 (relatório: artifact "Segurança do Portal Torg"). O que ficou **decidido** e o que continua **aberto**:

## Decisões que NÃO podem ser reabertas por engano

- **Limitador de login é POR CONTA, no banco** (`User.tentativasFalhas`/`bloqueadoAte`, `lib/login-tentativas.js`) — **nunca por IP**: a Torg inteira (escritório + fábrica) sai pelo mesmo IP público, e limitar por IP trancaria o expediente junto com o atacante. O limitador de `lib/rate-limit.js` é em memória (um Map por instância serverless) e por isso não serve para senha.
- **`npm audit fix --force` está PROIBIDO**: ele joga `exceljs` de 4.4.0 para **3.4.0** (quebra) e arrebenta o FORM 22 dos romaneios e as planilhas do padrão Torg. Usar sempre `npm audit fix` sem `--force`. E nunca `--omit=dev` (apaga o tailwind e quebra o build).
- **Tokens antigos de fornecedor NÃO são regenerados sem combinar dia** (Vitor, 29/08/2026): derrubar link de cotação ativa significa não saber o que falta cotar. Vale para `FreteCotacao`, `EstudoCotacao`, `CronogramaCobranca`, `CobrancaMarco` — os quatro com `@default(cuid())` no schema. O código **novo** já grava `gerarTokenForte()`; o problema é só o registro antigo.
- **Nunca testar senha contra hash guardado**, nem como auditoria. A conferência da senha de cadastro é feita **no login**, com o texto que a pessoa acabou de digitar (`ehSenhaDeCadastro`). Tentar rodar o teste offline contra a produção é bloqueado — e com razão.

## Corrigido em 29/08/2026

- Trava de força bruta no login e em `/api/trocar-senha` (8 erros → 15 min), **antes** do bcrypt.
- Senha de cadastro (`Primeiro@2026!` do `scripts/seed-team.mjs`, `TorgAdmin2026!` do `prisma/seed.mjs`) obriga troca. O middleware passou a respeitar `deveTrocarSenha` **também no portal interno** — antes só `/colaborador` respeitava.
- `/api/trocar-senha` e `/api/esqueci-senha` passaram a limpar `deveTrocarSenha` e gravar `senhaAlteradaEm`. **Antes só `/api/meu-rh/trocar-senha` fazia**, então o campo mentia sobre quem já tinha trocado (25 de 32 contas apareciam como "nunca trocou").
- `next-auth` 4.24.15 (crítica do "@" homóglifo) + nanoid, postcss, undici, form-data.

## Backup — [[torg_backup_banco]]

Antes de 29/08/2026 **não existia backup nenhum do banco**. Agora há dump semanal (domingo 4h) em `SERVIDOR › Workspace › Backup - Portal › AAAA-MM-DD`. Pasta com acesso restrito a Vitor e Matheus Martha (verificado por Vitor em 29/08) — o dump tem hashes de senha, holerites e custos.

## Continua ABERTO

1. **Retenção do Neon** — ninguém confirmou de quantos dias é a janela de restauração (depende do plano). Não temos `NEON_API_KEY` no ambiente, só `NEON_PROJECT_ID`, então não dá para consultar por código: é no console.
2. **`next` 14 → 16** — várias CVEs só corrigem lá (major, com quebras). A cópia vulnerável do `postcss` é a que vem presa dentro do Next e só anda junto.
3. **`xlsx` 0.18.5** — prototype pollution + ReDoS, sem correção no npm. Saída: pacote oficial da SheetJS ou consolidar em `exceljs`.
4. **`MES_SYNC_API_KEY` não rotacionada** desde o incidente de 01/06/2026 — ver [[torg_mes_syneco]].
5. **Conta com senha de cadastro que nunca faz login** continua com ela: a trava cobre o ataque automatizado, não o palpite de quem conhece o formato.
6. **Scripts de seed** ainda geram senha previsível (não refatorados para senha aleatória).

⚠️ `tar`, `prisma` e `deepmerge-ts` aparecem no `npm audit` mas **não estão na árvore de produção** (`npm ls tar --omit=dev` vazio) — são do CLI de build, sem exposição real. Não gastar tempo com eles.

Helpers a usar em código novo: [[torg_libs_compartilhadas]].
