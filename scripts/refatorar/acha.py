"""Acha o intervalo de um bloco JSX por PADRAO, nao por numero de linha — o
arquivo muda toda semana e numero de linha vira mentira no dia seguinte.

uso: acha.py <arquivo> <regex-da-abertura>      -> imprime a linha (1-indexed)
     acha.py <arquivo> <regex> --ate-fechar-div -> imprime "a b" do elemento inteiro
"""
import re,sys
arq,padrao=sys.argv[1],sys.argv[2]
L=open(arq).read().split("\n")
alvo=[i for i,l in enumerate(L) if re.search(padrao,l)]
if not alvo: sys.exit(f"nao achei /{padrao}/ em {arq}")
if len(alvo)>1: sys.exit(f"/{padrao}/ casou {len(alvo)} vezes — ambiguo")
i=alvo[0]
if "--ate-fechar-div" in sys.argv:
    # o alvo costuma ser uma linha DENTRO do elemento (o <table>); sobe ate o
    # <div> que o embrulha antes de casar o fechamento.
    if "--sobe" in sys.argv:
        i -= int(sys.argv[sys.argv.index("--sobe")+1])
    ind=re.match(r'\s*',L[i]).group(0)
    fim=next((j for j in range(i+1,len(L)) if L[j]==ind+"</div>"),None)
    if fim is None: sys.exit("nao achei o </div> na mesma indentacao")
    print(i+1,fim+1)
else:
    print(i+1)
