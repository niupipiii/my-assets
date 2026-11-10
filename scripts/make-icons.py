from PIL import Image, ImageDraw
import os

S = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

TOP = (79, 70, 229)      # #4F46E5 indigo
BOTTOM = (139, 92, 246)  # #8B5CF6 violet
WHITE = (255, 255, 255)

def gradient():
    img = Image.new('RGB', (S, S), TOP)
    px = img.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * (S - 1))
            px[x, y] = (
                int(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
                int(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
                int(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
            )
    return img

def draw_glyph(draw, scale=1.0):
    """White upward line chart, centred, full-bleed background."""
    cx, cy = 0.5, 0.5
    raw = [(0.27, 0.68), (0.42, 0.53), (0.55, 0.60), (0.73, 0.36)]
    pts = []
    for x, y in raw:
        nx = cx + (x - cx) * scale
        ny = cy + (y - cy) * scale
        pts.append((int(nx * S), int(ny * S)))

    width = int(S * 0.062 * scale)
    draw.line(pts, fill=WHITE, width=width, joint='curve')
    # round caps
    r = width // 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)
    # end dot
    dr = int(S * 0.058 * scale)
    ex, ey = pts[-1]
    draw.ellipse([ex - dr, ey - dr, ex + dr, ey + dr], fill=WHITE)

def icon(scale=1.0):
    img = gradient()
    draw = ImageDraw.Draw(img, 'RGBA')
    draw_glyph(draw, scale)
    return img

base = icon(1.0)
maskable = icon(0.72)

base.save(os.path.join(OUT, 'icon-1024.png'), optimize=True)
for size in (512, 192, 180, 32):
    base.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'icon-{size}.png'), optimize=True)
base.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
maskable.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-maskable-512.png'), optimize=True)

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F46E5"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <path d="M276 696 430 543 563 614 747 369" fill="none" stroke="#fff" stroke-width="63" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="747" cy="369" r="59" fill="#fff"/>
</svg>'''
open(os.path.join(OUT, 'favicon.svg'), 'w').write(svg)
open(os.path.join(OUT, 'icon.svg'), 'w').write(svg)
print('icons written to', OUT)
