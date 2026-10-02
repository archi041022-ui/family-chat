"""Проверка расшифровки голосовых в настоящем браузере (запускается в GitHub Actions, где есть интернет)."""
import subprocess, sys, time, shutil, os
from playwright.sync_api import sync_playwright
os.makedirs("web/_ci", exist_ok=True)
shutil.copy("test/stt-ci.html", "web/_ci/index.html")
shutil.copy("/tmp/speech.webm", "web/_ci/speech.webm")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8790", "-d", "web"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.on("console", lambda m: print("console:", m.text))
        pg.goto("http://localhost:8790/_ci/index.html")
        r = pg.evaluate("runStt('/_ci/speech.webm')")
        print("STT result:", r)
        words = ["привет", "мама", "дела", "семья", "как"]
        assert any(w in r["text"].lower() for w in words), r
        print(f"::notice title=Расшифровка голосовых::«{r['text']}» за {r['ms']} мс")
        print("STT OK")
        b.close()
finally:
    srv.terminate()
    shutil.rmtree("web/_ci", ignore_errors=True)
