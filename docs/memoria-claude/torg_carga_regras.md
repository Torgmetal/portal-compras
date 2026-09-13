---
name: torg-carga-regras
description: "Regras de formação de carga (Expedição) definidas pelo Vitor em 09–10/09/2026 — pacotes, pilha de guarda-corpo, peso, veículos, transporte especial, em pé só com embalagem, nada inclinado"
metadata: 
  node_type: memory
  type: project
  originSessionId: 962712cd-3688-48a6-8a86-e8b54b222c41
  modified: 2026-09-10T14:00:00.000Z
---

Protótipo local de **prévia de carga em 3D** (scratchpad `slots3.mjs` + `viewer.js`, servido em
`127.0.0.1:3115`), feito sobre a OP-089 com as caixas do IFC. Não está no portal ainda. Regras que
o Vitor definiu e que valem para a versão do portal:

- **Pacotes**: cantoneiras/barras amarradas por frente de montagem (A/C nunca se misturam) +
  família + comprimento; guarda-corpo em pacote de painéis; peça miúda em pallet ou caçamba.
- **Pilha de guarda-corpo**: zona própria na frente, pacote sobre pacote com madeira, o mais
  comprido embaixo, nada em cima.
- **Peso/fragilidade**: rígido embaixo, delicado (guarda-corpo, grade, chapa fina, pallet) em cima;
  pesado sobre leve vira alerta, não trava.
- **Cenário preferido**: separar — estrutura numa carga, guarda-corpo/grade/chapa/miúdos em outra
  (truck/3/4). Fechou a 089 em 3.435 kg/1,49 m + 722 kg/0,87 m.
- **Veículos**: carreta 12,4 m; carreta especial 14 m para 12,4–14 m; acima de 14 m, largura >
  2,60 m ou altura total > 4,40 m = **transporte especial**, com aviso. Medidas de toco/3/4/HR
  ainda são "típicas" — Vitor deve confirmar as dos caminhões contratados.
- **Inclinada nunca** (10/09/2026: "não podemos transportar dessa maneira"). **Em pé pode, desde que
  tenha embalagem adequada** (10/09/2026) — painel/pacote de painéis girado 90° DENTRO de engradado
  reforçado (guarda-corpo/grade, painéis lado a lado) ou em cavalete (A-frame) com calços e cintas
  (peça solta). Sem embalagem, nada fica em pé; só painel (fino em relação à altura) vai em pé; sempre
  no assoalho, nada em cima. No protótipo: `EMPE=necessario` (só o que não cabe deitado) ou
  `EMPE=paineis` (guarda-corpo sempre em engradado). Medidas do engradado/cavalete são premissa minha
  (quadro 60, base 120, ≤ 620 mm de largura, ≤ 600 kg) — o Vitor fez um **estudo no Claude Design**
  sobre essa embalagem que eu NÃO consegui abrir (DesignSync exige `/design-login` em sessão
  interativa e só lista projetos de design-system); pedir a ele o export/print quando o assunto voltar.
- Resultado na 089 com GC em pé: os 6 pacotes viram 6 engradados (+270 kg de madeira); a carga de
  delicados cai de 57% para 24% do chão da carreta e passa a caber num **3/4** (5,0 m, 992 kg, 1,66 m).
- **PERFIS DE CARREGAMENTO = TIPO DE EMBALAGEM** (Vitor, 10/09/2026: "o exigente nem seria a
  quantidade de caminhões, seria o tipo de embalagem; a quantidade de cargas sempre será a menor
  possível"). O empacotador (`slots4.mjs`) SEMPRE busca o menor nº de viagens e depois o frete menor,
  em todo perfil; delicados só vão em veículo separado quando já são precisas 2+ viagens. O que muda:
  **Econômico** = pacote amarrado + madeira, GC deitado (engradado só se reduzir viagem), pallet aberto;
  **Recomendado** = GC em pé em engradado, cantoneira sob cinta em peça pintada, pallet;
  **Exigente** = GC em engradado, chapa fina em engradado deitado, miúdos em caixa reforçada fechada,
  cantoneira + manta. Cada carga sai no MENOR veículo do catálogo em que cabe; `comparativo.json` põe
  os três lado a lado (viagens, veículos, frete relativo carreta=100 — PREMISSA —, embalagens,
  proteção, tempo, alertas). Portal: perfil deve ser cadastro por cliente/obra, não constante.

- **SEQUÊNCIA POR NÍVEL DA OBRA (OP-118, 10/09/2026)** — Vitor: "precisamos mandar as colunas, depois as
  vigas e guarda corpos conforme o nível da obra". A "Lista de Peças por Nível" da Engenharia (`niveis-118/*.xlsx`,
  parser `niveis.mjs`) dá nível + tipo (1 coluna · 2 viga/estrutura · 3 GC/grade/escada); `OP=118 SEQ=nivel CEL=100
  node slots4.mjs` empacota nessa ordem com janela de 4 cargas abertas (`JANELA`), pacotes por frente+nível. Na 118
  só existem 2 colunas na lista (obra é de plataformas: vigas 66 t + grades/GC/escadas 51 t). Resultado 13/13/15
  viagens (econ/recom/exigente) para 117 t. Premissas novas do protótipo: **CALCO=150** (carregador nivela apoio
  desigual com caibro + cunha até 15 cm; exigir mesmo nível fragmentava: 15 → 13 viagens), **grade de piso vai em
  pacote cintado** (`PAC_GRADE` 500 mm/1.200 kg, sem caibro entre grades), engradado de GC em pé = 60% do volume da
  carga exigente (128 engradados de 3,5 × 0,7 × 1,64 m, 92 kg/m³); what-if `ENG_ESP=1000 ENG_KG=1200` (engradado com
  2 pacotes) tira 2 viagens — depende do estudo de embalagem do Vitor. Contraventamento em X vem montado no IFC
  (T118J20 7,6 × 7,1 m, 16 kg): Vitor confirmou "vai desmontado, não teremos transporte especial" → o packer
  desmonta em 2 barras da diagonal (regra geral: contraventamento mais largo que a carroceria e ≤ 60 mm).
  Motor alternativo `MOTOR=camadas` (camadas inteiras) ficou PIOR (18 viagens) — não usar.
- **EMBALAGEM DE PEÇA PEQUENA E DE VIGA (Vitor, 10/09/2026, vendo a carga 1 da OP-118)**: "essas peças não podem
  ir dessa maneira em nenhum transporte, são peças pequenas e podem danificar". Regras: (1) **vigas que formam o
  nível vão em feixe cintado** (protótipo: seção ≤ 500 mm, 1,2 m de largura, ≤ 2,5 t, mesma frente/nível/família,
  faixa de 2 m de comprimento); (2) **cantoneiras/chapas de ligação e miúdos (≤ 2 m, ≤ 60 kg) vão em caixa de madeira
  fechada, separadas, UMA CAIXA POR MARCA** juntando todos os níveis (a marca repete nos níveis) — caixa muito grande
  divide em 2 (protótipo: 1 t, 0,6 m de altura); marca com poucas peças (< 6) divide caixa com as outras miúdas da
  mesma frente/nível; (3) **guarda-corpo nunca por baixo** — em cima de pacote de GC só vai outro pacote de GC
  (tampa 4); pallet aberto deixou de existir em todos os perfis.
- **GRADE DE PISO VAI EM CARGA PRÓPRIA** (Vitor, 10/09/2026): "grade de piso não mandamos junto com estruturas, fazemos
  carregamentos separados; pode ocorrer de tentar conciliar, mas não nessa obra (volume grande)". Protótipo:
  `GRADE_SEPARADA` (default), `GRADE_JUNTA=1` só para obra em que se decida conciliar; na sequência por nível a carga
  de grade entra depois da estrutura do seu último nível. Guarda-corpo continua indo com a estrutura (por cima).
- **MADEIRA DE EMBALAGEM — preços e calibração (10/09/2026)**: a madeira vem da **HM CONCHAL MADEIRAS** (Omie nCodFor
  7771549055, categoria "3.7 - Material para Embalagem"); os pedidos no Omie são genéricos ("SARRAFO 1 UN"), o detalhe
  está nas NF-e de entrada (`ListarNF` em produtos/nfconsultar com `nIdCliente`), vendidas por **m³**: caibro
  R$ 1.350→2.700/m³ (abr→ago/26, média jul–ago R$ 2.283), sarrafo R$ 1.400→2.300 (média R$ 1.853), "materiais
  diversos" (tábua) ≈ R$ 1.450, compensado R$ 65,60/chapa; abr–ago/26 = 34,5 m³, R$ 63.464 para 464 t expedidas =
  **R$ 137/t real**. Modelo do protótipo (`madeira-custo.mjs`, seções caibro 5×6, sarrafo 2,5×5, tábua 2,5 cm ripada
  60%): OP-118 recomendado R$ 163/t (caixa de madeira ≈ R$ 180, feixe ≈ R$ 20 de caibro, pacote GC ≈ R$ 26),
  exigente R$ 291/t (engradado em pé ≈ R$ 141). Vitor quer isso por tipo de carga e de embalagem.
- **OP-049 (Danpower ENC 0320, torre, Uruçuí-PI) = referência real para a OP-118** (mesmo lugar, peso parecido).
  Não está no portal: romaneios em `01. OP/Finalizadas/OP-049 - Danpower - ENC 0320/4. Expedição/4.2 Romaneios`
  (22 FORM 22 .xls, jun/25–mar/26; R19 = R20 duplicado; R06 só parafusos; R07 = 5,7 t de tubos; parser
  `lib/parse-romaneio.js` lê 20 deles). ≈ 146 t em 21 cargas = 7 t/carga (R01 22 t de colunas; 6 cargas de
  GC/grade R09–R14; cauda R15–R22 de complementos de 37 a 277 kg). Frete IGR Transportes (Luiz Cesar Gerotto)
  Conchal→Uruçuí ≈ **R$ 11.000/carreta** (2 parcelas de 5.500 no dia do romaneio; contas a pagar "4.4 - Frete
  (Entrega)"). Vitor: na 049 usou o modelo econômico e teve bastante retrabalho. Mix diferente: 049 tinha 37,6 t
  de colunas; 118 tem 2 colunas e 51 t de GC/grade (o que come volume).
- **⚠ A "Lista de Peças por Nível" da OP-118 NÃO é a lista completa** (10/09/2026): tem 117 t / 2.522 pç; a Lista de
  Expedição do portal (PecaConjunto LE_IMPORT) tem 136,9 t / 3.022 pç = o contrato (chapas e perfis 116,3 t + grades
  e degraus 22,4 t). Faltavam na lista por nível 217 marcas / 46 t: as 64 COLUNAS (37 t, frente A), talas, mãos
  francesas, contraventos, degraus (213 pç, não estão no IFC), 34 vigas, 20 grades, 19 GC. Regra: **a LE manda na
  quantidade; a lista por nível só dá o nível** (`merge-118.mjs` → `prontas-op118.json`; colunas/talas = nível 0
  "Base / colunas", vão primeiro; item com "EL. +NNNN" na descrição cai no nível da elevação). Com a lista completa e as
  caixas orientadas regeneradas (geo.mjs + obb.mjs para todas as marcas) a 118 dá **16 cargas** (142 t com madeira:
  1 carreta 14 m com 15 colunas, 13 carretas de estrutura, carreta + toco de grade; exigente 19), contra 21 da OP-049
  (146 t). Peça de 12,4–14 m vai na carreta 14 m completada com colunas (só uma carreta especial).

**Why:** o Vitor quer romaneio/volumes sugeridos a partir do 3D, com passo a passo para o
carregador; cada regra acima veio de uma correção dele sobre uma versão errada minha.

**How to apply:** ao levar isso ao portal (Expedição › prévia de carga → romaneio prévio), essas
regras entram como cadastro/regra, não como constante; ver [[torg_romaneio_carga]] e
[[torg_croqui_nao_expede]].

**12/09/2026 — orientação da peça e perfil Vale/TMSA (slots4.mjs).** O IFC da 118 é **Y-UP (índice 1)**: a maior dimensão
das 64 colunas está no eixo 1. A caixa orientada (obb.mjs) só pode ALINHAR O COMPRIMENTO; a permutação "menor dimensão
para baixo" deitava viga de lado, deixava mão-francesa de banda (giro 44°, "pacote flutuando") e mandava barra de 7 m para
transporte especial. Regra: perfil (viga, coluna, terça, treliça, mão-francesa, contraventamento) viaja com a **alma em pé**
(altura = eixo Y depois do giro; coluna deita no comprimento, seção maior para cima); família CHAPA (chapa, grade, GC, piso,
plataforma, tala) deita com a menor dimensão para baixo; quadro plano alto (> 80 cm e > 1,5× a largura) deita.
**Perfil `vale`** = espec. de embalagem TMSA/Hydro TPR00864 lida do jeito mais produtivo: feixe ≤ 2 t e ≤ 12 m, miúdo em caixa
sobre palete ≤ 1 t (caixa por marca só com 6+ peças), GC deitado em engradado (empilha), grade/chapa em engradado deitado,
madeira fumigada ×1,35, volume numerado por embalagem + `romaneio` por carga (`c.romaneio`, `c.volumes`). OP-118 por nível:
econômico/recomendado 15 viagens · R$ 24 mil de madeira; exigente 19 · R$ 39 mil; **vale 18 · R$ 86 mil**; vale-literal
(caixa manual 34 kg + GC em pé) 21 · R$ 131 mil · 868 volumes. Colunas 12,5–14 m nunca em feixe (Vitor). `PERFIL=a,b` roda só
esses perfis e preserva o comparativo dos outros.

**12/09/2026 — Embalagem na LQC (aba Frete).** Vitor: "vamos colocar essa parte do material de embalagem no portal (…) pode
impactar bem no preço" → `NIVEIS_EMBALAGEM` em lib/lqc.js: **Econômica 0,14 · Padrão 0,18 · Reforçada 0,29 · Especificada
0,63 R$/kg** (nomes escolhidos por ele; "Reforçada" no lugar de "Premium"). `calcularEmbalagem(cfg, pesoTotal)` entra em
`custoTorg`, diluída no R$/kg de cada área (rateio como frete diluído), e em `custosExternos`; `resultado.embalagem`. Estudo
novo nasce Padrão; estudo antigo sem nível fica com zero e a aba Frete mostra tarja. R$/kg digitado sobrepõe a tabela.
Calibrar os níveis conforme as obras saírem com romaneio (a Econômica é o real de 2026).

## Modelo de carga em PDF com capturas 3D (12/09/2026)

Vitor achou as plantas 2D por camada "bem ruins" e o caminhão "bem ruim". Hoje o modelo de UMA carga
(`gerar-modelo-carga.mjs`, A4 paisagem, ~9 páginas) usa **fotos do próprio simulador**: página 1 com iso +
lateral + de cima (número do volume numa bolinha da cor da camada) e **uma folha por camada** (camada da vez
colorida e numerada, o já carregado em cinza, o que falta escondido) + ordem de descida (1º, 2º…).

- `viewer.js` expõe `window.viewerApi` (`irPara`, `destacarCamada`, `rotular`, `enquadrar("iso|topo|lado|tras")`,
  `olhar`, `limpar`) e `window.viewerPronto`; `capturar-camadas.mjs` (Playwright + Chrome headless, SwiftShader)
  gera `cam-op<OP>-c<carga>-*.png`; `pdf-modelo.mjs <nome>` fecha o PDF. Roda por carga: `OP=118 PERFIL=recomendado CARGA=3`.
- **Enquadramento:** ajustar pela CAIXA da caçamba, não pela esfera envolvente (deixava a carga com 60 % do
  quadro); na vista de cima somar A/2 e na lateral L/2 à distância (a face mais próxima da câmera aparece maior).
- **Caminhão v2** (`caminhao.js`): cavalo 6x2 cabine avançada com dormitório (casca extrudada do perfil lateral,
  para-brisa inclinado, grade, faróis, retrovisores, degraus na frente da roda, tanques, quinta roda, mangueiras)
  e semirreboque com pescoço baixo, pés de apoio, para-lama corrido, barra anti-intrusão. Pino-rei a 1,4 m da
  frente da carroceria; cabine 2,3 m com 0,85 m de folga até a carroceria. Ambiente `RoomEnvironment` + ACES.
- ⚠ Para-lama = `CylinderGeometry(..., openEnded=true, θ=π/2..3π/2)` girado em X: com `openEnded=false` e θ=π
  saía um meio-disco EM PÉ na frente da roda (foi o "caminhão bem ruim" da primeira versão).
