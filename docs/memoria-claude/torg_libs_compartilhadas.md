---
name: torg-libs-compartilhadas
description: Portal Compras Torg — helpers compartilhados criados na varredura de 2026-06; preferir a reinventar
metadata: 
  node_type: memory
  type: reference
  originSessionId: 6159e822-8d9e-416e-8542-b783d3627472
  modified: 2026-07-30T22:27:00.532Z
---

Helpers de `lib/` criados em 2026-06 para padronizar coisas que estavam espalhadas/divergentes no Portal Compras. **Usar estes em código novo:**

- `lib/data-br.js` — datas no fuso de Brasília. `diaBRT(date)` → "YYYY-MM-DD" do dia-calendário BRT (evita o bug de turno noturno cair no dia seguinte via toISOString); `hojeBRT()`, `inicioDiaBRT(str)`, `fimDiaBRT(str)` para ranges. Usar SEMPRE que precisar do "dia" de um timestamp.
- `lib/html.js` — `escapeHtml(s)` canônico (escapa & < > " '). Aplicar em TODO dado dinâmico ao montar HTML de email ou injetar em innerHTML. `limparTextoCurto(s, max)` para higienizar input curto não-confiável antes de persistir. **`textoParaHtml(s)`** (30/07/2026, commit 9462878) — texto livre MULTI-LINHA → HTML de e-mail: escapa + `\n`→`<br>`. **Usar no lugar de `white-space:pre-wrap`** em e-mail: o Outlook (engine do Word) IGNORA esse CSS e junta tudo numa linha (reclamação do Vitor: mensagem ao cliente na ata/cronograma saía sem formatação). Já aplicado nos e-mails de mensagem ao cliente (cronograma/ata comercial/kickoff/relatório/avisar-cliente/auditoria/aviso-revisão/cobrança).
- `lib/blob-url.js` — `isBlobUrlSegura(url)` / `assertBlobUrlSegura(url)`: valida que a URL é do Vercel Blob (`*.public.blob.vercel-storage.com`). Usar antes de qualquer `fetch()` server-side de URL vinda do cliente (anti-SSRF).
- `lib/token.js` — `gerarTokenForte(bytes=32)`: token base64url de 256 bits para links públicos. NUNCA usar `cuid()` para token de segurança.

Padrão anti-OOM do Neon para bulk write (já no CLAUDE.md): `prismaDirect` + statement constante com `UNNEST($1::text[],...)` + arrays como literais de texto. Referências: `app/api/mes/sync-ordens` e `lib/omie-estoque.js` (refatorado em 2026-06).

Rate limit: `lib/rate-limit.js` `createRateLimiter({name,maxRequests,windowMs})`; o `check(req, chaveExplicita)` aceita chave (ex: `user:${id}`) além do IP. É em memória por instância — migrar para Upstash/Redis fica pendente. Ver [[torg-seguranca-pendencias]].

**`components/FiltroColuna.jsx` — o filtro do Excel (24/08/2026).** `useFiltroColunas(linhas, colunas)` + `<ThFiltro>` (cabeçalho com funil). Usado em `/pcp/producao` e na lista de expedição (`ConsultaExpedicao`). Colunas = `[{ key, label, valor: (linha) => string }]`, e `valor` tem de devolver **o mesmo texto que a célula mostra** — senão a pessoa marca "expedida" e vê linha dizendo outra coisa.
- ⚠️ **As opções de uma coluna respeitam as outras e NÃO se auto-cortam** — é o que torna o filtro usável: escolher um valor não pode sumir com os outros da mesma lista.
- ⚠️ **Marcar nada = marcar tudo** (Set vazio é apagado do estado). Filtro com zero selecionados escondendo a tabela é a armadilha clássica.
- ⚠️ O menu é **`fixed`, posicionado pelo rect do botão**. Tabela dentro de `overflow-y-auto` com cabeçalho `sticky` corta menu `absolute`, e o filtro parece abrir vazio.
- ⚠️ Se a tela exporta planilha, o filtro de coluna **tem de contar como filtro** no export — senão exporta tudo achando que exportou o que se vê.
- ⚠️ "Selecionar todos" deve marcar só o que está **na tela** (essas tabelas cortam em 300) e só o que é selecionável.
- **`lista-pecas`** — `SO_FABRICACAO` / `SO_EXPEDICAO`: LE é expedição, LPC é fabricação; nunca somar as duas. Ver [[torg_listas_le_lpc]].

**`lib/numero-br.js` — `numeroBR(v, padrao)` é o ÚNICO jeito de ler número digitado (30/08/2026).** Converte pt-BR e en-US: "1.234,56", "1,234.56", "2.500", "R$ 1.980,00", "35.64". Aplicado em 72 lugares (Compras + resto do portal + o agente MES, que tem a regra copiada por rodar em CommonJS na fábrica).
- ⚠️ **Duas famílias de bug que ele mata.** `replace(",", ".")` troca só a PRIMEIRA vírgula → "4.963,43" virava **4,963** (mil vezes menor); era a causa dos pedidos quebrando no Omie. E `replace(/\./g, "")` assume que todo ponto é milhar → "35.64" (como o CMR manda) virava **3564**.
- ⚠️⚠️ **SEMPRE `numeroBR(x, NaN)` quando houver guarda `isNaN`/`Number.isFinite` depois.** O padrão `0` transforma entrada inválida em zero e mata a guarda — foi assim que peso em branco virou 0 kg em produção. Só use `, 0)` onde o código original fazia `|| 0`.
- Não trocar onde só se normaliza TEXTO (bitola em `conferir-estoque`, descrição em `perfil-perimetro`/`product-matcher`, nome em `casar-omie`), nem onde já existe tratamento certo (`if (s.includes(","))` de `AbaExpedicao`/`ResumoLotes`/`sigissweb`/`parse-romaneio`/`lqc`, e o lookahead `\.(?=\d{3}(\D|$))` de `folha-planilha`/`indicadores-comercial-iso`/`lista-materiais-desenho`).

**`fmtOP` de `lib/utils.js` é única (30/08/2026).** Eram 16 cópias com dois resultados — "OP-82" na compartilhada, "OP-092" nas outras quinze. Ganhou o de três dígitos. A versão antiga pegava só o primeiro grupo de dígitos e comia a sub-obra ("036-01" → "OP-036"); agora sai "OP-036-01". `fmtOPdb` do Data Book é apelido dela.
