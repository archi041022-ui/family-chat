"""v4.4: регистрация без общего чата, нет «Избранного», добавление людей в идущий звонок."""
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
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, permissions=["camera", "microphone"], has_touch=True)
        ctx.add_init_script("window.__keepFamily = false")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        pg = {k: ctx.new_page() for k in "ABC"}
        for nm, x in pg.items():
            x.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            x.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        A, B, C = pg["A"], pg["B"], pg["C"]
        for x, lg, nm in ((A, "papa", "Папа"), (B, "mama", "Мама"), (C, "deda", "Дед")):
            register(x, lg, nm); x.wait_for_selector("#chatList", timeout=10000); x.wait_for_timeout(1200)
        # без общего чата: ни в списке, ни в данных, ни в звонках
        for x in (A, B, C):
            assert x.evaluate("!S.chats.some(c => c.id === FAMILY_CHAT)")
            assert 'Семья' not in x.inner_text('#chatList') and 'Избранное' not in x.inner_text('#chatList')
        for x in (A, B, C): x.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        print("регистрация без общего чата: ok")
        # скрытие работает и у старых аккаунтов: общий чат лежит в базе, но не показывается
        A.evaluate("window.__keepFamily = true; loadChats().then(() => 0)"); A.wait_for_timeout(500)
        A.evaluate("window.__keepFamily = false; loadChats().then(() => renderChatList())"); A.wait_for_timeout(500)
        assert A.evaluate("!S.chats.some(c => c.id === FAMILY_CHAT)")
        # меню без «Избранного» и «Видеочата семьи»
        A.evaluate("showTab('menu')"); A.wait_for_selector("#tabMenu .mn-tile")
        lbls = A.evaluate("[...document.querySelectorAll('#tabMenu .mn-lbl')].map(e => e.textContent)")
        assert not any(("Избранное" in l or "Видеочат семьи" in l or l == "Семья") for l in lbls), lbls
        A.evaluate("showTab('chats')")
        print("меню: ok")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        # звонок один-на-один: Папа -> Маме
        A.evaluate("(id) => void Calls.start(id, true)", ids["Мама"])
        B.wait_for_selector(".call.ringing", timeout=8000); B.click(".cbtn.green")
        A.wait_for_function("Calls.connected", timeout=20000)
        # «Добавить» до соединения не нужен, а при соединении есть
        assert A.locator(".call .add-btn").count() == 1
        A.click(".call .add-btn")
        A.wait_for_selector(".sheet .people-pick label")
        names = A.evaluate("[...document.querySelectorAll('.sheet .people-pick label')].map(l => l.textContent.trim())")
        assert len(names) == 1 and "Дед" in names[0], names           # собеседника в списке нет
        A.click(".sheet .people-pick label"); A.click(".sheet .btn.wide:has-text('Позвать')")
        # Дед получает приглашение, Мама перешла в групповой видеочат вместе с Папой
        C.wait_for_selector(".gc-invite", timeout=10000)
        A.wait_for_function("GroupCall.active", timeout=10000); B.wait_for_function("GroupCall.active", timeout=10000)
        assert A.evaluate("!Calls.ui && !Calls.pc") and B.evaluate("!Calls.ui && !Calls.pc")
        C.click(".gc-invite .cbtn.green")
        C.wait_for_function("GroupCall.active", timeout=10000)
        for x in (A, B, C):
            x.wait_for_function("GroupCall.peers.size === 2", timeout=25000)
        print("добавление в звонок: ok")
        # в групповом звонке «Добавить» тоже есть, места считаются
        assert A.locator(".call .add-btn").count() == 1
        A.click(".call .add-btn"); A.wait_for_selector(".sheet .people-pick")
        assert A.locator(".sheet .people-pick label").count() == 0 and "Звать больше некого" in A.inner_text(".sheet .people-pick")
        A.keyboard.press("Escape")
        print("ERRORS-section: done")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
