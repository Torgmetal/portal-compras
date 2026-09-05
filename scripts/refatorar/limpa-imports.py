"""Remove especificadores de import orfaos, RECONSTRUINDO a instrucao a partir
dos que sobram — nunca por cirurgia de range (foi assim que `import A, { B }`
virou `import A } from` na primeira tentativa)."""
import json,re,subprocess,sys,collections
alvo=sys.argv[1]
rel=subprocess.run(["npx","eslint",alvo,"-f","json"],capture_output=True,text=True).stdout
dados=json.loads(rel)
tot=0
for f in dados:
    orfaos={m["message"].split("'")[1] for m in f["messages"]
            if m["ruleId"]=="no-unused-vars" and "is defined but never used" in m["message"]}
    if not orfaos: continue
    caminho=f["filePath"]; L=open(caminho).read().split("\n")
    saida=[]
    for linha in L:
        m=re.match(r'^import\s+(.*?)\s+from\s+("[^"]+");\s*$',linha)
        if not m: saida.append(linha); continue
        clausula,origem=m.group(1),m.group(2)
        mn=re.search(r'\{([^}]*)\}',clausula)
        nomeados=[b.strip() for b in mn.group(1).split(",") if b.strip()] if mn else []
        deft=re.match(r'^([A-Za-z0-9_$]+)\s*(?:,|$)',clausula.replace(mn.group(0),"").strip() if mn else clausula.strip())
        padrao=deft.group(1) if deft else None
        nomeados=[b for b in nomeados if b.split(" as ")[-1].strip() not in orfaos]
        if padrao and padrao in orfaos: padrao=None
        if not padrao and not nomeados:
            tot+=1; continue                      # a instrucao inteira era orfa
        partes=[p for p in [padrao, "{ %s }"%", ".join(nomeados) if nomeados else None] if p]
        nova=f'import {", ".join(partes)} from {origem};'
        if nova!=linha: tot+=1
        saida.append(nova)
    open(caminho,"w").write("\n".join(saida))
print(f"{tot} instrucoes de import ajustadas")
