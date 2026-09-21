---
name: torg_preco_venda_kg
description: Modelo de preço de venda por kg acordado com o Vitor (09–11/09/2026) e o exemplo Galvani PTC-310-26 (Bahia, 113,5 t, 3 demãos, chapa expandida R$ 18/kg → R$ 27,62/kg)
metadata:
  type: project
---

**Preço de venda de fabricação (R$/kg) = custo ÷ (1 − BDI 15,93 % − lucro 15 % − imposto líquido do destino).**
Custo = fabricação + aplicação de pintura por classe (tabela "aba Fabricação" da sessão 09/09: Extra Leve 6,22 + 1,56/2,33/3,11;
Leve 4,15 + 1,04/1,56/2,07; Médio 3,55 + 0,89/1,33/1,77 para 1/2/3 demãos) + material. **Os R$ 6,81/kg de material são SÓ AÇO**;
parafusos ≈ R$ 0,60/kg (estudos recentes) e tinta entram à parte (1 demão epóxi ≈ 0,54/kg; 3 demãos epóxi+epóxi+PU ≈ 1,35/kg,
área 0,034 m²/kg, perda 45 %, diluente 25 %). Imposto líquido como fração do preço: SP 19,0 % · Sul/Sudeste 14,2 % ·
N/NE/CO/ES 10,5 % (equivale aos R$ 22,51 / 20,54 / 19,24 da estrutura média 1 demão). Classes por kg/m: EL <10, L 10–25,
M 25–60, P 60–120. Montagem = `MONTAGEM_REFERENCIA` de lib/lqc.js (faixa por tonelagem; despesas 90 % da MDO; equipamentos
R$/kg) ÷ (1 − BDI − lucro − 18,33 % de serviço); Vitor quer margem MAIOR na montagem.

**Galvani PTC-310-26 (calcinador + resfriador, Luís Eduardo Magalhães/BA), planilha LP-310-26 R02 (~/Downloads):** 113.553 kg
c/ margem 15 % (EL 6.473 · L 66.340 · M 40.741). Vitor: material em nome da Torg, **3 demãos**, **chapa expandida a R$ 18/kg**
(13.676 kg), só fabricação. Resultado: **R$ 27,62/kg = R$ 3.136.600**. Fora: frete (~R$ 140 mil, 13 carretas), montagem
(R$ 13,88–15,40/kg na faixa 100–300 t). MD da Galvani diz 135 t (−16 %). Proposta não está no portal (sem Orcamento/estudo).

**Why:** o Vitor pede "conforme falamos anteriormente" — o modelo mora nas sessões, não no portal; sem este registro cada
sessão re-deriva e chega a número diferente.

**How to apply:** partir destes parâmetros e dizer quais mudaram; oferecer montar o estudo no portal para o BDI sair auditável.
Ver [[torg_estudo_fabricacao]], [[torg_custo_hora]], [[torg_escopo_proposta]].
