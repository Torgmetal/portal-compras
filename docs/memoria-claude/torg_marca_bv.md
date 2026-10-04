---
name: torg_marca_bv
description: Selo Bureau Veritas (ISO 9001) — regras do manual da BV (mín. 60 mm, ≤ 1/3 do logo Torg, zona de 1 cm, proibido em documento técnico), onde estão manual e certificado, e o selo adormecido no data book legado
metadata:
  type: reference
---

Vitor (04/10/2026) pediu o logo da Bureau Veritas na proposta, "conforme padrão informado pelo manual".

**Onde está:** SharePoint `Administrativo/SGQ ISO 9001-2015/14 BVQI/1 Documentos Controlados/` — o
"Manual de Utiliz das Marcas de Certif de Sist de Gestão e Acreditação_Revisão novas marcas_Ago_2024"
(v1.4, ago/2024) e o "Marcas e Logos_Rev 6.1". O certificado está em `14 BVQI/Certificação ISO 9001.pdf`:
**BR045049**, ISO 9001:2015, válido até **16/10/2028**. O escopo é projeto, desenvolvimento, fabricação e
comercialização de estruturas metálicas e equipamentos industriais.

⚠⚠ **A ARTE NÃO ESTÁ NO SERVIDOR.** A marca específica ("CERTIFIED ISO 9001", sem ou com QR) é pedida
à BV pelo formulário do manual (§2.2.4 e §11), com os dados da empresa. A prévia da proposta usou a
imagem recortada do próprio manual, marcada como PRÉVIA. A marca geral (a que aparece no certificado)
é de uso exclusivo da BV (§2.2.1).

**Regras do manual:**
- a marca é reproduzida exatamente como a arte (§2.3, §7): sem girar, deformar, separar o selo do
  bloco ou trocar fonte ou cor. Cores: azul `#00049E` só no nome da norma, cinza `#706F6F` no resto,
  ou a versão toda preta (§5);
- **comprimento mínimo de 60 mm** impresso (§6.3);
- **no máximo 1/3 do tamanho do logo da organização** (§6.4). Lido ao pé da letra (comprimento),
  exigiria logo Torg de 180 mm, o que inviabiliza o papel timbrado que o próprio manual permite. Por
  isso adotamos **área do selo ≤ 1/3 da área do logo Torg** — com selo de 60 mm, logo de ~110 mm, o
  que só cabe na capa. Interpretação nossa: confirmar com a BV se for questionada;
- zona de proteção de **1 cm** em volta (§6.6);
- **permitido** em material promocional e "materiais diversos" (papel timbrado, documentos,
  assinatura de e-mail): é o caso da proposta (§4.1–4.2);
- ⚠⚠ **PROIBIDO em "documentos técnicos específicos"**: certificados de qualidade e de conformidade,
  laudos, relatórios técnicos, relatórios de teste, atestados (§2.5, §4.1). Logo, **nada de selo em
  data book, memorial de cálculo, relatório de inspeção ou PIT**;
- a declaração em texto do manual (§2.5.1):
  "Sistema de Gestão da Qualidade certificado conforme a Norma ISO 9001:2015 pelo Bureau Veritas";
- só vale com o certificado válido (§2.1, §2.9): o gerador tem de esconder o selo depois de 16/10/2028
  se ninguém renovar.

⚠⚠ **SELO ADORMECIDO NO DATA BOOK LEGADO.** `lib/databook-pdf.js` (template LEGADO) carimba
`public/bureau-veritas.png` com **24 pt (~8,5 mm)** no rodapé de **toda** folha, caso o arquivo exista.
Isso fere o mínimo de 60 mm e a proibição em documento técnico. Hoje o arquivo não existe, e por isso
nada sai. ⚠ **Nunca criar `public/bureau-veritas.png`**: o selo da proposta tem de ter outro nome.
Sem o arquivo, o rodapé legado imprime o texto "ISO 9001 · Bureau Veritas Certification", que também
merece revisão (não é a declaração do manual e está num documento técnico).

Ver [[torg_escopo_proposta]].
