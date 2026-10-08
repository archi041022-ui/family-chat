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
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True, reduced_motion="reduce")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000); A.wait_for_timeout(1000)
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        assert A.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
        A.click("#chatList >> text=Семья"); A.wait_for_selector(".composer .send")
        # фон-фото подстраивается под экран и не растягивается на длину переписки
        A.evaluate("""async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 800, 400);
          const blob = await new Promise(r => c.toBlob(r, 'image/png')); await Store.set(Wallpaper.key('default'), blob); Wallpaper.urls.clear(); Prefs.set('wp_default', 'photo'); await Wallpaper.apply(S.current); }""")
        A.evaluate("() => { for (let i = 0; i < 25; i++) { const d = document.createElement('div'); d.style.height = '60px'; d.className = 'filler'; document.querySelector('#msgs').append(d); } }")
        st = A.evaluate("() => { const m = document.querySelector('#msgs'), s = getComputedStyle(m); return [s.backgroundAttachment, s.backgroundSize, m.classList.contains('wp-photo')]; }")
        assert st[0].startswith("scroll") and "cover" in st[1] and st[2], st
        A.evaluate("document.querySelectorAll('.filler').forEach(e => e.remove())")
        assert A.evaluate("Maks.addressed('Мокс открой настройки') && Maks.addressed('max, привет') && !Maks.addressed('Максим')")
        assert A.evaluate("Maks.strip('Маск, открой настройки')") == "открой настройки"
        print("фон-фото под экран, варианты слова «Макс»: ok")
        A.fill("#input", "Удаляемое"); A.click(".composer .send"); A.wait_for_selector(".msg.out .text >> text=Удаляемое")
        shot(A, "v46_before"); A.click(".msg.out .bubble:has-text('Удаляемое')", button="right")
        A.click(".sheet >> text=Удалить у всех")
        A.wait_for_selector(".shatter-layer", timeout=3000)
        n = A.evaluate("document.querySelectorAll('.shatter-layer > *').length"); assert n >= 20, n
        A.wait_for_timeout(250); shot(A, "v46_msg_glass")
        A.wait_for_function("!document.querySelector('.shatter-layer')", timeout=5000)
        assert A.evaluate("!document.querySelector('.msg.out .text')|| ![...document.querySelectorAll('.msg .text')].some(t => /Удаляемое/.test(t.textContent))")
        print("стекло при удалении сообщения (одиночное, reduced-motion): ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
