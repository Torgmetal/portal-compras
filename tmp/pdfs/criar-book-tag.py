from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
P='/Users/vitorcosta/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype/'
for n,f in [('Sans','DejaVuSans.ttf'),('Bold','DejaVuSans-Bold.ttf')]:pdfmetrics.registerFont(TTFont(n,P+f))
OUT='output/pdf/Previa-Data-Book-Torg-por-TAG-TPR.pdf'
W,H=595.28,841.89; M=44; CW=W-2*M
navy='#002945';blue='#006EAB';gray='#576D7E';orange='#F4801F';line='#DCE5EB';light='#F4F7F9'
c=canvas.Canvas(OUT,pagesize=(W,H));c.setTitle('Data book por TAG / TPR | Prévia visual Torg');c.setAuthor('Torg Metal')
def text(x,y,t,size=10,color=navy,bold=False):
 c.setFillColor(HexColor(color));c.setFont('Bold' if bold else 'Sans',size);c.drawString(x,H-y,t)
def para(t,x,y,width=CW,size=10,color=gray):
 st=ParagraphStyle('p',fontName='Sans',fontSize=size,leading=size*1.5,textColor=HexColor(color));p=Paragraph(t,st);_,h=p.wrap(width,700);p.drawOn(c,x,H-y-h);return y+h

def logo(x,y,width=110):
 im=Image.open('public/torg-logo.png');h=width*im.height/im.width;c.drawImage('public/torg-logo.png',x,H-y-h,width,h,mask='auto')
def rule(y):c.setStrokeColor(HexColor(line));c.setLineWidth(.6);c.line(M,H-y,W-M,H-y)
def footer(n):
 rule(790);text(M,807,'PRÉVIA VISUAL • DADOS DEMONSTRATIVOS',7,gray);text(W-86,807,f'{n:02d} / 06',8,navy)
def header(n,label,title,desc):
 logo(M,29,88);text(360,44,'QUALIDADE TORG',9,navy,True);text(360,61,'OP-122  /  [TAG OU TPR]',8,gray);rule(99)
 text(M,133,label.upper(),9,blue,True);text(M,167,title,25,navy,True);para(desc,M,184,size=10);footer(n)
def section(y,num,title):
 text(M,y,num,11,blue,True);text(M+29,y,title,12,navy,True);rule(y+12)
def table(y,headers,rows,widths):
 st=ParagraphStyle('cell',fontName='Sans',fontSize=8.3,leading=12,textColor=HexColor(navy));hs=ParagraphStyle('head',parent=st,fontName='Bold',textColor=white)
 data=[[Paragraph(x,hs) for x in headers]]+[[Paragraph(str(x),st) for x in row] for row in rows]
 t=Table(data,colWidths=widths,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor(blue)),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),11),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,1),(-1,-1),.5,HexColor(line)),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,HexColor(light)])]));_,h=t.wrap(CW,650);t.drawOn(c,M,H-y-h);return y+h

def note(y,title,body):
 c.setFillColor(HexColor(light));c.roundRect(M,H-y-77,CW,77,6,fill=1,stroke=0);text(M+14,y+22,title,10,navy,True);para(body,M+14,y+30,CW-28,9)
# capa
logo(M,38,124);text(365,56,'DOCUMENTAÇÃO TÉCNICA',8,gray,True)
text(M,174,'DOSSIÊ DE FABRICAÇÃO',10,orange,True);text(M,226,'Data book',42,navy,True);text(M,266,'por TAG / TPR',25,gray)
c.setStrokeColor(HexColor(orange));c.setLineWidth(3);c.line(M,H-291,M+52,H-291)
text(M,338,'IDENTIFICAÇÃO DO EQUIPAMENTO / CONJUNTO',8,blue,True);text(M,377,'[TAG OU TPR]',29,navy,True);para('[Descrição do equipamento ou conjunto]',M,393,size=12)
section(465,'01','Identificação da obra')
text(M,505,'OP TORG',8,gray,True);text(M,527,'OP-122',14,navy,True);text(M+165,505,'OBRA',8,gray,True);text(M+165,527,'[Nome da obra]',12,navy)
text(M,568,'CLIENTE',8,gray,True);text(M,590,'[Razão social do cliente]',12,navy);text(M+290,568,'REFERÊNCIA DO CLIENTE',8,gray,True);text(M+290,590,'[Pedido / contrato]',11)
rule(614);text(M,643,'CÓDIGO DO BOOK',8,gray,True);text(M,665,'[Código a definir]',11,navy,True);text(M+255,643,'REVISÃO',8,gray,True);text(M+255,665,'[Rev.]',11);text(M+369,643,'EMISSÃO',8,gray,True);text(M+369,665,'[Data]',11)
para('Modelo para avaliação de identidade visual e organização. Não contém documentos técnicos emitidos nem comprova aprovação ou rastreabilidade da obra.',M,712,size=9);footer(1);c.showPage()
# indice
header(2,'Controle do dossiê','Índice do book','Uma identificação, um conjunto documental. A seleção final será conferida antes da emissão.')
y=table(242,['SEÇÃO','CONTEÚDO','PRÉVIA'],[['01','Identificação, escopo e projetos','03'],['02','Rastreabilidade de materiais','04'],['03','Inspeções e evidências','05'],['04','Conferência e emissão','06']],[57,390,60])
section(y+49,'','Estrutura dos anexos finais')
para('Após cada folha de controle entram os documentos originais correspondentes: desenhos, certificados e relatórios. A paginação final e o índice serão atualizados na montagem do book.',M,y+66,size=10)
y2=table(y+130,['TIPO DE DOCUMENTO','TRATAMENTO NO BOOK'],[['Específico da TAG / TPR','Somente documentos vinculados às peças deste book.'],['Compartilhado entre identificações','Incluído com indicação das TAGs / TPRs abrangidas.'],['Ainda sem vínculo confirmado','Apresentado como pendência na conferência.']],[170,337])
note(681,'Prévia de estrutura','As páginas seguintes mostram o padrão visual. Campos entre colchetes e exemplos não representam registros reais da OP.');c.showPage()
# projetos
header(3,'01 / Escopo e projetos','Identificação e projetos','Limites do fornecimento e correspondência entre as referências Torg e as referências do cliente.')
y=table(240,['IDENTIFICAÇÃO','REFERÊNCIA'],[['TAG / TPR principal','[Identificação escolhida para este book]'],['Fase Torg / referência do cliente','[Fase] / [Código correspondente]'],['Escopo abrangido','[Descrição dos conjuntos e limites do fornecimento]'],['Marcas incluídas','[Relação das marcas vinculadas a esta identificação]']],[170,337])
section(y+41,'','Relação de projetos')
y=table(y+62,['TORG','CLIENTE','DOCUMENTO / REVISÃO'],[['[Nº desenho]','[Nº TMSA / Vale]','[Título do projeto] • [Rev.]'],['[Nº desenho]','[Nº TMSA / Vale]','[Título do projeto] • [Rev.]']],[125,145,237])
note(675,'Anexos desta seção','Inserir os desenhos originais aplicáveis, preservando carimbos, revisões e registros de aprovação.');c.showPage()
# rastreio
header(4,'02 / Materiais','Rastreabilidade','Da marca da peça ao certificado do material: referências organizadas para consulta e conferência.')
section(248,'','Mapa de vínculos')
# visual three aligned cells
for i,(a,b) in enumerate([('PEÇA / CONJUNTO','[Marca]'),('RASTREABILIDADE','[Número R]'),('CERTIFICADO','[Nº / corrida]')]):
 x=M+i*174;c.setFillColor(HexColor(light));c.roundRect(x,H-350,159,75,5,fill=1,stroke=0);text(x+12,297,a,7.4,blue,True);text(x+12,327,b,12,navy,True)
y=table(387,['MARCA','MATERIAL','R / CORRIDA','CERTIFICADO'],[['[Marca]','[Perfil / chapa]<br/>[Especificação]','[R]<br/>[Corrida]','[Número / arquivo]'],['[Marca]','[Perfil / chapa]<br/>[Especificação]','[R]<br/>[Corrida]','[Número / arquivo]']],[83,149,123,152])
section(y+44,'','Documentos complementares')
para('Certificados de matéria-prima e, quando aplicáveis ao escopo, registros de consumíveis, revestimentos e tratamentos. Cada anexo deve indicar sua relação com as peças deste book.',M,y+63,size=10)
note(683,'Vínculo a conferir','O mesmo certificado pode atender mais de uma marca ou TAG. A inclusão depende do material efetivamente utilizado, e não apenas da pasta onde está salvo.');c.showPage()
#inspecoes
header(5,'03 / Qualidade','Inspeções e evidências','Relação de relatórios aplicáveis às peças da TAG / TPR, conforme o PIT e o escopo contratado.')
y=table(240,['ETAPA','RELATÓRIO / REVISÃO','ABRANGÊNCIA'],[['Dimensional / pré-montagem','[Código] • [Rev.]','[Marcas abrangidas]'],['Soldagem / ensaios','[Código] • [Rev.]','[Marcas abrangidas]'],['Preparação / pintura','[Código] • [Rev.]','[Marcas abrangidas]'],['Inspeção final','[Código] • [Rev.]','[Marcas abrangidas]']],[156,172,179])
section(y+43,'','Documentos comuns à obra')
para('PIT aplicável, procedimentos e qualificações podem compor mais de um book. A relação final deve seguir os requisitos documentais do cliente.',M,y+62,size=10)
note(651,'Relatórios compartilhados','Quando um relatório abranger várias TAGs, incluir o original completo e identificar as marcas relacionadas a este book. Preservar o conteúdo e as assinaturas.');c.showPage()
# entrega
header(6,'04 / Conferência','Preparação para emissão','Folha de trabalho da prévia. A versão destinada ao cliente deve conter os documentos finais conferidos.')
y=table(239,['VERIFICAÇÃO','CONFERÊNCIA'],[['TAG / TPR e escopo identificados','[Responsável / data]'],['Projetos e revisões aplicáveis relacionados','[Responsável / data]'],['Materiais, números R e certificados vinculados','[Responsável / data]'],['Relatórios e assinaturas conferidos','[Responsável / data]'],['Índice, paginação e anexos revisados','[Responsável / data]']],[335,172])
section(y+43,'','Pendências da montagem')
para('[Relacionar os documentos que faltam, os vínculos a confirmar e o responsável pelo retorno. A prévia pode ser conferida antes de o book estar completo.]',M,y+63,size=10)
section(629,'','Controle de emissão')
table(650,['ELABORAÇÃO','CONFERÊNCIA','REVISÃO / DATA'],[['[Nome / setor]','[Nome / setor]','[Rev.] / [Data]']],[170,170,167])
c.save();print(OUT)
