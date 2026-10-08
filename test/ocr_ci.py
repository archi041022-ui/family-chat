"""Проверка «Фото → текст» в настоящем браузере (запускается в GitHub Actions, где есть интернет)."""
import subprocess, sys, time, shutil, os
from playwright.sync_api import sync_playwright
os.makedirs("web/_ci", exist_ok=True)
shutil.copy("test/ocr-ci.html", "web/_ci/index.html")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8791", "-d", "web"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.on("console", lambda m: print("console:", m.text))
        pg.on("pageerror", lambda e: print("pageerror:", e))
        pg.goto("http://localhost:8791/_ci/index.html")
        # печатный текст, как на фото страницы (с лёгким наклоном и тенью)
        r = pg.evaluate("runOcr('/_ci/page.jpg')")
        print("OCR result:", r)
        low = r["text"].lower()
        assert "привет" in low and "мама" in low and "семья" in low, r
        print(f"::notice title=Фото в текст::«{r['text'][:80]!r}» за {r['ms']} мс")
        print("OCR OK")
        b.close()
finally:
    srv.terminate()
    shutil.rmtree("web/_ci", ignore_errors=True)
