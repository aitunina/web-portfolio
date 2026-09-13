"""Build static manifests and PDF. No web server is required."""
from pathlib import Path
from urllib.parse import quote
from io import BytesIO
from threading import Lock
import argparse, json, re, shutil
from PIL import Image, ImageOps
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
ROOT=Path(__file__).resolve().parents[1]
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

def build(output=None):
    groups=scan()
    if not groups:raise SystemExit('No valid project images in portfolio/.')
    data={'projects':[{'title':name,'kind':'','slides':[quote(p.relative_to(ROOT).as_posix()) for p in files]} for name,files in groups]}
    payload=json.dumps(data,ensure_ascii=False,indent=2)
    (ROOT/'portfolio.json').write_text(payload+'\n',encoding='utf-8')
    (ROOT/'assets/portfolio-data.js').write_text('window.PORTFOLIO_DATA = '+payload+';\n',encoding='utf-8')
    (ROOT/'downloads').mkdir(exist_ok=True)
    (ROOT/'downloads/portfolio.pdf').write_bytes(pdf_bytes(groups))
    if output:
        target=Path(output).resolve()
        if target!=ROOT/'dist':raise SystemExit('Deployment output must be dist/.')
        if target.exists():shutil.rmtree(target)
        target.mkdir()
        for name in ['index.html','portfolio.json','CNAME']:
            if (ROOT/name).exists():shutil.copy2(ROOT/name,target/name)
        (target/'.nojekyll').touch()
        for name in ['styles.css','app.js','portrait-original.png','favicon.svg','portfolio-data.js']:
            (target/'assets').mkdir(exist_ok=True)
            shutil.copy2(ROOT/'assets'/name,target/'assets'/name)
        for name in ['fonts','events']:
            shutil.copytree(ROOT/'assets'/name,target/'assets'/name)
        (target/'downloads').mkdir()
        shutil.copy2(ROOT/'downloads/portfolio.pdf',target/'downloads/portfolio.pdf')
        for _,files in groups:
            for source in files:
                dest=target/source.relative_to(ROOT);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
    print(f'Built {len(groups)} projects, {sum(len(files) for _,files in groups)} slides and PDF.')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output');args=parser.parse_args();build(args.output)
