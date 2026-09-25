---
name: torg_equivalencia_material
description: "Modelo/Tekla nomeia chapa pela espessura NOMINAL e a lista pela REAL (CH12 = CH12,5) — sempre considerar ao cruzar perfis"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-09-03T00:59:28.160Z
---

Vitor (03/09/2026): "sobre a equivalência de material vc sempre terá que ver isso pois acontece com bastante frequência".

Ao cruzar perfil do **modelo/Tekla** com perfil da **lista (LPC/LE)** ou do **Omie**, os dois lados falam dialetos diferentes do mesmo aço. Medido na OP-089 (679 peças):

- **chapa: nominal × real** — o Tekla escreve `CH12`, `CH5`, `CH30`; a LPC escreve `CH12,5`, `CH4,8`, `CH30`. Só essa equivalência recuperou **191 peças** (12→12,5 em 138, 5→4,8 em 44, 30→30 em 9) e levou o casamento de 32,3% para 50,4%.
- **escape do IFC** — `TB\S\X42.40X2.65` significa **TB Ø42,40x2,65** (`\S\c` = caractere + 128, ISO 10303-21). Sem decodificar, o perfil vira um nome que não existe em lugar nenhum. Ver `destep` no visualizador.

**Why:** sem isso o cruzamento parece "lista faltando" quando é só nome diferente — cheguei a reportar 87% sem par por causa do escape não decodificado, número que caiu para 62% depois de corrigir.

**How to apply:** nunca comparar perfil por string crua. Normalizar (maiúsculas, vírgula→ponto, tirar tudo que não é letra/número/ponto), decodificar escape do IFC e tratar espessura de chapa com tolerância (~12%) em vez de igualdade. E lembrar do limite: mesmo casando, **perfil+comprimento não identifica marca** — 1 em 6 cai em mais de uma (`W200X15 869 mm` → 4 marcas). Casar por semelhança só serve para conferência, nunca para carimbar marca que puxa R/croqui. Ver [[torg_listas_le_lpc]], [[torg_portal_estrutura_3d]].

**25/09/2026: chapa 10 = 9,5 (3/8") e chapa 12 = 12,5 (1/2"), decisão do Vitor.** Caso da OP-118,
levantado pelo Gabriel (Engenharia): *"mais um caso daquele de chapa com espessura diferente (…) não
consigo nem procurar o R pra colocar igual o da 9.50mm"*. A janela "Selecionar R" (Liberar frentes)
abria com "0 de 0 recebimentos compatíveis". A busca só filtra o que a API devolveu, e o POST refaz a
checagem, então nem o R da própria obra (261547) passava.
- `MESMA_CHAPA` em `lib/casar-omie.js`: pares NOMEADOS, com quem decidiu, lidos SÓ no ramo da CHAPA.
  ⚠ Não entrou em `MESMA_BITOLA` (o 4,75 = 5,00 de 08/09): aquela tabela é lida por `perto()`, que
  tubo, cantoneira e barra também usam, e ali 9,5 e 10 são peças diferentes. Há teste de barra chata.
- Efeito medido na hora:
  - OP-118: T118B-P294 (CH10) e T118B-P17 (CH12) saíram de SEM_MATERIAL para AGUARDANDO_CORTE e
    liberam os conjuntos T118B281 e T118B48;
  - ⚠ OP-067: a T67BT340 (CH10.00X260, cortada em 28/02) passou a ter R pela única chapa de 9,5 da obra
    (corrida 2512076547), o que muda a §02 do livro em montagem. A Qualidade confere;
  - OP-078: a T78B-P498 segue SEM_MATERIAL (não há chapa de 9,5 na obra); agora a janela oferece as de
    outras OPs.
- Corrigido no mesmo dia (Vitor: "pode corrigir todos"):
  - a janela e a gravação da liberação só consideram recebimento ATIVO (a OP-118 tinha um duplicado
    desativado do R 261401, sobra da confusão com a PORCA);
  - ⚠ a gravação da SEPARAÇÃO passou a conferir o material, como a da liberação. Ela só conferia se o R
    existia. ⚠⚠ A conferência vale só para o R NOVO ou TROCADO: "encaminhar ao PCP" reenvia todas as
    linhas, e 8 das 377 trocas registradas, decididas pelo Vitor, a regra não reconhece (xadrez para
    CH3,00, barra quadrada, BRØM16 × 5/8", U de "perfil IND", tubo IND, Z com lábio 32, W310 × HP310).
    A troca já registrada com o mesmo R passa.
