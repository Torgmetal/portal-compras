import json,subprocess,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/banco-midias';ff=imageio_ffmpeg.get_ffmpeg_exe()
a=json.loads((OUT/'inventario-videos.json').read_text());starts=[3,3,10,.5,2,.4,6,4,5,2,2,8]
for folder in ['videos-completos','videos-cortes','miniaturas']: (OUT/folder).mkdir(exist_ok=True)
def tratar(pair):
 n,i=pair; stem=f'video-{n+1:02d}-{i["sha256"][:10]}';start=starts[n];duration=round(min(8,i['duracao']-start-.2),2);result=[]
 for kind,sub in [('completo','videos-completos'),('corte','videos-cortes')]:
  out=OUT/sub/f'{stem}-{kind}.mp4';args=[ff,'-hide_banner','-loglevel','error','-y']
  if kind=='corte':args+=['-ss',str(start)]
  args+=['-i',i['path']]
  if kind=='corte':args+=['-t',str(duration)]
  bitrate=int(re.search(r'(\d+) kb/s',i['metadata'][1])[1]); teto=round(bitrate*1.15)
  vf='eq=contrast=1.025:saturation=1.025:gamma=1.015,unsharp=3:3:0.25:3:3:0,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1'
  if kind=='corte':vf+=f',fade=t=in:st=0:d=0.2,fade=t=out:st={duration-.25}:d=0.25'
  args+=['-map','0:v:0','-vf',vf,'-c:v','libx264','-crf','22','-maxrate',f'{teto}k','-bufsize',f'{teto*2}k','-preset','slow','-threads','2','-pix_fmt','yuv420p']
  if kind=='corte':args+=['-an']
  else:args+=['-map','0:a?','-c:a','copy']
  args+=['-map_metadata','-1','-movflags','+faststart',str(out)];subprocess.run(args,check=True)
  thumb=OUT/'miniaturas'/f'{stem}-{kind}.jpg';subprocess.run([ff,'-loglevel','error','-y','-ss',str(duration/2 if kind=='corte' else i['duracao']/2),'-i',str(out),'-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease',str(thumb)],check=True)
  subprocess.run([ff,'-v','error','-i',str(out),'-f','null','-'],check=True)
  result.append({**i,'id':f'{stem}-{kind}','tipo':'video','versao':kind,'duracao':duration if kind=='corte' else i['duracao'],'inicioOriginal':start if kind=='corte' else 0,'arquivo':str(out.relative_to(ROOT)),'miniatura':str(thumb.relative_to(ROOT))})
 print(f'Vídeo {n+1:02d}: completo e corte conferidos.',flush=True);return result
with ThreadPoolExecutor(max_workers=2) as pool: result=[x for group in pool.map(tratar,enumerate(a)) for x in group]
(OUT/'videos-tratados.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
