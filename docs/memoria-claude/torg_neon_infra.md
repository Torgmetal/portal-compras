---
name: torg-neon-infra
description: Portal Compras Torg — o que foi MEDIDO da infra do Neon, e as duas mudanças de painel que resolvem os incidentes recorrentes
metadata:
  node_type: memory
  type: reference
---

Medido em 17/09/2026 pela própria conexão (read-only), projeto `gentle-fog-97975034`, região `sa-east-1`:

| medida | valor | leitura |
|---|---|---|
| tamanho do banco | **229 MB** | armazenamento NÃO é problema |
| `shared_buffers` | 233 MB | o banco inteiro cabe na RAM |
| `neon.file_cache_size_limit` (LFC) | 1461 MB | ~2 GB de RAM ⇒ compute pequena |
| cache hit | 98,26% | quase nada vai a disco |
| `work_mem` | 4 MB | **é aqui que o OOM 53200 nasce** |
| `effective_cache_size` | 25,6 GB | o **teto** do autoscaling é largo |
| `max_connections` | 901 | folgado; pooler em uso + `DIRECT_URL` separado |

⚠⚠ **O DIAGNÓSTICO ESTÁ NA COMPARAÇÃO ENTRE O MÍNIMO E O MÁXIMO.** `shared_buffers` e o LFC são
derivados da compute MÍNIMA; `effective_cache_size`, da MÁXIMA. Mínimo pequeno + máximo enorme é
exatamente o que produz o `PostgresError 53200 "out of memory"`: a escrita em massa estoura na
LARGADA, antes de o autoscaling reagir. **Subir o teto não resolve nada** — quem tem de subir é o piso.

⚠ **O que se lê pela conexão é o estado ATUAL da compute, que pode já estar escalada acima do
mínimo** — não é a configuração. A faixa honesta pela evidência é "mínimo entre 0,25 e 0,5 CU"; o
número configurado só aparece no painel (Branches → Compute).

### As duas mudanças de painel (decisão do Vitor, 17/09/2026 — ainda pendente)
1. **Subir o mínimo de autoscaling para 1 CU.** Resolve o OOM. Barato: o banco tem 229 MB, não há
   economia real em manter a compute apertada.
2. **Desligar o scale-to-zero (ou atraso de 1h).** Resolve o `P1001 "Can't reach database server"`
   do cold start — o que deixou o `cmr-reconciliar` 55h parado em silêncio. É o item que pesa no
   custo, porque passa a pagar as horas ociosas da noite (não há cron entre ~21h e ~04h UTC).
   ⚠ Virou CONFORTO, não necessidade, depois que os 24 crons passaram a chamar `aquecerBanco`.

⚠ Os dois controles **só existem em plano pago** — confirmar em qual plano a conta está.

### Acesso à API do Neon — NÃO temos (verificado)
A integração Neon↔Vercel injeta só string de conexão e `NEON_PROJECT_ID`. **Não existe
`NEON_API_KEY`** em produção (conferido com `npx vercel env ls production`). Essas credenciais abrem
o BANCO, não o PAINEL. Para ler plano, limites configurados e histórico de consumo é preciso uma
chave criada em *Account settings → API keys*, guardada **fora do repositório**.
⚠ Chave de API do Neon **não é só leitura**: é de conta e permite criar/apagar branch, endpoint e o
próprio projeto. Preferir chave com escopo de projeto, e revogar depois do uso.

Ver [[torg_crons]] (o incidente do cmr-reconciliar) e o aviso de arquitetura no `CLAUDE.md`.
