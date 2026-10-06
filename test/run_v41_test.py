"""v4.1: громкая связь в звонке, плавные жесты."""
import os, shutil, subprocess, time, sys, json
from playwright.sync_api import sync_playwright

ROOT = "/home/claude/family-chat"
T = "/tmp/fc-test"
shutil.rmtree(T, ignore_errors=True); shutil.copytree(f"{ROOT}/web", T)
os.makedirs(f"{T}/vendor", exist_ok=True)
shutil.copy(f"{ROOT}/test/mock-supabase.js", f"{T}/vendor/supabase.js")
open(f"{T}/vendor/qrcode.js", "w").write("window.qrcode=()=>({addData(){},make(){},createDataURL(){return ''}});")
open(f"{T}/config.js", "w").write(open(f"{ROOT}/web/config.js").read()
    .replace('supabaseUrl: ""', 'supabaseUrl: "https://mock"').replace('supabaseKey: ""', 'supabaseKey: "mock"'))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", T], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
URL = "http://localhost:8765/index.html"

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
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        ctx.add_init_script("window.__noWelcome = true")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        # ── громкая связь
        A.evaluate("""() => { window.__spk = []; window.AndroidBridge = { callState() {}, cancelCall() {}, setSpeaker(on) { window.__spk.push(on); setTimeout(() => window.onSpeaker && window.onSpeaker(on, true), 20); } };
          Calls.peer = S.me.id; Calls.role = "caller"; Calls.video = false; Calls.showUi("Вызов…"); }""")
        A.wait_for_selector(".call .spk-btn")
        assert "Громкая" in A.inner_text(".call .controls")
        A.click(".call .spk-btn"); A.wait_for_timeout(300)
        assert A.evaluate("window.__spk") == [True] and A.evaluate("Calls.speaker === true")
        assert A.evaluate("document.querySelector('.call .spk-btn').classList.contains('off')")
        A.click(".call .spk-btn"); A.wait_for_timeout(300)
        assert A.evaluate("window.__spk") == [True, False] and A.evaluate("Calls.speaker === false")
        A.click(".call .spk-btn"); A.wait_for_timeout(300)
        A.evaluate("Calls.reset()"); assert A.evaluate("Calls.speaker") is False
        print("speaker: ok")
        # ── в браузере (нет моста) кнопки нет
        A.evaluate("() => { window.AndroidBridge = undefined; Calls.peer = S.me.id; Calls.role = 'caller'; Calls.showUi('Вызов…'); }")
        A.wait_for_selector(".call .controls"); assert A.locator(".call .spk-btn").count() == 0
        A.evaluate("Calls.reset()")
        # ── плавность: жест выбора папки идёт через transform3d/rAF и не оставляет хвостов
        A.evaluate("() => { showTab('chats'); S.folder = 'all'; renderChatList(); }")
        A.evaluate("""() => { const b = document.querySelector('#tabChats'); window.__tx = []; new MutationObserver(() => window.__tx.push(b.style.transform)).observe(b, { attributes: true, attributeFilter: ['style'] }); }""")
        cdp = ctx.new_cdp_session(A)
        def drag(dx):
            y = 400; x0 = 300 if dx < 0 else 90
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
            for i in range(1, 11):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + dx * i / 10, "y": y}]}); A.wait_for_timeout(16)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); A.wait_for_timeout(450)
        drag(-200); assert A.evaluate("S.folder") == "personal", A.evaluate("S.folder")
        tx = A.evaluate("window.__tx"); assert any("translate3d" in t for t in tx), tx[:5]
        assert A.evaluate("document.querySelector('#tabChats').style.transform") == ""
        drag(200); assert A.evaluate("S.folder") == "all"
        print("smooth swipe: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
