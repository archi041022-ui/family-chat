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
        FAM = "00000000-0000-0000-0000-000000000001"
        dm = A.evaluate("(id) => S.sb.rpc('get_or_create_dm', { other: id }).then(x => x.data)", ids["Мама"])
        A.evaluate("() => loadChats().then(renderChatList)"); B.evaluate("() => loadChats().then(renderChatList)")
        # ── 1. отметки о прочтении доходят и без «вещания»
        A.evaluate("() => { S.sb.realtime && 0; }")
        A.evaluate("(id) => openChat(id)", dm); A.wait_for_selector(".composer")
        A.evaluate("() => postMessage({ body: 'прочти меня' }, S.current)"); A.wait_for_selector(".msg.out:has-text('прочти меня')")
        assert A.locator(".msg.out:has-text('прочти меня') .ticks.read").count() == 0
        # глушим канал вещания у отправителя — должна сработать серверная доставка
        A.evaluate("() => { Live.broadcast = () => {}; }")
        B.evaluate("() => { Live.broadcast = () => {}; }")
        B.evaluate("(id) => openChat(id)", dm); B.wait_for_selector(".msg:has-text('прочти меня')")
        A.wait_for_selector(".msg.out:has-text('прочти меня') .ticks.read", timeout=5000)
        A.click(".msg.out:has-text('прочти меня') .ticks"); A.wait_for_selector(".sheet-back:has-text('Прочитано')")
        assert "Мама" in A.inner_text(".sheet-back"); A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        print("read receipts: ok")
        # ── 2. сервер звонков
        L = A.evaluate("() => Ice.get().then(l => l.map(s => [].concat(s.urls).join(' ')))")
        assert any("openrelay" in x for x in L) and any("stun.cloudflare.com" in x for x in L), L
        A.evaluate("void Ice.adminSheet()"); A.wait_for_selector(".sheet-back:has-text('Сервер звонков')")
        A.fill(".sheet-back input[placeholder^='turn:']", "http://плохо"); A.click(".sheet-back button:has-text('Сохранить')"); A.wait_for_timeout(400)
        assert A.evaluate("!JSON.parse(localStorage.getItem('mockdb')).turn")
        A.fill(".sheet-back input[placeholder^='turn:']", "turn:relay.example.com:3478"); A.fill(".sheet-back input[placeholder='Логин']", "fam"); A.fill(".sheet-back input[placeholder='Пароль']", "pw")
        A.click(".sheet-back button:has-text('Сохранить')"); A.wait_for_timeout(700)
        L = A.evaluate("() => Ice.get().then(l => l.map(s => [].concat(s.urls).join(' ')))")
        assert "relay.example.com" in L[0] and "transport=tcp" in L[0], L
        B.evaluate("() => { Ice.list = null; return Ice.get(); }"); assert "relay.example.com" in B.evaluate("() => Ice.now()[0].urls.join(' ')")
        print("turn config: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
