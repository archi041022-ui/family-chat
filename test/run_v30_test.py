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
        A = ctx.new_page(); B = ctx.new_page()
        A = ctx.new_page(); B = ctx.new_page(); C = ctx.new_page()
        ctx.route("https://api.github.com/**", lambda r: r.abort())
        BR = """(() => { if (!/index/.test(location.pathname)) return;
          window.AndroidBridge = { fg: sessionStorage.getItem('bgStart') ? false : %s, isForeground() { return this.fg; }, notify() {}, loggedIn() {}, loggedOut() {}, takeShared() { return ''; } }; })()"""
        B.add_init_script(BR % "true"); C.add_init_script(BR % "true")
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        on = lambda pg, name: pg.evaluate("(id) => S.online.has(id)", ids[name])
        A.wait_for_function("(id) => S.online.has(id)", arg=ids["Мама"], timeout=5000)
        A.click("#tabBtnContacts"); A.wait_for_selector("#tabContacts .contact-row:has-text('Мама') >> text=в сети")
        print("open app → online: ok")
        # 1) Мама свернула приложение — через ~2.5 с у Папы «был(а) только что»
        B.evaluate("AndroidBridge.fg = false; window.onAppBackground()")
        A.wait_for_timeout(1200); assert on(A, "Мама"), "мигание: офлайн сразу при кратком сворачивании"
        A.wait_for_function("(id) => !S.online.has(id)", arg=ids["Мама"], timeout=5000)
        A.wait_for_selector("#tabContacts .contact-row:has-text('Мама') >> text=был(а) только что", timeout=5000)
        shot(A, "p1_mama_offline"); print("background → offline: ok")
        # 2) вернулась — снова в сети
        B.evaluate("AndroidBridge.fg = true; window.onAppForeground()")
        A.wait_for_function("(id) => S.online.has(id)", arg=ids["Мама"], timeout=5000); print("foreground → online: ok")
        # 3) короткое сворачивание (выбор фото, разрешение) — не мигает
        B.evaluate("AndroidBridge.fg = false; window.onAppBackground()"); B.wait_for_timeout(800)
        B.evaluate("AndroidBridge.fg = true; window.onAppForeground()"); A.wait_for_timeout(3500)
        assert on(A, "Мама"); print("short switch, no flicker: ok")
        # 4) экран чата: подзаголовок
        A.click("#tabContacts .contact-row:has-text('Мама')"); A.wait_for_selector("#chatSub >> text=в сети")
        B.evaluate("AndroidBridge.fg = false; window.onAppBackground()")
        A.wait_for_selector("#chatSub >> text=был(а)", timeout=6000); print("chat subtitle: ok")
        A.click(".back-btn")
        # 5) страница, запущенная фоновой службой (телефон перезагрузили, приложение не открывали) — не в сети
        C.evaluate("sessionStorage.setItem('bgStart', '1')"); C.reload(); C.wait_for_selector("#chatList .chat-item"); A.wait_for_timeout(1500)
        assert not on(A, "Сын"), "служба в фоне показывает «в сети»"
        assert C.evaluate("AndroidBridge.isForeground()") is False
        C.evaluate("sessionStorage.removeItem('bgStart'); AndroidBridge.fg = true; window.onAppForeground()")
        A.wait_for_function("(id) => S.online.has(id)", arg=ids["Сын"], timeout=5000); print("background service page: ok")
        # 6) выход из аккаунта — сразу не в сети
        C.evaluate("S.tab === 'menu' || showTab('menu')"); C.click("#tabMenu .mn-tile:has-text('Настройки')"); C.click("#tabSettings >> text=Выйти"); C.click(".sheet .menu-item.danger")
        A.wait_for_function("(id) => !S.online.has(id)", arg=ids["Сын"], timeout=5000); print("logout → offline: ok")
        # 7) браузер: вкладку скрыли
        B.evaluate("AndroidBridge.fg = true; window.onAppForeground()")
        A.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
        B.wait_for_function("(id) => !S.online.has(id)", arg=ids["Папа"], timeout=6000)
        A.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))")
        B.wait_for_function("(id) => S.online.has(id)", arg=ids["Папа"], timeout=6000); print("browser tab hidden/visible: ok")
        # 8) старые версии приложения (без отметки) по-прежнему считаются «в сети»
        assert A.evaluate("[...onlineFrom({ a: [{}], b: [{ active: false }], c: [{ active: false }, { active: true }] })].sort().join()") == "a,c"
        print("compat: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
