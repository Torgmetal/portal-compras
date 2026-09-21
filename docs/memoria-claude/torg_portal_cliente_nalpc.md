---
name: torg_portal_cliente_nalpc
description: Portal do cliente só enxerga peça com naLPC/naLE — a LPC importada pela revisão gravava naLPC=false e a OP-113 "não tinha rastreabilidade nem certificado" (Alexandre, 14/09/2026); certificado mostra "aplicado em" (perfil do projeto); LE de 112/113 estava só no SharePoint
metadata:
  type: project
---

**Três coisas por trás do e-mail do Alexandre (OP-113, 14/09/2026: "não consta no portal a
rastreabilidade e os certificados de L2.1/2"x3/16", UE150x75x20x4.75, UE200x75x20x2.25/2.65/3.00/3.75;
faltam certificados de perfil dobrado; tem materiais no portal que não constam na lista do projeto"):**

1. **`naLPC` faltava.** `pecasDaObra` (lib/portal-obra-consulta) só responde marca com `naLPC` ou
   `naLE`. O importador de REVISÃO (`lib/importar-lpc-merge.js`, usado pela tela de Listas e pelo sync
   do SharePoint) criava a peça sem `naLPC: true`; o comum sempre gravou. As 197 peças da T113A
   ficaram invisíveis para o cliente ("esta marca não está nas listas") — o motor de rastreio
   (`rastreioDaOp`) tinha R para todas. Corrigido no importador e nos dados (era só a 113).
2. **Certificado sem PDF.** 9 R de perfil dobrado (261357–261391, SOUFER, NFs 235741/367668/235827,
   03–09/09) estão no CMR sem arquivo na pasta de certificados: nem o cron "casar certificados" tem o
   que casar. É gente: Eduardo/Qualidade sobe o PDF, o cron liga pelo R.
3. **Nome do fornecedor × perfil do projeto.** O CMR diz "PERFIL DOBRADO UDCE 200x75x25x2,25"; o
   projeto diz UE200X75X20X2.25 (até o enrijecedor difere, 25 × 20). O casamento já existia
   (`casarPerfilComOmie`/equivalência); o que faltava era MOSTRAR: a tabela de certificados do portal
   ganhou a coluna "Aplicado em (perfil do projeto)", tirada de `rastreioDaOp` (R → perfis que o
   consumiram). Sem consumo (tinta, consumível, perfil ainda não cortado) fica "—".

**E a LE de 112/113 "não aparecia"** porque `ListaExpedicao` só nasce pela importação da
`2.6 Lista de Expedição` (Planejamento › Status da obra › Importar) — os arquivos estavam lá
(T112-LE-R00, T113-LE-R00, 167 marcas cada), ninguém tinha clicado. Importadas em 14/09.

**How to apply:**
- Cliente diz "não tem rastreabilidade": conferir `naLPC/naLE` da peça ANTES do motor de rastreio.
- Todo importador que cria PecaConjunto grava `naLPC: true` (LPC) / `naLE: true` (LE).
- Certificado "indisponível" no portal = sem PDF na pasta (`mapearCertificados().porIndice`), não bug.
- Relacionado: [[torg_rastreio_corrida]], [[torg_equivalencia_material]], [[torg_listas_le_lpc]], [[torg_status_obra]].
