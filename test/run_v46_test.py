"""v4.5 (часть 2): стекло при удалении, плавающее окно видеозвонка. Прежнее: ассистент Макс (команды, настройки, приветствие голосом) и видеоредактор (звук, кадр, разрезание)."""
import os, shutil, subprocess, time, sys
from playwright.sync_api import sync_playwright

ROOT = "/home/claude/family-chat"
T = "/tmp/fc-test"
OUT = "/tmp/fc-shots"
shutil.rmtree(T, ignore_errors=True); shutil.copytree(f"{ROOT}/web", T)
os.makedirs(f"{T}/vendor", exist_ok=True); os.makedirs(OUT, exist_ok=True)
shutil.copy(f"{ROOT}/test/mock-supabase.js", f"{T}/vendor/supabase.js")
# плитки карты в тесте не грузим из интернета
open(f"{T}/vendor/qrcode.js", "w").write("window.qrcode=()=>({addData(){},make(){},createDataURL(){const c=document.createElement('canvas');c.width=c.height=33;const x=c.getContext('2d');for(let i=0;i<33;i++)for(let j=0;j<33;j++)if((i*7+j*13)%5<2)x.fillRect(i,j,1,1);return c.toDataURL();}});")
open(f"{T}/config.js", "w").write(open(f"{ROOT}/web/config.js").read()
    .replace('supabaseUrl: ""', 'supabaseUrl: "https://mock"').replace('supabaseKey: ""', 'supabaseKey: "mock"'))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", T], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
URL = "http://localhost:8765/index.html"

def shot(page, name): page.screenshot(path=f"{OUT}/{name}.png")

def register(page, login, name, invite="SEMYA-4825"):
    page.goto(URL)
    page.click("text=Регистрация")
    page.fill("input[autocomplete=username]", login)
    page.fill("input[type=password]", "secret123")
    page.fill("input[autocomplete=name]", name)
    page.fill("input[placeholder='выдаёт создатель чата']", invite)
    page.click("button[type=submit]")

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, permissions=["camera", "microphone"], has_touch=True)
        ctx.add_init_script("window.__keepFamily = false")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A, B = ctx.new_page(), ctx.new_page()
        for nm, x in (("A", A), ("B", B)):
            x.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            x.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        for x, lg, nm in ((A, "papa", "Папа"), (B, "mama", "Мама")):
            register(x, lg, nm); x.wait_for_selector("#chatList", timeout=10000); x.wait_for_timeout(1200)
            x.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        # стекло: слой с осколками появляется, оригинал скрыт, промис завершается
        A.evaluate("""() => { const d = document.createElement('div'); d.id = 'tst'; d.textContent = 'Привет, семья'; d.style.cssText = 'position:fixed;left:40px;top:200px;width:220px;height:60px;background:#2b7;color:#fff;padding:8px;border-radius:12px;z-index:50'; document.body.append(d); window.__r = Shatter.run(d).then(() => window.__done = true); }""")
        A.wait_for_selector(".shatter-layer", timeout=2000)
        n = A.evaluate("document.querySelectorAll('.shatter-layer > *').length"); assert n >= 20, n
        assert A.evaluate("document.getElementById('tst').style.visibility") == "hidden"
        A.wait_for_function("window.__done === true", timeout=3000)
        shot(A, "v46_glass")
        A.wait_for_function("!document.querySelector('.shatter-layer')", timeout=5000)
        assert A.evaluate("FX.dust.toString().includes('Shatter')")
        print("стекло: ok")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        A.evaluate("(id) => void Calls.start(id, true)", ids["Мама"])
        B.wait_for_selector(".call.ringing", timeout=8000); B.click(".cbtn.green")
        A.wait_for_function("Calls.connected", timeout=20000); B.wait_for_function("Calls.connected", timeout=20000)
        for x in (A, B): x.wait_for_timeout(600)
        # окошко-превью: по умолчанию маленькое — своё; касание меняет местами
        assert not A.evaluate("document.querySelector('.call').classList.contains('swap')")
        box = A.locator(".call video.local").bounding_box(); assert box and box["width"] < 200, box
        A.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); A.wait_for_timeout(300)
        assert A.evaluate("document.querySelector('.call').classList.contains('swap')")
        small = A.locator(".call video.remote").bounding_box(); assert small and small["width"] < 200, small
        A.mouse.click(small["x"] + small["width"] / 2, small["y"] + small["height"] / 2); A.wait_for_timeout(300)
        assert not A.evaluate("document.querySelector('.call').classList.contains('swap')")
        print("переключение видео по касанию: ok")
        # перетаскивание к другому углу
        box = A.locator(".call video.local").bounding_box()
        sx, sy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        A.mouse.move(sx, sy); A.mouse.down(); A.mouse.move(sx - 250, sy + 450, steps=8); A.mouse.up(); A.wait_for_timeout(600)
        box2 = A.locator(".call video.local").bounding_box()
        assert abs(box2["x"] - box["x"]) > 40 or abs(box2["y"] - box["y"]) > 40, (box, box2)
        assert not A.evaluate("document.querySelector('.call').classList.contains('swap')")   # перетаскивание не переключает
        assert box2["x"] >= 0 and box2["x"] + box2["width"] <= 391 and box2["y"] + box2["height"] <= 801, box2
        shot(A, "v46_pip")
        print("перетаскивание окошка: ok")
        # положить трубку
        A.evaluate("Calls.hangup(true, 'hangup')"); B.wait_for_function("!Calls.ui", timeout=8000)
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
