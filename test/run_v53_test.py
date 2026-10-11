"""v4.14: голосовые слышно после звонков (обычный режим звука), устаревшие ссылки на голосовые обновляются сами."""
import os, shutil, subprocess, time, sys
from playwright.sync_api import sync_playwright
ROOT = "/home/claude/family-chat"; T = "/tmp/fc-test"; OUT = "/tmp/fc-shots"
shutil.rmtree(T, ignore_errors=True); shutil.copytree(f"{ROOT}/web", T)
os.makedirs(f"{T}/vendor", exist_ok=True); os.makedirs(OUT, exist_ok=True)
shutil.copy(f"{ROOT}/test/mock-supabase.js", f"{T}/vendor/supabase.js")
open(f"{T}/vendor/qrcode.js", "w").write("window.qrcode=()=>({addData(){},make(){},createDataURL(){return ''}});")
open(f"{T}/config.js", "w").write(open(f"{ROOT}/web/config.js").read().replace('supabaseUrl: ""', 'supabaseUrl: "https://mock"').replace('supabaseKey: ""', 'supabaseKey: "mock"'))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", T], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); URL = "http://localhost:8765/index.html"; errors = []
def register(page, login, name):
    page.goto(URL); page.click("text=Регистрация")
    page.fill("input[autocomplete=username]", login); page.fill("input[type=password]", "secret123")
    page.fill("input[autocomplete=name]", name); page.fill("input[placeholder='выдаёт создатель чата']", "SEMYA-4825"); page.click("button[type=submit]")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, permissions=["microphone"])
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"): ctx.route(host, lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000)
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList", timeout=10000); B.wait_for_timeout(1000)
        B.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        B.evaluate("openDm([...S.profiles.values()].find(p => p.name === 'Папа').id)"); B.wait_for_selector("#input")
        B.evaluate("Voice.start(document.querySelector('.composer'))"); B.wait_for_function("!!Voice.cancel", timeout=5000)
        B.wait_for_timeout(2500); B.click(".composer .send")
        B.wait_for_selector(".msg audio", timeout=8000)
        A.wait_for_timeout(1500); A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        A.evaluate("openDm([...S.profiles.values()].find(p => p.name === 'Мама').id)"); A.wait_for_selector(".msg audio", timeout=8000)
        info = A.evaluate("""async () => { const a = document.querySelector('.msg audio'); const src = a.currentSrc || a.src;
          try { await a.play(); } catch (e) { return 'play error: ' + e.message + ' src=' + src.slice(0,60); }
          await new Promise(r => setTimeout(r, 1200)); return { t: a.currentTime, paused: a.paused, err: a.error && a.error.code, dur: a.duration, src: src.slice(0, 40) }; }""")
        print("A plays:", info)
        A.evaluate("window.__an = 0; window.AndroidBridge = Object.assign(window.AndroidBridge || {}, { audioNormal() { window.__an++; } })")
        r2 = A.evaluate("""async () => { const a = document.querySelector('.msg audio'); a.pause();
          a.dataset.wantPlay = '1'; a.src = 'http://localhost:8765/expired.webm'; a.load();
          await new Promise(r => setTimeout(r, 2000)); try { await a.play(); } catch {}
          await new Promise(r => setTimeout(r, 800));
          return { src: (a.currentSrc||'').slice(0,20), t: a.currentTime, paused: a.paused, an: window.__an }; }""")
        print("expired link recovers:", r2)
        A.screenshot(path=f"{OUT}/voice.png")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
