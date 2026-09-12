"""Local portfolio: folders → tabs, images → slides. Bind only to loopback."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import quote, urlparse
from io import BytesIO
import json,re,hashlib
from threading import Lock
from PIL import Image, ImageOps
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parent
PORTFOLIO=ROOT/'portfolio'
EXT={'.png','.jpg','.jpeg','.webp'}
PDF_LOCK=Lock()
PDF_CACHE={}
def natural(value):
    return [int(x) if x.isdigit() else x.casefold() for x in re.split(r'(\d+)',value)]
def scan():
    groups=[]
    if not PORTFOLIO.exists():return groups
    for folder in sorted(PORTFOLIO.iterdir(),key=lambda p:natural(p.name)):
        if not folder.is_dir() or folder.is_symlink() or folder.name.startswith('.'):continue
        match=re.fullmatch(r'([0-9]{2}) (\S.*)',folder.name)
        if not match or match[1]=='00':continue
        files=[p for p in sorted(folder.iterdir(),key=lambda p:natural(p.name)) if p.is_file() and not p.is_symlink() and not p.name.startswith('.') and p.suffix.lower() in EXT]
        if files:groups.append((match[2],files))
    return groups

def pdf_bytes(groups):
    key=tuple((str(p),p.stat().st_mtime_ns,p.stat().st_size) for _,files in groups for p in files)
    with PDF_LOCK:
        if PDF_CACHE.get('key')==key:return PDF_CACHE['data']
        stream=BytesIO();pdf=canvas.Canvas(stream,pagesize=(960,540));pdf.setTitle('Alexandra Itunina - Portfolio');pdf.setAuthor('Alexandra Itunina')
        for _,files in groups:
            for path in files:
                with Image.open(path) as source:
                    im=ImageOps.exif_transpose(source).convert('RGBA');bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);im=bg.convert('RGB');im.thumbnail((1920,1080));jpg=BytesIO();im.save(jpg,'JPEG',quality=92);jpg.seek(0);w,h=im.size;scale=min(960/w,540/h);pdf.drawImage(ImageReader(jpg),(960-w*scale)/2,(540-h*scale)/2,w*scale,h*scale);pdf.showPage()
        pdf.save();data=stream.getvalue();PDF_CACHE.update(key=key,data=data);return data
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        route=urlparse(self.path).path
        if route not in ('/api/portfolio','/api/portfolio.pdf'):return super().do_GET()
        try:
            groups=scan()
            if route.endswith('.pdf'):
                if not groups:self.send_error(404,'Portfolio is empty');return
                data=pdf_bytes(groups);mime='application/pdf'
            else:
                data=json.dumps({'projects':[{'title':name,'kind':'','slides':['/'+quote(str(p.relative_to(ROOT)))+'?v='+str(p.stat().st_mtime_ns) for p in files]} for name,files in groups]},ensure_ascii=False).encode();mime='application/json; charset=utf-8'
            self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
            if route.endswith('.pdf'):self.send_header('Content-Disposition','attachment; filename="Alexandra-Itunina-Portfolio.pdf"')
            self.end_headers();self.wfile.write(data)
        except (OSError,ValueError) as e:self.send_error(500,'Cannot read a portfolio file')
if __name__=='__main__':
    print('Portfolio: http://127.0.0.1:8765/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
