---
name: torg_materiais_tekla
description: Pasta "Materiais OMIE - Tekla" (SERVIDOR/Engenharia/Workspace) — planilha só com perfis e parafusos do cadastro do Omie; arquivo NOVO a cada cadastro novo; cron 2x/dia; alimenta o Tekla
metadata:
  type: project
---

**Vitor (24/09/2026):** *"estou criando uma pasta na engenharia, preciso que vc traga uma planilha
atualizada sempre que um novo tipo de perfil for cadastrado no Omie, cadastrou vc cria uma planilha nova.
Essa pasta vai alimentar o Tekla para ele ficar sempre atualizado com os cadastros. Essa planilha vamos
deixar ela somente com perfis e parafusos"*.

- **Pasta:** `SERVIDOR/Engenharia/Workspace/Materiais OMIE - Tekla` (`PASTA_TEKLA`, drive
  `SHAREPOINT_DRIVE_ID`). **Arquivo:** `Materiais OMIE - Tekla AAAA-MM-DD HHhMM.xlsx` (hora de Brasília) —
  um NOVO a cada cadastro novo, nunca por cima; a ordem alfabética é a cronológica e a mais recente vale.
- **A pasta é o estado:** o cron lê o Omie (`listarProdutosOmie`, direto — o cache `ProdutoOmie` só
  sincroniza às segundas), baixa a última planilha da pasta e compara os códigos (`codigosDaPlanilha`).
  Código novo → arquivo novo; nada novo → nada. Sem tabela no banco.
- **Cron** `/api/cron/materiais-tekla`, `30 9,15 * * 1-6` (6h30 e 12h30 BRT, seg–sáb), cadastrado no
  monitor. `POST` manual (ADMIN/ENGENHARIA) aceita `{forcar:true}`. Trava `comTravaDeCron`.
- **Abas:** Perfis e Parafusos com a tabela na LINHA 1 (sem logo/bloco ISO em cima — quem lê é uma
  importação do Tekla), Novos, Leia-me. Código como TEXTO (zero à esquerda).
- **Perfis** = família Matéria Prima: PERFIL (W, H/HP, I, U, dobrado), CANTONEIRA, TUBO, BARRA, TRILHO,
  soldados (VS/CS/PS). **Parafusos** = família Fixadores, descrição começando por PARAF.
  **Fora:** chapa, porca/arruela/chumbador/barra roscada/autobrocante, "Cópia de …", perfil esponjoso,
  itens SEM família (os códigos soltos importados, "01.42.…"), inativos.
- **Leitura da descrição** (`lerPerfil`/`lerParafuso`): tipo, designação ("W 200 x 31,3", "L 3\" x 1/4\"",
  "UDCE 75 x 40 x 15 x 3,00", "Ø 5\" SCH 40"), peso kg/m, material; parafuso: norma/classe, diâmetro,
  comprimento, cabeça, acabamento. O que não se lê com segurança fica em BRANCO.
  ⚠ No Omie a cantoneira laminada vem ESPESSURA x ABA ("DN. 1/4 X 3POL" = L 3" x 1/4"); escrita com
  aspas ("4\" X 5/16\"") vem ABA x ESPESSURA.
  ⚠ A polegada não pode começar colada em número/hífen: "A-307 5/16\"" virava a bitola "307.5/16\"".
- **Primeira planilha:** 24/09/2026 17h02 — 673 perfis, 414 parafusos (Omie com 2.493 produtos). Sem
  designação lida: 2 perfis (descrição truncada; "2,25M"). Sem medida: 1 parafuso.
