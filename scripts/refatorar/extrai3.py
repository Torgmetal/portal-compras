"""Extrai o MIOLO de um bloco JSX condicional `{cond && (` ... `)}` para um
sub-componente irmao, deixando a condicao no lugar.
uso: extrai3.py <arquivo> <linha_do_abre> <NomeNovo> <doc>
"""
import re,sys,textwrap,os
arq,ini,nome,doc=sys.argv[1],int(sys.argv[2]),sys.argv[3],sys.argv[4]
L=open(arq).read().split("\n")
abre=L[ini-1]
assert abre.rstrip().endswith("("), abre
# casa parenteses a partir do abre
d=0; fim=None
for i in range(ini-1,len(L)):
    linha=re.sub(r'"(?:[^"\\]|\\.)*"',"",L[i]); linha=re.sub(r"'(?:[^'\\]|\\.)*'","",linha)
    d+=linha.count("(")-linha.count(")")
    if d==0 and i>ini-1: fim=i+1; break
assert fim, "nao achou o fechamento"
corpo=textwrap.dedent("\n".join(L[ini:fim-1]))
impfim=max(i for i,l in enumerate(L) if l.startswith("import "))+1
header=L[:impfim]
def ref(n): return r'(?<![A-Za-z0-9_$])'+re.escape(n)+r'(?![A-Za-z0-9_$])'
cands=set()
for l in L:
    for m in re.finditer(r'^  (?:const|let) \[([A-Za-z0-9_$]+), ([A-Za-z0-9_$]+)\]', l): cands|={m.group(1),m.group(2)}
    m=re.match(r'^  (?:const|let|function|async function) ([A-Za-z0-9_$]+)', l)
    if m: cands.add(m.group(1))
m=re.search(r'^export (?:default )?function [A-Za-z0-9_$]+\(\{([^}]*)\}', "\n".join(L), re.M)
if m:
    for p in m.group(1).split(","):
        p=p.strip().split("=")[0].split(":")[0].strip()
        if re.match(r'^[A-Za-z0-9_$]+$',p): cands.add(p)
limpo=re.sub(r'//[^\n]*','',corpo)
limpo=re.sub(r'"(?:[^"\\]|\\.)*"','""',limpo)
limpo=re.sub(r"'(?:[^'\\]|\\.)*'","''",limpo)
limpo=re.sub(r'`(?:[^`\\]|\\.)*`',lambda m:" ".join(re.findall(r'\$\{([^{}]*)\}',m.group(0))),limpo)
props=sorted(p for p in cands if re.search(ref(p), limpo))
novo=os.path.join(os.path.dirname(arq), nome+".jsx")
txt="\n".join(header)+"\n\n"+doc+"\nexport function %s({\n  %s,\n}) {\n  return (\n"%(nome,",\n  ".join(props))+textwrap.indent(corpo,"    ")+"\n  );\n}\n"
open(novo,"w").write(txt)
ind=re.match(r'\s*',L[ini]).group(0)
chamada=ind+"<"+nome+"\n"+"\n".join(f"{ind}  {p}={{{p}}}" for p in props)+"\n"+ind+"/>"
s="\n".join(L[:ini]+[chamada]+L[fim-1:])
s=s.replace(header[-1], header[-1]+f'\nimport {{ {nome} }} from "./{nome}";',1)
open(arq,"w").write(s)
print(f"{novo} {len(txt.split(chr(10)))} | props: {', '.join(props)}")
print(f"{arq} {len(s.split(chr(10)))}")
