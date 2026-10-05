"""Сквозная проверка интерфейса на тестовом сервере: регистрация, чаты, реакции, фото, звонок."""
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
        ctx = b.new_context(viewport={"width": 390, "height": 800}, permissions=["camera", "microphone"])
        ctx.add_init_script("window.__noWelcome = true")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"A console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        def swipe(pg, sel, dx, dy=0, x0=200, y0=400):
            pg.evaluate("""([sel, dx, dy, x0, y0]) => { const el = document.querySelector(sel);
              const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
                el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
              mk('touchstart', x0, y0); mk('touchmove', x0 + dx / 2, y0 + dy / 2); mk('touchmove', x0 + dx, y0 + dy); mk('touchend', x0 + dx, y0 + dy); }""", [sel, dx, dy, x0, y0])
            A.wait_for_timeout(450)
        for dx in (180, -180):
            A.evaluate("void Camera.open('doc')"); A.wait_for_selector(".camera")
            swipe(A, ".camera", dx); assert A.evaluate("!document.querySelector('.camera') && !Camera.el"), dx
        print("camera swipe: ok")
        A.evaluate("void Camera.open('doc')"); A.wait_for_selector(".camera")
        A.evaluate("""() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#333'; x.fillRect(0,0,400,300); x.fillStyle = '#fff'; x.fillRect(60,40,280,220); Camera.got(c); }""")
        A.wait_for_selector(".scan-editor")
        swipe(A, ".scan-editor", 180); assert A.evaluate("!document.querySelector('.scan-editor')") and A.evaluate("!!document.querySelector('.camera')")
        print("editor swipe back to camera: ok")
        A.evaluate("() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; Camera.got(c); }"); A.wait_for_selector(".scan-editor")
        swipe(A, ".scan-quad", 180); assert A.evaluate("!!document.querySelector('.scan-editor')")   # тянем угол — не выходим
        swipe(A, ".scan-editor .scan-title", -180); assert A.evaluate("!document.querySelector('.scan-editor')")
        Camera_close = A.evaluate("Camera.close()")
        # ── блокировка не срабатывает после короткого выхода во внешнее окно
        A.evaluate("() => { Lock.enabled = () => true; Lock.delay = () => 0; Lock.ext = true; Lock.onBg(); Lock.onFg(); }")
        assert A.evaluate("!document.querySelector('.lock-screen') && Lock.ext === false")
        # контакт: колбэк срабатывает и сбрасывает флаг; отмена тоже
        A.evaluate("() => { window.AndroidBridge = { pickContact() { setTimeout(() => window.onContactPicked(null), 50); } }; void Invite.fromContacts('SEMYA-4825'); }")
        A.wait_for_timeout(500); assert A.evaluate("Lock.ext === false && window.onContactPicked === null")
        A.evaluate("() => { window.AndroidBridge = { pickContact() { setTimeout(() => window.onContactPicked({ name: 'Анна Т', phone: '8 900 111-22-33' }), 50); } }; void Invite.fromContacts('SEMYA-4825'); }")
        A.wait_for_selector(".sheet-back"); assert "Анна" in A.inner_text(".sheet-back")
        print("contact flow: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
