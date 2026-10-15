---
name: torg_node26_localstorage_teste
description: No Node 25+/26 o `localStorage` do teste jsdom é `undefined` — todo teste que usa armazenamento precisa de vi.stubGlobal
metadata:
  type: project
---

No Node 25+ (o Mac roda v26) o Web Storage nativo vem ligado e põe um getter `localStorage` no global que devolve
`undefined` sem `--localstorage-file` — e ele **esconde o `localStorage` do jsdom** no vitest. `sessionStorage` não é
afetado. No Windows (Node mais antigo) o jsdom fornece o armazenamento e o mesmo teste passa: teste verde lá e
vermelho aqui é o sinal.

**Why:** 15/10/2026 — dois testes de Corte e montagem estouravam `Cannot read properties of undefined (reading
'setItem')` no Mac e passavam no Windows. `try { localStorage.clear() } catch {}` no `beforeEach` engolia o erro em
silêncio.

**How to apply:** teste que lê ou grava `localStorage` faz `vi.stubGlobal("localStorage", { getItem, setItem,
removeItem, clear })` sobre um `Map` novo a cada `beforeEach` (modelo: `testes/producao-corte-montagem.teste.jsx`,
`testes/minha-fila.teste.jsx`). E o código da tela sempre acessa o armazenamento dentro de try/catch — sem ele, só
não lembra.
