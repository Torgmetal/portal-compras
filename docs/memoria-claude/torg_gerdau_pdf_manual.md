# GERDAU responde a cotação só com PDF — e a digitação é manual, por decisão

**22/09/2026.** Matheus: *"deixe o da GERDAU assim, a gente vai digitando manualmente as propostas
de PDF deles"*. **Não é defeito em aberto — é decisão.** Quem for mexer no leitor de PDF depois,
leia isto antes.

## O que foi medido (banco de produção, 22/09/2026)

| | |
|---|---|
| Cotações `PENDENTE` com PDF anexado e **nenhum preço** | **31** |
| Delas, **GERDAU** | **27** |
| Outros (Comercial Ararense 2, JD Aço 1, SOUFER 1) | 4 |
| A mais antiga | **115 dias** parada |
| Comparação: cotações `RECEBIDA` | 453 |

## Por que o leitor automático não resolve

O PDF é uma *Proposta Comercial* do **representante** (L & L Silva), não da Gerdau direto, num
layout de formulário. Testado contra o arquivo real da RM T122-001:

- ⚠⚠ **O texto sai EMBARALHADO** — rótulo e valor se separam, não há linha para casar. O leitor de
  reserva devolve **0 itens** (`parseCotacaoText`, medido).
- ⚠ **Eles cotam parte da RM**: 4 dos 9 itens (só as cantoneiras; os perfis W/H não vêm).
- ⚠⚠ **A proposta é em QUILO** (2.500 kg, R$ 6,90/kg) e a RM é em **PEÇA** (135 UN). Sem o peso por
  barra não existe conversão automática honesta.

Ou seja: mesmo com leitura perfeita, a resposta não ficaria completa.

## A armadilha que continua de pé (e não é da GERDAU)

⚠⚠ **ANEXAR O PDF NÃO ENVIA A PROPOSTA, E NINGUÉM É AVISADO.** O anexo sobe na hora, independente
do envio; o fornecedor larga o arquivo e vai embora achando que respondeu. Do lado de Compras a
cotação fica "Aguardando" **com um PDF pendurado**, que se lê como proposta recebida. É a mesma
armadilha já documentada com a SOUFER em 21/09 — o conserto de então (rolar até o campo que falta)
não alcança quem nunca chega a ver aviso nenhum.

⚠ As três saídas propostas e **não feitas** (decisão do Matheus foi digitar à mão):
1. tarja que não sai depois do upload: *"PDF anexado — a proposta AINDA NÃO FOI ENVIADA"*;
2. na lista de Compras, `PDF anexado · sem proposta enviada` (hoje essas 31 parecem iguais às que
   ninguém respondeu);
3. leitor para o layout do representante — o menos urgente dos três.
