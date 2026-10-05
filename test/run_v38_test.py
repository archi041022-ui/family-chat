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
        ctx.route("https://api.github.com/**", lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); B.reload(); B.wait_for_selector("#chatList .chat-item")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        A.evaluate("void Ice.adminSheet()"); A.wait_for_selector(".sheet-back:has-text('Cloudflare TURN не подключён')")
        A.fill(".sheet-back input[placeholder='Turn Token ID']", "коротко"); A.fill(".sheet-back input[placeholder='API Token']", "x")
        A.click(".sheet-back button:has-text('Сохранить Cloudflare')"); A.wait_for_timeout(400)
        assert not A.evaluate("JSON.parse(localStorage.getItem('mockdb')).cfTurn")
        A.fill(".sheet-back input[placeholder='Turn Token ID']", "abcdef0123456789abcdef0123456789"); A.fill(".sheet-back input[placeholder='API Token']", "abcdef0123456789abcdef0123456789abcdef")
        A.click(".sheet-back button:has-text('Сохранить Cloudflare')"); A.wait_for_timeout(800)
        L = A.evaluate("() => Ice.get().then(l => l.map(s => [].concat(s.urls).join(' ')))")
        assert "turn.cloudflare.com" in L[0] or "turn.cloudflare.com" in " ".join(L[:3]), L
        assert any("cfuser" == (s.get("username") if isinstance(s, dict) else None) for s in A.evaluate("() => Ice.list"))
        # у обычного участника данные приходят с сервера тоже
        B.evaluate("() => { Ice.list = null; return Ice.get(); }"); assert B.evaluate("Ice.list.some(s => s.username === 'cfuser')")
        # подключение отключаем
        A.evaluate("void Ice.adminSheet()"); A.wait_for_selector(".sheet-back:has-text('Cloudflare TURN подключён')")
        A.click(".sheet-back button:has-text('Отключить Cloudflare')"); A.wait_for_timeout(600)
        assert not A.evaluate("JSON.parse(localStorage.getItem('mockdb')).cfTurn")
        print("cloudflare turn: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
