"""Export current folder portfolio to a standalone PDF."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import ROOT,scan,pdf_bytes
if __name__ == '__main__':
    groups=scan()
    if not groups:raise SystemExit('В portfolio нет слайдов.')
    output=ROOT/'output/pdf/Alexandra-Itunina-Portfolio.pdf'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(pdf_bytes(groups))
    print(output)
