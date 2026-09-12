---
name: torg_dado_historico_incompleto
description: "Portal Compras — obra antiga NÃO vai fechar 100% no portal; Vitor manda ignorar buraco histórico em vez de reconciliar. Corrigir o que é sistêmico, não o passado."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eab059d-15a2-4872-a325-5e90f443c4e3
  modified: 2026-09-07T15:26:01.490Z
---

**Vitor (07/09/2026): "não vamos conseguir deixar tudo 100% pois o portal nasceu agora."** Quando o dado
de uma obra antiga não fecha, a resposta padrão é **ignorar**, não reconciliar.

**Why:** o portal entrou depois de a fábrica já estar rodando. Toda obra anterior tem pedaço que nunca
passou por aqui — lista não importada, romaneio em papel, apontamento fora do Syneco. Perseguir isso
gasta sessão inteira e não muda decisão nenhuma: a obra já foi entregue.

**How to apply:** ao achar divergência em obra antiga, **medir, dizer o tamanho, e parar**. Só seguir se o
Vitor pedir. O que vale corrigir é a regra que vai errar DE NOVO (filtro, fallback, teto de consulta);
o registro do passado, não.

Casos concretos (07/09/2026, todos encerrados com "ignore"):
- **Frente G da OP-067** — 314 marcas / 17.728 kg embarcadas com romaneio, e a frente G não existe na
  LPC (que só tem A, AT, B, BT, C, CT, D, DT, F, FT, HT). 12% do peso de romaneio da obra é de peça que
  o portal não sabe que existe. Não é peça parada em fila: é obra que nunca foi importada.
- **`PC1`…`PC22`** no mesmo romaneio: pesam ZERO — são linha de controle do FORM 22, não peça. Nunca
  tratar como marca.

⚠ Marca de romaneio que não casa **não estraga o "expedido"**: o peso vem do arquivo (`pesoRealKg`), não
das peças casadas. O que ela não faz é dar baixa na peça — e se a peça não existe, não há baixa a dar.

Ver [[torg_import_romaneios]] (romaneio emitido ≠ embarcado), [[torg_listas_le_lpc]] e
[[torg_producao_e_lpc]].
