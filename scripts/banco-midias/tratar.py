"""Tratamento tradicional autorizado: nunca altera os originais nem recria detalhes."""
import json, math
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageStat, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/banco-midias'
items=json.loads((OUT/'inventario-originais.json').read_text())
seen=set(); fotos=[]
for i in items:
 if i['name'].endswith('.jpg') and i['sha256'] not in seen:
  seen.add(i['sha256']); fotos.append(i)
def sheet(paths, name):
 w,h=320,230; canvas=Image.new('RGB',(w*4,h*math.ceil(len(paths)/4)), '#e8edf1');d=ImageDraw.Draw(canvas)
 for n,(label,path) in enumerate(paths):
  im=Image.open(path);im=ImageOps.exif_transpose(im);im.thumbnail((310,200));x=(n%4)*w;y=(n//4)*h
  canvas.paste(im,(x+(w-im.width)//2,y));d.text((x+8,y+202),label,fill='#142c42')
 canvas.save(OUT/name,quality=88)
sheet([(f'{n+1:02d} {i["name"][6:16]}',i['path']) for n,i in enumerate(fotos)],'contato-originais.jpg')
manifest=[]
for n,i in enumerate(fotos):
 with Image.open(i['path']) as original:
  im=ImageOps.exif_transpose(original).convert('RGB')
  media=ImageStat.Stat(im.convert('L').resize((128,128))).mean[0]
  gamma=1.045 if media<110 else 1.018 if media<145 else 1.0
  im=im.point([round(255*(v/255)**(1/gamma)) for v in range(256)]*3)
  im=ImageEnhance.Contrast(im).enhance(1.025)
  im=ImageEnhance.Color(im).enhance(1.025)
  im=im.filter(ImageFilter.UnsharpMask(radius=0.7,percent=45,threshold=3))
  stem=f'foto-{n+1:02d}-{i["sha256"][:10]}'
  for sub in ['fotos-matriz','fotos-web','miniaturas']: (OUT/sub).mkdir(exist_ok=True)
  master=OUT/'fotos-matriz'/f'{stem}.jpg';im.save(master,quality=95,subsampling=0)
  web=im.copy();web.thumbnail((1920,1920));wp=OUT/'fotos-web'/f'{stem}.webp';web.save(wp,quality=88,method=6)
  thumb=im.copy();thumb.thumbnail((480,480));tp=OUT/'miniaturas'/f'{stem}.webp';thumb.save(tp,quality=78,method=6)
  manifest.append({**i,'id':stem,'tipo':'imagem','largura':im.width,'altura':im.height,'matriz':str(master.relative_to(ROOT)),'arquivo':str(wp.relative_to(ROOT)),'miniatura':str(tp.relative_to(ROOT)),'ajustes':{'gamma':gamma,'contraste':1.025,'saturacao':1.025,'nitidez':{'raio':.7,'percentual':45,'limiar':3}}})
(OUT/'fotos-tratadas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
sheet([(f'{n+1:02d} tratada',ROOT/i['arquivo']) for n,i in enumerate(manifest)],'contato-tratadas.jpg')
print(f'{len(manifest)} fotos: matrizes JPEG, WebP e miniaturas gerados.')
