// Uma NF-e mínima e válida para os testes do anexo — a forma do leiaute real (infNFe com Id,
// ide/emit/dest, det com prod e imposto/IPI), com os campos que o portal lê.
export const item = (n, { cfop = "5915", ncm = "84379000", cst = "50", aliq = "5.00", infAdProd = "PECA DE REPOSICAO" } = {}) => `
<det nItem="${n}"><prod><cProd>ARM000010</cProd><xProd>ARMACAO DE ESTRUTURA METALICA</xProd><NCM>${ncm}</NCM>
<CFOP>${cfop}</CFOP><uCom>KG</uCom><qCom>1.0000</qCom><vUnCom>100.00</vUnCom><vProd>100.00</vProd></prod>
<imposto><IPI><cEnq>999</cEnq><IPITrib><CST>${cst}</CST><vBC>100.00</vBC><pIPI>${aliq}</pIPI><vIPI>5.00</vIPI></IPITrib></IPI></imposto>
<infAdProd>${infAdProd}</infAdProd></det>`;

export const nfe = ({ itens = [item(1)], natOp = "REMESSA PARA INDUSTRIALIZACAO", uf = "SP" } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe Id="NFe35260912345678000199550010000009731000009736" versao="4.00">
<ide><nNF>973</nNF><serie>1</serie><natOp>${natOp}</natOp><dhEmi>2026-09-10T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>TORG METAL LTDA</xNome><enderEmit><UF>SP</UF></enderEmit></emit>
<dest><CNPJ>98765432000100</CNPJ><xNome>TMSA</xNome><enderDest><UF>${uf}</UF></enderDest></dest>
${itens.join("")}
<total><ICMSTot><vProd>100.00</vProd><vIPI>5.00</vIPI><vICMS>0.00</vICMS><vNF>105.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;
