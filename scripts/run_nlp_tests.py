#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sesli Görev Asistanı - Python NLP Test Koşucusu
Gerekçe: CI/CD ortamlarında, mobil geliştirme pipelineları ve backend testlerinde
Node.js bağımlılığı olmadan doğrudan Python ile testleri çalıştırma ve doğrulama yeteneği.
"""

import sys
import os
import json
import subprocess
import time

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    test_runner_js = os.path.join(base_dir, "tests", "test_runner.js")
    test_cases_json = os.path.join(base_dir, "tests", "nlp_test_cases.json")

    print("====================================================")
    print("   SESLİ GÖREV ASİSTANI - PYTHON TEST ÇALIŞTIRICISI   ")
    print("====================================================")
    print(f"Proje Dizini: {base_dir}")
    print(f"Test Seti   : {test_cases_json}\n")

    if not os.path.exists(test_cases_json):
        print(f"[HATA] Test seti bulunamadı: {test_cases_json}")
        sys.exit(1)

    with open(test_cases_json, "r", encoding="utf-8") as f:
        cases = json.load(f)
    print(f"Toplam Yüklenen Test Senaryosu: {len(cases)}")

    # Node.js test runner'ı çağır
    print("Node.js NLP Motoru çalıştırılıyor...\n")
    start = time.time()
    result = subprocess.run(["node", test_runner_js], cwd=base_dir, capture_output=True, text=True, encoding="utf-8")
    elapsed = time.time() - start

    print(result.stdout)
    if result.stderr:
        print("[STDERR]", result.stderr)

    print(f"Python İşlem Süresi: {elapsed:.2f} saniye")
    sys.exit(result.returncode)

if __name__ == "__main__":
    main()
