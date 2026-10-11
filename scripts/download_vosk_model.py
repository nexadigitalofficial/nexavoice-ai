#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sesli Görev Asistanı - Offline Vosk Türkçe Dil Modeli İndirme ve Kurulum Scripti
Model: vosk-model-small-tr-0.3 (~45MB)
Hedef: android/app/src/main/assets/model-tr/
Gerekçe: Kaldi tabanlı Vosk, Android APK içine assets olarak gömülür.
Uygulama ilk açıldığında internetsiz olarak dahili belleğe açılır ve çalışır.
"""

import os
import sys
import urllib.request
import zipfile
import shutil

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip"
ZIP_NAME = "vosk-model-small-tr-0.3.zip"

def download_progress(block_num, block_size, total_size):
    downloaded = block_num * block_size
    if total_size > 0:
        percent = min(100.0, (downloaded / total_size) * 100.0)
        mb_down = downloaded / (1024 * 1024)
        mb_total = total_size / (1024 * 1024)
        sys.stdout.write(f"\rİndiriliyor: %{percent:.1f} ({mb_down:.1f} MB / {mb_total:.1f} MB)")
        sys.stdout.flush()

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_assets_dir = os.path.join(base_dir, "android", "app", "src", "main", "assets", "model-tr")
    www_assets_dir = os.path.join(base_dir, "www", "assets", "model-tr")
    temp_zip_path = os.path.join(base_dir, ZIP_NAME)

    print("====================================================")
    print("   VOSK TÜRKÇE OFFLINE MODEL KURULUM ARACI         ")
    print("====================================================")
    print(f"Model URL : {MODEL_URL}")
    print(f"Hedef APK Assets: {target_assets_dir}")

    os.makedirs(target_assets_dir, exist_ok=True)
    os.makedirs(www_assets_dir, exist_ok=True)

    # Model zaten kurulu mu kontrol et
    model_conf = os.path.join(target_assets_dir, "am")
    if os.path.exists(model_conf):
        print("\n[BİLGİ] Vosk Türkçe modeli zaten kurulu! İşlem atlanıyor.")
        return

    # İndirme
    if not os.path.exists(temp_zip_path):
        print(f"\nModel arşivi indiriliyor: {ZIP_NAME}...")
        try:
            urllib.request.urlretrieve(MODEL_URL, temp_zip_path, reporthook=download_progress)
            print("\nİndirme tamamlandı!")
        except Exception as e:
            print(f"\n[UYARI] Model otomatik indirilemedi (Offline ortam veya ağ kısıtlaması): {e}")
            print("Geliştirme / Test amaçlı yerel model iskeleti oluşturuluyor...")
            # Offline testler için boş model iskeleti oluştur
            for sub in ["am", "conf", "graph", "ivector"]:
                os.makedirs(os.path.join(target_assets_dir, sub), exist_ok=True)
            with open(os.path.join(target_assets_dir, "README.txt"), "w", encoding="utf-8") as f:
                f.write("Vosk Offline Türkçe Modeli (vosk-model-small-tr-0.3)\nAPK derlemeden önce ZIP içeriğini bu klasöre açın.")
            print(f"Placeholder hazırlandı: {target_assets_dir}")
            return

    # Arşiv Açma
    print(f"\nArşiv açılıyor: {temp_zip_path} -> {target_assets_dir}")
    try:
        extract_tmp = os.path.join(base_dir, "_model_temp")
        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_tmp)

        # Klasör içindeki alt klasörü model-tr'ye taşı
        subdirs = [os.path.join(extract_tmp, d) for d in os.listdir(extract_tmp) if os.path.isdir(os.path.join(extract_tmp, d))]
        source_dir = subdirs[0] if subdirs else extract_tmp

        for item in os.listdir(source_dir):
            s = os.path.join(source_dir, item)
            d = os.path.join(target_assets_dir, item)
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)

        # Vosk StorageService.unpack için gerekli uuid dosyasını yaz
        with open(os.path.join(target_assets_dir, "uuid"), "w", encoding="utf-8") as f:
            f.write("vosk-model-small-tr-0.3-v1\n")

        # Temizlik
        shutil.rmtree(extract_tmp, ignore_errors=True)
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)

        print(f"[BAŞARILI] Vosk Türkçe modeli hazır: {target_assets_dir}")

    except Exception as e:
        print(f"[HATA] Arşiv açılırken sorun oluştu: {e}")

if __name__ == "__main__":
    main()
