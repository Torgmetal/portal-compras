---
name: torg_estudo_fabricacao
description: "Estudo de fabricação (LQC) e Cenário Financeiro em /comercial/orcamentos/estudos — regras medidas e o alinhamento pendente com a planilha"
metadata:
  type: project
---

Módulo de composição de custo de fabricação (`/comercial/orcamentos/estudos/[id]`), espelhando a LQC. Núcleo em `lib/lqc.js`; fábrica em `lib/fabrica-capacidade.js` + `lib/fabrica-horas.js`; custo medido em `lib/custo-casa.js`; medidor fiscal em `lib/omie-nfe-saida.js`.

**⏳ PENDENTE — Vitor vai verificar em 24/08/2026:** o material do estudo dá **R$ 6.748.084** contra **R$ 6.995.376** da planilha nas mesmas 4 áreas (3,5% a menos). Peso (836.560 kg) e industrialização (0,07%) batem — é especificamente o **preço do aço por área**. Vitor pediu para deixar o portal como está e ver amanhã o que fazer para alinhar os dois.

**⏳ AUDITORIA 23/08/2026 — decisões que dependem do Vitor (o código já foi corrigido no que era erro meu):**
1. **`ocupacaoPct = 80`** faz o preço-hora sair **4,6× alto** (soldagem R$ 889/h em vez de R$ 193/h). E o `horasMes` de cada setor já está gravado errado no banco (= headcount × 38,5), então mudar só o campo não resolve — tem de zerar/recalcular os setores. Vitor ainda não disse o que o campo deveria significar.
2. **ADM está com `faturaHora: true`** → R$ 110.359/mês de folha administrativa nunca é rateada. Um clique resolve.
3. **Efetivo do chão: config diz 27, folha do RH diz 33** (montagem 4 × 7). Duas fontes independentes (folha × 1,8 e ContaPagar) concordam entre si em 0,7% e contradizem o config. HH/t da rota subestimado ~22%.
4. **O custo da casa medido não forma preço**: `custo-fabricacao.js` usa o `ConfigCustoHora` digitado (R$ 784.270), não o medido (R$ 1.052.966). R$ 268.696/mês = R$ 2,03/kg fora de qualquer proposta (R$ 3,2 mi/ano).
5. **Cadência mistura dois regimes**: o LASER PERFIL só entra em "Corte" a partir de jan/2026. Sem ele set–dez/25 = 114.755; com ele jan–jul/26 = **141.941**. A média de 132.055 é de duas fábricas diferentes.
6. **Filtro de "18 dias" viesa a pintura 33% para baixo** — descarta os 5 melhores meses e guarda os 2 piores. Faz o contrário do que promete.
7. **`OP.valorFaturarPorKg` com lixo**: OP-115 = 10.023,58 R$/kg (é o valor do contrato num campo por quilo). Estoura /financeiro/previsao ~2.000×. Falta validação de faixa.

**Números medidos que custaram caro (não re-derivar do zero):**
- Custo da casa: **R$ 1.052.966/mês**, medido em 12 meses de `ContaPagar` pelo plano de contas da Torg — 45% fixo, 27% degrau, 28% variável. **Não é fixo**: escala não barateia a fábrica.
- Cadência: a consulta do Syneco não trazia `setor` e devolvia 693.844 kg/mês (os 6 setores somados). Real: corte 132.055 kg/mês de média, melhor semestre 147.537.
- **HH/t não se mede em fábrica ociosa** — a conta devolve efetivo ÷ produção, não conteúdo de trabalho. Vitor diz 5 t/dia por montador; com essa régua todos os postos ficam em 17–27% de ocupação, e o gargalo é a **pintura (3 pessoas, 330 t/mês)**. Só cronometrando um posto num conjunto real se resolve — anotando qual peça.
- **Pintura aponta mais peso que o jato** (1.369.803 × 1.141.861 kg em 11 meses) — fisicamente impossível, toda peça pintada é jateada antes. Começa em dez/2025, quando os dias de apontamento despencam e o kg sobe: lançamento em lote. `pinturaAcimaDoJato` marca isso.
- ⚠ As três fontes de peso **não fecham entre si**: dinheiro (3.1 ÷ R$ 7,25) 110.011 · corte 132.055 · CMR 234.240 kg/mês. Antes de usar CMR ou dinheiro para validar cadência, resolver quanto do aço é faturamento direto e se o `pesoKg` do CMR é peso recebido ou do certificado.
- Medidor de peso confiável = **NF-e de saída, CFOP 5.101/6.101, sem canceladas**: 99.769 kg/mês de venda contra 111.739 cortados (89% de aproveitamento). Sem filtrar CFOP dá 304.550 (remessa e retorno contados de novo) — é a origem da lembrança dos "330 t".

**Regras que já viraram código e não devem ser desfeitas:** desmarcar área é excluir do escopo; bases de imposto partem a venda (não somam em cima); ICMS credita 12% das compras da Torg (não do que o cliente compra direto); medição fatura kg produzido e trava no peso da obra; projeto e fabricação podem se sobrepor.

Ver [[torg_custo_hora]] — o `ocupacaoPct` está em 80 numa fórmula que o lê como absenteísmo (38,5 h/pessoa/mês, 1,75 h/dia), inflando o custo-hora ~4,6×. **Vitor ainda não decidiu** o que aquele campo deveria significar.
