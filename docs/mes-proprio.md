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
