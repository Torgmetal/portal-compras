---
name: torg_portao_desenho
description: Liberação do Planejamento só passa marca com PDF em 2.5.2; a pasta 2.5.5 (envio ao cliente) nunca conta
metadata:
  type: project
---

Estar na LPC **não** é ter desenho. A liberação do Planejamento para o PCP
(`/planejamento/datas-setor`) só deixa descer marca com PDF casado em
**2.5.2 Fabricação**; `PastaEngenharia` guarda a conferência (cron
`pasta-engenharia`), e `portaoDoDesenho()` em `lib/pasta-engenharia.js` é o
critério único da tela e da gravação.

- **2.5.5 é pasta de SAÍDA** (Torg → cliente) e nunca conta como desenho
  entregue. ⚠ **Não mencionar 2.5.5 em tela, planilha ou mensagem** — Vitor
  (26/08/2026): "não precisa ser mencionado em nada só se eu pedir". Continua
  medido (`soEnvio`/`pdfsEnvio` na conferência) para quando ele pedir; para quem
  lê, o estado é um só: não tem desenho na fabricação. "Outro nome" pode aparecer
  — existe, mas a impressão em lote não acha, e a ação é renomear.
- **A lista gravada é só a dos FALTANTES.** Marca que a conferência não viu não
  aparece nela e passaria por "tem desenho". Por isso o portão exige que a
  conferência cubra a LPC atual (`marcas` conferidas ≥ marcas distintas hoje) e
  não esteja truncada — senão trava a OP inteira até reconferir.
- Reconferir na hora: `POST /api/planejamento/liberacao/pasta` (Planejamento/PCP;
  a rota da Diretoria não serve, allowlist própria).

**Why:** liberar sem desenho manda o PCP imprimir o que não existe, e o furo
apareceu de verdade — a OP-105 descia 23 t com conferência vazia de antes da LPC.

**How to apply:** todo portão novo (material, desenho) valida no SERVIDOR, não só
no filtro da tela — [[torg_estudo_fabricacao]] e o portão do material seguem a
mesma regra. Ver [[torg_grd_desenhos]] e [[torg_listas_le_lpc]].

**26/09/2026: a conferência lia só a 1ª PÁGINA da pasta.** Gabriel (OP-118): T118B-P470, P382 e P383
apareciam "sem desenho em 2.5.2" com o PDF na pasta — *"tem sim, no servidor … aí não conseguimos
liberar desenho pro Alex"*.
- ⚠⚠ O Graph devolve a pasta em PÁGINAS (`@odata.nextLink`). A "2.5.2.2 Croqui/B" da OP-118 tem
  **1.762 arquivos em 2 páginas**, e a conferência lia 996. Os 766 da segunda página nunca entravam, e a
  marca virava faltante. Não era nome nem pasta: P295 e P315 estão na página 1; P382, P383 e P470, na 2.
- A impressão em lote (`desenhos-lote.js`) e a pasta do dia da liberação (`pastas-liberacao.js`) liam a
  mesma pasta do mesmo jeito: liberada a marca, a impressão ainda não acharia o PDF.
- Agora as três usam `todasAsPaginas` (`lib/graph-paginas.js`). Falha em QUALQUER página = `ok: false`,
  porque pasta pela metade não pode passar por inteira.
- ⚠ Ainda leem só a 1ª página, com pasta pequena na prática: `le-servidor` (pasta da L.E., $top=100),
  `prontuario-certificados` e `sharepoint-lista` ($top=200) e rotas de romaneio, SGQ e orçamento. O
  `listChildrenByPath` do `lib/sharepoint.js` sempre paginou.
