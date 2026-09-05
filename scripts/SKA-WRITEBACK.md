# Descoberta da API de escrita do SKA Syneco (correção de apontamento)

**Objetivo:** achar como **lançar/corrigir a quantidade produzida** de uma marca num setor
direto no Syneco, a partir do portal. Caso de uso: o operador esqueceu de apontar a produção
no terminal e o painel mostra divergência entre setores (ex.: Corte=10, Montagem=6).

> ⚠️ Hoje a integração é **só leitura** (`/v1/dataset`). Não existe escrita ainda. A API de
> escrita do SKA **não é documentada publicamente** — por isso precisamos descobri-la na rede
> da Torg. Rode tudo abaixo numa máquina que **enxerga** `192.168.0.190:1000` (a do `C:\MesSync`).

---

## Método 1 — Capturar pelo DevTools (MAIS CONFIÁVEL — faça este primeiro)

A forma mais certeira é ver **o que o próprio Syneco envia** quando alguém corrige um
apontamento na tela dele. Isso entrega a URL, o corpo (payload) e os headers exatos.

1. Abra o **Syneco no navegador** (Chrome/Edge) e faça login normalmente.
2. Aperte **F12** → aba **Network** (Rede). Marque **Preserve log** (Preservar log).
3. No filtro do Network, deixe em **Fetch/XHR**.
4. Vá até a tela onde se **edita/lança a produção** de um apontamento (a mesma que o operador
   usaria, ou a de correção/ajuste do supervisor). Faça **uma correção real pequena** numa
   marca de teste — ex.: ajustar a quantidade produzida de 6 → 7.
5. No Network, ache a requisição que saiu nesse momento (método **POST** ou **PUT**, normalmente).
   Clique nela e copie:
   - **Request URL** (a URL completa, com `/v1/...`)
   - **Request Method** (POST/PUT/PATCH)
   - **Headers** — principalmente `token`/`Authorization` e `Content-Type`
   - **Payload / Request Body** (o JSON enviado) — **copie inteiro**
   - **Response** (o que voltou) — pra sabermos o formato de sucesso
6. Dica: clique com o botão direito na requisição → **Copy → Copy as cURL** e cole tudo pro
   Claude. O cURL já traz URL + método + headers + body juntos.

> Faça isso para CADA tipo de ação que importa: **lançar quantidade que faltou** e, se houver,
> **corrigir um valor existente**. Cada tela pode usar um endpoint diferente.

---

## Método 2 — Probe automático (fallback / complemento)

Se a tela de correção não estiver acessível, ou pra mapear a API de forma ampla, rode o probe.
Ele é **seguro: NÃO grava nada** — só faz login, procura Swagger/OpenAPI e pergunta a cada
rota candidata quais métodos ela aceita (via `OPTIONS`/`GET`).

```bash
# na pasta C:\MesSync (mesmo .env do agente)
node ska-probe.js --salvar
```

Isso imprime um relatório e grava `ska-probe-resultado.json`. **Mande esse arquivo pro Claude.**
Procuramos por:
- alguma **documentação viva** (`/swagger`, `/openapi.json`, `/api-docs`…) → é o achado de ouro;
- rotas marcadas **"ACEITA ESCRITA"** (Allow com POST/PUT) → candidatas ao lançamento.

---

## Método 3 — Inspecionar os datasets de escrita/parametrizados

Alguns MES expõem "ações" como datasets parametrizados. Vale rodar o explorador procurando
relatórios cujo SQL seja um `INSERT`/`UPDATE` (raro, mas acontece):

```bash
node ska-explorar.js --find insert
node ska-explorar.js --find update
node ska-explorar.js --find aponta
```

---

## O que mandar pro Claude depois

Qualquer um destes já destrava a escrita do código de correção no portal:

1. O **cURL** (ou URL + método + headers + body + response) capturado no DevTools — **ideal**.
2. O arquivo **`ska-probe-resultado.json`**.
3. Se achar Swagger/OpenAPI: a URL dele (ou o `swagger.json` salvo).

Com isso eu escrevo: a rota no portal (`/api/mes/corrigir-apontamento`), a chamada autenticada
ao SKA e — depois — o botão/modal na tela de Rastreabilidade Syneco.

---

## Riscos / pontos de atenção (decidir depois de achar a API)

- **Pode não existir** endpoint de escrita exposto ao cliente. Se o Syneco só aceitar entrada
  via terminal/integração própria, a alternativa é a SKA habilitar/expor (questão comercial).
- **Idempotência:** ao reenviar uma correção, não duplicar apontamento. Provável precisar do
  `ProductionID` (corrigir o existente) em vez de criar um novo.
- **Auditoria:** toda correção enviada ao Syneco deve gravar `AuditLog` no portal (quem, quando,
  de/para) — é mutação externa irreversível.
- **Rastreabilidade do sync:** depois de corrigir no Syneco, o próximo sync de leitura (242/150)
  deve refletir o novo valor — confirmar que não há conflito com o dado local.
