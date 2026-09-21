---
name: torg_conversao_em_massa
description: "Conversão em massa de JSX por script: o que ESLint e npm run checar NÃO pegam — 'use client' deslocado, import dentro de import multilinha, e o conversor mordendo o próprio componente"
metadata:
  type: project
---

Trocar um padrão em dezenas de arquivos por script funciona, mas **três classes de erro não
aparecem no `npm run checar` nem no `npx eslint`** — só no `npm run build`, que é o que a Vercel
roda. Aconteceram todas na conversão de `<input type="number">`/`type="date"` para `CampoDecimal`/
`CampoData` (15–16/09/2026, 125 + 120 campos):

⚠⚠ **`'use client'` COM ASPAS SIMPLES.** O script testava `linha.startswith('"use client"')` e, no
arquivo que usa aspas simples, inseria o import **antes** da diretiva. O SWC recusa:
*"The 'use client' directive must be placed before other expressions"*. **Duas builds da Vercel
falharam por isso**, e nem o ESLint nem o `checar` acusam — não é regra de lint, é do compilador.
Comentário antes da diretiva é permitido (`components/PlantaFabril.jsx` sempre foi assim); import
não é.

⚠⚠ **IMPORT NO MEIO DE UM `import { … }` MULTILINHA.** Inserir "depois do último `import`" quebra
quando esse import ocupa várias linhas — o novo entra entre `import {` e `} from`. Deu erro de
parsing em 4 arquivos. Lugar seguro: logo **depois da diretiva** (ou no topo, quando não há).

⚠⚠ **O CONVERSOR MORDE O PRÓPRIO COMPONENTE.** A varredura de `type="date"` trocou também o
`<input type="date">` escondido **dentro do `CampoData`** (o que abre o calendário nativo): ele
passou a se renderizar dentro de si mesmo e a tela do fornecedor abriu com **2.546 campos
aninhados** antes de o React cortar. Excluir `components/Campo*.jsx` da varredura, ou conferir o
diff do próprio conversor.

**Ordem que funciona:** script → `npm run checar` → `npx eslint` → **`npm run build`** → `npm test`
→ validar a tela no navegador. Pular o build foi o que deixou o erro chegar à Vercel; `npm run dev`
não substitui, porque só compila as rotas que alguém abre.

⚠ **Testar com o navegador em INGLÊS** (`locale: "en-US"` no Playwright) quando a mudança é de
formato — foi assim que o `mm/dd/yyyy` e a vírgula descartada apareceram.

Relacionado: [[torg_campos_decimais]], [[torg_checar_imports]].
