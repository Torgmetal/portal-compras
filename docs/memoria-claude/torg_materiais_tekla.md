---
name: torg_materiais_tekla
description: Pasta "Materiais OMIE - Tekla" (SERVIDOR/Engenharia/Workspace) — planilha só com perfis e parafusos do cadastro do Omie; arquivo NOVO quando um código entra, SAI (inativado) ou muda de descrição; cron 2x/dia; alimenta o Tekla
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
  sincroniza às segundas), baixa a última planilha da pasta e compara código E descrição
  (`descricoesDaPlanilha` + `mudancasDoCadastro`). Entrou, saiu ou mudou de descrição → arquivo novo;
  nada mudou → nada. Sem tabela no banco.
  ⚠⚠ **SAIR TAMBÉM PUBLICA (24/09/2026, noite).** Na 1ª versão só código NOVO gerava arquivo: a limpeza
  dos duplicados (inativar no Omie) não chegaria ao Tekla até alguém cadastrar outro produto. Ver
  [[torg_omie_duplicados]].
  ⚠⚠ **SUMIÇO EM MASSA NÃO PUBLICA**: mais de max(20, 15%) dos códigos saindo de uma vez é leitura ruim
  (família renomeada, resposta incompleta), não limpeza — o cron LANÇA (monitor avisa) e nada vai para a
  pasta. Limpeza grande de propósito sai pelo POST com `{forcar:true}`.
- **Cron** `/api/cron/materiais-tekla`, `30 9,15 * * 1-6` (6h30 e 12h30 BRT, seg–sáb), cadastrado no
  monitor. `POST` manual (ADMIN/ENGENHARIA) aceita `{forcar:true}`. Trava `comTravaDeCron`.
- **Abas:** Perfis e Parafusos com a tabela na LINHA 1 (sem logo/bloco ISO em cima — quem lê é uma
  importação do Tekla), **Mudanças** (Novo / Saiu do cadastro / Descrição alterada, com a descrição de
  antes; era "Novos" até 24/09), Leia-me. Código como TEXTO (zero à esquerda). O xlsx mora em
  `lib/materiais-tekla-xlsx.js` (reexportado por `lib/materiais-tekla.js`).
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
- **Conferido contra o real (24/09 noite):** Omie ao vivo × planilha das 17h02 = 1.087 × 1.087 códigos,
  0 mudança — a regra nova não gera arquivo à toa.

**As normas do Tekla e o "Omie automático" (26/09/2026).** Na sessão do Tekla (PC Windows) foram criados os
materiais TORG: **A36, A572-GR.50, MULTINORMA, CIVIL 300**. O "Omie automático" (DLL no Tekla) escolhe o código pelo
perfil e, entre os códigos do mesmo perfil, pelo material da peça; **sem código na norma da peça, fica o A36** (nunca
multinormas). Ele lê a norma da DESCRIÇÃO (via esta planilha: `materialDe` + descrição).
- ⚠⚠ **A NORMA MORA NA DESCRIÇÃO DO OMIE, no padrão da família** ("A-36", "A 572 GR.50", "MULTINORMAS COMERCIAL",
  "USI CIVIL 300"). Vitor perguntou se a descrição se mantém: sim — só se corrige grafia que impede o casamento.
- ⚠⚠ **"SEM CÓDIGO NO OMIE" QUASE SEMPRE É GRAFIA, NÃO FALTA.** Medido nos 12 meses de listas: a L152X12.7 da RM da
  OP-124 existe (401000058 "1/2 X 6POL", de 23/07 — o Tekla não converte cantoneira em mm para polegada; a peça veio
  do NC1 do cliente com nome métrico); a W200X86 existe (501000103, escrita "WH200"); a U3"X7.44 existe (601000002,
  escrita "7,40", o catálogo diz 7,44). Criar teria gerado duplicado. **Conferir a grafia antes de cadastrar.**
- ⚠ **Chapa: o Tekla escolhe pela espessura e ignora a norma** (só xadrez/inox mudam o tipo), e lê os códigos de chapa
  da tabela dele (Omie.dat), não desta planilha (que não tem chapa). Chapa CIVIL 300 só sai sozinha depois de ajuste
  no programa do Tekla.
- **Decisão do Vitor (26/09):** CIVIL 300 é o padrão; a USI CIVIL 350 (101000048/49, criadas em 29/04, nunca
  compradas) não será comprada. Faltavam de verdade só a cantoneira 4" x 7/16" (T64T, sem compra) e as chapas CIVIL 300
  (T92/T60B: 3; 4,75; 6,30; 9,50; 12,50; 16; 19; 31,50; 44,50 mm). Ver [[torg_omie_cadastro_fiscal]].
