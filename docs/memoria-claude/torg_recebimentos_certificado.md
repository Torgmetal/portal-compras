---
name: torg-recebimentos-certificado
description: Recebimentos nascem dos CERTIFICADOS do CMR, sem peça — tintas (RRT, A/B/C), penetrante/revelador (RRP) e arame de solda (RRA), em modelo próprio da Torg; penetrante e removedor não estão no CMR
metadata:
  type: project
---

Vitor (07/10/2026), para a QWS (OP-102): o recebimento de tintas pedia peça, e devia pedir só os certificados
das tintas e diluentes; criar o recebimento de penetrante/revelador e o de arame de solda, também só com
certificados. O RIR que veio de exemplo é de um concorrente: *"vamos criar o nosso modelo, não usar de alguém
que é nosso concorrente — é apenas um modelo para saber as informações necessárias"*. As siglas RRP e RRA foram
aprovadas por ele. Commit `046a4954`.

- **Criação, no computador e no celular:** escolhem-se certificados do CMR (`EscolherCertificados`,
  `GET /api/qualidade/inspecoes/certificados`), não peças. Sem texto, a lista traz a classe
  (`certificadoDaClasse`), com os desta obra primeiro. Com texto, busca no CMR inteiro. O relatório guarda uma
  CÓPIA do certificado (`linhaDoCertificado`): correção posterior no CMR não reescreve documento assinado.
- **Tintas (RRT):** continua o modelo do SGQ (lotes A/B/C e os 9 itens da embalagem). Até 3 certificados;
  `componentesDosCertificados` põe o endurecedor no B e o diluente no C, e a posição ocupada vai para a próxima
  livre. É a MESMA regra na tela e na criação. Tela e PDF listam os certificados escolhidos.
- **RRP e RRA (§12):** uma linha por certificado, com visual, dimensional e documentação marcados A, R ou N.A.,
  mais quantidade e nº da RNC (`lib/recebimento-rir-campos.js`). O PDF é próprio
  (`lib/relatorio-recebimento-rir-pdf.js`) e parte a tabela em blocos de 12. A regra do resultado é a do RRT:
  R ou validade vencida exigem reprovar; reprovar com tudo aprovado pede o motivo.
- ⚠⚠ **PENETRANTE E REMOVEDOR NÃO ESTÃO NO CMR** (medido em 07/10/2026). Só o revelador Metalcheck D-70
  (R 261266) foi lançado. Por isso a classe só ORDENA a lista, e a tela do computador tem "incluir item à mão".
  O celular só inclui certificado do CMR. O jeito certo é o Almoxarifado lançar o penetrante e o removedor.
- ⚠ **ESCOPO:** acompanham o ensaio que usa o material (`ACOMPANHA` em `lib/qualidade-escopo.js`): penetrante
  com o LP, arame com o visual de solda. Não têm caixa própria no escopo, senão a obra com escopo salvo levaria
  409 na criação. É a mesma lógica de sais/poeira/pull-off com a pintura.
- ⚠ **§12, não §06:** seção de certificado lista tudo como rastreabilidade, e o relatório apareceria ali como
  material (ver [[torg_relatorios_pulloff_recebimento]]).
- ⚠ O penetrante não tem grupo em `classificarMaterial` e cai em ESTRUTURAL. O recebimento usa regex própria
  (`RX_LP`), mas o data book ainda mandaria um certificado de penetrante para a §04.
