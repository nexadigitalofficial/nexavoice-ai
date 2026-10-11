#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sesli Görev Asistanı - Otomatik İkon ve Splash Ekranı Üreticisi
Gerekçe: %100 yerel ve harici tasarım aracına ihtiyaç duymadan
tüm Android mipmap ve PWA ikonlarını sıfırdan vektörel matematik ve PIL ile üretir.
"""

import os
import sys
from PIL import Image, ImageDraw

def create_app_icon(size=512):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Yuvarlatılmış Köşeli Arka Plan (Deep Slate)
    pad = int(size * 0.04)
    radius = int(size * 0.22)
    bg_color = (15, 23, 42, 255) # #0F172A
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=bg_color)

    # 2. Dış Halka / Nabız Efekti (Emerald Green Accent)
    center = size // 2
    ring_radius = int(size * 0.38)
    ring_width = int(size * 0.04)
    ring_color = (16, 185, 129, 255) # #10B981
    draw.ellipse([
        center - ring_radius, center - ring_radius,
        center + ring_radius, center + ring_radius
    ], outline=ring_color, width=ring_width)

    # 3. İç Daire (Dark Teal Center)
    inner_radius = int(size * 0.32)
    inner_color = (6, 78, 59, 255) # #064E3B
    draw.ellipse([
        center - inner_radius, center - inner_radius,
        center + inner_radius, center + inner_radius
    ], fill=inner_color)

    # 4. Mikrofon Gövdesi (White Capsule)
    mic_w = int(size * 0.14)
    mic_h = int(size * 0.24)
    mic_top = int(size * 0.30)
    mic_left = center - (mic_w // 2)
    mic_radius = mic_w // 2
    draw.rounded_rectangle([
        mic_left, mic_top,
        mic_left + mic_w, mic_top + mic_h
    ], radius=mic_radius, fill=(255, 255, 255, 255))

    # 5. Mikrofon Sepeti / Yay (U Shape)
    arc_pad = int(size * 0.04)
    arc_radius = int(mic_w * 1.3)
    arc_top = mic_top + int(mic_h * 0.35)
    arc_bottom = arc_top + int(mic_h * 0.85)
    arc_box = [center - arc_radius, arc_top, center + arc_radius, arc_bottom]
    draw.arc(arc_box, start=0, end=180, fill=(255, 255, 255, 255), width=int(size * 0.035))

    # 6. Mikrofon Ayağı
    stem_top = arc_bottom - int(size * 0.04)
    stem_bottom = stem_top + int(size * 0.10)
    draw.line([center, stem_top, center, stem_bottom], fill=(255, 255, 255, 255), width=int(size * 0.035))
    base_w = int(size * 0.16)
    draw.line([center - (base_w // 2), stem_bottom, center + (base_w // 2), stem_bottom], fill=(255, 255, 255, 255), width=int(size * 0.035))

    return img

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    www_assets = os.path.join(base_dir, "www", "assets")
    android_res = os.path.join(base_dir, "android", "app", "src", "main", "res")

    os.makedirs(www_assets, exist_ok=True)

    print("İkonlar üretiliyor...")
    base_512 = create_app_icon(512)
    base_512.save(os.path.join(www_assets, "icon-512.png"))

    base_192 = base_512.resize((192, 192), Image.Resampling.LANCZOS)
    base_192.save(os.path.join(www_assets, "icon-192.png"))

    base_32 = base_512.resize((32, 32), Image.Resampling.LANCZOS)
    base_32.save(os.path.join(base_dir, "www", "favicon.ico"))

    # Android mipmap boyutları
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192
    }

    for folder, dim in densities.items():
        folder_path = os.path.join(android_res, folder)
        os.makedirs(folder_path, exist_ok=True)
        resized = base_512.resize((dim, dim), Image.Resampling.LANCZOS)
        resized.save(os.path.join(folder_path, "ic_launcher.png"))
        resized.save(os.path.join(folder_path, "ic_launcher_round.png"))

    print(f"Başarılı! İkonlar oluşturuldu:")
    print(f" - {os.path.join(www_assets, 'icon-512.png')}")
    print(f" - {os.path.join(www_assets, 'icon-192.png')}")
    print(f" - Android mipmap klasörleri güncellendi.")

if __name__ == "__main__":
    main()
