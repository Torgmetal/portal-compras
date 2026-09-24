from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
P='/Users/vitorcosta/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype/'
for n,f in [('Sans','DejaVuSans.ttf'),('Bold','DejaVuSans-Bold.ttf')]:pdfmetrics.registerFont(TTFont(n,P+f))
OUT='output/pdf/Previa-Data-Book-Torg-TPR-701-702.pdf'
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
 logo(M,29,88);text(360,44,'QUALIDADE TORG',9,navy,True);text(360,61,'OP-122 / TPR-701 e TPR-702',8,gray);rule(99)
 text(M,133,label.upper(),9,blue,True);text(M,167,title,25,navy,True);para(desc,M,184,size=10);footer(n)
def section(y,num,title):
 text(M,y,num,11,blue,True);text(M+29,y,title,12,navy,True);rule(y+12)
def table(y,headers,rows,widths):
 st=ParagraphStyle('cell',fontName='Sans',fontSize=8.3,leading=12,textColor=HexColor(navy));hs=ParagraphStyle('head',parent=st,fontName='Bold',textColor=white)
 data=[[Paragraph(x,hs) for x in headers]]+[[Paragraph(str(x),st) for x in row] for row in rows]
 t=Table(data,colWidths=widths,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor(blue)),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),11),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,1),(-1,-1),.5,HexColor(line)),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,HexColor(light)])]));_,h=t.wrap(CW,650);t.drawOn(c,M,H-y-h);return y+h

def note(y,title,body):
 c.setFillColor(HexColor(light));c.roundRect(M,H-y-77,CW,77,6,fill=1,stroke=0);text(M+14,y+22,title,10,navy,True);para(body,M+14,y+30,CW-28,9)
def anchor(nome):c.bookmarkPage(nome)
def link(y,h,dest):c.linkRect('',dest,(M,H-y-h,W-M,H-y),relative=0,thickness=0)
anchor('capa');c.addOutlineEntry('Capa','capa',0)
logo(M,38,124);text(365,56,'DOCUMENTAÇÃO TÉCNICA',8,gray,True)
text(M,174,'DOSSIÊ DE FABRICAÇÃO',10,orange,True);text(M,226,'Data book',42,navy,True);text(M,266,'Partes da mesma obra',23,gray)
c.setStrokeColor(HexColor(orange));c.setLineWidth(3);c.line(M,H-291,M+52,H-291)
text(M,335,'IDENTIFICAÇÕES REUNIDAS NESTE VOLUME',8,blue,True)
text(M,378,'TPR-701',28,navy,True);text(M+240,378,'TPR-702',28,navy,True);para('Um único documento. Projetos, materiais e inspeções identificados por parte.',M,399,size=11)
section(475,'','Identificação da obra')
text(M,512,'OP TORG',8,gray,True);text(M,536,'OP-122',14,navy,True);text(M+165,512,'OBRA',8,gray,True);text(M+165,536,'[Nome da obra]',12)
text(M,573,'CLIENTE',8,gray,True);text(M,597,'[Razão social do cliente]',12);rule(620)
text(M,650,'CÓDIGO DO BOOK',8,gray,True);text(M,672,'[Código do volume]',11);text(M+255,650,'REVISÃO',8,gray,True);text(M+255,672,'[Rev.]',11);text(M+375,650,'EMISSÃO',8,gray,True);text(M+375,672,'[Data]',11)
para('Prévia de organização. TPR-701 e TPR-702 são exemplos; os documentos e vínculos abaixo são demonstrativos. Nomenclatura TPR a confirmar.',M,719,size=9);footer(1);c.showPage()
anchor('indice');c.addOutlineEntry('Índice geral','indice',0)
header(2,'Navegação','Índice geral','Documentos comuns aparecem uma vez. Cada parte possui seu próprio controle documental.')
rows=[['01','Documentos comuns e compartilhados','03'],['02','TPR-701 | Projetos, materiais e inspeções','04'],['03','TPR-702 | Projetos, materiais e inspeções','05'],['04','Conferência dos vínculos','06']]
y=table(240,['SEÇÃO','CONTEÚDO','PÁGINA'],rows,[55,388,64])
for i,dest in enumerate(['comuns','701','702','conferencia']):link(274+i*34,34,dest)
section(472,'','Como consultar')
para('Selecione uma seção no índice ou nos marcadores do PDF. Dentro de cada TPR, os documentos próprios ficam separados das referências aos anexos compartilhados.',M,492,size=11)
note(586,'Exemplo de documento compartilhado','O certificado CERT-C01 é referenciado na TPR-701 e na TPR-702. O original seria anexado somente na seção comum, sem duplicar páginas.')
para('A numeração mostrada vale para esta prévia. Na emissão, a inserção dos PDFs originais atualiza o índice e a paginação do volume completo.',M,697,size=9);c.showPage()
anchor('comuns');c.addOutlineEntry('01 - Documentos comuns','comuns',0)
header(3,'01 / Base documental','Documentos comuns','Relação única de documentos aplicáveis a mais de uma parte. Códigos abaixo são exemplos.')
y=table(241,['REFERÊNCIA','DOCUMENTO','APLICA-SE A'],[['PIT-C01','[PIT aplicável à obra]','TPR-701 e TPR-702'],['PROC-C01','[Procedimento aplicável]','TPR-701 e TPR-702'],['CERT-C01','[Certificado de material compartilhado]','TPR-701 e TPR-702'],['REL-C01','[Relatório de inspeção compartilhado]','TPR-701 e TPR-702']],[102,270,135])
section(y+45,'','Anexos desta seção')
para('Os arquivos originais entram após esta folha de controle. Cada referência deve apontar para a página inicial do respectivo anexo no PDF final.',M,y+66,size=10)
note(663,'Documento íntegro','Relatórios e certificados compartilhados são preservados completos. A identificação das marcas abrangidas fica no controle de cada TPR.');c.showPage()
for n,tag in [(4,'701'),(5,'702')]:
 anchor(tag);c.addOutlineEntry('TPR-'+tag,tag,0)
 header(n,'0'+str(n-2)+' / Parte da obra','TPR-'+tag,'[Descrição do equipamento / conjunto] • [Fase Torg correspondente]')
 text(M,239,'MARCAS DESTA PARTE',8,blue,True);text(M,260,'[Relação de marcas vinculadas à TPR-'+tag+']',10)
 section(303,'01','Projetos próprios')
 table(322,['CÓDIGO TORG','CÓDIGO DO CLIENTE','REVISÃO'],[['[Projeto desta parte]','[Referência do cliente]','[Rev.]']],[186,241,80])
 section(428,'02','Rastreabilidade das peças')
 table(447,['MARCA','NÚMERO R / CORRIDA','CERTIFICADO'],[['[Marca desta TPR]','[R] / [Corrida]','CERT-C01 • seção comum, p. 03']],[145,175,187])
 section(566,'03','Relatórios de inspeção')
 table(585,['RELATÓRIO','ABRANGÊNCIA','LOCALIZAÇÃO'],[['[Relatório próprio]','[Marcas desta TPR]','Anexo desta parte'],['REL-C01','[Marcas desta TPR]','Seção comum, p. 03']],[151,170,186])
 para('Referências demonstrativas. Os anexos próprios entram após esta folha; os compartilhados são consultados na seção comum.',M,727,size=9)
 c.showPage()
anchor('conferencia');c.addOutlineEntry('04 - Conferência dos vínculos','conferencia',0)
header(6,'04 / Conferência da prévia','Mapa dos documentos','A conferência mostra o que é exclusivo de cada parte e o que é utilizado em conjunto.')
table(240,['DOCUMENTO','TPR-701','TPR-702','INSERÇÃO'],[['Projeto da TPR-701','Aplicável','Não aplicável','Parte TPR-701'],['Projeto da TPR-702','Não aplicável','Aplicável','Parte TPR-702'],['CERT-C01','Aplicável','Aplicável','Uma vez, na seção comum'],['REL-C01','Aplicável','Aplicável','Uma vez, na seção comum'],['PIT-C01','Aplicável','Aplicável','Uma vez, na seção comum']],[175,92,92,148])
section(540,'','Antes da emissão')
para('Conferir as marcas de cada TPR, os números R efetivamente utilizados e a abrangência dos relatórios. Um documento não entra em uma parte apenas por estar na pasta da mesma OP.',M,560,size=10)
note(659,'Prévia, não documento emitido','Este arquivo demonstra o agrupamento e o visual aprovado. Não contém os projetos, certificados ou relatórios originais. A inclusão real depende da conferência dos vínculos.');c.save();print(OUT)
