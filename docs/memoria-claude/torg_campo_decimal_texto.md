---
name: torg-campo-decimal-texto
description: CampoDecimal entrega TEXTO em português ("1.500,50"); quem guarda esse texto no estado lê com numeroBR — Number/parseFloat/parseInt erram (varredura de 06/10/2026, 26 telas)
metadata:
  type: project
---

O `components/CampoDecimal.jsx` (16/09/2026, `fc02dd40`) substituiu o `<input type="number">` em 125
campos. Ele chama `onChange(texto)` com o que a pessoa digitou, em português. A tela que guarda esse
texto no estado **tem de ler com `numeroBR`** (`lib/numero-br.js`). As outras conversões erram de três
jeitos:

- `Number("1500,50")` dá NaN: o valor é recusado ("Valor deve ser maior que zero") ou, com `|| 0`, `|| null`
  ou `JSON.stringify`, gravado zero/vazio **sem aviso**;
- `parseFloat("1.500,00")` dá 1,5: o valor fica até mil vezes menor, sem erro nenhum;
- `parseInt`/`Number("12.000")` dá 12: a meta de doze mil kg/dia vira doze.

**Origem:** Matheus, 06/10/2026, modal "Adicionar receita" da OP: R$ 519.539,62 → "Valor da receita deve
ser maior que zero", com o resumo mostrando Impostos 15% (as alíquotas com vírgula também sumiam). A
correção foi o `56edf507` (`lib/receita-calculo.js`). A varredura (`8950b3da`) achou o mesmo erro em mais
26 telas, entre elas as páginas públicas de frete e de estudo cotados pelo FORNECEDOR, o Financeiro, o RH
(cargos, férias, treinamentos), a calibração, o Kickoff, o custo-hora e os orçamentos.

**Medido no banco (06/10/2026, só leitura):** nada a reparar. Desde 16/09 não houve gravação em frete,
estudo, calibração, cargos, férias nem treinamentos. Os 25 orçamentos e as 96 liberações gravados no
período têm valor plausível. Nenhuma receita foi salva pelo modal. Os eventos de faturamento sem valor no
Kickoff da OP-122 e da OP-123 fecham 100% em percentual, então o valor vazio parece intencional.

**Why:** quem converteu os campos trocou o componente e não olhou quem lia o valor depois. Metade das
telas já guardava número (`onChange={(txt) => set(numeroBR(txt))}`) e funcionou. A outra metade guardava o
texto e seguiu com `Number()`.

**How to apply:**
- Em tela nova com CampoDecimal, guarde número (`numeroBR(txt)`) ou leia com `numeroBR` antes de usar.
- O guarda `testes/campo-decimal-leitura.teste.js` varre as telas e falha se o texto cru for lido com
  `Number`, `parseFloat` ou `parseInt`. Exceção vai em `PERMITIDAS`, com o motivo, e só para dado que
  vem do banco.
- ⚠ Ele **não segue função auxiliar**: um `const num = (v) => Number(v)` aplicado ao texto, ou um
  `onQtd={(v) => Number(v)}` passado ao filho, escapa dele. Nesses casos, leia o código.
- ⚠ O `numeroDecimal` de `lib/lqc-itens-comerciais.js` aceita uma vírgula só: "15.000,00" vira 0. Ficou
  de fora da varredura porque o LQC tem testes de caracterização ([[torg-orcamento-lqc-numero]]).

Ver [[torg-libs-compartilhadas]] (numeroBR é a lib).
