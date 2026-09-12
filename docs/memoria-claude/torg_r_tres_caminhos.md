---
name: torg_r_tres_caminhos
description: "Portal Compras Torg — o R chega ao carimbo do croqui por TRÊS caminhos; o mais comum (material da obra, NA_OP) foi o que faltava"
metadata:
  type: project
---

**O R chega ao carimbo do desenho por TRÊS caminhos, e a precedência importa** (01/09/2026, commit `be511497`):

1. **Corte** — a peça foi cortada daquele fardo. É FATO, ganha de todos. (`rastreioDaOp`/`rastreioDoConjunto`, só peça já cortada.)
2. **Amarração à mão** — `TrocaRastreabilidade`: alguém disse "neste perfil o fardo é o R X", com nome e motivo. Decisão humana registrada. (`amarracoesDaOp`)
3. **Material da própria obra (`NA_OP`)** — comprado PARA a obra, R já determinado pelo CMR. Nada a escolher, nada a amarrar. (`rDoMaterialDaObra`, sobre o `porPerfil` de `analisarMaterial`.)

⚠️⚠️ **O terceiro é o mais comum e foi o que ficou desligado.** As 79 marcas da OP-113 saíram sem R nenhum: os 27 perfis eram todos `NA_OP`, então não existia amarração alguma para o carimbo ler. Pior, a rota de impressão **já calculava esse R** — usa `estado === "NA_OP"` para liberar a impressão — e jogava fora.

⚠️ **"Não tem botão para confirmar o R" não é bug de tela.** O "informar o R usado" de `LiberacaoMaterial.jsx` só aparece para estado `ESTOQUE`, onde há escolha real (material no pátio, nota lançada em outra obra). Para `NA_OP` a tela só EXIBE o R, porque não há o que decidir. Diagnóstico errado meu: cheguei a dizer ao Vitor que ele precisava definir os R primeiro — não precisava.

⚠️ **Dois R no mesmo perfil = o mais antigo da obra (FIFO).** Não é palpite: `analisarMaterial` devolve `rs` ordenado por `dataRecebimento asc`, e é a MESMA regra que a folha de separação já imprime (`daOpAntiga`). Escolher outro critério poria o croqui e o papel do Almoxarifado apontando fardos diferentes para a mesma peça.

Os três passam pelo mesmo `aplicarAmarracaoNosItens` (mesmo formato de Map), então a precedência sai de graça: quem já tem R não é sobrescrito. Aplicar na ordem 2 → 3. Ligado em `app/api/producao/desenhos/route.js` (avulso) e `lib/desenhos-lote.js` (lote); a separação já lia certo. Ver [[torg_rastreio_corrida]] e [[torg_marca_nao_unica]].
