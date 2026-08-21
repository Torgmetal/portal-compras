# Agente de E-mails da Engenharia — arquitetura e plano

> **Documento vivo.** Autor: Matheus + Claude. Objetivo: ler as caixas de entrada/saída
> da Engenharia (Microsoft 365) pra saber **quando o cliente deu start no projeto** (ex.: IFC),
> **pra quem chegou, que dia/hora, quanto tempo sem resposta e quem respondeu** — e usar isso
> pra (a) mostrar na **aba Resumo da OP** e (b) **preencher o cronograma** de projeto e medir o
> SLA da Engenharia.

Legenda: ✅ feito · ⏳ pendente/decisão · 🔜 próximo passo · 🔒 ação de ADMIN (Matheus/Vitor).

---

## 0. Resumo executivo

Dá pra fazer **reaproveitando o app do Azure que já existe** (o mesmo que move o SharePoint:
`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`, token em
[`lib/sharepoint.js`](../lib/sharepoint.js) `getAccessToken()`, *client credentials* app-only).
Pra ler e-mail falta **1 permissão** (`Mail.Read`) + **consentimento de admin** + **1 política de
escopo** que trava a leitura **só nas caixas da Engenharia**. Depois é código no padrão do portal
(cron + Prisma + tela).

---

## 1. Duas decisões das respostas (ajustes de desenho)

**(1) Escopo = CAIXAS da Engenharia, não "palavra no e-mail".**
Você respondeu "todos os e-mails que tenham a palavra engenharia". Tecnicamente, a leitura
segura é **por CAIXA** (a política de acesso do Exchange é por mailbox). Então o escopo será
**as caixas cujo endereço contém `engenharia`** (ex.: `engenharia@torg.com.br` e afins) — e, se
quiser, aplicamos o **filtro da palavra "engenharia" DEPOIS**, já dentro dessas caixas.
> ⚠️ Ler "qualquer e-mail da empresa que contenha a palavra engenharia" exigiria leitura
> **de toda a organização** (`Mail.Read` sem restrição) — **não recomendado** (privacidade/LGPD).
> Confirmar a lista exata de caixas (seção 3).

**(2) O "start" NÃO é só IFC.**
Você disse que nem sempre o cliente manda IFC. Então o marco de início é **configurável e
multi-gatilho**: o agente sempre registra o **1º contato do cliente** na thread e classifica o
**tipo de gatilho** (IFC recebido, liberação de projeto, planilha/levantamento, "pode iniciar",
etc.). O cronograma usa o **primeiro gatilho válido** da obra, não só o IFC.

---

## 2. A peça central — Microsoft Graph (Mail)

Cada mensagem no Graph traz o que precisamos:

| Campo Graph | Uso |
|---|---|
| `from`, `toRecipients`, `ccRecipients` | quem mandou / **pra quem chegou** |
| `receivedDateTime` / `sentDateTime` | **dia e hora** de entrada/saída |
| `subject`, `bodyPreview` | assunto + snippet (casar com a OP) |
| `conversationId` | **amarra a thread** (1º e-mail ↔ resposta) |
| `internetMessageId` | dedupe idempotente |
| `hasAttachments` + `/attachments` | detectar **IFC** (`.ifc`) e outros anexos |

**Tempo de resposta:** dentro de um `conversationId`, pego o **1º inbound do cliente** e a
**1ª resposta outbound da Engenharia** → `respondidoEm − recebidoEm` = SLA. "Sem resposta" =
thread aberta sem nenhum outbound da engenharia (conta o tempo desde o recebido).

---

## 3. ✅ Fase 0 — CONCLUÍDA (18/08/2026)

Feita como admin. Estado: `Mail.Read` concedido no app `Torg Portal SharePoint`
(`1e76f3e9-2d81-4935-955e-da52fdbca442`); grupo `SG-Engenharia-GraphMail` criado com as 6 caixas;
`ApplicationAccessPolicy` (RestrictAccess) aplicada. **Teste OK:** engenharia@ = *Concedido*,
vitor@ = *Negado*. O app lê **só** as 6 caixas da Engenharia. Passos abaixo ficam de registro.

**Caixas da Engenharia (6):** `engenharia@`, `engenharia1@`, `engenharia2@`, `engenharia3@`,
`engenharia4@`, `engenharia5@` `torg.com.br`.

**(a) Definir as caixas da Engenharia** (grupo de segurança com correio):
```powershell
# Exchange Online PowerShell (Connect-ExchangeOnline)
New-DistributionGroup -Name "SG-Engenharia-GraphMail" -Type Security `
  -PrimarySmtpAddress sg-engenharia-graphmail@torg.com.br `
  -Members engenharia@torg.com.br,engenharia1@torg.com.br,engenharia2@torg.com.br,engenharia3@torg.com.br,engenharia4@torg.com.br,engenharia5@torg.com.br
```

> **App do portal confirmado:** `Torg Portal SharePoint` — **AppId `1e76f3e9-2d81-4935-955e-da52fdbca442`**
> (é o que tem as permissões Graph `Files.Read.All` / `Sites.Read.All` / `Sites.ReadWrite.All` já
> concedidas; o `AZURE_CLIENT_ID` no Vercel é write-only, por isso não dá pra ler o valor lá).

**(b) ✅ FEITO — Azure Portal → App registrations → `Torg Portal SharePoint` → API permissions:**
`Mail.Read` (Application) adicionado + **admin consent concedido** (✔ Concedido para Torg Metal).
> ⚠️ Enquanto a política do Exchange (item c) não for aplicada, o `Mail.Read` é **org-wide** —
> aplicar (c) é o que restringe a leitura só às 6 caixas da Engenharia. Fazer ANTES de usar.

**(c) Exchange Online → travar o app só nesse grupo (ApplicationAccessPolicy):**
```powershell
# AppId confirmado do "Torg Portal SharePoint"
New-ApplicationAccessPolicy -AppId 1e76f3e9-2d81-4935-955e-da52fdbca442 `
  -PolicyScopeGroupId sg-engenharia-graphmail@torg.com.br `
  -AccessRight RestrictAccess `
  -Description "Portal Torg - Graph Mail so nas caixas da Engenharia"

# testar (pode levar ~30 min pra propagar)
Test-ApplicationAccessPolicy -Identity engenharia@torg.com.br -AppId 1e76f3e9-2d81-4935-955e-da52fdbca442   # Granted
Test-ApplicationAccessPolicy -Identity vitor@torg.com.br      -AppId 1e76f3e9-2d81-4935-955e-da52fdbca442   # Denied
```
> Depois disso, qualquer chamada do app a uma caixa **fora** do grupo é negada pelo próprio
> Exchange — garantia de que o portal só enxerga a Engenharia.

**(d) Env** (Vercel + `.env.local`): reusa `AZURE_*`; adiciona
`ENG_MAILBOXES=engenharia@torg.com.br,...` (lista das caixas a varrer).

---

## 4. Ingestão — como o agente "escuta" (Fase 1)

- **Delta Query** por caixa e por pasta: `GET /users/{caixa}/mailFolders/inbox/messages/delta`
  e `.../sentItems/messages/delta`. O Graph devolve só o que mudou desde a última vez; guardo o
  `deltaLink` por caixa/pasta (bookkeeping) e retomo dali.
- Roda num **cron Vercel** (padrão do portal: `aquecerBanco`, `maxDuration=60`, escrita resiliente).
- Cada ciclo: novidades → dedupe por `internetMessageId` → classifica (seção 6) → grava eventos.
- **Evolução (Fase 4):** Webhooks/Subscriptions do Graph pra near-real-time (notifica em segundos);
  exige endpoint público + renovação de subscription. Só se a latência do cron não bastar.

---

## 5. Modelo de dados (Prisma — aditivo, sem `db push`)

```prisma
model ObraEmailEvento {
  id               String   @id @default(cuid())
  opId             String?  // vínculo com a OP (null enquanto não casou)
  caixa            String   // mailbox de origem (qual caixa da engenharia)
  conversationId   String   // thread do Graph
  internetMessageId String  @unique // dedupe
  direcao          String   // ENTRADA | SAIDA
  de               String
  para             Json     // [endereços]
  cc               Json?
  assunto          String?
  snippet          String?  // bodyPreview (sem corpo inteiro)
  recebidoEm       DateTime?
  enviadoEm        DateTime?
  temAnexoIfc      Boolean  @default(false)
  anexos           Json?    // [{ nome, tipo, tamanho }] — metadados só
  tipoGatilho      String?  // IFC_RECEBIDO | LIBERACAO_PROJETO | LEVANTAMENTO | OUTRO
  primeiroContato  Boolean  @default(false) // 1º inbound do cliente na thread
  matchConfianca   Float?   // 0..1
  matchMetodo      String?  // REGRA_OP | CODIGO_OBRA | DOMINIO | NOME_OBRA | IA | MANUAL
  respondidoEm     DateTime? // 1ª resposta da eng na thread (p/ SLA)
  respondidoPor    String?
  createdAt        DateTime @default(now())
  @@index([opId])
  @@index([conversationId])
  @@index([opId, direcao])
}

model ObraEmailSync { // controle de delta por caixa/pasta (bookkeeping não-fatal)
  id        String  @id @default(cuid())
  caixa     String
  pasta     String  // inbox | sentItems
  deltaLink String? @db.Text
  ultimoEm  DateTime?
  @@unique([caixa, pasta])
}
```
Guardo **metadados + snippet** (sua resposta 4) — sem corpo nem anexo arquivados.

---

## 6. Casar e-mail → OP/Obra (o cérebro)

Camadas, da mais precisa/barata pra mais esperta (sua resposta 3: código da obra, nome, domínio, IFC):

1. **Determinístico:** regex de **nº da OP** e **código da obra**; **domínio do remetente → Cliente**
   (mapa cliente↔domínio, base nos clientes do Omie); **nome da obra** por fuzzy match nas OPs abertas;
   **nome do anexo `.ifc`**.
2. **IA (Anthropic, já usada no portal):** quando as regras não batem com confiança, o Claude
   classifica "qual OP é esta?" a partir de assunto+snippet+anexos, com **score**.
3. **Fila de revisão:** confiança baixa → não auto-vincula; a Engenharia confirma com 1 clique
   (vira treino das regras). Nunca "chuta e finge que acertou".

---

## 7. UI — aba **Resumo** da OP (Fase 2/3)

Card por obra:
- **Início do projeto:** `<gatilho>` recebido em `dd/mm HH:MM`, de `cliente@…`, **para** `fulano@torg`.
- **1ª resposta da Engenharia:** `X h/dias` · **por** `beltrano@torg` — ou **"sem resposta há N dias"** (vermelho).
- **Timeline** da thread (entradas/saídas) expansível.
- **Confirmar vínculo** quando a confiança foi baixa.

---

## 8. Cronograma automático + SLA (Fase 3)

- O **1º gatilho válido** da obra vira a **data de início da fase de Projeto** no cronograma
  (auto-preenchido, editável).
- SLA de resposta (recebido→1ª resposta) vira **indicador da Engenharia** (média, atrasos).

---

## 9. Fases

- **Fase 0** 🔒 — permissão + consent + política de escopo (Matheus/Vitor). *Bloqueia tudo.*
- **Fase 1** — ingestão (delta cron) + modelo + dedupe; tela interna "crua" pra validar leitura.
- **Fase 2** — casamento e-mail→OP (regras + IA + fila de revisão) + card no Resumo.
- **Fase 3** — SLA/indicadores + auto-preenchimento do cronograma.
- **Fase 4** (opcional) — webhooks (tempo real).

---

## 10. Decisões pendentes / próximos passos

1. ✅ **Caixas definidas:** `engenharia@`, `engenharia1@`…`engenharia5@` `torg.com.br` (6 caixas).
2. ⏳ Avaliar **`Mail.ReadBasic`** (mais restrito) vs `Mail.Read` — como só guardamos snippet,
   ReadBasic pode bastar e é mais seguro.
3. 🔜 Depois da Fase 0 no ar, começo a **Fase 1** (ingestão + tela de validação).
4. ⏳ Mapa **cliente ↔ domínio de e-mail** (ajuda muito o casamento) — dá pra semear a partir dos
   clientes do Omie.
