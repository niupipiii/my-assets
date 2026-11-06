from PIL import Image, ImageDraw
import os

S = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

# vertical indigo gradient
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
px = img.load()
top = (99, 102, 241)
bottom = (129, 140, 248)
for y in range(S):
    t = y / (S - 1)
    r = int(top[0] + (bottom[0] - top[0]) * t)
    g = int(top[1] + (bottom[1] - top[1]) * t)
    b = int(top[2] + (bottom[2] - top[2]) * t)
    for x in range(S):
        px[x, y] = (r, g, b, 255)

# rounded square mask
mask = Image.new('L', (S, S), 0)
md = ImageDraw.Draw(mask)
radius = int(S * 0.22)
md.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
img.putalpha(mask)

d = ImageDraw.Draw(img, 'RGBA')
# subtle top-left highlight
d.ellipse([-S*0.3, -S*0.45, S*0.9, S*0.55], fill=(255, 255, 255, 18))

# white chart line
pts = [(0.18, 0.70), (0.34, 0.56), (0.47, 0.62), (0.63, 0.42), (0.82, 0.30)]
P = [(int(x*S), int(y*S)) for x, y in pts]
d.line(P, fill=(255, 255, 255, 255), width=int(S*0.045), joint='curve')
# area under line
area = P + [(P[-1][0], int(0.78*S)), (P[0][0], int(0.78*S))]
d.polygon(area, fill=(255, 255, 255, 46))
# end dot
r = int(S*0.055)
cx, cy = P[-1]
d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 255, 255, 255))
# baseline ticks
for i, x in enumerate([0.18, 0.34, 0.5, 0.66, 0.82]):
    d.rounded_rectangle([int(x*S)-int(S*0.012), int(0.82*S), int(x*S)+int(S*0.012), int(0.86*S)], radius=int(S*0.012), fill=(255, 255, 255, 90))

img.save(os.path.join(OUT, 'icon-1024.png'))
for size in (512, 192, 180):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'icon-{size}.png'))
img.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'apple-touch-icon.png'))

# maskable: shrink artwork to 80% safe zone on a full-bleed background
bg = Image.new('RGBA', (S, S), (99, 102, 241, 255))
inner = img.resize((int(S*0.8), int(S*0.8)), Image.LANCZOS)
bg.alpha_composite(inner, (int(S*0.1), int(S*0.1)))
bg.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-maskable-512.png'))

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#818CF8"/></linearGradient></defs>
  <rect width="1024" height="1024" rx="225" fill="url(#g)"/>
  <path d="M184 717 348 573 481 635 645 430 840 307 840 798 184 798Z" fill="#fff" opacity=".18"/>
  <path d="M184 717 348 573 481 635 645 430 840 307" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="840" cy="307" r="56" fill="#fff"/>
</svg>'''
open(os.path.join(OUT, 'favicon.svg'), 'w').write(svg)
open(os.path.join(OUT, 'icon.svg'), 'w').write(svg)
print('icons written to', OUT)
