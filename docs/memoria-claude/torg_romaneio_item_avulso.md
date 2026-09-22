---
name: torg-romaneio-item-avulso
description: "Portal Compras Torg — item avulso (tinta de retoque, item específico) vive só na carga do romaneio; não entra na Lista de Expedição nem em nenhuma conta de peso da obra"
metadata:
  type: project
---

**22/09/2026.** Vitor: *"vamos criar uma forma de colocar algum item na mão além da lista de
expedição, pois acontece o caso de enviar tinta para retoque, algum item específico"*. E, sobre
também gravar peça nova na LE: *"meu medo é de quebrar alguma lógica e ficar pior, **acho que o
caminho vai ser reimportar**"*.

**A decisão:** são duas perguntas diferentes, e só a primeira virou código.

| | Pergunta | Onde mora |
|---|---|---|
| Tinta de retoque, item específico | "o que vai neste caminhão?" | só `RomaneioPrevio.itens` + FORM 22 |
| Peça que faltou na LE | "o que a obra deve entregar?" | corrigir o arquivo e **reimportar** |

⚠⚠ **O AVULSO NÃO ENTRA EM CONTA DE PESO NENHUMA.** O contratado vem da Lista de Expedição, que não
tem tinta — somar o avulso faria o embarcado crescer sem a obra ter entregado nada. A regra é uma
função só, **`itensDeObra`** (`lib/expedido-por-romaneio.js`), usada por:
- `RomaneioPrevio.pesoKg` gravado na emissão (alimenta o card da carga, `lib/expedido-mes.js` e o
  status da obra);
- `app/api/planejamento/status-obra` — expedido real por OP/frente;
- a simulação de carga (galão de tinta não é peça para empilhar).

⚠ **O peso dele SAI no documento**, na linha do FORM 22 — o motorista leva, e a coluna J soma. O que
fica de fora é a conta do portal, não o papel.

⚠ **O FORM 22 já tinha lugar para isso**: coluna **F = Unid.** (sempre "PÇ" até aqui) e **G = código**.
Então o avulso sai como "2 GL" sem nenhuma mudança no modelo do Excel.

⚠ **Nome e descrição são obrigatórios** — linha de romaneio que não diz o que é não serve para
conferir carga. O item se descreve no próprio envio (`itensSel[].avulso`), porque ele não existe na
Lista de Expedição nem no prévio para ser procurado.

⚠ **Romaneio sem avulso sai idêntico ao de antes** — é o que torna a mudança segura.

Ver [[torg_expedido_parcial_marca]], [[torg_romaneio_carga]].
