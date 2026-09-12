# Teste Tekla 2025 — marcas no padrão TMSA / Vale (UDA na montagem)

Objetivo: cada montagem do modelo carrega o SKU, TAG, CWP, Item LX e desenho do cliente,
e esses campos saem nos relatórios de LPC/LE que o portal importa. Nada é renumerado.

## Passos (modelo de teste, ex.: OP-107 TMSA)
1. **objects.inp** → copie para a pasta do modelo (vale só para ele). Reabra o modelo.
   Conferir: duplo clique numa montagem → aba "TMSA / Vale" com os 5 campos.
2. **mapeamento-sku.csv** → salve na pasta do modelo. Colunas separadas por ponto e vírgula:
   `marca;sku;tag;cwp;item_lx;desenho_cliente`. A marca é a de montagem (T107A1).
   Para o teste, os SKUs do arquivo são fictícios; na OP-122 vêm da lista LX da TMSA.
3. **TORG_TMSA_PreencherUDA.cs** → copie para
   `C:\ProgramData\Trimble\Tekla Structures\2025.0\Environments\common\macros\modeling\`
   (ou a pasta de macros do seu ambiente). Applications & components → Macros → Run.
   Sai `TORG_TMSA_resultado.txt` na pasta do modelo com casadas e sem par.
4. **Relatórios**: no Template Editor, abra o modelo da LPC (036 VFI_Lista de peças por conj)
   e da LE, e acrescente colunas com os campos `ASSEMBLY.USERDEFINED.SKU_TMSA`,
   `TAG_CLIENTE`, `CWP_CLIENTE`, `ITEM_LX`, `DESENHO_CLIENTE`. Salve com outro nome
   (ex.: `036 VFI_LPC_TMSA`) para não mexer no relatório das outras obras.
5. Gere a LPC do modelo de teste e me mande o .xls: eu confiro se o portal lê e o vínculo
   SKU × marca nasce sozinho na importação.

## Se a TMSA exigir a marca física = SKU
Aí é numeração, não UDA: prefixo de montagem por família (ex.: `S105B-`) e número inicial.
A letra final do SKU deles (`15A`) não sai da numeração padrão; precisamos da regra deles
(reunião de PIM, 22/09) antes de mexer nisso.
