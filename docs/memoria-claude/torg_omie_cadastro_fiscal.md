---
name: torg_omie_cadastro_fiscal
description: Cadastro fiscal dos produtos do Omie pelas NF-e de compra — GRAVADO em 26/09/2026 (859+1 produtos: NCM/peso/origem/tipo; 536 pesos teóricos de fixadores pela norma); imposto NÃO fica no produto; a API IGNORA vazio e zero (CEST e peso só se limpam pela tela); troca de NCM zera o IBPT; CEST só é validado com recomendacoes_fiscais
metadata:
  type: project
---

**Vitor (26/09/2026):** *"sobre os cadastros, temos várias informações para colocarmos nos produtos, impostos,
peso, NCM (…) quero deixar isso muito bem cadastrado, vc consegue fazer isso com base nos produtos que compramos
até hoje?"* e depois *"pode seguir com os cadastros vc mesmo para podermos deixar alinhado"*.

**O que dá e o que não dá para gravar no produto:**
- ⚠⚠ **IMPOSTO NÃO MORA NO PRODUTO.** CST, alíquotas, CFOP e IBS/CBS vêm do **Cenário de Impostos** do Omie; os
  campos `cst_*`, `aliquota_*` e `cfop` do `ConsultarProduto` são "retornados só para o PDV" e a doc manda **não**
  enviá-los em `AlterarProduto`.
- Pela API o produto aceita: `ncm`, `tipoItem` (SPED), `peso_liq`, `peso_bruto`, `codigo_familia`, `marca` e, em
  `recomendacoes_fiscais`, `origem_mercadoria` e `id_cest`. ⚠ Ao mandar `recomendacoes_fiscais`, mandar o objeto
  INTEIRO (lido antes) com só a origem trocada — não se sabe se o parcial apaga o resto.

**A fonte: as NF-e de compra.** `produtos/recebimentonfe/` → `ListarRecebimentos` com `cExibirDetalhes:"S"` (100 por
página; 4.211 notas desde 2015, 65 canceladas). Por item: `itensCabec` (nosso `cCodigoProduto`/`nIdProduto`, `cNCM`,
`cCFOP` do fornecedor, `cUnidadeNfe`, `nQtdeNFe`), `itensAjustes` (`cUnidade` e `nQtdeRecebida` de quem lançou,
`cCFOPEntrada`, CSTs de entrada), `itensICMS.cOrigem`, `itensIPI`, `itensPIS`/`itensCOFINS`.
- ⚠ **O CFOP DE ENTRADA NÃO PROVA A NATUREZA DO ITEM.** 1.556 (uso e consumo) 6.584 itens, 1.101 3.737, **1.924
  (material do cliente) 2.652**, **1.102 (compra para comercialização) 1.615**. É como a nota foi lançada, não o que o
  item é — o tipo do SPED fica para o contador.
- ⚠ **PESO "MEDIDO" PELA CONVERSÃO DE UNIDADE NÃO SERVE:** nota em KG recebida em UN deu razão 1,000 em todos os
  casos (gás de 13 kg, serviço de pintura) — quem lança digita o mesmo número. Peso só onde a unidade é KG (= 1).

**O retrato de 26/09 (2.489 ativos):** peso líquido zerado em 2.488; NCM "0000" em 45; 171 sem família (164 já
comprados); 504 com tipo 99; origem vazia em 136; 1.572 produtos com pelo menos uma NF de compra; 527 com NCM do
cadastro ≠ NCM das notas (27 com ≥2 fornecedores concordando).

**Regras de NCM conferidas na tabela oficial (Gecex 926/2026, `FiscalNcmCodigo` do portal):**
- ⚠⚠ **7306.30.00 NÃO EXISTE.** Tubo redondo soldado de aço não ligado é **7306.30.90**; o 7306.30.10 é uma medida
  só (22,25 × 2,64 × 448 mm). Tubo quadrado/retangular (metalon) é **7306.61.00**. O cadastro tinha ~70 tubos no
  código inexistente, e há fornecedor emitindo com ele.
- Cantoneira laminada: aba < 80 mm → 7216.21.00; **≥ 80 mm (4" em diante) → 7216.40.10** (≤ 200 mm). O cadastro
  punha tudo em 7216.21.00; dois fornecedores declaram 7216.40.10 nas de 4".
- Perfil U/I laminado com altura < 80 mm (U 3", I 3") → **7216.10.00**; ≥ 80 mm: U 7216.31.00, I 7216.32.00.
- Chapa lisa laminada a quente pela espessura: > 10 mm .51 · 4,75–10 .52 · 3–4,75 .53 · < 3 .54; **xadrez 7208.40.00**.
- ⚠ **Item "conforme desenho" (códigos TP…) fica FORA:** a chapa xadrez TP002156x tem 8437.90.00, NCM de peça da
  máquina do cliente — trocar pelo 7208.40 pode estar errado. Serviços também ficam fora.

**GRAVADO (26/09/2026, noite — Vitor: "2 pode gravar").** `proposta2.json` (scratchpad da sessão): 860 produtos —
peso 1 kg nos 801 em KG, tubos 69 (7306.30.00 → .30.90 / .61.00), cantoneiras 13, chapas 12, U/I 7, NCM vazio 8, 13
revisados um a um (lente 7015.90.20, diluente 3814.00.90, arame tubular 8311.20.00, autobrocante 7318.14.00…), origem 39,
tipo 99→01 em 4 da Matéria Prima. **859 gravados e conferidos campo a campo**; o 860º (lente 181000022) foi recusado pelo
CEST e entrou depois (ver abaixo). Piloto de 4 antes; uma rodada só com `AlterarProduto` + releitura.
- ⚠⚠ **TROCA DE NCM ZERA (OU RECALCULA) O `dadosIbpt`** — a carga aproximada da Lei da Transparência é por NCM. Em 31 dos
  122 produtos com NCM trocado a conferência acusou só isso (alíquotas 18/13,83 → 0, ou 0 → 12 quando o Omie já recalculou).
  Não é defeito: o Omie repõe pela tabela do IBPT. Conferência de NCM tem de tolerar `dadosIbpt.*`.
- ⚠⚠ **O CEST SÓ É VALIDADO QUANDO `recomendacoes_fiscais` VAI JUNTO.** A lente (CEST 10.034.00 "Vidro estirado… em
  folhas", do NCM antigo 7004) parou a rodada: *"CEST não cadastrado para o Código [1003400]"* — foi a única com origem E
  NCM mudando. Os 6 que trocaram só o NCM passaram sem validar; reenviar o objeto como estava mostrou 3 CEST válidos
  (protetor solar, tubo 28.999.00, óleo de corte) e 3 errados: desengripante com CEST de **"Bombas para combustíveis"**
  (01.032.00) e os 2 diluentes com o de tinta (24.001.00, "Tintas, vernizes", para NCM de solvente 3814).
- ⚠⚠ **A API IGNORA VALOR VAZIO E ZERO** — `id_cest: ""`, `peso_liq: 0` e `peso_bruto: 0` respondem "alterado com sucesso"
  e não mudam nada (é o "não informado" deles). **Limpar CEST ou zerar peso é pela TELA**: Produtos → Editar →
  aba "Recomendações Fiscais" (CEST) ou "Informações Adicionais" (Peso Líquido/Bruto). Os 4 CEST errados e 2 pesos foram
  limpos assim, conferidos pela API. ⚠ Na tela, salvar produto com pedido/recebimento aberto PERGUNTA se leva a mudança
  para esses documentos — respondi **Não** (o documento reflete o combinado com o fornecedor; a API também não leva).
- **+9 no 7306.30.00 que a regra pulou por "SCH"** (SCH pode ser sem costura, 7304): 4 "COM COSTURA (CC)" e 3 com
  100% das notas em 7306.30 → 7306.30.90; HSS 200×150 → 7306.61.00; curva 1½" (notas 100%) → 7307.22.00. Conferidos.
  ⏳ **Restam 9 no código inexistente**, sem evidência limpa: curva SCH40 201000065 (notas 50% 7307.93.00), tubos DIN2440
  "laminado" 201000097/099 (não diz costura), tubos SCH40 201000102/103/117/118 (notas trazem 7208.51, de chapa) e os CS
  502000003/009.
- ⏳ **PERFIS SOLDADOS (VS/PS/CS) ESTÃO COM NCM SEM CONVENÇÃO — para o contador:** 9406.90.20 (construção
  pré-fabricada) ×6, 8205.59.00 (ferramenta manual!) ×1, 7306.30.00 (inexistente) ×2, 7308.90.10 ×2. Na tabela existe
  **7301.20.00 "Perfis"** (obtidos por soldadura), candidato natural; não mexi.
- ⚠⚠ **ZERAR PELA API: mandar 0,0001.** O Omie grava peso com 3 casas e o `AlterarProduto` só ignora o zero LITERAL —
  0,0001 passa pelo "não informado", é arredondado e vira 0,000 (medido em 26/09 no 701000036; 50 zerados assim e
  conferidos). Vale para peso; para texto vazio (CEST) continua sendo a tela.
- ⚠ **Peso declarado na NF (transporte.nPesoLiquido/nPesoBruto) NÃO serve para peso unitário**, nem em nota de 1 item:
  HARDTOP XP comp. B 0,32 L = 90 kg; Penguard 4 L = 1 kg; airless Graco X70 = 0,36 kg. É o que o fornecedor digita.
- **TIPI: 7308.90.90 tem Ex 01 = "Telhas de aço" (IPI 0; o geral é 3,25%)** — o Omie grava como `7308.90.90.01`. Telhas
  passaram todas para ele (26/09). ⏳ Rufo, calha, tampa e bocal também estão no Ex 01 e não são telha: candidato é
  7308.90.10 ("chapas… próprias para construções", IPI 0) ou o 7308.90.90 geral — decisão do contador. ⏳ Chapas
  galvalume (103000001–005, 20003280/288) com 3 NCMs (7308.90.10, 7210.61.00, 7210.49.10); 7210.49.10 é zincado, não
  Al-Zn — o texto da TIPI aponta 7210.61.00, mas fornecedor usa 7308.90.10. Contador.
- **Telhas, calhas e rufos (Vitor, 26/09: "precisamos melhorar esses cadastros no geral").** O retrato: unidade M2 no
  cadastro, mas VENCOB e A2 ROCHA vendem TELHA POR METRO LINEAR e o recebimento lançou ML como M2/PC/CJ (razão 1) — o
  saldo mistura metro e peça; preço R$ 37,62 e bruto 32,14 copiados em quase todos; nota da H BREMER em "1 KG a R$
  8.500" (lote); item genérico "TELHAS, CALHAS, RUFOS E ACESSORIOS" (CJ) recebendo metros de tudo; BOCAL duplicado
  em Fixadores (150000013). Feito: NCM do selante (3506.10.90), lanternim (9406.20.00), genérico (7308.90.90) e 2 telhas
  no Ex 01; pesos brutos copiados zerados; rufos/calha em m² de chapa = espessura × 7,85 + 0,15 (AZ150). ⏳ Proposta de
  padrão (descrição "TELHA TRAPEZOIDAL TP40 GALVALUME ESPESSURA 0,43MM - LARGURA UTIL 980MM", telha em M com peso
  9,42·e + 0,18 kg/m pela bobina de 1.200 mm, cumeeira/tampa/bocal em PC) aguardando o Vitor.
- ⚠ Minha 1ª conferência do CEST disse "OK" com o CEST intacto: ela só procurava mudança A MAIS. **Conferência tem de
  checar também que o valor pedido FICOU**, não só que nada além mudou.

**Unidades (26/09 — Vitor: "9 ajuste todas as unidades que estiverem erradas").** O estoque do portal já batia com o
Omie (0 de 2.509 divergentes; a correção de 24–25/09 parou de sobrescrever com "UN"). No Omie, pelo PREÇO das notas (não
pela sigla): CO₂ UN → **KG** (81/82 notas em kg a ~R$ 5,59/kg; o saldo de 2.140 é kg), revelador de trincas e
"equipamentos de informática" KG → **UN**, botina **PA → PAR** (no Omie `PA` = Pacote). ⚠ **O GLP PARECE errado e não
está**: a nota diz "KG" e cobra R$ 230/unidade — é o botijão, o UN está certo. ⚠ Na tabela de unidades do Omie, `MT` =
"Material" (não metro) e `MN` = Metro Linear. Ficaram para decidir: 4 itens TP da TMSA em "Kg/M", energia (PRD00001) em
"WATTS" com notas em MWh (não há MWh na tabela) e 2 códigos da Quality Welding em "MT".

**Peso (26/09 — Vitor: "coloque o peso dos produtos que forem possíveis").** Antes: 1 de 2.489 com peso. Agora: os 801
em KG (1 kg) + **536 pesos teóricos pela NORMA**, conferidos contra tabela publicada (porca DIN934 M12 ≈ 17 g, DIN933
M12×40 ≈ 46 g, barra roscada ½" ≈ 0,80 kg/m, A325 ¾"×2" ≈ 0,19 kg): A325/A490 (ASME B18.2.6), A307 (B18.2.1), porca
A194 2H/A563 (B18.2.2), F436 (½" acima), DIN 933/931/934/125, barra roscada; GLP P13/P20 (conteúdo) e selante 400 g.
Geometria: sextavado 0,866·F² × altura (porca × 0,95), rosca a 0,9·d, aço 7,85. Fora, sem chute: "A994" (não é norma
de arruela), parabolt, prisioneiro, cabo, tinta (densidade), grade de piso (catálogo). Script `pesos.mjs` no scratchpad.
- ⚠⚠ **83 PRODUTOS TINHAM PESO BRUTO COPIADO DE OUTRO** (108,91 / 109,52 / 36,51 / 32,14 repetidos em tubo, tinta,
  telha, selante…) — o "Duplicar" copia o peso. Os fixadores da lista ganharam o calculado nos dois campos; os 26 em KG
  ficaram com bruto 1. ⏳ ~57 fora de KG (tintas, telhas, curvas, telas) seguem com o bruto errado: zerar só pela tela.

**Famílias (26/09/2026, noite — Vitor: "notei alguns produtos sem família definida, consegue ajustar isso também").**
✅ 134 dos 171 sem família gravados pela API e conferidos campo a campo: Matéria Prima 43, Fixadores 29, Tinta e
Solvente 13, Material Auxiliar 12, Manutenção e Conservação do Imóvel 8, Máquinas e Equipamentos 5, Serviço 5,
Manutenção de Equipamentos 4, EPI 3, Gas e Equipamento 3, Material Escritório 3, Marketing 2, e 1 cada em
Ferramentas, Material Auxiliar de Pintura, Material para embalagem e Telhas. Regra: a família que a maioria dos
produtos com o MESMO NCM já tem (≥ 3 e ≥ 70%), senão a descrição; cilindro de gás → Gas e Equipamento; módulo/placa
de tomada → Imóvel. ⏳ Ficaram 38 para o Vitor decidir: peças de cliente com desenho (T…/TP… "- PP", chapas UHMW,
etiquetas), ENERGIA ELETRICA, FORNECIMENTO DE ALIMENTOS, MATERIAIS DIVERSOS (193 notas), MARQUISE e ESTRUTURA METALICA.
⚠⚠ **TRÊS ARMADILHAS DA API DE PRODUTO (medidas nessa rodada):**
1. `AlterarProduto` com só o campo que muda responde "Produto alterado com sucesso!" e **não grava** — é preciso mandar
   junto `codigo`, `descricao`, `unidade`, `ncm`, `valor_unitario` (e `tipoItem`).
2. O `ConsultarProduto` logo depois devolve o dado **antigo** por alguns segundos: conferir numa segunda passada, não na
   hora (a 1ª rodada "falhou" por isso, e tinha gravado).
3. ⚠⚠ O `ConsultarProduto`/`ListarProdutos` devolve o texto com **entidade HTML** (`"` vem `&quot;`). Reenviar assim
   grava o `&quot;` como TEXTO — 17 descrições e 1 código (`CTTOR-750-2000-1"`) ficaram com `&amp;quot;` e foram
   restaurados na hora. **Decodificar (`&quot;`→`"`, `&amp;`→`&`…) antes de mandar de volta.**
