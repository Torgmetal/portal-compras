# MES próprio — substituir o Syneco (SKA)

> Documento vivo. Nasceu do levantamento de 09/09/2026 (Matheus: "criar nosso próprio MES e
> trocar o Syneco, já nascido dentro do mesmo banco do PORTAL").
> Rota de trabalho isolada: **`/mes-lab`** (só ADMIN, fora de qualquer menu).

## ► ESTADO ATUAL E PRÓXIMO PASSO (10/09/2026)

**Branch:** `matheus/mes-proprio` — **nada em produção**: nenhum `db push` no Neon, nenhum push da
branch. O laboratório roda inteiro na máquina do desenvolvedor.

**Feito:** levantamento (§1-5) · engenharia reversa ao vivo do Syneco (§6) · reconciliação com a
pesquisa do Codex (§7) · schema Prisma dos 8 modelos (§10) · IoT real (§8) · arquitetura do gateway
local fechada (§9) · **laboratório local no ar, com dado real de produção dentro** (§10).

**O laboratório, em uma linha:**

```bash
node scripts/mes-lab/subir.mjs                                 # sobe o Postgres (porta 55432)
MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
  node --env-file=.env.local scripts/mes-lab/importar.mjs --meses=6
```

Dentro dele hoje: **47 obras · 21.772 peças · 123.824 ordens · 28.064 apontamentos** de 6 meses
reais, em 6 setores. Números conferidos **contando no destino**, não somando as gravações.

**Próximo passo, em ordem:**

1. ~~Semear `MesSetor`/`MesRecurso` **do vocabulário do Gantt** (§11)~~ — **feito**.
2. ~~`lib/mes/sessao.js` — abrir, apontar, parar, encerrar, com as travas do §7.5~~ — **feito**.
3. ~~Fluxo do **totem** contra o banco local~~ — **feito** (§13).
4. ~~**Telas de cadastro** de setores, máquinas e bancadas (§11.3)~~ — **feito** (§14).
5. ~~**Monitor** de máquinas — contrato: dataset 131 (§6.4)~~ — **feito** (§15).
6. **Engine de nesting** — os três formatos lidos, conferidos contra os arquivos reais (§12.8).
   Falta a **tela**: importar o plano e o operador escolher no totem. **← É AQUI QUE SE RETOMA.**

> ⚠ A lista do totem está **longa demais** (a captura da tela inteira do Laser Chapa deu 41.607 px).
> As marcas concluídas deveriam ir para o fim ou para uma seção recolhida, e a busca ganhar foco
> automático. Não foi feito porque não foi pedido; fica anotado antes que vire hábito rolar.

> ~~BLOQUEADO por credencial SKA~~ — **caiu** (§11). Não vamos importar o cadastro do Syneco: os
> recursos saem do Gantt, que é nosso.

> ⚠ Os dados importados incluem **nomes reais de operadores**. Ficam **só na máquina local** — não
> vão para o repositório, nem para prévia publicada, nem para massa de demonstração compartilhada.

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

---

# 8. O IoT dos lasers — configuração real (10/09/2026)

Extraída **inteiramente pela API de relatórios** (datasets 207/209/210/211/212), sem encostar em
nenhum equipamento industrial. O produto é o **SYNECO I/O Collect**, que a SKA descreve como
coleta por **Modbus TCP** ligada a "módulos I/O de mercado".

## 8.1 São só TRÊS máquinas sensorizadas

Base `TORG_SYNECO`: **54 máquinas ativas, 3 sensorizadas, 3 devices ativos.** (E o banco inteiro
tem **19 meses em 0,07 GB** — migrar o histórico é trivial.)

| Device | Recurso | Código | Terminal | Contador acumulado |
|---|---|---|---|---|
| `IOUSB - LASER CHAPA` | 11 | **09** | TERMINAL 6 | 92 |
| `IOUSB - LASER PERFIL` | 12 | **10** (Laser Tubo) | TERMINAL 7 | 3 |
| `IOUSB - CENTRO FURAÇAO` | 13 | **11** (Laser Perfil) | TERMINAL 8 | 2340 |

> ⚠ **Os nomes dos devices estão desalinhados com as máquinas** (o device "CENTRO FURAÇAO" está no
> recurso "LASER PERFIL"). É rótulo, não função — mas confunde quem for conferir, e vale
> corrigir no cadastro deles ou simplesmente não herdar esses nomes.

## 8.2 As variáveis coletadas

`Spindle` (máquina cortando — é o sinal de tensão), `CycleCount64` (contador de ciclos),
`InstantSpindle`, `DeviceConnectionChange` (saúde da conexão) e `ManualTimerState`.

Configuração dos três, idêntica:
- `SignalWay = Normal` (sinal não invertido)
- `Interval = 0`, `Duration = 0` — **sem filtro de debounce configurado**
- `ResourceTolerance = 300s` — tolerância de **5 minutos** antes de virar parada automática
- `CountAcc = 1`, `TimeAcc = 1` — contagem e tempo acumulados

## 8.3 ⚠⚠ O achado que muda o plano: provavelmente é **USB**, não Ethernet

Os três devices se chamam **`IOUSB`**, e o "Client" de cada um é o **PC do terminal**
(`TERMINAL 6/7/8`). Além disso, os datasets 205 e 206 — os únicos que expõem `Host` (IP),
`StartAddress` e `RegisterType` — **devolvem zero linhas**, o que é o sintoma exato de `Host`
ser **NULL** (`NULL LIKE '%'` é falso no SQL Server).

**Leitura:** o módulo I/O não é um escravo Modbus TCP na rede; é um **módulo USB plugado no PC do
terminal**, e o serviço da SKA naquele PC lê o USB e manda o evento pro servidor. A página
comercial fala em Modbus TCP, mas **esta instalação não parece ser assim**.

**Confirmado em campo pelo Matheus (10/09/2026):** é um módulo que se conecta por **USB ao PC do
terminal**, e os **cabos do painel da máquina** chegam nas entradas desse módulo.

## 8.3.1 ⚠⚠ OS MÓDULOS SÃO ALUGADOS DA SKA — e isso decide a arquitetura

Matheus (10/09/2026): *"esses IO são da SKA alugados, então se migramos pro nosso MES vamos ter
que comprar novos dispositivos"*.

Isso **encerra a discussão de reaproveitamento**: o hardware volta junto com o contrato. Não há o
que reaproveitar, e portanto **não há concessão a fazer** — compramos o hardware certo:

**→ Módulo de entradas digitais Modbus TCP (Ethernet), trilho DIN, 24 VDC. Três unidades.**

**O que se aproveita, e é o que importa:** a **fiação do painel** de cada máquina é da Torg e
continua. Os mesmos fios saem dos bornes do módulo USB e entram nos bornes do módulo novo —
serviço de eletricista, não de reengenharia.

**Por que Ethernet é melhor do que o que existe hoje**, e não só "equivalente":
- O coletor deixa de depender do **PC do terminal estar ligado** e de um serviço de fornecedor
  rodando nele. Hoje, PC desligado = sinal perdido.
- Protocolo aberto: qualquer linguagem lê Modbus TCP (em Node, `modbus-serial`/`jsmodbus`).
- Vários clientes podem ler o mesmo escravo → dá para **rodar em paralelo** com o sistema antigo
  durante a validação, se ainda houver sobreposição.

**A levantar antes de comprar:**
1. **Natureza do sinal no painel** — os fios que hoje chegam ao módulo são contato seco, 24 VDC
   ou tensão de comando (110/220 VAC)? Isso define o tipo de entrada do módulo; sinal em VAC
   exige entrada apropriada ou relé interposto.
2. **Quantas entradas por máquina** — hoje o Syneco lê `Spindle` e `CycleCount64`. Um módulo de
   8 ou 16 entradas dá folga para parada, alarme e o que vier.
3. **Quando termina o contrato de locação da SKA** — é o que define o prazo real da migração.

> **Sequenciamento:** a compra **não bloqueia nada**. Das 54 máquinas, 51 são apontamento
> manual. O piloto começa por um **posto manual**, validando sessão, evento, quantidade, parada e
> monitor; o laser com IoT entra depois, quando o núcleo já estiver provado — que é exatamente a
> ordem que o roadmap do Codex propõe (§11 do relatório dele).

---

# 9. O gateway local deixa de ser opção e vira obrigação (10/09/2026)

Pergunta do Matheus: *"se cair a internet, as máquinas param de mandar sinal pro terminal PC?"*
A resposta desfaz uma confusão e **fecha a arquitetura**.

## 9.1 Internet ≠ rede local

O módulo Modbus TCP se liga ao **switch da fábrica**, não à internet. Internet fora → **a LAN
continua**, e o módulo segue respondendo a quem perguntar de dentro da fábrica. O que cai é a
ponte fábrica → nuvem. É o que já acontece hoje: o serviço da SKA lê o USB e entrega ao
**servidor Syneco na LAN** — internet nunca entrou nessa conta, e é por isso que a fábrica é
resiliente hoje.

## 9.2 ⚠⚠ Gateway na nuvem não funcionaria NEM COM internet

Um poller hospedado na Vercel **não alcança** esses módulos: IP privado, atrás do NAT da fábrica.
Para alcançá-los seria preciso **expor um dispositivo Modbus à internet** — e **Modbus não tem
autenticação nenhuma**. Seria publicar as entradas da máquina para qualquer um. Não se faz.

**Portanto: o gateway local é requisito do IoT, não preferência de arquitetura.**

## 9.3 A arquitetura que isso fecha

```
Painel da máquina → módulo Modbus TCP (LAN)
                          ↑ polling
              GATEWAY LOCAL TORG (PC na LAN, fila durável)
                          ↓ HTTPS, quando houver internet
                    Portal (Vercel + Neon)

Totens (navegador) ──→ falam com o GATEWAY LOCAL primeiro
```

**E aqui o problema de disponibilidade do §7.2 se resolve de brinde:** o mesmo gateway que faz o
polling do Modbus **serve os totens e guarda a fila durável**. Internet cai → a fábrica continua
**operando inteira** (aponta, vê o monitor, coleta sinal), não apenas capturando. Quando volta, o
gateway descarrega no portal.

Isso **substitui** a mitigação anterior (PWA offline-first como resposta principal). O PWA
continua útil como camada extra — se o totem perder a LAN, ele ainda enfileira — mas a resposta
de verdade é o gateway.

## 9.4 O hardware do gateway já existe

Quando o Syneco sair, o servidor **`DESKTOP-IONH0V7` / 192.168.0.190** fica livre — é onde o
gateway vai morar. Sem compra adicional além dos 3 módulos de I/O.

> **Consequência para o §7.4 (isolamento):** o gateway ter banco próprio local reforça a decisão
> de **acoplamento fraco** já tomada no schema (`opId`/`funcionarioId` sem FK). O que roda no
> gateway não pode depender de FK para tabela do portal.

## 8.4 A lógica que teremos de reescrever

O I/O Collect não entrega evento pronto: ele entrega **sinal**, e o SYNECO Device aplica regras
("sequência de regras padrão que tratam as informações vindas das máquinas", incluindo filtro de
ruído). Ou seja, mesmo reaproveitando o hardware, **a tradução sinal → evento é nossa**:

- borda de subida/descida do `Spindle` → início/fim de produção;
- ausência de sinal por mais que a tolerância (hoje 300s) → parada automática;
- incremento de `CycleCount64` → ciclo concluído — **e ciclo NÃO é peça**: um nesting de laser
  rende várias marcas e várias peças por ciclo (ver §7.3);
- `DeviceConnectionChange` → alimenta a dimensão **conectividade**, que é separada do estado
  produtivo (§7.3): coletor mudo **não** é máquina parada.

---

# 10. O laboratório local (10/09/2026)

O banco onde o MES vai ser desenhado. Schema **completo** (portal + MES), dado **real** de
produção, e **zero** conexão com o Neon na hora de escrever.

## 10.1 ⚠⚠ Postgres SEM `sudo` — e por que não foi `apt install`

O plano dizia `sudo apt install postgresql`. **Não foi assim**, e a troca é melhor, não um
contorno:

| | `apt install` | o que foi feito |
|---|---|---|
| Instalação | pede **senha do sudo** | nenhuma senha |
| Onde vive | serviço do sistema, `/var/lib/postgresql` | `~/.local/share/torg-mes-lab` |
| Descartar | `apt purge` + limpar diretórios | `rm -rf` numa pasta |
| Colide com a máquina | porta 5432, usuário `postgres` do sistema | porta **55432**, usuário próprio |

`npm i embedded-postgres` baixa o binário **oficial** do PostgreSQL (é 18.4 de verdade, não uma
emulação) para o diretório do usuário e o roda como processo comum. É o mesmo padrão que o
`graphify` e o Playwright já usam neste projeto: **ferramenta pesada em `~/.local/share`, fora do
repositório** — 200 MB dentro do projeto seriam um acidente esperando o `git add -A`.

O ganho que importa não é evitar a senha: é o laboratório ser **descartável**. Errar aqui não
suja a máquina, e recomeçar do zero é apagar uma pasta.

## 10.2 ⚠⚠ A trava que impede o import de escrever em produção

`scripts/mes-lab/destino.mjs`. Duas regras, e as duas existem por um acidente concreto:

1. **Origem e destino saem de variáveis DIFERENTES.** A origem é `DATABASE_URL` (Neon, só leitura);
   o destino é `MES_LAB_URL`, e só ela. Se o destino também caísse em `DATABASE_URL`, **esquecer de
   exportar a variável** faria o script despejar dado de demonstração dentro da operação. Assim,
   esquecer não faz nada acontecer — o script para antes de abrir conexão.
2. **O destino é validado: tem que ser esta máquina.** Variáveis separadas não bastam, porque o
   erro provável é *copiar a URL do `.env.local`* para a variável certa. A URL do Neon é
   sintaticamente perfeita; só a checagem de host a separa do desastre.

Coberta por `testes/lib/mes-lab-destino.teste.js` — código puro, sem banco. É o teste mais barato
do projeto e cobre o pior acidente possível deste script.

> ⚠ Antes do `db push` foi preciso **provar** que a variável de ambiente vence o `.env` que o
> Prisma carrega sozinho. A prova foi uma sonda inofensiva (`CREATE TABLE "_sonda_isolamento"`) e a
> conferência de **onde ela caiu**. Se tivesse caído no Neon, o `db push` seguinte teria tentado
> dropar `ExpedicaoItemExcluido` — o drift conhecido do schema.

## 10.3 O que NÃO viaja para o laboratório

O import traz `User` porque `OP.createdById` tem FK — sem os usuários o Postgres recusa toda obra.
Mas duas coisas são cortadas na entrada:

- **Hash de senha** → substituído por `LABORATORIO-SEM-SENHA`. Hash não é "dado realista", é
  **credencial**: nada no laboratório precisa autenticar ninguém, e copiá-lo criaria uma segunda
  cópia do material que abre o portal, num banco sem senha forte e sem backup.
- **`User.funcionarioId`** → zerado. Ele aponta para `Funcionario`, a ficha de RH (CPF, salário,
  holerite). Trazer a tabela junto arrastaria o RH inteiro para um laboratório **para nada** — o
  MES não usa esse vínculo. Cortar o ponteiro é mais barato e mais seguro que copiar o alvo.

Conferido depois de importar: **0 hashes bcrypt, 0 vínculos de RH, 0 linhas de `Funcionario`.**

## 10.4 ⚠⚠ Um `return` engolia metade do `ensure-mes-tables.mjs`

Achado ao instalar o índice parcial de `MesSessao` (§7.3): o índice não aparecia no banco, e o
script dizia "OK" no fim.

A causa: uma guarda no meio do arquivo — *"as tabelas `MesApontamento`/`MesSyncLog` já existem?"* —
saía com `return` **da função inteira**, em vez de pular só a criação delas. Como em qualquer banco
já inicializado essas tabelas existem, **tudo o que vinha depois nunca rodava**. Junto com o meu
índice ia a verificação do **event trigger de proteção**, que portanto nunca foi conferida em
produção desde que existe.

Virou guarda de **bloco** (`if/else` + função `criarTabelasDoAgente`): o que é condicional é a
criação, não o fim do script.

> **A lição, que é a mesma da aba `Revisao`:** um script que termina dizendo "OK" sem ter feito o
> trabalho é pior que um que falha. Os dois defeitos deste projeto em 2026 são a mesma família —
> **relatar intenção como se fosse resultado**.

## 10.5 A trava de sessão única por recurso, provada

`travaDaSessaoDoRecurso` cria o índice parcial
`ON "MesSessao"("recursoId") WHERE status = 'ABERTA'`. Testado contra o banco de verdade:

| Tentativa | Resultado |
|---|---|
| 1ª sessão ABERTA no recurso `09` | aceita |
| 2ª sessão ABERTA no mesmo recurso | **recusada** — `MesSessao_recursoId_aberta_key` |
| 2ª sessão depois de encerrar a 1ª | aceita |

A terceira linha é a que importa: um índice que travasse também isso deixaria o recurso com uma
única sessão na vida inteira.

---

# 11. O cadastro é NOSSO, não do Syneco (10/09/2026)

Matheus, depois de eu propor importar recursos e operadores da API do SKA: *"o ideal não é usar os
dados do Syneco para fazer nosso MES, o ideal é usar as funcionalidades dele para criar o nosso com
nossa cara"*. E na sequência, apontando o caminho: *"tem o Gantt que o Vitor fez para programar
produção da fábrica, nele podemos usar para liberar as marcas em cada máquina/bancada"*.

Isso **derrubou o bloqueio por credencial SKA** e mudou o desenho.

## 11.1 O Gantt já é o que faltava

Eu tinha concluído que só o `MesOrdem` do Syneco sabia o que falta por setor — nove módulos de
`lib/` leem dali. Estava errado: `app/pcp/producao/_gantt/` **programa marca por bancada e por dia**,
e grava direto na peça (`corteDiaProgramado`+`maquina`, `montagemDiaProgramado`+`montagemBancada`,
`soldaDiaProgramado`+`soldaBancada`). O totem não inventa nada — **lê o que o PCP já programou**.

⚠ **A cobertura é fina, e isso é normal.** 246 peças com bancada de montagem, 168 de solda, 3 de
pintura, de 21.772. O Gantt programa o horizonte próximo, não o backlog. Então o totem **precisa** de
saída para "não há programação para hoje" — é aí que o bipar livre entra, validado contra a L.E.
Sem isso, máquina não programada não aponta nada.

## 11.2 ⚠⚠ O VOCABULÁRIO É O DO GANTT

| | Syneco | Gantt (**adotado**) |
|---|---|---|
| Solda 5 | `40E` | `SOLDA 5`, rotulado **Wilson Barros** |
| Montagem 1 | `30A` | `MONTAGEM 1`, rotulado **Jurandir** |
| Laser Chapa | `09` | `LASER_CHAPA` |

O Vitor já tomou essa decisão quando batizou as bancadas com o nome de quem senta nelas — quem
distribui trabalho fala em pessoa, não em código. O código do Syneco entra só como campo de
reconciliação enquanto os dois rodarem em paralelo, e **morre junto com o Syneco**.

De brinde, descarta os **15 recursos mortos**: o Syneco tem 53 cadastrados, mas só **38** apontaram
em 6 meses. Nascer do que produz é mais limpo que herdar cadastro com linha morta.

## 11.3 ⚠⚠ CORTE VIRA **PREPARAÇÃO** — E ABSORVE AS MÁQUINAS `20x`

Matheus (10/09/2026): *"o Corte vai ser Preparação o nome do setor"*.

Antes de aplicar, conferido no dado — porque **"Preparação" já existia no Syneco como outro setor**:

| Setor | Op. | Máquinas | Último apontamento |
|---|---|---|---|
| **Corte** | 10 | `09` Laser Chapa, `10` Laser Tubo, `10A` Laser Cantoneira, `11` Laser Perfil, `10C` Metaleira, `10E` Policorte | **hoje** |
| **Preparação** | 20 | `20C`/`20D` Furadeira Magnética, `20A`/`20B` Plasma Manual, `20F` Rosqueadeira | **05/02/2026** |

A Preparação rodou set/2025 → fev/2026 e **parou de apontar há sete meses** — 399 apontamentos
contra 16.824 do Corte. Matheus confirmou a leitura: **os dois viraram um setor só**, chamado
**Preparação**, com os 6 lasers **mais** as 6 máquinas `20x`. O silêncio de fevereiro não foi o setor
morrendo; foi ele sendo absorvido.

⚠ **Ao projetar de volta para `MesApontamento`/`MesOrdem`** (o contrato do §2), lembrar que lá
"Corte" e "Preparação" são operações DIFERENTES (10 e 20). `lib/conjuntos-setor.js`
(`CADEIA_SYNECO`) e `lib/produzido-setor.js` mapeiam pelos nomes do Syneco — a fusão não pode
vazar para eles sem revisão, senão dois setores viram um no meio de um relatório que hoje bate.

## 11.4 ⚠⚠ AS TELAS DE CADASTRO MANDAM NA MODELAGEM DE AGORA

Matheus: *"precisamos ter essas telas depois para criar e excluir setores, máquinas dos
setores/bancadas"*. É "depois" no cronograma, mas **não** na modelagem:

- Setor deixa de ser string em `MesRecurso` e vira **`MesSetor`** (com `ordem`, que é a cadeia
  física da fábrica — hoje um array fixo em `CADEIA_SYNECO`).
- O semeio a partir do Gantt é **bootstrap de uma vez**, não fonte permanente. Depois dele, quem
  manda é o banco.

⚠⚠ **E AQUI NASCE UMA SEGUNDA VERDADE SE NINGUÉM OLHAR.** Hoje os recursos do Gantt são
**constantes no código**: `RECURSOS` em `app/pcp/producao/_gantt/recursos.js`, `BANCADAS` e
`SOLDADOR_DA_BANCADA` em `lib/solda-capacidade.js`. Se o MES ganhar cadastro em banco com telas de
criar/excluir, passam a existir **duas listas de bancadas** — e a primeira bancada nova cadastrada
pela tela não aparece no Gantt. O fim de linha correto é o Gantt **ler o cadastro do MES**, e as
capacidades (que são medidas, não escolhidas) migrarem para colunas de `MesRecurso`. Isto é o mesmo
erro que `lib/baixa-syneco.js` e o sino de notificações já documentam ter custado caro neste
projeto; está escrito aqui para não ser redescoberto na terceira vez.

---

# 12. A engine de NESTING da Preparação (11/09/2026)

Matheus: *"precisamos pensar em uma engine para ser os arquivos NESTING do programador das máquinas
da Preparação, dessa forma o operador apenas seleciona o NESTING que ele vai cortar e já puxa todas
as MARCAS para abrir na tela do operador"*.

## 12.1 ⚠⚠ O NESTING É A PEÇA QUE FALTA ENTRE O CICLO DO CNC E A MARCA

O §8.4 já tinha topado com o buraco sem nome: *"incremento de `CycleCount64` → ciclo concluído — e
ciclo NÃO é peça: um nesting de laser rende várias marcas e várias peças por ciclo"*. Enquanto o
portal não souber **o que tem dentro da chapa**, o contador do laser é um número sem tradução.

Com o plano carregado, um ciclo deixa de ser um número e vira **um conjunto conhecido de marcas**.
É a mesma peça que atende o pedido do Matheus (o operador escolhe o plano, não digita marca) e a que
torna o apontamento automático possível depois. Não são dois trabalhos, é um.

## 12.2 ⚠⚠ E FECHA A RASTREABILIDADE DO MATERIAL — DE DECLARAÇÃO PARA FATO

Hoje o rastreio do material no corte é uma **declaração por perfil**: `TrocaRastreabilidade` grava
*"todo este perfil, nesta OP, veio deste lote"*. O próprio schema documenta o preço disso na OP-106
— o perfil `CH12.50X100` tinha 1 peça de estoque e 3 corretamente rastreadas, e aplicar a declaração
nas 4 **apagaria rastreio bom**; foi de onde nasceu o escopo `SEM_R`.

O nesting é por **chapa**. Bipando o R da chapa ao abrir o plano, **todas as marcas daquele plano
herdam o R como fato**, não como declaração — e a distinção `TODAS`/`SEM_R` deixa de ser necessária
para o que passar por aqui. É o mesmo ganho que a Conferência de Peça teve ao contar contra a L.E.
em vez de contra a memória de quem confere.

## 12.3 As entidades (provisórias)

- **`MesNesting`** — o plano: número, máquina (`MesRecurso`), material + espessura, dimensão da
  chapa, nº de chapas previstas, arquivo de origem, hash do arquivo, quem programou, estado.
- **`MesNestingItem`** — uma linha por marca no plano: marca, `pecaConjuntoId` (quando casar),
  `opNumero`, **quantidade POR CHAPA**. É aqui que mora a explosão.
- **`MesNestingChapa`** — o fato: chapa nº N do plano cortada, quando, por quem, com qual R, e se
  saiu inteira ou sucateada.

⚠ **A quantidade do item é POR CHAPA, não total.** Guardar o total obrigaria a dividir de volta a
cada apontamento, e divisão que não fecha em inteiro é onde nascem as meias-peças. Total = por chapa
× chapas cortadas, sempre derivado — a mesma regra do §3.1 (o fato é o evento; quantidade é
projeção).

## 12.4 O fluxo, decidido com o Matheus (11/09/2026)

**Entrada: os dois caminhos.** Pasta varrida como padrão — o programador salva onde já salva hoje e o
plano aparece sozinho, sem passo novo no trabalho dele (*passo novo é passo que se esquece, e um
nesting não subido é máquina parada esperando*) — mais upload manual na tela do PCP para o que a
pasta não cobre: plano refeito na hora, arquivo que veio por e-mail.

**Apontamento: "cortei mais uma chapa".** Um toque por chapa; o portal explode nas marcas do plano.
Marca a marca era justamente o trabalho a tirar do operador — um nesting de laser tem dezenas de
marcas. ⚠ **Precisa de saída para a chapa que não saiu inteira** (colisão, sucata, chapa curta): sem
ela, o operador mente na contagem ou não aponta, e os dois estragam o mesmo número.

## 12.5 ⚠⚠ O QUE ESTÁ BLOQUEADO, E POR QUE NÃO DÁ PARA COMEÇAR SEM

**O formato do arquivo.** Matheus vai mandar um nesting real exportado. Escrever o leitor contra uma
suposição de formato é o erro mais caro possível aqui: o leitor é 80% do trabalho, e um leitor feito
para o formato errado não se conserta, se joga fora.

O que precisa vir no exemplo, do **mesmo plano**:

1. o **relatório do plano** (PDF/HTML/CSV/XLS — o que o software exportar), que é onde costuma estar
   a lista de peças com quantidade por chapa;
2. o **programa NC** (`.nc`, `.tap`, `.cnc`…), porque em alguns fluxos a lista de marcas só existe
   nos comentários dele;
3. qualquer **exportação estruturada** que o software ofereça (XML/CSV/JSON).

A pergunta que o exemplo tem de responder: **a MARCA da Torg aparece no arquivo?** Se o nesting
chamar as peças por um id interno do software de CAM, falta um passo de casamento — e aí o desenho
muda, porque o casamento tem de ser explícito e conferível, nunca adivinhado por semelhança de nome.

## 12.6 Riscos já visíveis

- ⚠⚠ **Plano que mistura OPs.** É normal e é o ponto do nesting (aproveitar chapa). A baixa tem de
  cair na OP certa marca a marca — `lib/reconciliar-syneco-corte.js` casa por `opId|marca`, então o
  item do plano precisa carregar a OP, não só a marca.
- ⚠⚠ **Segunda verdade de "o que produzir".** O §3.2 é explícito: *não criar tabela nova de ordem de
  produção*. O nesting **não** é uma nova lista do que fazer — é um agrupamento físico de marcas que
  já existem em `PecaConjunto`. Item de plano que não casar com marca conhecida tem de aparecer como
  pendência, não entrar calado.
- ⚠ **Replano.** O programador refaz o plano e salva por cima. O hash do arquivo existe para isso: o
  mesmo número com conteúdo diferente é um plano NOVO, e o antigo só pode ser substituído se ainda
  não tiver chapa cortada.
- ⚠ **Sobra/retalho** fica fora deste escopo — é a tela `/pcp/aproveitamento`, hoje em construção.
  Anotado para não virar escopo por acidente.

---

# 12.7 Os formatos, decifrados (11/09/2026)

Matheus mandou `ARQUIVOS MARTHA 1.rar` com um nesting real de **cada uma das três máquinas**, mais a
explicação do próprio programador. O §12.5 está **desbloqueado**. Nada aqui é binário fechado.

| Máquina | Software | Arquivos | O que é |
|---|---|---|---|
| Laser Perfil | **TubesT azul** | `.pdf` · `.yxy` · `.zh` | PDF do operador · projeto · **1 arquivo por barra** |
| Laser Cantoneira / Laser Tubo | **TubesT verde** | `.pdf` · `.yxy` · `.zx` | idem |
| Laser Chapa | **Libellula** | `.pdf` · `.lxd` | PDF do operador · arquivo da máquina |

O programador, sobre os `.zx`: *"cada Nest 1, 2, 3, 4… são cada BARRA que ele precisa cortar"*.

⚠⚠ **NO PERFIL/TUBO, "NESTING" É UMA BARRA — NÃO UMA CHAPA.** O §12.4 decidiu apontar por chapa; a
unidade física real aqui é **a barra**, e cada uma tem seu próprio arquivo. Isso *melhora* o desenho:
o operador escolhe o trabalho e aponta **Nest 1, Nest 2…** conforme corta cada barra, e a lista de
marcas daquela barra é conhecida. No Laser Chapa a unidade continua sendo a chapa.

## 12.7.1 ⚠⚠ O ARQUIVO DA LIBELLULA NÃO TEM NOME DE PEÇA NENHUM — E ISSO DECIDE A ENGINE

O `.lxd` é XML aberto (`<LXDDocument>`), mas só geometria: **744 polilinhas, 21 círculos, zero
texto**. As marcas gravadas na chapa são vetorizadas — viraram desenho, não texto. Não existe ali o
nome de uma peça sequer.

Os `.zx`/`.zh`/`.yxy` do TubesT são **ZIP** e, dentro, `Portions/content.xml` lista as marcas:

```xml
<NestedTube Name="I-Beam 148 X 100 X 4,3 X 4,9  R11,1,45°_Nest 1">
  <PackSegments><WorkSeq><Seg .../>…7 segmentos…</WorkSeq></PackSegments>
</NestedTube>
<ExtParts>
  <NestPart Name="T107A-P3_10"/> <NestPart Name="T107A-P12_2"/> …
</ExtParts>
```

⚠ **Mas a quantidade por barra vem indireta** — são os `<Seg>` do `WorkSeq` (7 peças em 5 tipos na
Nest 1); é preciso casar handle de segmento com `NestPart`. O PDF entrega isso pronto.

**Conclusão que fecha o desenho:** uma engine que lesse os arquivos de máquina **não funcionaria para
o Laser Chapa**, que é justamente a que mais produz. O **PDF é o leitor primário** — é a única fonte
que cobre as três máquinas com a mesma informação. Os arquivos de máquina entram como **conferência**
e como o vínculo "qual arquivo é esta barra".

## 12.7.2 O que cada PDF entrega

**TubesT** (as duas cores, layout idêntico) — três blocos:
- `Part Info` — a lista mestra: `ID · Part Name · Qty (feitas/total) · Part Length`;
- `Tube Info` — `Tube Count 4/999 · Tube Length 12000,00 · Cutoff`;
- `Nesting List` — **um bloco por barra**, com `Parts per tube`, `Remnant Length`, `Utilization`, e a
  tabela `Part Name · Qty · Identical parts per tube`.

**Libellula** — duas páginas:
- pág. 1, o cabeçalho do plano: `Chapas n° 1`, material `AÇO`, espessura `9.53`, chapa `1500 x 3000`,
  peso da chapa e das peças, tempo de corte, aproveitamento;
- pág. 2, a tabela: `ID · Código de peça · Dimensão · Perímetro · Peso · Qty peça · Piercing`.

⚠ Na Libellula o código vem com a pasta do projeto na frente — **`T107-TMSA\T107A-P14`**. A marca é o
que está depois da contrabarra.

## 12.7.3 ⚠⚠ CONFERIDO CONTRA O BANCO: 28 DE 28 MARCAS CASARAM

A pergunta do §12.5 era *"a MARCA da Torg aparece no arquivo?"*. Aparece — e casa exato com
`PecaConjunto`:

| Plano | Marcas | Casaram |
|---|---|---|
| OP T107A · Laser Cantoneira/Tubo (4 barras) | 11 | **11/11** |
| OP T107A · Laser Chapa (1 chapa, 64 peças) | 15 | **15/15** |
| OP 097 · Laser Perfil (1 barra) | 2 | **2/2** |

E **as quantidades também batem**: `T107A-P1` tem `qte=8` no portal, o arquivo o chama de
`T107A-P1_8` e o PDF diz `Qty 8/8`. Idem `P3_10` (qte 10), `P12_2` (qte 2), `T97A5_1` (qte 1).

⚠ **O sufixo `_N` é convenção do programador, não campo do software.** Serve de *conferência* — se
discordar do `qte` do portal, ou a LPC mudou ou o nesting saiu de uma lista velha, e isso tem de
aparecer. Nunca como fonte da quantidade.

⚠⚠ **O NOME DA MARCA MUDA DE PLANO PARA PLANO.** Laser Cantoneira/Tubo: `T107A-P1`. Laser Perfil:
`T97A5` — sem hífen e sem "P". A única regra estável é *"o que vem antes do último `_N`"*. Casamento
tem de ser **exato contra `PecaConjunto`**, com o que não casar virando pendência visível — nunca
aproximação por semelhança de nome.

## 12.7.4 O nome do arquivo já traz a OP

`11-09-2026 - T107A - W150X13.pdf` → data · **chave da OP** · perfil. E `T107A` é literalmente o
`opNumero` de `PecaConjunto` (55 das 90 chaves distintas começam com "T" — o problema multi-chave do
CLAUDE.md). Melhor ainda: **`opId` está preenchido** nas peças conferidas, então a baixa pode casar
por `opId|marca`, igual `lib/reconciliar-syneco-corte.js`, sem depender da forma da chave.

No Laser Chapa o nome é `T107A - 9.50mm.pdf` — OP + espessura, e o perfil da peça no portal é
`CH9.50X128`. A espessura do nome bate com o perfil; a largura, não. Serve para conferir, não para
casar.

## 12.7.5 Estado de verdade, medido

As duas marcas da OP-097 (plano de **14/08**) estão `status=CORTE`, `qteProduzida=1` — já cortadas e
com baixa pelo Syneco. As da OP-107 (plano de **hoje**) estão `PENDENTE`, `qteProduzida=0`. O dado do
portal concorda com a data dos arquivos, o que é uma checagem de sanidade de graça.

## 12.7.6 ⚠⚠ A LISTA DO OPERADOR É O PRÓPRIO PDF — NÃO FALTA NADA NO PACOTE

Eu tinha registrado como pendência que *"a lista que ele dá para o operador ver as marcas do dia não
veio"*. **Veio.** Matheus (13/09/2026): *"a lista são os PDFs que estão dentro das pastas de cada
máquina"*. O PDF é **os dois documentos ao mesmo tempo**: o relatório do plano e o papel que vai
para a mão do operador.

Isso não é detalhe de catalogação — **é o contrato da tela do totem**. A tela não precisa inventar
como apresentar o trabalho: ela tem de mostrar o que o operador já lê hoje, na mesma ordem e com os
mesmos nomes, senão ele passa a conferir a tela contra o papel em vez de confiar nela. Ou seja:

- **TubesT:** `Part Info` (a lista mestra: marca · feitas/total · comprimento) e, por barra, o bloco
  `Nesting List` com `Parts per tube`, sobra e a tabela de marcas. É exatamente o que
  `lerRelatorioTubesT` já devolve.
- **Libellula:** o cabeçalho da chapa (material, espessura, dimensão, peso, tempo) e a tabela
  `ID · Código de peça · Dimensão · Peso · Qty · Piercing`. É o que `lerRelatorioLibellula` devolve.

⚠ E fecha a razão de o PDF ser o **leitor primário** (§12.7.1): não é só porque cobre as três
máquinas — é porque é **o documento que a fábrica já usa**. O arquivo da máquina entra por cima,
dando a ordem de corte e a conferência peça a peça (§12.8.1).

> ⚠ Os arquivos de exemplo têm dado real de obra (OP-107/TMSA, OP-097). Ficaram **fora do
> repositório**, no diretório temporário da sessão — como os dados do laboratório (§10.3).


---

# 12.8 A ENGINE, ESCRITA E CONFERIDA NOS ARQUIVOS REAIS (13/09/2026)

Relendo o `.rar` **inteiro** — não só o `Portions/content.xml`, que foi até onde a primeira análise
foi — apareceu o que faltava. Código em `lib/mes/nesting/`; roda com:

```bash
npx vite-node -c vitest.config.mjs scripts/mes-lab/ler-nesting.mjs -- <pasta-do-plano>
```

## 12.8.1 ⚠⚠ A MARCA ESTÁ GRAVADA NA PEÇA, E O ARQUIVO DIZ QUAL É

O §12.7.1 dizia que a quantidade por barra "vem indireta" e que o PDF entregava isso pronto. Vem
direta: `Shapes/content.xml` tem `<TextData Text="T107A-P12_2"/>` — **o texto que o laser grava na
peça** — e `Segments/content.xml` diz qual `TubeSegment` carrega qual `<Text>`. Com isso o arquivo
da máquina entrega **a ordem de corte, peça a peça**, que o PDF não tem. É o que vai permitir ao
totem dizer *"está cortando a 3ª de 7"*.

O inventário completo do ZIP (o que a primeira leitura não viu): `info.xml` (**quem gerou**:
`TubesT 2025V2.12`, motor CypTube, computador `ENGENHARIA02`), `content.xml` (metadados +
`CADLabelSettingsManager`, que é onde mora a regra de gravação), `Segments/`, `Shapes/`, `Curves/`,
`Surfaces/`, `Geometrys/`, `Portions/`, `Technical/`, `Configs/`, `Layers/`, `Viewports/`,
`Thumbnail/` (uma imagem por tipo de peça).

## 12.8.2 ⚠⚠ A PEÇA CURTA NÃO TEM NOME — E É POR ISSO QUE O PDF CONTINUA MANDANDO

A `T107A-P3` tem **62,30 mm**. Não cabe gravação, e o TubesT não põe texto nela: ela sai **sem nome**
no arquivo da máquina. São **10 das 35 peças** do plano T107A.

O relatório diz quantas são. Cruzando os dois (`conciliarBarra`), cada corte ganha nome:

| Barra | Peças | Gravadas | Deduzidas do PDF | Confere |
|---|---|---|---|---|
| Nest 1 | 7 | 6 | 1 | ✔ |
| Nest 2 | 11 | 11 | 0 | ✔ |
| Nest 3 | 11 | 7 | 4 | ✔ |
| Nest 4 | 6 | 1 | 5 | ✔ |
| Laser Perfil, Nest 1 | 2 | 2 | 0 | ✔ |

**35 de 35 nomeadas, as quatro barras fechando peça a peça.**

⚠⚠ **A DEDUÇÃO É TENTATIVA, E SE DESFAZ.** Só vale quando sobra **uma** marca candidata *e* a barra
fica sem nenhuma outra divergência. Nomear peça no meio de um plano que já não bate é carimbar
palpite em cima de dado suspeito.

⚠⚠ **E ELA SUPÕE QUE O PDF E O ARQUIVO SÃO DA MESMA VERSÃO — que nenhum dos dois prova sozinho**
(achado do Codex). No replano (PDF velho, arquivo novo com a peça sem gravação já trocada), a conta
fecha e a marca sai errada, calada. Quem tem de garantir isso é a **importação**, gravando o hash
dos dois arquivos **como um par**. Por isso `deduzida: true` viaja até a tela: peça deduzida é peça
para conferir no olho.

## 12.8.3 A Libellula: o censo de tags fecha a questão

Censo do `.lxd` real: `LwPolyline` 744 · `Point` 6.202 · `LeadIn` 185 · `Circle` 21 · `Channel` 17 —
e **nenhuma tag de texto**. A marca gravada na chapa está no **canal 2** (579 polilinhas
vetorizadas). Não existe nome de peça ali, e não é questão de procurar melhor.

⚠ **A conta que confere:** contornos de corte (canal 1, **164**) + furos (**21**) = **185** =
`Piercing N.` do relatório. É o que pega o par errado sem depender do nome do arquivo — mas **não é
prova de identidade** (dois planos da mesma obra podem dar os mesmos números), e está escrito assim
no código.

## 12.8.4 O que quebrou ao rodar nos arquivos de verdade

Duas coisas que os testes com recortes não pegariam, e a rodada real pegou:

1. **O `.yxy` não disputa a barra com o `.zx`.** O plano inteiro contém as mesmas barras que os
   recortes — a minha detecção de "índice repetido" (pedida pelo Codex, e correta) acusou
   ambiguidade nas **quatro** barras de um plano perfeito. Vale o arquivo **da barra**, que é o que
   vai para a máquina; o plano só preenche a barra sem recorte.
2. **A chapa não está no `<ExtMax>`** — ele vem `-50..50`, o padrão do documento vazio. A chapa é a
   polilinha de **contorno** (`NoExport="1"`). Lendo do cabeçalho, a conferência acusava
   *"1500x3000 contra 50x50"* num arquivo correto.

## 12.8.5 O número escrito de dois jeitos

⚠⚠ O TubesT escreve `679,60` e a Libellula escreve `9.53` — **no mesmo plano, no mesmo dia**. Minha
primeira conta apagava todo ponto: um relatório em `679.60` viraria **67960**, uma barra 100× mais
comprida, sem erro nenhum. E adivinhar não resolve, porque a ambiguidade é real: `1.352` é o peso
1,352 kg de uma peça da Libellula e `1.500` são mil e quinhentos milímetros no TubesT — a mesma
string, dois números. Por isso **quem chama declara a convenção** (`numeroTubesT` / `numeroLibellula`),
e quem chama sabe, porque sabe de qual software é o arquivo.

## 12.8.6 A "engine" não era um download

O que era preciso instalar, na verdade, era **o extrator do `.rar`** — e ele já existia na máquina
(o WinRAR do Windows, chamado do WSL). Para ler os planos, as duas bibliotecas necessárias **já são
dependências do portal**: `pizzip` (os `.zx`/`.zh`/`.yxy` são ZIP) e `unpdf` (os relatórios). Nada
proprietário: os três formatos são ZIP+XML ou XML puro. O TubesT e a Libellula continuam sendo do
programador — o portal não precisa deles para ler o que eles exportam.


---

# 14. As telas de cadastro (13/09/2026)

`/mes-lab/cadastro` — setores, postos, motivos de parada e operadores. Até aqui tudo isso só nascia
do `scripts/mes-lab/semear-cadastro.mjs`, que é **bootstrap de uma vez, não fonte permanente**
(§11.4): depois dele, quem manda é o banco, e é aqui que se escreve.

Regras em `lib/mes/cadastro.js` (a rota e a tela só as chamam):

- ⚠⚠ **O que tem histórico não se apaga, se desativa.** Um posto com apontamento é a âncora do que
  foi produzido nele; apagá-lo deixaria o evento órfão e o relatório do mês passado passaria a
  mentir. O botão de excluir **só existe** para quem nunca foi usado — mostrar e deixar o servidor
  recusar é prometer o que não se cumpre.
- ⚠⚠ **O código congela ao primeiro uso.** Ele é o vínculo com o que o PCP programou
  (`PecaConjunto.soldaBancada = "SOLDA 5"`). Trocado depois, a bancada continua na tela e para de
  receber programação — falha silenciosa. O campo fica travado, com o motivo à vista.
- ⚠ **O espaço do meio do código fica.** "SOLDA 5", "MONTAGEM 1" — é a string gravada em 21.772
  peças. Normalizar tirando o espaço criaria um posto que não casa com nada.

## 14.1 ⚠⚠ O TOTEM DO ACABAMENTO E DA PINTURA NUNCA MOSTRAVA NADA

Achado **pela própria tela de cadastro**, no primeiro carregamento, e confirmado no banco:

| Campo do Gantt | O que está gravado | O que o MES cadastra |
|---|---|---|
| `acabamentoBancada` | `ACABAMENTO` (83 peças) | `ACABAMENTO1`…`ACABAMENTO10` |
| `pinturaBancada` | `GALPAO_1` (3 peças) | `PINTURAAIRLESS`, `PINTURAELETROSTATICA` |
| `soldaBancada` | `SOLDA 1`…`SOLDA 7` | os mesmos ✔ |
| `maquina` | `LASER_CHAPA`… | os mesmos ✔ |

`programadoPara` filtrava por `campo = recurso.codigo`. No Acabamento isso procurava
`acabamentoBancada = "ACABAMENTO7"`, que **não existe em peça nenhuma** — a tela dizia *"nada
programado para este posto hoje"* todo dia, para sempre, sem erro visível. Solda e Preparação batem
código a código, e foi por isso que passou despercebido em toda a validação do totem.

**As duas granularidades estão certas** e foram decididas com o Matheus (10/09/2026): o Gantt planeja
em balde onde a capacidade é kg/dia; o chão tem os postos físicos, porque **7 postos de acabamento
apontaram no mesmo dia** e uma sessão por recurso travaria o segundo operador. O que faltava era o
encaixe — e ele já estava escrito no semeador: **o vínculo entre planejar e executar é o SETOR**.

Agora, quando o código do posto **não é** um código que o Gantt conhece, a lista passa a ser a do
**setor inteiro**, e a tela diz isso (*"Esta é a programação de Acabamento — o PCP programa o setor,
não cada posto"*). Sem esse aviso, dois postos pegariam a mesma marca achando que era só deles.

Medido depois do conserto, contra o laboratório: `ACABAMENTO7` passou de **0 para 90 marcas**,
`PINTURAAIRLESS` de **0 para 3**; `LASER_CHAPA` (433) e `SOLDA 5` (60) seguem filtrando pelo posto.

## 14.2 ⚠⚠ O PRIMEIRO AVISO DA TELA ERA ALARME FALSO — E FOI TROCADO

A primeira versão comparava os postos **código a código** com a lista do Gantt e acusava 15
divergências. Depois do encaixe por setor, aquilo virou ruído: Acabamento, Pintura e as máquinas
`20x` da Preparação **são** diferentes de propósito. Alarme falso em ferramenta de alarme ensina a
ignorar a tarja — a mesma lição que o import de listas (§"Import de lista" no CLAUDE.md) já pagou.

Sobrou a pergunta que continua sendo defeito de verdade, em `setoresSemPosto`: **setor que o PCP
programa e que não tem nenhum posto ativo no MES**. Aí o trabalho existe no Gantt e não aparece em
terminal nenhum.

> ⚠ O Gantt continua com os recursos em **constante no código** (`RECURSOS`, `BANCADAS`). O fim de
> linha correto é ele ler este cadastro, mas as tabelas `Mes*` **não existem no Neon** e o Gantt é
> produção: pendurá-lo nelas hoje quebraria o que funciona. Fica para quando o MES virar a chave.


---

# 15. O monitor de máquinas (13/09/2026)

`/mes-lab/monitor` — a tela de cards da supervisão, feita para TV. Contrato: o dataset 131 do
Syneco (§6.4). Regras em `lib/mes/monitor.js`, rota `GET /api/mes-lab/monitor`, tela em
`app/mes-lab/monitor/`.

**⚠⚠ ELE SÓ LÊ.** Não existe POST, PATCH nem DELETE nessa rota, e nenhum caminho da tela grava
evento. É a decisão central: o monitor fica aberto o dia inteiro se atualizando sozinho, e um
defeito num caminho de escrita dele viraria apontamento fantasma repetido a cada 10 segundos.

## 15.1 O que o Codex corrigiu antes de isto ir ao ar

A primeira versão foi escrita por mim e revisada por ele (perfil `architecture`) **antes** de
existir tela. Três achados viraram código:

1. **Evento sem sessão não é máquina livre.** Eu tinha achatado três procedências num caso só: se
   não havia sessão aberta, *qualquer* último evento virava `LIVRE`. Só que `MesEvento.sessaoId` é
   **opcional** de propósito — é por aí que entram manutenção e o sinal do CNC (§6.6). Uma máquina
   **EM MANUTENÇÃO** apareceria como disponível, e o supervisor mandaria trabalho para ela. Agora:
   evento da sessão aberta vale; evento **do recurso** (sem sessão) vale, porque fala da MÁQUINA;
   evento de **outra** sessão não vale.
2. **O último evento não tinha desempate.** Eu buscava `groupBy(_max ocorridoEm)` e depois casava
   por igualdade de data num `OR` de pares. Dois problemas: sem `orderBy`, dois eventos no mesmo
   milissegundo faziam o card **piscar** entre dois estados a cada atualização; e a igualdade de
   `DateTime` falha **calada** se a coluna guardar precisão que o `Date` do JavaScript não carrega —
   o posto apareceria "SEM REGISTRO" sem erro nenhum. Trocado por `take: 1` na relação, com ordem
   **total** (`ocorridoEm`, `recebidoEm`, `id`). Sumiram as duas armadilhas e uma consulta.
3. **O saldo divergia do totem.** O monitor enxerga UMA sessão; `saldoDaMarca` soma **todas** as
   sessões da mesma obra+marca. Marca de 10 com 6 feitas ontem e 2 hoje: o monitor diria "faltam 8"
   e o totem "faltam 2" — duas verdades sobre o mesmo número, na mesma fábrica. **O campo foi
   removido**; volta quando for calculado pela mesma conta do totem.

Ele também apontou o que ficou **aceito como está**, e está escrito no código: as consultas não
compartilham um retrato único (a tela se corrige no ciclo seguinte, e prender uma transação
`RepeatableRead` a cada poll custaria conexão no Neon), e o desempenho do `take: 1` por relação
**não foi medido** em Neon — só no laboratório.

## 15.2 As decisões da tela

- **Parado, livre e sem registro são três contas separadas** no cabeçalho. Somar os três em "não
  produzindo" é o número que o Syneco entrega hoje e que não serve para agir: parada é problema
  para resolver agora, livre é máquina esperando trabalho, sem registro é posto que ninguém sabe.
- **O tempo decorrido é contado no navegador** (o servidor manda só o instante). Calculado no
  servidor, o número congela entre uma atualização e outra: a TV mostraria "12 min" parado por 10
  segundos e depois pularia para 13.
- **`setTimeout` depois da resposta, não `setInterval`** (recomendação do Codex): com intervalo
  fixo, uma consulta lenta faz as chamadas se empilharem. O passo dobra a cada falha até 2 min.
- **Falha de atualização aparece separada do estado da fábrica.** Rede caída mantém os cards com o
  último panorama e acende "sem atualizar há X"; apagar a tela faria o supervisor achar que a
  fábrica parou, quando quem parou foi o Wi-Fi.
- **Posto sem trabalho mostra só nome e estado.** Com 31 postos sem sessão, as linhas de "—"
  empurravam para fora da tela justamente os que estão produzindo (a captura caiu de 4.653 px para
  2.544 px ao encurtar o card vazio).
- **Alerta de sessão aberta há mais de 12 h.** Um turno tem 8-9 h; passou disso, atravessou a
  noite — quase sempre é o operador que foi embora sem encerrar. O monitor **aponta**, não
  conserta: escrever daqui é proibido. Na primeira validação ele pegou um caso real
  (MONTAGEM 1, 43 h — resto dos testes de 11/09).

## 15.3 A ponte com o Codex tinha quebrado, e ninguém sabia

`consultar.py` devolvia `CLI codex não encontrado`. Causa: o binário do Codex mora **dentro da
extensão ChatGPT do VSCode**, e o nome da pasta tem a versão (`openai.chatgpt-26.903.61454-…`). A
extensão se atualizou para `26.908` e o caminho gravado em `.claude/revisao-codex.local.json`
deixou de existir — a revisão automática morria em silêncio a cada Stop.

Conserto: `~/.local/bin/codex`, um lançador que resolve o caminho **na hora**, pegando a extensão
mais recente **pela data** (não pela ordem alfabética: "26.10" viria antes de "26.9" num `sort` de
texto). A configuração passou a apontar para ele. A próxima atualização da extensão não quebra
nada.

## 15.4 O visual: o padrão das TVs do portal (13/09/2026)

Matheus: *"deixe a tela do monitor com visual definido pelo nosso portal TORG, para seguir o mesmo
padrão dos relatórios e telas de TV que o Vitor está ajustando"*.

A referência é `app/planejamento/prioridades/PrioridadesClient.jsx` (a TV de Prioridades, que o PCP
reaproveita em `/pcp/dashboard-prioridades`). O monitor passou a usar o mesmo desenho: barra **navy**
(`bg-torg-dark`) com o logo branco, divisor, nome da tela e **relógio**; corpo claro (`#F3F6F9`);
título com a **tarja laranja** curta em cima; botão de **tela cheia**; cards brancos com borda fina.

⚠ **A cor do setor é a do CADASTRO (`MesSetor.cor`), que veio do `COR_SETOR` do Gantt** — a mesma
que pinta o setor na tela do PCP. Inventar uma paleta aqui faria o mesmo setor ter duas cores no
mesmo portal.

> ⚠ **Anotado para o Vitor decidir:** o Gantt e a TV de Prioridades **já discordam** entre si.
> `COR_SETOR` (Gantt) diz `CORTE #8e5cd9`, `SOLDA #c2410c`; `LANE_ACC` (TV) diz `CORTE #F4801F`,
> `SOLDA #D26713`. Não mexi em nenhum dos dois — escolher por conta própria criaria uma terceira
> verdade. O monitor segue o Gantt porque é de lá que o cadastro do MES nasceu.

⚠⚠ **"SEM REGISTRO" SUMIA NO FUNDO CLARO.** O mapa de estados nasceu para o totem, que é escuro, e
lá o estado desconhecido é `bg-white/15` — em cima do branco isso é invisível, e o card ficava sem
faixa nenhuma, parecendo defeito de renderização. O mapa ganhou `fundoClaro`/`textoClaro` para quem
pinta superfície clara, em vez de uma segunda tabela de cores — que foi exatamente o que já fez a
tela do operador dizer "PRODUZINDO" com a máquina parada.

---

# 16. A tela do nesting (13/09/2026)

`/mes-lab/nesting` — o plano do programador entra no portal. Regras em `lib/mes/nesting/`, rota
`GET/POST /api/mes-lab/nesting`.

⚠⚠ **LER E GRAVAR SÃO DUAS CHAMADAS, E A PRIMEIRA NÃO ESCREVE NADA.** O import de lista do portal já
ensinou o preço de misturar os dois: a aba "Revisão" dizia *"18 incluídas"* e **nenhuma entrou**,
porque o número era uma **previsão** apresentada como recibo, e a divergência só apareceu quatro
semanas depois (CLAUDE.md). Aqui a prévia mostra exatamente o que a gravação vai escrever —
divergências e pendências **antes** do botão — e o que fica gravado é esse mesmo recibo.

## 16.1 O que a tela faz hoje, medido nos arquivos reais

| Plano | Máquina | Unidades | Marcas | Casaram | Deduzidas |
|---|---|---|---|---|---|
| `11-09-2026 - T107A - W150X13` | Cantoneira/Tubo | 4 barras | 11 | **11/11** | 10 peças |
| `T107A - 9.50mm` | Laser Chapa | 1 chapa (64 peças) | 15 | **15/15** | — |
| `14-08-2026 - T97A - W310X44.5` | Laser Perfil | 1 barra | 2 | **2/2** | — |

Subidos pela própria rota, logado — não por script direto no banco.

## 16.2 As regras que a tela impõe

- ⚠⚠ **Casamento EXATO e DENTRO DA OBRA.** A mesma marca se repete entre obras (`T97A16` existe na
  097 e na 102): casar só pela marca daria baixa na obra errada, e erro de baixa aparece no
  inventário meses depois. Quando a obra do arquivo não desempata, o item fica **sem peça** e a tela
  cobra. ⚠ A obra é comparada **só pelos dígitos**, porque o banco tem 90 grafias para as mesmas
  obras ("89", "089", "T89A").
- ⚠⚠ **Replano é plano NOVO, e o hash é quem diz.** `@@unique([hashRelatorio, ambiente])` recusa o
  mesmo conteúdo duas vezes; conteúdo diferente com o mesmo nome entra como outro plano, em vez de
  sobrescrever em silêncio. O hash do arquivo da máquina é gravado **junto** — é o par que amarra a
  versão, e é dele que depende a dedução do nome da peça curta (§12.8.2).
- ⚠ **Peça deduzida vai marcada na tela** (`·dz`). Peça sem gravação, nomeada por cruzamento, é peça
  para conferir no olho.
- ⚠ **A quantidade do item é POR UNIDADE** (§12.3): total = por unidade × unidades cortadas, sempre
  derivado.

## 16.3 Bater o nesting com o Gantt (13/09/2026)

Matheus: *"o planejamento vai subir no Gantt as marcas liberadas para produzir naquela máquina; a
ideia é bater o nesting do dia com o que está programado no Gantt"*. Feito:
`lib/mes/nesting/conferir-gantt.js`, `GET /api/mes-lab/nesting/<id>/gantt?recurso=CODIGO`, e o
painel no card do plano.

⚠⚠ **A COMPARAÇÃO É DIRECIONAL — DO PLANO PARA A LIBERAÇÃO, NUNCA IGUALDADE DE CONJUNTOS.** Minha
primeira versão comparou os dois lados e, medida no laboratório, acusou **432 marcas "liberadas e
fora do plano"**. A causa está escrita no próprio `lib/mes/programado.js`: a fila da máquina é o
**backlog** (`lte fimDoDia`, de propósito — *"atrasado continua sendo trabalho"*), não o dia. Estar
liberado **não** obriga a entrar neste nesting: o programador escolhe o que cabe naquela chapa,
naquela espessura, naquele material. Cobrar as 432 seria alarme falso, e alarme falso ensina a
ignorar a tarja — o preço que este projeto já pagou no import de listas.

O que é divergência de verdade:

| Caso | Por que é problema |
|---|---|
| Marca no plano **sem liberação** | sai material da chapa que não tem destino na obra |
| Plano corta **mais que o saldo** liberado | o excedente não tem para onde ir (⚠ mede contra `qte - feitas`, não contra o total: medir contra o total faria a produção de ontem parecer folga de hoje) |
| Peça do plano **sem obra** | sem obra não existe chave, e casar sem ela é casamento inventado |

A fila (`naFila`) continua na tela, **recolhida e fora do veredito**, para quem quiser ver o que
mais espera naquela máquina.

⚠ **"Compatível com o setor" não é "confirmado para esta máquina".** Quando o PCP programa em balde
(§14.1), `programadoPara` cai para o setor — e a tela diz isso com todas as letras, senão daria um
aval que o Gantt não deu.

⚠ Medido no laboratório: os três planos do T107A dão **tudo sem liberação** — e está certo. A OP-107
tem **154 peças e ZERO programadas para corte** no retrato do Gantt que foi importado. A tela está
dizendo a verdade sobre este banco, não errando.

## 16.4 ⚠⚠ MULTI MARCAS NA MESMA MÁQUINA — A DECISÃO, COM O PARECER DO CODEX

Matheus (13/09/2026): *"o nesting vai servir para ABRIR TODAS AS MARCAS e iniciar a produção delas
sem que o operador precise abrir uma por uma (…) tem que ser possível MULTI MARCAS ao mesmo tempo
numa máquina"*.

Hoje: **uma marca por sessão** e **uma sessão ABERTA por recurso**, esta garantida por índice
parcial no Postgres. As duas coisas precisam mudar — e é o coração do apontamento, que já está
validado e rodando.

**Decisão: (A) sessão continua POR MARCA, abertas em LOTE pelo nesting.** Preserva o teto por marca,
preserva `MesApontamentoQtd`, e "multi marcas ao mesmo tempo" é literalmente o que ela permite. A
alternativa (sessão de nesting, com a quantidade apontada por barra) só passa a valer se o pedido
virar *"apontar por barra cortada"* — e aí espalha mudança pelo código inteiro.

**O Codex concordou com (A) e corrigiu o COMO** — o que segue é dele, e muda o plano:

1. ⚠⚠ **A unicidade não é `(recurso, marca)` — é `(recurso, OBRA, marca)`.** Marca se repete entre
   obras; o índice que eu ia criar misturaria as duas.
2. ⚠⚠ **O ESTADO É DO RECURSO, E NÃO PODE SAIR DAS SESSÕES.** Hoje toda abertura grava `PRODUCAO` e
   todo encerramento grava `ENCERRAMENTO`. Repetindo isso por marca, **abrir uma marca apagaria uma
   PARADA** e **fechar uma marca liberaria a máquina inteira** — e o tempo/OEE seria contado várias
   vezes no mesmo recurso. As transições compartilhadas viram evento **do recurso**
   (`sessaoId: null`), um por comando; "iniciar produção" passa a ser explícito.
3. ⚠⚠ **Encerrar o lote encerra as sessões DAQUELA EXECUÇÃO**, nunca "todas as abertas do recurso" —
   e marca com saldo pode ser encerrada sem completar quantidade.
4. ⚠ **Não chamar `abrirSessao` N vezes**, cada uma com sua transação: as operações internas têm de
   receber `tx` e o lote abrir numa transação só, com a execução identificada para o reenvio não
   criar um segundo lote.
5. ⚠ **`CREATE INDEX IF NOT EXISTS` com o mesmo nome NÃO substitui o índice existente** — trocar a
   trava exige derrubar a antiga explicitamente.

E um achado que **não é deste trabalho, é de hoje**: ⚠⚠ `saldoDaMarca` soma as sessões de **vários
recursos**, mas `comTravaDoRecurso` serializa **um**. Dois recursos podem consumir o mesmo saldo ao
mesmo tempo. Fica anotado como defeito existente, a tratar junto.


---

# 17. Multi marcas na mesma máquina, e o nesting que abre a barra (13/09/2026)

Implementado o que o §16.4 decidiu, com as correções do Codex. Regras em `lib/mes/lote.js`,
`lib/mes/chave-trabalho.js`, `lib/mes/trava.js` e `lib/mes/saldo.js` (os dois últimos saíram de
`sessao.js`, que passou de 350 linhas).

## 17.1 A trava mudou de pergunta

| Antes | Agora |
|---|---|
| uma SESSÃO aberta por recurso | um TRABALHO (obra+marca) aberto por recurso |
| `ON "MesSessao"("recursoId") WHERE ABERTA` | `ON "MesSessao"("recursoId","chaveTrabalho") WHERE ABERTA` |

⚠⚠ **A chave carrega a OBRA** (`"89|T89A16"`), não só a marca: `(recurso, marca)` misturaria a
`T97A16` da obra 097 com a da 102 — duas peças diferentes que por acaso se chamam igual — e uma
impediria a outra de abrir. ⚠ Trabalho sem marca vira `"—"`, para identidade nula não furar a trava.

⚠⚠ **O índice antigo é derrubado por nome.** `CREATE UNIQUE INDEX IF NOT EXISTS` com o mesmo nome
**não substitui nada** — só não faz nada, e a trava velha continuaria barrando a segunda marca.

## 17.2 ⚠⚠ O ESTADO É DO RECURSO, E ISSO ERA O RISCO REAL

Até aqui, abrir sessão gravava `PRODUCAO` e encerrar gravava `ENCERRAMENTO`, **presos à sessão**.
Repetindo isso por marca, com várias abertas:

- abrir uma marca **apagaria uma PARADA em curso** — e o Pareto e a Disponibilidade iriam junto;
- fechar uma marca **liberaria a máquina inteira** enquanto as outras ainda produzem;
- N marcas abertas no mesmo instante dariam N eventos de PRODUCAO, **inflando o tempo do posto N
  vezes**.

Agora a transição compartilhada é **um evento do recurso** (`sessaoId: null`), um por comando, e só
acontece quando o posto **não** está num estado que alguém escolheu (PARADA, MANUTENÇÃO, SETUP,
FORA DE TURNO). O `ENCERRAMENTO` só é gravado quando **não sobrou trabalho aberto**.

Provado contra o banco do laboratório, pela rota, logado:

```
1) ABRIR TRABALHO NÃO APAGA UMA PARADA
   lote A aberto (6 marcas) · estado: PARADA
   abriu o lote B (8 marcas) → estado agora: PARADA
   ✔ a parada resistiu · trabalhos abertos: 11

2) ENCERRAR UM LOTE NÃO LIBERA A MÁQUINA COM O OUTRO ABERTO
   encerrou o lote A (3) · sobraram 8 · estado: PARADA
   encerrou o lote B (8) · sobraram 0 · estado: ENCERRAMENTO
```

## 17.3 ⚠⚠ A MESMA MARCA EM DUAS BARRAS — ACHADO NA PRIMEIRA PROVA CONTRA O BANCO

Abrindo duas barras do mesmo plano na mesma máquina, **3 marcas se repetiam**. A sessão é uma só (a
trava é por obra+marca), e encerrar a primeira barra fechava marca que a segunda ainda cortava —
exatamente o que o Codex tinha previsto (*"encerrar as sessões daquela execução que não estejam
sendo usadas por outra unidade ainda ativa"*).

Por isso `MesSessao.lotes` e `.nestingUnidades` são **listas**, não campos únicos: a sessão acumula
os comandos que a usam e **só encerra quando o último deles termina** (`encerradas: 3,
seguemEmOutroLote: 3`). Um `loteId` único teria escondido isso.

## 17.4 O teto do planejado atravessa os postos

⚠⚠ Defeito que **já existia** e o Codex apontou de passagem: `saldoDaMarca` soma as boas de TODAS
as sessões daquela obra+marca, **em qualquer posto** — mas a trava serializava só o recurso. Dois
postos lançando a mesma marca ao mesmo tempo liam o mesmo saldo e passavam os dois. Agora o
lançamento trava **as duas chaves** (recurso e trabalho), em ordem determinística — ordenar é o que
evita abraço mortal entre dois lançamentos que precisam das mesmas duas travas.

## 17.5 O totem e o monitor

- `estadoDoRecurso` devolve `sessoes[]`; a rota do totem devolve **uma conta por marca aberta**
  (cada uma com o seu apontado e o seu saldo), mais `planos` — as barras que aquele posto pode
  abrir, dizendo qual já está em curso. ⚠ Só na **Preparação**: nesting é corte.
- O monitor mostra **um card por posto**, com o trabalho principal e quantas marcas mais. Um card
  por sessão faria a TV mostrar a mesma máquina cinco vezes, em cinco estados que são o mesmo.
- ⚠ O alerta de sessão esquecida passou a olhar a **mais velha** das abertas.

## 17.6 ⚠⚠ UMA FUNÇÃO SUMIU E 1.239 TESTES NÃO VIRAM

Refatorando o encerramento, apaguei `estadoDoRecurso` junto com o bloco que reescrevi — e a suíte
inteira continuou verde, porque **nenhum teste a chamava**. O defeito só apareceu quando o totem
devolveu **500** no navegador. Agora ela tem teste, e a lição vale para o resto: função que a tela
chama precisa de pelo menos um teste, nem que seja para provar que ela existe.

⚠ E um segundo tropeço na mesma tarde: um `replace` de refatoração que **não casou virou no-op
silencioso**, e eu segui adiante achando que tinha editado. Conferir o arquivo depois de mexer.
