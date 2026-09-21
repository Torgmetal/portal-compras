---
name: torg_cotacao_fornecedor_sem_email
description: "Não estamos conseguindo enviar a cotação" (21/09/2026) — a Vendor List do Omie tem 435 cadastros ativos SEM e-mail e 10 com dois e-mails no mesmo campo; o clique morria em silêncio (null.toLowerCase fora do try) ou tomava 400 com JSON do Zod; regra em lib/fornecedores-envio.js, linha do picker com "informar e-mail" que grava no cadastro
metadata:
  type: project
---

**Vitor (21/09/2026):** *"no portal de compras não estamos conseguindo enviar a cotação"*.

**O que estava acontecendo.** Nada no código do envio tinha mudado desde 16/09 e as cotações de
17/09 saíram normais — a diferença estava nos FORNECEDORES escolhidos. Medido no banco:

- **435 fornecedores ativos sem e-mail** (`email: null`), todos da importação do Omie de 25/08 —
  quase metade da Vendor List (1005 ativos). Entre eles as **6 filiais da GERDAU ACOS LONGOS**.
- **10 com DOIS e-mails no mesmo campo** (`"a@x.com,b@y.com"`, jeito do Omie), entre eles a
  **ARCELORMITTAL** — exatamente os fornecedores de perfil W e chapa grossa da OP-122.

E os dois caminhos falhavam de jeitos diferentes:

1. Sem e-mail: `montarFornecedoresEnvio` fazia `f.email.toLowerCase()` **fora do `try`** do
   `submit` → `TypeError` no handler do clique → React não mostra nada, a tarja vermelha não
   aparece. Quem clicava achava que o portal ignorou o botão.
2. Dois e-mails: passava pelo cliente e o servidor (`z.string().email()`) recusava com
   `"Dados inválidos: " + e.message` — o despejo JSON inteiro do Zod na tarja.

⚠⚠ **ERRO QUE A TELA NÃO MOSTRA É ERRO QUE NINGUÉM RELATA.** O relato chegou como "não
conseguimos", sem mensagem, porque não HAVIA mensagem. Regra que ficou: **tudo do `submit`
dentro do `try`**, inclusive a montagem da lista; e `res.json().catch(() => null)` para 500/504
em HTML não virarem *"The string did not match the expected pattern"* (Safari).

**O que mudou**
- `lib/fornecedores-envio.js` (saiu de `app/compras/rm/[id]/_lib/`): `emailPrincipal()` /
  `separarEmails()`; cadastro sem e-mail vira `{ error }` com o NOME do fornecedor. O envio
  consolidado do painel (`RMsTabelaSeletor.jsx`) tinha uma CÓPIA do parser — agora usa a lib.
- `components/compras/LinhaFornecedorPicker.jsx` (usada pelos dois pickers): chip **"sem
  e-mail"**, checkbox desligado e **"informar e-mail"** inline, que grava no cadastro via
  `PATCH /api/fornecedores/[id]` — não só neste envio, senão a próxima cotação para o mesmo
  fornecedor bate na mesma parede.
- `/api/cotacao/enviar`: `mensagemDeValidacao` nomeia o fornecedor e o valor
  (*E-mail inválido no fornecedor "ARCELORMITTAL…": "a,b"*).
- `lib/omie-fornecedores.js`: a importação separa os e-mails (primeiro em `email`, resto em
  `emailsAdicionais`, que já vai em cópia nas cobranças).
- Manutenção **`fornecedor-email-multiplo`** (Admin › Manutenção) conserta os 10 já gravados
  — clique do Vitor/Matheus.

⚠ **Não confundir com o envio do FORNECEDOR** (`/fornecedores/c/[token]`): o frete CIF/FOB
virou obrigatório em 17/09 e nenhum fornecedor submeteu depois disso até 21/09 — não há
evidência de que aquele lado quebrou, mas também não há evidência de que funciona.

Ver [[torg_token_cotacao_no_payload]], [[torg_seguranca_pendencias]] (não regenerar token).

### Segunda causa, no mesmo dia: "O servidor respondeu 500 sem detalhes" (21/09/2026, 09:5x)

Com a tela já mostrando erro, Compras tentou a T122-001 (9 itens, ~7 fornecedores) e tomou 500.
Nada foi gravado (itens seguiram PENDENTE, nenhuma `Cotacao`). Dois fatos medidos:

- **A função da Vercel roda em `iad1` (Washington); o Neon fica em `sa-east-1` (São Paulo)** —
  ~120 ms por statement. A transação escrevia LINHA A LINHA (`create` aninhado por cotação = 1
  INSERT por item, `create` por Envio): 7 × 9 = 63 inserts de item + 7 cotações + 7 envios +
  status ≈ **85 idas e voltas ≈ 10 s**, contra o teto **padrão de 5 s** da transação interativa do
  Prisma (`Transaction already closed … expired transaction`).
- **No mesmo horário o log ao vivo (`npx vercel logs <deployment> --scope torg`) mostrou
  `P1001 Can't reach database server at ep-…-pooler.sa-east-1`** numa página do Comercial — o
  Neon some por alguns segundos (ver [[torg-neon-infra]]).

⚠⚠ **Gravação EM LOTE, não linha a linha** (`lib/cotacao-envio-gravacao.js`): `createManyAndReturn`
das cotações (token gerado ANTES, e é por ele que se casa o que voltou — ordem do RETURNING não é
garantia), `createMany` dos itens e dos envios, 2 `updateMany`, 1 audit = **6 statements**, qualquer
tamanho. `OPCOES_TX = { timeout: 30 s, maxWait: 10 s }`; `maxDuration = 60`.

⚠ `aquecerBanco` antes e `withDbRetry` em volta da transação INTEIRA — repetir é seguro porque a
anterior foi desfeita por completo (nada commitado, nenhum e-mail). Erro que não é de conexão vira
**500 em JSON com a causa** ("Não consegui gravar a cotação (nada foi enviado): …").

⚠ **Como ler o log de produção quando o MCP da Vercel dá 403**: `npx vercel logs <url-do-deploy>
--scope torg` em background, escrevendo num arquivo — só mostra o que acontece DEPOIS de ligar
(não há histórico); ligar ANTES de pedir para a pessoa repetir o erro.

⚠ Visto de passagem no mesmo log: `/api/qualidade/plp/[opNumero]` seleciona `indiceR`, campo que
NÃO existe em `DocumentoQualidade` — a rota devolve 500 desde 22/08. Pendência separada.

### Terceira: doze e-mails no mesmo segundo (21/09/2026, 10:18)

Com as duas correções no ar, Matheus enviou T122-001 (10 fornecedores → **10 e-mails**) e
T122-002 (12 fornecedores → **só 10**; NOROACO e FERALVAREZ ficaram sem, e a tela avisou "alguns
e-mails falharam"). O envio era `Promise.all` — doze chamadas no mesmo segundo contra o limite de
~2 req/s do Resend. ⚠⚠ **Um de cada vez, com pausa de 600 ms**, como a cobrança de atraso já fazia.
⚠ A falha passou a ser auditada (`email_cotacao_falha`, com o motivo) — antes só o sucesso deixava
rastro, e a investigação era por dedução do que faltava.
