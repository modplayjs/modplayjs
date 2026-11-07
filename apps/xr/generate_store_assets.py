import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = "D:/StudioProjects/modplayjs/apps/xr/store_assets"
ARTIFACTS_DIR = "C:/Users/bitti/AppData/Local/Google/AndroidStudio2026.2.2/projects/xr.67eded61/.artifacts/3c6c6185-2196-45fa-b2e8-cd7d091fea76"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

# Official Brand Colors from apps/android/store
COLOR_BG_START = (27, 18, 56)    # #1B1238
COLOR_BG_MID   = (15, 12, 31)    # #0F0C1F
COLOR_BG_END   = (12, 10, 24)    # #0C0A18

COLOR_PERIWINKLE = (142, 162, 255) # #8EA2FF (App Mark, XR badge)
COLOR_MINT       = (95, 227, 192)  # #5FE3C0 (js text)
COLOR_TEXT_WHITE = (241, 237, 251) # #F1EDFB (modplay text)
COLOR_TEXT_SUB   = (148, 163, 184) # #94A3B8 (subtitles)
COLOR_TILE_BG    = (19, 15, 34)    # #130F22

FONT_TITLE_PATH = "C:/Windows/Fonts/bahnschrift.ttf"
FONT_TEXT_PATH  = "C:/Windows/Fonts/segoeuib.ttf"
FONT_MONO_PATH  = "C:/Windows/Fonts/consola.ttf"

# Official 'M' Logo Polygon Points (in 108x108 viewbox)
M_POINTS_108 = [
    (30, 72), (30, 36), (40, 36), (54, 58), (68, 36),
    (78, 36), (78, 72), (69, 72), (69, 51), (54, 74),
    (53, 74), (39, 51), (39, 72)
]

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def draw_official_background(w, h):
    img = Image.new("RGBA", (w, h), (*COLOR_BG_END, 255))
    draw = ImageDraw.Draw(img)

    # 1. Linear Background Gradient
    for y in range(h):
        ratio = y / float(h)
        if ratio < 0.5:
            t = ratio / 0.5
            r = int(COLOR_BG_START[0] * (1 - t) + COLOR_BG_MID[0] * t)
            g = int(COLOR_BG_START[1] * (1 - t) + COLOR_BG_MID[1] * t)
            b = int(COLOR_BG_START[2] * (1 - t) + COLOR_BG_MID[2] * t)
        else:
            t = (ratio - 0.5) / 0.5
            r = int(COLOR_BG_MID[0] * (1 - t) + COLOR_BG_END[0] * t)
            g = int(COLOR_BG_MID[1] * (1 - t) + COLOR_BG_END[1] * t)
            b = int(COLOR_BG_MID[2] * (1 - t) + COLOR_BG_END[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # 2. Soft Radial Halos (Periwinkle & Mint)
    halo_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo_layer)

    cx1, cy1, r1 = int(w * 0.50), int(h * 0.40), int(min(w, h) * 0.65)
    for radius in range(r1, 0, -4):
        alpha = int(90 * (1.0 - radius / float(r1)) ** 2)
        halo_draw.ellipse([cx1 - radius, cy1 - radius, cx1 + radius, cy1 + radius], fill=(*COLOR_PERIWINKLE, alpha))

    cx2, cy2, r2 = int(w * 0.50), int(h * 0.85), int(min(w, h) * 0.5)
    for radius in range(r2, 0, -4):
        alpha = int(45 * (1.0 - radius / float(r2)) ** 2)
        halo_draw.ellipse([cx2 - radius, cy2 - radius, cx2 + radius, cy2 + radius], fill=(*COLOR_MINT, alpha))

    img = Image.alpha_composite(img, halo_layer)

    # 3. Perspective Grid Lines
    grid_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid_layer)
    horizon_y = int(h * 0.55)
    center_x = w // 2

    for i in range(1, 16):
        gy = horizon_y + int((h - horizon_y) * (i / 16.0) ** 1.8)
        alpha = int(35 * (i / 16.0))
        grid_draw.line([(0, gy), (w, gy)], fill=(*COLOR_PERIWINKLE, alpha), width=1)

    for gx in range(-w, w * 2, int(w * 0.06)):
        alpha = 25
        grid_draw.line([(center_x, horizon_y), (gx, h)], fill=(*COLOR_PERIWINKLE, alpha), width=1)

    img = Image.alpha_composite(img, grid_layer)
    return img

def draw_official_logo_tile(size, radius_ratio=0.24):
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)

    rx = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=rx, fill=(*COLOR_TILE_BG, 255))

    scaled_m = []
    for px, py in M_POINTS_108:
        sx = (px / 108.0) * size
        sy = (py / 108.0) * size
        scaled_m.append((sx, sy))

    draw.polygon(scaled_m, fill=(*COLOR_PERIWINKLE, 255))
    return tile

def draw_spatial_sphere(img, cx, cy, radius, color):
    """
    Renders a glossy 3D sphere with a smooth Gaussian-blurred volumetric glow.
    NO concentric target lines or moire artifacts!
    """
    # Soft Gaussian Glow
    glow_img = Image.new("RGBA", img.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_radius = int(radius * 1.6)
    glow_draw.ellipse([cx - glow_radius, cy - glow_radius, cx + glow_radius, cy + glow_radius], fill=(*color, 120))
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=int(radius * 0.4)))

    img.paste(glow_img, (0, 0), glow_img)

    # Core Sphere
    draw = ImageDraw.Draw(img)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(*color, 255))

    # Glossy Highlight
    hr = int(radius * 0.32)
    hx = cx - int(radius * 0.28)
    hy = cy - int(radius * 0.28)
    draw.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=(255, 255, 255, 200))

def draw_tracker_preview_panel(w, h, font_mono):
    panel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(panel)

    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=16, fill=(15, 12, 31, 230), outline=(*COLOR_MINT, 180), width=2)
    draw.rounded_rectangle([0, 0, w - 1, 32], radius=16, fill=(27, 21, 52, 250))
    draw.text((12, 6), "PATTERN VIEW - CH 01-04", fill=(*COLOR_MINT, 255), font=font_mono)

    rows = [
        "00  C-3 01 --  E-3 02 --  G-3 01 --",
        "01  --- -- --  --- -- --  --- -- --",
        "02  C-3 01 A04 --- -- --  G-3 01 --",
        "03  E-3 01 --  G-3 02 --  C-4 01 --",
        "04  --- -- --  C-3 02 --  --- -- --",
    ]

    cy = 40
    for idx, row in enumerate(rows):
        is_highlight = (idx == 0 or idx == 3)
        color = (255, 230, 0, 255) if is_highlight else (*COLOR_TEXT_SUB, 240)
        if is_highlight:
            draw.rectangle([6, cy - 2, w - 6, cy + 18], fill=(30, 41, 59, 200))
        draw.text((12, cy), row, fill=color, font=font_mono)
        cy += 20
        if cy + 18 > h:
            break

    return panel

def generate_universal_base():
    w, h = 2560, 1440
    img = draw_official_background(w, h)

    # 3D Spheres
    draw_spatial_sphere(img, 380, 420, 65, COLOR_PERIWINKLE)
    draw_spatial_sphere(img, 2220, 380, 75, COLOR_MINT)
    draw_spatial_sphere(img, 300, 1020, 55, (234, 179, 8))

    draw = ImageDraw.Draw(img, "RGBA")
    f_title = get_font(FONT_TITLE_PATH, 115)
    f_sub1  = get_font(FONT_TEXT_PATH, 34)
    f_sub2  = get_font(FONT_TEXT_PATH, 28)
    f_badge = get_font(FONT_TEXT_PATH, 26)
    f_mono  = get_font(FONT_MONO_PATH, 16)

    center_x = 1280
    tile_size = 170
    logo_tile = draw_official_logo_tile(tile_size)

    modplay_w = draw.textlength("modplay", font=f_title)
    js_w      = draw.textlength("js", font=f_title)
    badge_w   = 130
    gap = 20

    total_brand_w = tile_size + gap + modplay_w + js_w + gap + badge_w
    start_x = center_x - (total_brand_w / 2.0)

    ty = 480
    img.paste(logo_tile, (int(start_x), ty), logo_tile)

    wx = start_x + tile_size + gap
    wy = ty + 18
    draw.text((wx, wy), "modplay", fill=(*COLOR_TEXT_WHITE, 255), font=f_title)

    jsx = wx + modplay_w
    draw.text((jsx, wy), "js", fill=(*COLOR_MINT, 255), font=f_title)

    xrx = jsx + js_w + gap
    xry = wy + 12
    draw.rounded_rectangle([xrx, xry, xrx + badge_w, xry + 88], radius=16, fill=(*COLOR_PERIWINKLE, 255))
    draw.text((xrx + 18, xry + 6), "XR", fill=(12, 10, 24, 255), font=get_font(FONT_TITLE_PATH, 80))

    sy = ty + tile_size + 35
    sub1_text = "SPATIAL CHIPTUNE & TRACKER PLAYER"
    sub1_w = draw.textlength(sub1_text, font=f_sub1)
    draw.text((center_x - sub1_w / 2, sy), sub1_text, fill=(*COLOR_MINT, 255), font=f_sub1)

    sub2_text = "Meta Quest 3 / Horizon OS • Native 3D Audio Engine"
    sub2_w = draw.textlength(sub2_text, font=f_sub2)
    draw.text((center_x - sub2_w / 2, sy + 45), sub2_text, fill=(*COLOR_TEXT_SUB, 255), font=f_sub2)

    formats = ["MOD", "XM", "S3M", "IT", "MO3"]
    badge_width = 88
    badge_gap = 14
    total_badges_w = len(formats) * badge_width + (len(formats) - 1) * badge_gap
    fx = center_x - (total_badges_w / 2.0)
    fy = sy + 105

    for fmt in formats:
        draw.rounded_rectangle([fx, fy, fx + badge_width, fy + 42], radius=10, fill=(*COLOR_TILE_BG, 230), outline=(*COLOR_PERIWINKLE, 180), width=2)
        draw.text((fx + 16, fy + 6), fmt, fill=(*COLOR_TEXT_WHITE, 255), font=f_badge)
        fx += badge_width + badge_gap

    # Tracker Panel Right
    panel_right = draw_tracker_preview_panel(420, 150, f_mono)
    img.paste(panel_right, (1920, 680), panel_right)

    # Save
    p1 = os.path.join(OUTPUT_DIR, "universal_base_2560x1440.png")
    p2 = os.path.join(OUTPUT_DIR, "landscape_cover_2560x1440.png")
    img.save(p1, "PNG")
    img.save(p2, "PNG")
    img.save(os.path.join(ARTIFACTS_DIR, "universal_base_2560x1440.png"), "PNG")
    print("Saved Smooth 2560x1440 Base Asset.")

def generate_hero_cover():
    w, h = 3000, 900
    img = draw_official_background(w, h)

    # Smooth Gaussian Spheres
    draw_spatial_sphere(img, 380, 450, 65, COLOR_PERIWINKLE)
    draw_spatial_sphere(img, 2620, 420, 75, COLOR_MINT)

    draw = ImageDraw.Draw(img, "RGBA")
    f_title = get_font(FONT_TITLE_PATH, 110)
    f_sub1  = get_font(FONT_TEXT_PATH, 32)
    f_sub2  = get_font(FONT_TEXT_PATH, 24)
    f_mono  = get_font(FONT_MONO_PATH, 16)

    center_x = 1500
    tile_size = 150
    logo_tile = draw_official_logo_tile(tile_size)

    modplay_w = draw.textlength("modplay", font=f_title)
    js_w      = draw.textlength("js", font=f_title)
    badge_w   = 120
    gap = 18

    total_brand_w = tile_size + gap + modplay_w + js_w + gap + badge_w
    start_x = center_x - (total_brand_w / 2.0)

    ty = 270
    img.paste(logo_tile, (int(start_x), ty), logo_tile)

    wx = start_x + tile_size + gap
    wy = ty + 15
    draw.text((wx, wy), "modplay", fill=(*COLOR_TEXT_WHITE, 255), font=f_title)

    jsx = wx + modplay_w
    draw.text((jsx, wy), "js", fill=(*COLOR_MINT, 255), font=f_title)

    xrx = jsx + js_w + gap
    xry = wy + 10
    draw.rounded_rectangle([xrx, xry, xrx + badge_w, xry + 82], radius=16, fill=(*COLOR_PERIWINKLE, 255))
    draw.text((xrx + 18, xry + 6), "XR", fill=(12, 10, 24, 255), font=get_font(FONT_TITLE_PATH, 75))

    sy = ty + tile_size + 25
    sub1_text = "SPATIAL CHIPTUNE & TRACKER PLAYER"
    sub1_w = draw.textlength(sub1_text, font=f_sub1)
    draw.text((center_x - sub1_w / 2, sy), sub1_text, fill=(*COLOR_MINT, 255), font=f_sub1)

    sub2_text = "Meta Quest 3 • Interactive 3D Audio Vault & Modular UI"
    sub2_w = draw.textlength(sub2_text, font=f_sub2)
    draw.text((center_x - sub2_w / 2, sy + 42), sub2_text, fill=(*COLOR_TEXT_SUB, 255), font=f_sub2)

    panel = draw_tracker_preview_panel(460, 150, f_mono)
    img.paste(panel, (2080, 320), panel)

    p = os.path.join(OUTPUT_DIR, "hero_cover_3000x900.png")
    img.save(p, "PNG")
    img.save(os.path.join(ARTIFACTS_DIR, "hero_cover_3000x900.png"), "PNG")
    print("Saved Smooth 3000x900 Hero Cover.")

def generate_app_icon():
    w, h = 512, 512
    img = draw_official_background(w, h)

    # Smooth Gaussian Sphere in Background
    draw_spatial_sphere(img, 256, 190, 75, COLOR_PERIWINKLE)

    draw = ImageDraw.Draw(img, "RGBA")

    tile_size = 210
    tx = (w - tile_size) // 2
    ty = 85
    logo_tile = draw_official_logo_tile(tile_size)
    img.paste(logo_tile, (tx, ty), logo_tile)

    f_word = get_font(FONT_TITLE_PATH, 54)
    wy = 345

    draw.text((45, wy), "modplay", fill=(*COLOR_TEXT_WHITE, 255), font=f_word)
    mw = draw.textlength("modplay", font=f_word)
    jsx = 45 + int(mw)
    draw.text((jsx, wy), "js", fill=(*COLOR_MINT, 255), font=f_word)

    jsw = draw.textlength("js", font=f_word)
    xrx = jsx + int(jsw) + 12
    xry = wy + 4
    draw.rounded_rectangle([xrx, xry, xrx + 70, xry + 46], radius=10, fill=(*COLOR_PERIWINKLE, 255))
    draw.text((xrx + 10, xry + 2), "XR", fill=(12, 10, 24, 255), font=get_font(FONT_TITLE_PATH, 38))

    f_sub = get_font(FONT_TEXT_PATH, 20)
    draw.text((125, 420), "SPATIAL CHIPTUNE PLAYER", fill=(*COLOR_MINT, 255), font=f_sub)

    p1 = os.path.join(OUTPUT_DIR, "app_icon_512x512.png")
    p2 = os.path.join(OUTPUT_DIR, "app_icon.png")
    img.save(p1, "PNG")
    img.save(p2, "PNG")
    img.save(os.path.join(ARTIFACTS_DIR, "app_icon_512x512.png"), "PNG")
    print("Saved Smooth 512x512 App Icon.")

if __name__ == "__main__":
    generate_universal_base()
    generate_hero_cover()
    generate_app_icon()
