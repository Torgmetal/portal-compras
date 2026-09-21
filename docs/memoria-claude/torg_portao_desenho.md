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
