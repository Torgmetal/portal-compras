"""Props que chegam e nao sao lidas, e um calculo que ninguem le.

Prop de componente extraido: sai da assinatura E da chamada — deixar so num
lado e trocar um aviso por outro.
Prop de componente que ja existia (Resumos.mexer): RENOMEIA para `_mexer`. A
assinatura e contrato com quem chama; apagar mudaria o contrato.
"""
import re,sys
D="app/comercial/orcamentos/estudos/[id]/_componentes"

def tira(comp, props, pai):
    s=open(f"{D}/{comp}").read()
    for p in props: s=re.sub(r'^  '+re.escape(p)+r',\n','',s,flags=re.M)
    open(f"{D}/{comp}","w").write(s)
    t=open(f"{D}/{pai}").read()
    for p in props: t=re.sub(r'^(\s*)'+re.escape(p)+r'=\{'+re.escape(p)+r'\}\n','',t,flags=re.M)
    open(f"{D}/{pai}","w").write(t)

tira("LeituraDoSistema.jsx", ["c"], "Pintura.jsx")
tira("OQueMoveOResultado.jsx", ["base"], "Cenario.jsx")
tira("TabelaFluxoMes.jsx", ["fabrica","projeto"], "FluxoDoDinheiro.jsx")

def troca(arq, de, para):
    s=open(f"{D}/{arq}").read()
    assert de in s, f"{arq}: nao achei o trecho — o arquivo mudou, confira a mao"
    open(f"{D}/{arq}","w").write(s.replace(de, para, 1))

troca("Material.jsx",
      "              const calc = (res.grupos ? null : null) || (res.comerciaisDetalhe || []).find((x) => x.key === i.key);",
      "              (res.grupos ? null : null) || (res.comerciaisDetalhe || []).find((x) => x.key === i.key);")
troca("Resumos.jsx",
      "export function Resumos({ e, c, setComp, mexer, res }) {",
      "export function Resumos({ e, c, setComp, mexer: _mexer, res }) {")
print("sobras limpas")
