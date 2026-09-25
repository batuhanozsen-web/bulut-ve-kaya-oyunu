"""index.html + style.css + js/*.js dosyalarını tek bir HTML dosyasında birleştirir.

Kullanım:  python3 tek_dosya_olustur.py
Çıktı:     bulut-ve-kaya-macerasi.html
"""
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "bulut-ve-kaya-macerasi.html"

html = (ROOT / "index.html").read_text(encoding="utf-8")
html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    "<style>\n" + (ROOT / "style.css").read_text(encoding="utf-8") + "</style>",
)
for name in ["audio", "pose", "blow", "game"]:
    html = html.replace(
        f'<script src="js/{name}.js"></script>',
        "<script>\n" + (ROOT / "js" / f"{name}.js").read_text(encoding="utf-8") + "</script>",
    )
assert 'src="js/' not in html and "style.css" not in html, "birleştirilemeyen dosya kaldı"
OUT.write_text(html, encoding="utf-8")
print(f"{OUT.name} oluşturuldu ({OUT.stat().st_size // 1024} KB)")
