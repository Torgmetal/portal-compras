---
name: torg_checar_imports
description: "`next build` compila função usada sem import — rodar `npm run checar` antes de subir"
metadata:
  type: feedback
---

`next build` **compila com sucesso** um arquivo que usa uma função que ninguém importou. O
ReferenceError só aparece quando alguém clica no botão, em produção. Vale para identificador
indefinido, TDZ e `const` declarado dentro de bloco e usado fora.

**Como aplicar:** antes de `git push`, rodar

```bash
npm run checar
```

(`eslint.undef.config.mjs`, só `no-undef`, sem dependência nova — usa `npx --yes eslint@9`.)

**Por quê:** três quebras de produção em cinco dias, todas do mesmo movimento — mover função para
lib compartilhado, trocar a chamada local pela nova, esquecer o import:
- `f6ce3cc8` (22/08/2026) `gerarPDFdoRelatorio` — o PDF do relatório de inspeção **quebrava a tela
  da Qualidade** (foi o que o Vitor reportou em 24/08: *"na criação do pdf do relatorio dimensional
  ao gerar o pdf a pagina quebra"*). Ironia: é o commit que centralizou o despacho para consertar o
  link de assinatura, e consertou a rota pública quebrando a interna.
- `f835c2ff` (20/08/2026) `sincronizarCronogramaSyneco`/`avancosDasTarefas` — **pior**, porque um
  `try/catch` engolia o ReferenceError: a lista de cronogramas saía sem avanço, como se a fábrica
  não tivesse produzido, e sem erro na tela. Ver [[torg_cronograma_syneco]].
- `1dfacd3d` (24/08/2026) `OP_VIVA` na fila de corte. Ver [[torg_fila_corte]].

🚨 **NUNCA conferir build com `grep` dentro de `&&`.** `npx next build | grep -iE "Compiled successfully|Failed"` sai com **0 quando ACHA "Failed to compile"** — a cadeia `&& git commit` segue justamente no caso de erro. Em 25/08/2026 isso mandou build quebrado para produção. O certo é o código de saída:

```bash
npx next build >/dev/null 2>&1 && echo OK || echo FALHOU
```

⚠️ **"Compiled successfully" NÃO quer dizer que o build passou.** O Next compila e SÓ DEPOIS pré-renderiza; erro de prerender (ex.: `useSearchParams()` sem `<Suspense>`) sai depois daquela linha e vai para produção quebrado se você só olhar o "Compiled successfully". Ao mexer em página client, conferir também:

```bash
npx next build 2>&1 | grep -iE "Error occurred prerendering|suspense|Failed"
```

🚨 **Refatorou movendo declaração? Cheque TDZ no arquivo mexido.** Em 25/08/2026, extrair o filtro de coluna deixou o `useFiltroColunas` DEPOIS do `useMemo` que o chama **durante a renderização** — `/pcp/producao` abriu em branco com *"Cannot access 'passaColuna' before initialization"*. `no-undef` fica quieto (a variável existe) e o build compila.

```bash
npx --yes eslint@9 --no-config-lookup -c /tmp/es-tdz.mjs <arquivo>
# regra: "no-use-before-define": ["error", { functions: false, classes: false, variables: true }]
```

⚠️ No repo inteiro acusa ~20, quase todos **inofensivos** (const usado dentro de handler, que só roda depois da renderização) — por isso não vira gate, vira conferência no arquivo que acabou de mudar. **Fatal = usado em tempo de RENDER** (corpo do componente, `useMemo`, `useCallback` sem lazy).

⚠️ **`catch` mudo esconde esta classe.** Ao engolir exceção por resiliência (integração fora do ar),
registrar o motivo — senão um erro de programação vira "sem dados" silencioso.

Para testar geração de PDF sem sessão, ver o padrão de shim em [[torg_qualidade]].

**Atualização 29/08/2026 — 4ª ocorrência, e a 1ª que o próprio `checar` deixou passar.**
`<Loader2 />` e `<X />` sem import derrubaram `/admin/usuarios` com "client-side exception". O
`no-undef` **não enxerga nome de componente em JSX** sem o plugin do react, e o `next build`
compila normal — o ReferenceError só acontece ao renderizar.

Corrigido: `eslint.undef.config.mjs` ganhou a regra `jsx/componente-sem-import`, escrita dentro do
próprio config (não instalar `eslint-plugin-react`: o `checar` roda por `npx --yes eslint@9`, sem
dependência no projeto). Validada nos dois sentidos — repo limpo, e acusa quando o import sai.

⚠ Moral: `npm run checar` passar **não** garante que a tela abre. Para tela nova com ícone novo,
conferir o import na mão continua valendo.
