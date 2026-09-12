---
name: torg_engenharia_medicao
description: "Medir a Engenharia: o agente de e-mail JÁ EXISTE e roda; o que falta é classificação e vínculo. Ver o dossiê Posição do Cronograma"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-20T23:42:42.276Z
---

**⚠ DESATUALIZADO abaixo — ver a atualização de 29/08/2026 no fim. Em aberto (Vitor pediu, 19/08/2026, "amanhã retornaremos nesse assunto da engenharia").**

Vitor: *"estamos tendo problema demais com a engenharia, eu não consigo medir as informações,
eles falham demais nas entregas e não tem controle, não tem documentos para nos respaldar, fora o
tempo que demora para resolver coisa pequena"*.

## Diagnóstico (medido em 19/08/2026)

O dado existe e está furado — **não é falta de ferramenta, é falta de registro**:

| | |
|---|---|
| Tarefas de Engenharia (cronogramas ativos) | 88 |
| Concluídas **sem data real de entrega** | **27 de 52** |
| Com `dataInicioReal` | **21 de 88** |
| Abertas e atrasadas | 15 · média 11 d · pior 17 d |
| Revisões de lista detectadas | 1 (OP-083, **+33 peças incluídas**, sem tratativa) |

Marcar 100% no cronograma não pede data, então alguém arrasta a barra e não sobra rastro.

## A saída acordada: capturar do E-MAIL

🚫 **Exigir a data no portal NÃO resolve** — Vitor: *"não adianta exigir a data, pois não lembram e
pede dias para poder retornar; como temos pouca gente no processo fica ruim de medir"*. O registro
tem de vir do **ato que já acontece**, não de um segundo passo manual.

Ideia dele: caixa fixa (ex. `entregas.engenharia@torg.com.br`) sempre em **cópia** no e-mail que a
Engenharia já manda. O portal lê a caixa e guarda: **data/hora = data da entrega**, remetente,
**anexos = o documento que respalda**, assunto → amarra na OP (número no assunto) e na etapa
(Modelo/Detalhamento/Diagrama/Lista/Liberação). Não identificado cai em fila pra ligar num clique.

**Viável reaproveitando o que existe:** `lib/sharepoint.js` já pega token do Graph por
`client_credentials` com escopo `.default` — ler e-mail é a mesma porta, muda só a permissão.

**Bloqueio externo:** conceder `Mail.Read` (application) ao app do Azure — quem mexe é o
**Matheus**. ⚠ Pedir **Application Access Policy** limitando a UMA caixa; sem isso o app lê
qualquer caixa do tenant.

Se o *pedido* também passar pela caixa, o par pedido→resposta mede o "demora pra resolver coisa
pequena", que hoje não tem registro nenhum.

Ver [[torg_portal_engenharia]], [[torg_cronograma]] e [[torg_listas_le_lpc]].

---

## ⚠⚠ ATUALIZAÇÃO 29/08/2026 — o agente EXISTE e roda

**`Mail.Read` está concedido** ao app da Torg (travado por ApplicationAccessPolicy nas 6 caixas
`engenharia*@torg.com.br`). O cron `/api/cron/emails-engenharia` ingere inbox + sentItems em delta
(`lib/graph-mail.js`, `lib/ingest-emails-engenharia.js` → `ObraEmailEvento`). A nota antiga de que
"falta Mail.Read" está errada.

**Estado medido:** 358 e-mails · 53% casados com OP · **75% com `tipoGatilho: OUTRO`** (só 41 por
palavra-chave e 48 por IA). O gargalo é classificação e vínculo, não captura.

**Regras do matcher que NÃO podem ser afrouxadas** (`lib/match-email-op.js`):
- **Ambíguo não casa.** OP-078 tem obra "ENC 328" e OP-112 ref "ENC 0328", as duas DANPOWER. Todas
  as regras usam `filter` + exigem UMA candidata. Duas ⇒ nenhuma.
- **Dígito do refCliente só no ASSUNTO.** No corpo, qualquer nota fiscal vira match falso.
- **Cliente é definido pelo cadastro da OP** (`clienteEmail` + `clienteContatos`), não por
  "não é @torg.com.br" — senão o calculista da casa (jonas@jfengenharia.eng.br) vira "o cliente".

## O entregável: "Posição do Cronograma" [[torg_posicao_cronograma]]

Botão no card **E-mails do Projeto** da aba da OP (diretoria) → PDF com envios do cronograma ao
cliente, o que a Torg entregou, o que está parado esperando, o efeito na entrega, linha do tempo,
todas as tarefas, a correspondência item a item, **o que o cliente respondeu** (só o domínio do
cliente) e **terceiros** com quem chamou cada um.

⚠ O documento **mostra, não acusa** — e a prova corta dos dois lados: na OP-089 o cliente muda
escopo (a favor) mas também cobra desenho e prazo (contra). Ler antes de enviar.
