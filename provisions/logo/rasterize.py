#!/usr/bin/env python3
"""Растеризация знака «Провиант» v5 (по одобренному концепту v1_ai_sail_mountain):
парус-гора с пузом на гипотенузе, отделённая снежная вершина, тонкая ватерлиния,
отражение. Композитинг premultiplied alpha; скругления — расширением маски."""
import os
import numpy as np
from PIL import Image, ImageDraw

S = 4
F = np.float32


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], F) / F(255)


def lerp3(c0, c1, c2, t, mid=.55):
    t = np.clip(t, 0, 1).astype(F)
    lo = t < mid
    a = np.where(lo, t / F(mid), (t - F(mid)) / F(1 - mid))[..., None]
    A = np.where(lo[..., None], c0, c1)
    B = np.where(lo[..., None], c1, c2)
    return A + (B - A) * a


def quad(p0, c, p1, n=72):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(c)
            + t ** 2 * np.array(p1))


def sail_pts():
    return [(210, 140)] + [tuple(p) for p in quad((210, 140), (294, 209), (348, 319))] + [(210, 319)]


CAP = [(209, 102), (234, 132), (224, 126), (216.5, 132), (209, 126),
       (201.5, 132), (194, 126), (184, 132)]
CAP_BAND = [(209, 100), (234, 132), (222, 132), (209, 116), (196, 132), (184, 132)]
REFL = [(187, 341), (324, 341), (248, 413)]

WAVE = [((135, 331), (155, 325), (175, 337), (195, 331)),
        ((195, 331), (215, 325), (235, 337), (255, 331)),
        ((255, 331), (275, 325), (295, 337), (315, 331)),
        ((315, 331), (335, 325), (355, 337), (375, 331))]


def poly_mask(size, pts, s, dilate=0):
    im = Image.new('L', (size[0] * s, size[1] * s), 0)
    d = ImageDraw.Draw(im)
    pp = [(x * s, y * s) for x, y in pts]
    d.polygon(pp, fill=255)
    if dilate:
        w = int(2 * dilate * s)
        d.line(pp + [pp[0]], fill=255, width=w, joint='curve')
        r = dilate * s
        for x, y in pp:
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.asarray(im, F) / F(255)


def bezier(p0, p1, p2, p3, n=96):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 3 * np.array(p0) + 3 * (1 - t) ** 2 * t * np.array(p1)
            + 3 * (1 - t) * t ** 2 * np.array(p2) + t ** 3 * np.array(p3))


def bezier_d(p0, p1, p2, p3, n=96):
    t = np.linspace(0, 1, n)[:, None]
    return (3 * (1 - t) ** 2 * (np.array(p1) - np.array(p0))
            + 6 * (1 - t) * t * (np.array(p2) - np.array(p1))
            + 3 * t ** 2 * (np.array(p3) - np.array(p2)))


def wave_mask(size, segs, width, s):
    im = Image.new('L', (size[0] * s, size[1] * s), 0)
    d = ImageDraw.Draw(im)
    for seg in segs:
        p, dv = bezier(*seg), bezier_d(*seg)
        slope = dv[:, 1] / np.where(np.abs(dv[:, 0]) < 1e-6, 1e-6, dv[:, 0])
        off = (width / 2) * np.sqrt(1 + slope ** 2)
        top = [(x * s, (y - o) * s) for (x, y), o in zip(p, off)]
        bot = [(x * s, (y + o) * s) for (x, y), o in zip(p, off)][::-1]
        d.polygon(top + bot, fill=255)
        r = width * s / 2
        for x, y in (p[0], p[-1]):
            d.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=255)
    return np.asarray(im, F) / F(255)


def over(base, rgb, a):
    a3 = np.asarray(a, F)[..., None]
    base[..., :3] = np.asarray(rgb, F) * a3 + base[..., :3] * (1 - a3)
    base[..., 3:] = a3 + base[..., 3:] * (1 - a3)
    return base


def put(base, col, m):
    ia = 1 - base[..., 3:4]
    base[..., :3] += col * (m[..., None] * ia)
    base[..., 3:] += m[..., None] * ia


def finalize(base):
    a = base[..., 3]
    rgb = np.zeros_like(base[..., :3])
    nz = a > 1e-5
    rgb[nz] = base[..., :3][nz] / a[nz][..., None]
    out = np.concatenate([rgb, a[..., None]], axis=-1)
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')


def _mark(base, W, H, s, x, y, pal, cap_pts, cap_dil, wave_w, refl=True, sail_dil=4):
    if refl:
        m = poly_mask((W, H), REFL, s)
        over(base, hexc(pal['refl']), m * np.clip(F(pal['refl_a']) * (1 - (y - 341) / F(72)), 0, 1))
    m = poly_mask((W, H), sail_pts(), s, dilate=sail_dil)
    t = ((x - 210) * 138 + (y - 140) * 179) / F(138 ** 2 + 179 ** 2)
    put(base, lerp3(hexc(pal['s0']), hexc(pal['s1']), hexc(pal['s2']), t), m)
    over(base, hexc(pal['cap']), poly_mask((W, H), cap_pts, s, dilate=cap_dil))
    over(base, hexc(pal['wave']), wave_mask((W, H), WAVE, wave_w, s))


DARK = dict(s0='FFC46B', s1='F08A2E', s2='E4571B', cap='F5F2EA', wave='F5F2EA',
            refl='C46A2A', refl_a=.5)
LIGHT = dict(s0='F79A3E', s1='E8622C', s2='C24E12', cap='10202B', wave='12877A',
             refl='C24E12', refl_a=.35)


def render_mark(size=512, s=S, downsample=True):
    W = H = size
    base = np.zeros((H * s, W * s, 4), F)
    yy, xx = np.mgrid[0:H * s, 0:W * s]
    _mark(base, W, H, s, (xx / s).astype(F), (yy / s).astype(F), DARK, CAP, 2.5, 7)
    img = finalize(base)
    return img.resize((W, H), Image.LANCZOS) if downsample else img


def render_mark_light(size=512, s=S, downsample=True):
    W = H = size
    base = np.zeros((H * s, W * s, 4), F)
    yy, xx = np.mgrid[0:H * s, 0:W * s]
    _mark(base, W, H, s, (xx / s).astype(F), (yy / s).astype(F), LIGHT, CAP, 2.5, 7)
    img = finalize(base)
    return img.resize((W, H), Image.LANCZOS) if downsample else img


def render_mark_simple(s=S):
    """Упрощённый знак для фавиконки: без отражения, утолщённые штрихи."""
    W = H = 512
    base = np.zeros((H * s, W * s, 4), F)
    yy, xx = np.mgrid[0:H * s, 0:W * s]
    _mark(base, W, H, s, (xx / s).astype(F), (yy / s).astype(F), DARK,
          CAP_BAND, 5, 12, refl=False, sail_dil=7)
    return finalize(base)


def tile_base(W, H, s, radius):
    yy, xx = np.mgrid[0:H * s, 0:W * s]
    x = (xx / s).astype(F)
    y = (yy / s).astype(F)
    t = ((x + y) / F(W + H))[..., None]
    bgc = hexc('152531') * (1 - t) + hexc('0B141B') * t
    base = np.zeros((H * s, W * s, 4), F)
    base[..., :3] = bgc
    base[..., 3] = 1
    mask = Image.new('L', (W * s, H * s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W * s - 1, H * s - 1],
                                           radius=radius * s, fill=255)
    m = np.asarray(mask, F) / F(255)
    base[..., :3] *= m[..., None]
    base[..., 3] *= m
    return finalize(base), x, y


def render_app_icon(size=512, s=S):
    W = H = 512
    img, x, y = tile_base(W, H, s, 116)
    arr = np.asarray(img, F) / F(255)
    r = np.sqrt((x - 300) ** 2 + (y - 150) ** 2)
    g = np.clip(F(.15) * (1 - r / F(270)), 0, 1)[..., None]
    glowc = hexc('FF9E2C')
    arr[..., :3] = arr[..., :3] * (1 - g) + glowc * g * arr[..., 3:]
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA')
    mark = render_mark(512, s, downsample=False)
    ms = int(512 * 1.15 * s)
    mark = mark.resize((ms, ms), Image.LANCZOS)
    img.paste(mark, (int(-37.2 * s), int(-38.4 * s)), mark)
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rounded_rectangle([s, s, W * s - s, H * s - s],
                                         radius=115 * s,
                                         outline=(255, 255, 255, 16), width=2 * s)
    img.alpha_composite(ov)
    return img.resize((size, size), Image.LANCZOS)


def render_favicon(size=64, s=8):
    W = H = 64
    img, _, _ = tile_base(W, H, s, 14)
    mark = render_mark_simple(4)
    ms = int(512 * .16 * s)
    mark = mark.resize((ms, ms), Image.LANCZOS)
    img.paste(mark, (int(-8.79 * s), int(-8.97 * s)), mark)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__) or '.', 'png')
    os.makedirs(out, exist_ok=True)
    render_mark().save(f'{out}/mark-512.png')
    render_mark_light().save(f'{out}/mark-light-512.png')
    render_app_icon(512).save(f'{out}/app-icon-512.png')
    render_app_icon(192).save(f'{out}/app-icon-192.png')
    render_favicon(64).save(f'{out}/favicon-64.png')
    render_favicon(32).save(f'{out}/favicon-32.png')
    print('done:', sorted(os.listdir(out)))
