# MES próprio — substituir o Syneco (SKA)

> Documento vivo. Nasceu do levantamento de 09/09/2026 (Matheus: "criar nosso próprio MES e
> trocar o Syneco, já nascido dentro do mesmo banco do PORTAL").
> Rota de trabalho isolada: **`/mes-lab`** (só ADMIN, fora de qualquer menu).

## 1. O que o Syneco é hoje, na Torg

Três serviços no servidor **`DESKTOP-IONH0V7` / 192.168.0.190**:

| Porta | O quê | Uso |
|---|---|---|
| **9123** `/app/` | **Terminal do operador** (totem no setor/máquina) | onde a fábrica aponta |
| **81** (UI) / **1000** (`/v1/` API) | **SKA Reports** — dashboards e datasets | de onde o portal lê hoje |
| 9134 | Configurator (hardware) | parametrização |
| SQLEXPRESS | banco **`TORG_SYNECO`** (SQL Server 2022) | a verdade |

**53 recursos** cadastrados (máquinas/postos), vistos no "02 - Monitor Geral de Máquinas".

### 1.1 O terminal do operador (o coração)

Um totem por recurso. O estado do recurso é sempre **um** destes, e é o que pinta o card no
monitor:

`PRODUÇÃO` (verde) · `SETUP` (amarelo) · `PARADA` (vermelho) · `RETRABALHO` (laranja) ·
`MANUTENÇÃO` (azul) · `FORA DE TURNO` (cinza)

Campos na tela: `Ordem`, `Oper.` (código da operação/setor), `Produto`, `Qtd Plan.`, `Qtd Prod.`,
`Qtd Rej.`, `Saldo`, `Inform.`, `Operador`, `Ciclo Plan/Real`, `T. Prod. Plan/Real`,
`T. Setup Plan/Real`. Medidores: **Disp. · Qualid. · Efic. · OEE**.

Ações (botões): `TROCAR OPERADOR` · `PRODUÇÃO` · `SETUP` · `PARADA` · `TROCAR ORDEM` ·
`QUANTIDADE PRODUZIDA` · `Documentos` · `Inserir/Remover ordens de produção` · `Repasse`.

Fluxo real na Torg: o operador abre o crachá, bipa ou digita a marca que vai produzir, inicia a
produção e, ao encerrar, aponta a quantidade produzida. Enquanto está aberto, o monitor mostra
"Produzindo" com o tempo `Decorrido`.

### 1.2 IOT nos lasers

Alguns lasers têm captura do **sinal do CNC**: início, fim e parada viram apontamento
**automático**, sem o operador tocar no totem. É um diferencial que o MES novo precisa manter.

### 1.3 Modelo de dados (engenharia reversa, 19/06/2026)

Event-sourced — e é o padrão certo a copiar:

- **`Event`** — a linha do evento. `EventTypeID` **5 = REPORTE PRODUÇÃO**, com `ProductionID`,
  `Qty`, início/fim.
- **`Production`** — o contexto: `OrderNum` (OP/obra), `PartCode` (marca), `Operation`
  (setor/código), `ResourceCode` (máquina).
- **`ProductionQuantity`, ShiftQty, OEE** — agregados **derivados**, não fonte.
- Correção oficial via procedures **`MCA_Correcao_de_Quantidades/Horario/Motivos`**, reversíveis.
  Não se faz `UPDATE` cru num modelo event-sourced.

> ⚠ **Nenhuma API REST do Syneco escreve apontamento.** A porta 1000 é só leitura (BI); a 9123 é
> o SignalR do terminal (simular tecla é frágil). Escrita, só pelo banco/procs.

## 2. O CONTRATO que já existe — e é o achado mais importante

O portal **já depende do Syneco em muito mais lugar do que parece**. Hoje o agente
(`scripts/mes-sync-agent.js`, em `C:\MesSync`) lê dois datasets e alimenta duas tabelas:

- dataset **242** → `POST /api/mes/sync` → **`MesApontamento`** (evento de produção)
- dataset **150** → `POST /api/mes/sync-ordens` → **`MesOrdem`** (snapshot planejado × produzido)
- `mes-sync-status.ps1` → `POST /api/mes/sync-status` → **`MesInativo`** (setor terceirizado)

E quem **consome** essas tabelas — todos quebram se o dado parar de chegar:

| Consumidor | Arquivo |
|---|---|
| Painel de Produção e relatório do dia | `lib/syneco-dia.js` |
| Vínculo obra Syneco → OP do portal | `lib/syneco-obra.js` |
| Avanço do cronograma/Gantt por frente e fase | `lib/cronograma-syneco.js` |
| Baixa automática das peças LPC no corte | `lib/reconciliar-syneco-corte.js` |
| Planilha de baixa manual | `lib/baixa-syneco.js` |
| Furos de apontamento (com `MesInativo`) | `lib/conjuntos-setor.js` |
| Rastreabilidade da OP / portal do cliente | `app/api/mes/rastreabilidade-op` |

**Consequência de projeto:** `MesApontamento`/`MesOrdem` são a **interface**, não um detalhe do
Syneco. O MES novo deve **projetar** para elas (mesma forma, mesmos campos), em vez de
substituí-las de cara. Isso permite rodar **os dois em paralelo** e desligar o Syneco sem tocar
em nenhum dos sete consumidores acima.

## 3. Arquitetura proposta

### 3.1 Princípio: event-sourced, como o Syneco (e por quê)

Quantidade e OEE são **derivados**; o fato é o evento. Foi isso que deu ao Syneco correção
reversível e auditável. Copiar esse acerto:

```
MesEvento (fato imutável)  →  projeções  →  MesApontamento / MesOrdem (contrato atual)
                                         →  agregados de OEE por recurso/turno
```

### 3.2 Entidades novas (nomes provisórios, tudo no banco do portal)

- **`MesRecurso`** — máquina/posto (código `09`, `30A`, `50J`), nome, setor, tipo, tem terminal.
- **`MesTurno`** — calendário de turno por recurso. É o que define "FORA DE TURNO" e a base da
  **Disponibilidade**. Sem turno não existe OEE honesto.
- **`MesOperador`** — crachá; liga em `Funcionario` (já existe no portal).
- **`MesMotivoParada`** — catálogo de motivos, com classificação planejada/não planejada.
- **`MesEvento`** — o núcleo: `recursoId`, `operadorId`, `tipo` (PRODUCAO/SETUP/PARADA/
  RETRABALHO/MANUTENCAO/FORA_TURNO), `inicioEm`, `fimEm`, `motivoId`, `origem` (TERMINAL/IOT/
  CORRECAO), ordem/marca e quantidades.
- **`MesCorrecao`** — trilha de correção (o equivalente honesto do `MCA_*`), sempre reversível.

**O que NÃO criar:** uma tabela nova de "ordem de produção". A Torg já tem o que produzir em
`PecaConjunto` + `ListaExpedicao` + `LiberacaoProducao` (ver a regra de `lib/itens-expedicao.js`).
O MES deve apontar **contra o que já existe**, senão nasce uma segunda verdade — o erro que o
`lib/baixa-syneco.js` documenta ter custado caro.

### 3.3 Terminal (chão de fábrica)

PWA no navegador do totem, mesma stack do portal. Tela grande, alto contraste, botão gordo.

> ⚠⚠ **DECISÃO CRÍTICA — o Syneco é LOCAL; o portal é nuvem.** Hoje, se a internet cair, a
> fábrica continua apontando (servidor na LAN). Se o MES novo for só Vercel/Neon, **queda de
> internet = fábrica cega**, e ninguém aponta. Isso não é aceitável sem mitigação. Opções:
> 1. **PWA offline-first** (fila em IndexedDB, sincroniza ao voltar) — mitiga o caso comum;
> 2. **agente/servidor local** que recebe o apontamento e replica pro portal — igual ao Syneco;
> 3. só nuvem — mais simples, mas assume o risco.
>
> Recomendação: **(1) desde o primeiro dia**, com (2) no radar se a conectividade da fábrica for
> ruim de fato. Medir antes de decidir.

### 3.4 Tempo real

Dashboards precisam de atualização viva. SSE (`text/event-stream`) resolve sem WebSocket e
funciona na Vercel; polling curto é o plano B. **Atenção ao Neon** — a compute é pequena e já tem
histórico de OOM: o agregado de OEE deve ser **materializado**, nunca recalculado a cada
carregamento de dashboard.

### 3.5 IOT / CNC

Endpoint autenticado por chave de máquina (`POST /api/mes/iot/<recurso>/evento`) recebendo
`inicio|fim|parada`. É o mesmo caminho de escrita do terminal — muda só a `origem`.

## 4. Riscos conhecidos

1. **Disponibilidade** (§3.3) — o maior. Fábrica parada por internet é inaceitável.
2. **Neon pequeno** — 53 recursos gerando eventos, mais dashboards. Materializar agregados; nada
   de recalcular OEE por request. Ver o aviso de OOM no `CLAUDE.md`.
3. **Migração** — não há big bang. Rodar em paralelo, comparar número a número com o Syneco por
   algumas semanas, e só então desligar.
4. **Cadastro** — 53 recursos, turnos, motivos de parada e crachás precisam ser migrados.
5. **`obraParaNumeroOP`** — a regra frágil que já causou 1.063 ordens órfãs (OP-92). No MES
   próprio o vínculo com a OP deve ser **por id**, não por string.

## 5. Decisões pendentes (precisam do Matheus)

- Disponibilidade offline: PWA offline-first, agente local, ou aceitar o risco?
- Escopo da fase 1: só apontar produção, ou já com parada/setup/OEE?
- Os totens são PCs com navegador? Tela sensível ao toque? O leitor de código de barras é USB?
- Mantém os conceitos de "Repasse" e "Documentos" do Syneco?

---

# 6. Engenharia reversa ao vivo (10/09/2026)

Feita da rede da fábrica, com a credencial `portal` da API de relatórios. **Tudo somente leitura.**

## 6.1 A porta de entrada: `GET /v1/dataset` devolve o SQL de tudo

O maior achado. A API da porta 1000 expõe **os 242 datasets com o SQL de cada um** — ou seja, o
esquema do banco inteiro, sem precisar de acesso ao SQL Server (que segue fechado: 1433 fechada,
porta dinâmica só local). Também respondem `GET /v1/reports` (183+ relatórios) e
`GET /v1/dashboard`. Não há Swagger; o header de auth é `token: <jwt>` (não `Bearer`).

Cópias salvas durante a análise: `dataset.json` (324 KB), `reports.json`, `dashboard.json`.

## 6.2 O núcleo do modelo (confirmado)

```
Resource   ResourceID, Code, Name, CostCenter(=setor), Type, IsEnabled,
           ParentResourceID, DataColGroupID
Production ProductionID, OrderNum(=obra/OP), Operation, PartCode(=marca), PartName,
           PlanQty, PartCount, ScrapCount, CycleTime, PlannedBeginTimestamp,
           FirstBeginEventID, ParentProductionID
Event      EventID, EventTypeID, ResourceID, OperatorID, ProductionID, ServerTimestamp
```

> ⚠⚠ **`Event` guarda um INSTANTE (`ServerTimestamp`), não um intervalo.** A duração de cada
> estado é o tempo **até o evento seguinte** daquele recurso. É essa escolha que faz o OEE,
> o "Tempo Decorrido" e as paradas caírem todos do mesmo lugar, sem campo de fim para
> desencontrar. **É o desenho que devemos copiar.**

Complementos: `EventDetail` (detalhamento/motivo), `EventOperator` (operador do evento),
`EventType` (**179 tipos**), `ShiftData` (turnos), `ResourceInterruptionTolerance` (tolerância de
microparada). Configuração é **EAV**: `TypeData` + `ResourceData` + `DataColGroupData` +
`EventDetailData`.

## 6.3 Catálogos reais da Torg

- **Setores (`CostCenter`)**: Acabamento, Corte, Expedição, Jato, Montagem, Pintura,
  **Serralheria**, Solda.
- **53 recursos** ativos no monitor (54 na lista), **68 operadores**.
- `EventTypeID = 2` → "Em Produção" (`Cor=verde`, `Detalhamento=Normal`).

> ⚠ **`normalizeSetorSyneco` (`lib/syneco-dia.js`) não mapeia "Serralheria"** — ela cai no
> fallback e vira o literal `SERRALHERIA`. Conferir se isso esconde produção em algum painel.

## 6.4 O monitor de máquinas (dataset 131, `SKA_Production_GeneralMonitor`)

É a tela de cards. Sem parâmetros, devolve o estado vivo dos 53 recursos com:
`Código, Máquina, Setor, OP, Operação, Item, Desc. Item, Planejado, Operador, Status,
Detalhamento, Tempo Decorrido, Produzido, Rejeitado, Retrabalhado, Cor, ResourceID,
ProductionID, EventTypeID, EventDetailID`. **É o contrato de tela do nosso monitor.**

## 6.5 O terminal do operador

**Angular** (build CLI: `runtime/polyfills/main-es2015`) servido por **IIS**, com
`manifest.json` — ou seja, o terminal do Syneco **já é um PWA**. Confirma a escolha de PWA para
o nosso, e mostra que rodar no navegador do totem é caminho batido.

## 6.6 A camada IOT (o sinal do CNC)

Existe e é tabela de primeira classe: **`Device`, `DeviceConfiguration`,
`DeviceConfigurationData`, `ResourceProtocolInfo`, `Signal`, `VW_SKA_DeviceInfo`**, mais
`fn_ska_VerifyDeviceFullConfig`. O laser não fala com o Syneco por API: existe um **dispositivo
coletor** por recurso, com protocolo configurado, que grava sinal e vira evento. Para manter esse
automatismo no MES próprio, é esse elo que precisa ser mapeado em campo (qual hardware, qual
protocolo).

## 6.7 O tamanho real do Syneco (o que ele faz além de apontar)

Pelos 242 datasets, os módulos são: **OEE** (global, por máquina, grupo, setor),
**Paradas/Interrupções** (pareto, evolução, por operador), **Setup**, **Refugo (Scrap)**,
**Retrabalho**, **Manutenção** (MTBF, breakdown), **Inspeção/Qualidade** (CEP, Cp/Cpk,
histograma, limites de controle), **CheckList**, **Cadeia de Ajuda / Andon**, **Moldes**,
**Pintura**, **Prateleiras**, **Lean Board**, **Logística de localização** e **habilidades do
operador**.

> **Conclusão de escopo:** não vamos reimplementar isso tudo — nem precisamos. A Torg usa uma
> fração. O MES próprio deve nascer com **apontamento + estados + OEE + paradas**, que é o que
> alimenta o portal hoje, e crescer só no que a Torg realmente usa.

## 6.8 Funções feitas sob medida para a Torg

`TORG_Production_Traceability_V01` (dataset 150), `..._V01_Eventos` (dataset 242),
`..._OBRA`, `..._OBRA_CARDS`, `TORG_Production_Analytics_V03`. São *table-valued functions* no
banco do Syneco — **elas somem quando o Syneco sair**, e é exatamente o que a projeção do nosso
MES para `MesApontamento`/`MesOrdem` precisa substituir.

---

# 7. Reconciliação com a pesquisa do Codex (10/09/2026)

Duas pesquisas independentes: o Codex foi pelas fontes públicas da SKA + rigor de produto
(ISA-95, OEE.com); esta foi pela engenharia reversa ao vivo. **Convergem quase totalmente.**
O que segue é o que ficou decidido a partir das duas.

## 7.1 Decisões confirmadas pelo Matheus (10/09/2026)

- **Escopo da fase 1: apontar PRODUÇÃO e PARADAS.** Setup, OEE e o resto vêm depois.
- **Totens:** PCs com navegador, teclado, mouse, **leitor USB e leitor Bluetooth**. Ambos os
  leitores emulam teclado (digitam o código + Enter) — é o caminho mais simples e o que o totem
  deve assumir.
- **Modelo PWA aprovado** — com a ressalva de disponibilidade abaixo, que é decisiva.

## 7.2 ⚠️⚠️ A verdade sobre "PWA resolve a queda de internet"

**Não resolve.** Registrado aqui porque a decisão de arquitetura depende disso e a intuição
natural (e a minha própria recomendação anterior, incompleta) engana. Com PWA offline-first:

| Continua | Para |
|---|---|
| Tela do totem abre (service worker) | **Monitor da supervisão fica cego** (lê da nuvem) |
| Operador aponta produção/parada/quantidade | **Totens não se enxergam** — trava de exclusividade é no servidor |
| Fila local sincroniza quando a rede volta | **Validações rodam em cache velho** (saldo, marca, roteiro) |
| | **PC do totem morrer antes de sincronizar = apontamento perdido** |

**PWA faz a fábrica continuar CAPTURANDO, não continuar OPERANDO.** Cobre queda de minutos.
Não substitui servidor local.

**E o Syneco hoje é local.** Trocar por nuvem+PWA seria **rebaixar a disponibilidade** — a
fábrica percebe na primeira queda. O Codex chegou à mesma conclusão por outro caminho:
*"Cache no navegador não é equivalente a operação industrial offline."*

**Plano em duas etapas:**
1. **Laboratório e piloto** — PWA + fila, só nuvem. Suficiente para construir e validar.
2. **Antes de desligar o Syneco** — **gateway local** na LAN da fábrica (serviço num PC, com
   banco durável próprio) atendendo os totens e replicando pro portal. É o que iguala o Syneco.

O modelo de dados nasce preparado para (2), mesmo que (2) só venha depois.

## 7.3 Onde o Codex corrigiu/refinou o meu desenho

1. **Sessão ≠ evento ≠ acumulado.** Eu ia direto para `MesEvento`. O correto são três níveis —
   e isso espelha o próprio Syneco (`Production` = sessão, `Event` = instante):
   - **`MesSessao`** — recurso + ordem/marca + operador(es), com abertura e fechamento.
   - **`MesEvento`** — transições de estado (instantes), como no Syneco.
   - **`MesApontamentoQtd`** — quantidade **incremental** de boas/rejeitadas/retrabalho.
2. **Event sourcing completo não é obrigatório.** Uma transação grava o evento, atualiza a
   projeção e enfileira a mensagem de saída. Auditoria e consistência com menos infraestrutura.
3. **Conectividade é uma dimensão SEPARADA do estado produtivo.** `conectado / atrasado /
   desconectado / desconhecido`. **Falta de sinal não é parada de máquina** — o monitor deve
   mostrar o último estado conhecido com a idade do dado, não inventar "parado".
4. **Indicador sem base é "indisponível", com a causa** — nunca 0% nem 100%. (Na tela do laser
   que o Matheus mandou aparece Efic. e OEE em 0% com ciclo planejado zero: é exatamente esse
   defeito, no Syneco.)
5. **Nesting/laser:** um ciclo CNC pode render várias marcas e várias peças. **Não converter
   ciclo em peça boa automaticamente**, nem copiar o tempo da máquina para cada marca.
6. **A marca não é única globalmente** — a chave é obra/OP + item + revisão + operação. Isso
   ecoa o que o portal já sofreu com `obraParaNumeroOP` e com `opNumero` de `PecaConjunto`.
7. **Idempotência desde o primeiro dia** — duplo clique, retry e sinal repetido produzem efeito
   único. O portal já tem esse padrão em `chaveOperacao` na Conferência de Peça; reusar a ideia.

## 7.4 Onde há tensão a resolver com o Matheus

**Isolamento do laboratório.** O Codex pede *aplicação/deploy separado e base separada*
("não basta criar uma rota escondida"); o Matheus pediu **"já nascido dentro do mesmo banco do
PORTAL"**.

- A favor do Codex: dado de demonstração não pode poluir a operação, e nome de operador real
  não deve virar massa fictícia.
- A favor do Matheus: o MES **precisa** conviver com `OP`, `PecaConjunto` e `ListaExpedicao` —
  banco separado viraria uma segunda verdade e um problema de integração permanente. E um
  segundo deploy é infraestrutura que uma equipe de duas pessoas vai manter.

**Proposta de meio-termo:** tabelas do MES no **mesmo banco**, com um campo `ambiente`
(`DEMO`/`PROD`) em sessão/evento/apontamento, e **regra dura: nada com `ambiente=DEMO` projeta
para `MesApontamento`/`MesOrdem` nem sai no portal operacional**. Isolamento por dado, não por
infraestrutura. `/mes-lab` já é fechado no servidor (middleware, só ADMIN) — não é "rota
escondida", mas o gate precisa cobrir **API, tempo real e exportação** também, não só a página.

## 7.5 Testes de aceitação adotados

Os 12 do relatório do Codex viram o critério de pronto do piloto. Os que mais pegam bug aqui:
duplo clique não duplica; dois totens não abrem sessão concorrente no mesmo recurso;
encerramento parcial preserva saldo; falta de comunicação não vira "parada"; sinal CNC repetido
ou fora de ordem tem resultado explícito; usuário sem permissão é negado **também na API**.
