#!/usr/bin/env python3
"""시뮬레이터 화면(1320x2868)에 제목을 얹어 App Store 스크린샷을 만듭니다.
사용법: python3 store/make_frames.py <원본 폴더> <저장 폴더>
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1320, 2868
BG_TOP, BG_BOT = (20, 18, 28), (6, 7, 12)
GOLD_L, GOLD = (255, 230, 150), (212, 175, 55)
CAPS = {
    1: ('산 로또, QR 한 번이면', '당첨 확인 끝'),
    2: ('나만의 숫자로 뽑는', '행운 번호 5게임'),
    3: ('회차별 당첨 결과를', '자동으로 맞춰드려요'),
    4: ('줄마다 몇 개 맞았는지', '한눈에 보여요'),
    5: ('용지를 찍자마자', '몇 등인지 바로'),
    6: ('지난 당첨번호도', '한눈에'),
    7: ('재미로 보는', '오늘의 운'),
}
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'


def font(size):
    for f in (FONT, '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size, index=1)  # index 1 = KR
    return ImageFont.load_default()


def bg():
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] * (1 - t) + BG_BOT[i] * t) for i in range(3)))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((W * 0.1, -380, W * 0.9, 640), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    im = Image.composite(Image.new('RGB', (W, H), GOLD), im, glow.point(lambda v: v // 2))
    return im


def gold_text(im, xy, text, f):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=f, fill=255, anchor='mt')
    grad = Image.new('RGB', im.size)
    gd = ImageDraw.Draw(grad)
    x0, y0, x1, y1 = mask.getbbox()
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        gd.line([(0, y), (W, y)], fill=tuple(int(GOLD_L[i] * (1 - t) + GOLD[i] * t) for i in range(3)))
    shadow = mask.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .55))
    im.paste((0, 0, 0), (0, 6), shadow)
    im.paste(grad, (0, 0), mask)


def frame(src, n, out):
    im = bg()
    l1, l2 = CAPS.get(n, ('', ''))
    d = ImageDraw.Draw(im)
    f1, f2 = font(92), font(118)
    d.text((W // 2, 170), l1, font=f1, fill=(235, 228, 210), anchor='mt')
    gold_text(im, (W // 2, 295), l2, f2)
    shot = Image.open(src).convert('RGB')
    sw = int(W * 0.80)
    sh = int(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    top = 520
    r = 70
    m = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=r, fill=255)
    x = (W - sw) // 2
    sh_blur = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh_blur).rounded_rectangle((x - 6, top + 16, x + sw + 6, top + sh + 30), radius=r, fill=200)
    im.paste((0, 0, 0), (0, 0), sh_blur.filter(ImageFilter.GaussianBlur(28)))
    border = Image.new('L', (W, H), 0)
    ImageDraw.Draw(border).rounded_rectangle((x - 5, top - 5, x + sw + 4, top + sh + 4), radius=r + 5, fill=255)
    im.paste((120, 98, 40), (0, 0), border)
    im.paste(shot, (x, top), m)
    im.save(out, optimize=True)


if __name__ == '__main__':
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for n in range(1, 8):
        p = os.path.join(src_dir, f'ios-{n}.png')
        if os.path.exists(p):
            frame(p, n, os.path.join(out_dir, f'{n:02d}.png'))
            print('만듦', n)
