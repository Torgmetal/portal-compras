"""Extrai um trecho JSX de um componente para um sub-componente irmao.
uso: extrai2.py <arquivo> <a> <b> <NomeNovo> <doc>   (linhas 1-indexed, inclusivas)
Herda o header de imports inteiro; orfaos saem na limpeza posterior.
"""
import re,sys,textwrap,os
arq,a,b,nome,doc=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),sys.argv[4],sys.argv[5]
L=open(arq).read().split("\n")
corpo=textwrap.dedent("\n".join(L[a-1:b]))
fim=max(i for i,l in enumerate(L) if l.startswith("import "))+1
header=[l for l in L[:fim]]
def ref(n): return r'(?<![A-Za-z0-9_$])'+re.escape(n)+r'(?![A-Za-z0-9_$])'
cands=set()
for l in L:
    for m in re.finditer(r'^  (?:const|let) \[([A-Za-z0-9_$]+), ([A-Za-z0-9_$]+)\]', l): cands|={m.group(1),m.group(2)}
    m=re.match(r'^  (?:const|let|function|async function) ([A-Za-z0-9_$]+)', l)
    if m: cands.add(m.group(1))
m=re.search(r'^export function [A-Za-z0-9_$]+\(\{([^}]*)\}', "\n".join(L), re.M)
if m:
    for p in m.group(1).split(","):
        p=p.strip().split("=")[0].split(":")[0].strip()
        if re.match(r'^[A-Za-z0-9_$]+$',p): cands.add(p)
limpo=re.sub(r'//[^\n]*','',corpo)
props=sorted(p for p in cands if re.search(ref(p), limpo))
novo_arq=os.path.join(os.path.dirname(arq), nome+".jsx")
txt="\n".join(header)+"\n\n"+doc+"\nexport function %s({\n  %s,\n}) {\n  return (\n"%(nome,",\n  ".join(props))+textwrap.indent(corpo,"    ")+"\n  );\n}\n"
open(novo_arq,"w").write(txt)
ind=re.match(r'\s*',L[a-1]).group(0)
chamada=ind+"<"+nome+"\n"+"\n".join(f"{ind}  {p}={{{p}}}" for p in props)+"\n"+ind+"/>"
restante=L[:a-1]+[chamada]+L[b:]
s="\n".join(restante)
s=s.replace(header[-1], header[-1]+f'\nimport {{ {nome} }} from "./{nome}";',1)
open(arq,"w").write(s)
print(novo_arq, len(txt.split("\n")), "| props:", ", ".join(props))
print(arq, len(s.split("\n")))
