from PIL import Image, ImageDraw
#!/usr/bin/env python3
"""Step 2 of the picture tour: compose build/tour/*.png into 960×600 WebP slides and write assets/tour.js."""
import os, base64, json
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(R,'build','tour'))
W,H=960,600; BG=(233,235,241)
def contain(im, pad=0, bg=BG):
    c=Image.new('RGB',(W,H),bg); im=im.convert('RGB'); r=min((W-2*pad)/im.width,(H-2*pad)/im.height); im=im.resize((round(im.width*r),round(im.height*r)),Image.LANCZOS)
    c.paste(im,((W-im.width)//2,(H-im.height)//2)); return c
def rounded(im, rad=18):
    m=Image.new('L',im.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,im.width-1,im.height-1],rad,fill=255); o=Image.new('RGBA',im.size); o.paste(im.convert('RGB'),(0,0),m); return o
out={}
for k in ['draw','grid','anchors','layers','kern','preview','bulk','export']: out[k]=contain(Image.open(k+'.png'))
out['poster']=contain(Image.open('poster.png'),24); out['ot']=contain(Image.open('ot.png'),24)
a=Image.open('fx.png'); b=Image.open('fx2.png'); s=a.width/1000
ca=a.crop((0,int(64*s),int(760*s),int(600*s))); cb=b.crop((0,int(64*s),int(760*s),int(600*s)))
c=Image.new('RGB',(W,H),BG); w=(W-36)//2
for i,im in enumerate([ca,cb]):
    r=min(w/im.width,(H-24)/im.height); im=im.resize((round(im.width*r),round(im.height*r)),Image.LANCZOS); im=rounded(im,14); c.paste(im,(12+i*(w+12)+(w-im.width)//2,(H-im.height)//2),im)
out['fx']=c
c=Image.new('RGB',(W,H),(45,67,210)); hh=H-60
for i in range(3):
    im=Image.open(f'm{i+1}.png'); r=hh/im.height; im=im.resize((round(im.width*r),hh),Image.LANCZOS); im=rounded(im,22); x=int(W/2+(i-1)*(im.width+40)-im.width/2); c.paste(im,(x,30),im)
out['mobile']=c
os.makedirs('webp',exist_ok=True); js={}
for k,im in out.items():
    p=f'webp/{k}.webp'; im.save(p,'WEBP',quality=62,method=6); js[k]='data:image/webp;base64,'+base64.b64encode(open(p,'rb').read()).decode()
def chunk(v): return '+\n'.join(json.dumps(v[i:i+300]) for i in range(0,len(v),300))
open(os.path.join(R,'assets','tour.js'),'w').write('window.LITERA_TOUR = {\n'+',\n'.join(json.dumps(k)+': '+chunk(v) for k,v in js.items())+'\n};\n'); print(os.path.getsize(os.path.join(R,'assets','tour.js')))
