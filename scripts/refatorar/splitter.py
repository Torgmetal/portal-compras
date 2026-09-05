"""Quebra um arquivo React gigante em modulos, por bloco de topo.

Uso: splitter.py <arquivo> <grupos.json>
grupos.json: {"destino/relativo.jsx": ["Bloco1","Bloco2"], ...}
Blocos nao citados ficam no arquivo original.
"""
import re,json,sys,os

ARQ, GRUPOS_JSON = sys.argv[1], sys.argv[2]
GRUPOS = json.load(open(GRUPOS_JSON))
DIR = os.path.dirname(ARQ)
src = open(ARQ).read().split("\n")

# --- header: tudo antes do primeiro bloco de topo
pat = re.compile(r'^(export default function|function|const|let|async function|class) ([A-Za-z_$][A-Za-z0-9_$]*)')
raw = [(i, pat.match(l).group(2)) for i, l in enumerate(src) if pat.match(l)]
starts = []
for i, name in raw:
    s = i
    while s - 1 >= 0 and re.match(r'^\s*(//|/\*|\*)', src[s - 1]): s -= 1
    starts.append((s, name))
HEADER = src[:starts[0][0]]
B = {}
for k, (s, name) in enumerate(starts):
    e = starts[k + 1][0] if k + 1 < len(starts) else len(src)
    B[name] = "\n".join(src[s:e]).rstrip()
ORDEM = [n for _, n in starts]

# \b nao serve: um nome pode terminar em "$" (fmtR$), e ai o \b exige um
# caractere de palavra depois — "fmtR$(" nunca casaria.
def ref(nome):
    return r'(?<![A-Za-z0-9_$])' + re.escape(nome) + r'(?![A-Za-z0-9_$])' 

# --- mapa binding -> linha de import (a partir do header original)
imports = []
buf = ""
for l in HEADER:
    if l.startswith("import ") or buf:
        buf += ("\n" if buf else "") + l
        if l.rstrip().endswith(";"): imports.append(buf); buf = ""
BIND = {}
for imp in imports:
    m = re.search(r'\{([^}]*)\}', imp, re.S)
    binds = []
    if m:
        binds += [b.strip().split(" as ")[-1].strip() for b in m.group(1).replace("\n", " ").split(",") if b.strip()]
    m2 = re.match(r'import\s+([A-Za-z0-9_$]+)\s*(?:,|from)', imp)
    if m2: binds.append(m2.group(1))
    for b in binds: BIND[b] = imp

def sem_strings(t):
    t = re.sub(r'"(?:[^"\\]|\\.)*"', '""', t)
    t = re.sub(r"'(?:[^'\\]|\\.)*'", "''", t)
    # template literal: joga fora o texto, PRESERVA o miolo dos ${...} --
    # e ali que mora `${fmtR$(x)}`, que e uso de verdade.
    t = re.sub(r'`(?:[^`\\]|\\.)*`',
               lambda m: " ".join(re.findall(r'\$\{([^{}]*)\}', m.group(0))), t)
    t = re.sub(r'//[^\n]*', '', t)
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return t

dono = {}
for arq, blocos in GRUPOS.items():
    for b in blocos:
        assert b in B, f"bloco desconhecido: {b}"
        dono[b] = arq
restantes = [n for n in ORDEM if n not in dono]
for n in restantes: dono[n] = os.path.basename(ARQ)

def rel(de, para):
    d = os.path.dirname(de)
    r = os.path.relpath(os.path.dirname(para) or ".", d or ".")
    base = re.sub(r'\.jsx?$', '', os.path.basename(para))
    # webpack trata "_componentes/X" como pacote do node_modules — precisa do "./"
    p = ("./" if r == "." else r + "/") + base
    return p if p.startswith(".") else "./" + p

def monta(arq, blocos, use_client, default_de=None):
    corpo = "\n\n".join(B[b] for b in blocos)
    limpo = sem_strings(corpo)
    linhas = ['"use client";'] if use_client else []
    vistos = set()
    for imp in imports:
        usados = [b for b, i in BIND.items() if i is imp and re.search(ref(b), limpo)]
        if not usados or id(imp) in vistos: continue
        vistos.add(id(imp))
        m = re.search(r'from\s+("[^"]+")', imp)
        origem = m.group(1)
        deft = re.match(r'import\s+([A-Za-z0-9_$]+)\s*(?:,|from)', imp)
        partes = []
        if deft and deft.group(1) in usados: partes.append(deft.group(1)); usados.remove(deft.group(1))
        nomeados = ", ".join(sorted(usados))
        alvo = origem
        if origem.startswith('"./') or origem.startswith('"../'):
            cam = origem.strip('"')
            abs_ = os.path.normpath(os.path.join(os.path.dirname(ARQ), cam))
            alvo = '"' + rel(arq, abs_) + '"'
        linhas.append("import " + ", ".join(filter(None, [partes[0] if partes else "", "{ %s }" % nomeados if nomeados else ""])) + f" from {alvo};")
    externos = {}
    for b, d in dono.items():
        if b in blocos or d == arq: continue
        if re.search(ref(b), limpo): externos.setdefault(d, []).append(b)
    for d in sorted(externos):
        caminho = rel(arq, d if "/" in d else os.path.join(DIR, d))
        linhas.append(f'import {{ {", ".join(sorted(externos[d]))} }} from "{caminho}";')
    exportado = re.sub(r'^(function |const |let |class )', r'export \1', corpo, flags=re.M)
    if default_de:
        exportado = exportado.replace("export export default", "export default")
    return "\n".join(linhas) + "\n\n" + exportado + "\n"

saida = {}
for arq, blocos in GRUPOS.items():
    caminho = os.path.join(DIR, arq)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    txt = monta(arq, blocos, True)
    open(caminho, "w").write(txt)
    saida[caminho] = len(txt.split("\n"))
principal = os.path.basename(ARQ)
txt = monta(principal, restantes, True, default_de=True)
open(ARQ, "w").write(txt)
saida[ARQ] = len(txt.split("\n"))
for k in sorted(saida, key=lambda x: -saida[x]):
    flag = "  <-- ACIMA DE 350" if saida[k] > 350 else ""
    print(f"{saida[k]:5d}  {k}{flag}")
