---
name: torg_app_ia_rotas
description: Rotas /api/engenharia-ia/app/* do app Torg Metal IA (F2a) — auth por token do aparelho, regras do roteiro de 6 etapas, download em stream
metadata:
  type: project
---

O app desktop da Engenharia fala com o portal só por `/api/engenharia-ia/app/*`.

| Rota | Faz |
|---|---|
| `GET documentos` / `documentos/arquivo` | lista (paginada) e baixa os documentos da obra |
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

### Arquivos
⚠ A Vercel corta corpo/resposta em ~4,5 MB: o download do documento sai em **stream**, o upload de lista
tem teto de 4 MB em base64 (413 legível), e a listagem pagina.

### Antes do deploy
⚠⚠ Rodar **`scripts/ensure-roteiro-engenharia.mjs` em produção ANTES** de subir (cria a tabela do roteiro);
sem isso `roteiro` dá 500.
