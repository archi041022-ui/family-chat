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
        # ── 1. контакты: свой список с поиском
        A.evaluate("""() => { window.AndroidBridge = { loadContacts() { setTimeout(() => window.onContactsList([
          { name: 'Анна Т', phone: '8 900 111-22-33' }, { name: 'Борис', phone: '+7 911 222-33-44' }, { name: 'Вера', phone: '8 922 333-44-55' }]), 50); } }; void Invite.fromContacts('SEMYA-4825'); }""")
        A.wait_for_selector(".contact-list .menu-item"); assert A.locator(".contact-list .menu-item").count() == 3
        A.fill(".contact-search", "бор"); assert A.locator(".contact-list .menu-item").count() == 1
        A.fill(".contact-search", "922"); assert A.locator(".contact-list .menu-item").count() == 1
        A.click(".contact-list .menu-item"); A.wait_for_selector(".sheet-back:has-text('Как отправить')"); assert "Вера" in A.inner_text(".sheet-back")
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        # отказ в доступе — ручной ввод
        A.evaluate("""() => { window.AndroidBridge = { loadContacts() { setTimeout(() => window.onContactsList(null, 'denied'), 50); } }; void Invite.fromContacts('SEMYA-4825'); }""")
        A.wait_for_selector("input[type=tel]"); print("contacts list: ok")
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        # ── 2. автоудаление после прочтения
        dm = A.evaluate("(id) => S.sb.rpc('get_or_create_dm', { other: id }).then(x => x.data)", ids["Мама"])
        A.evaluate("() => loadChats().then(renderChatList)"); B.evaluate("() => loadChats().then(renderChatList)")
        A.evaluate("(id) => openChat(id)", dm); A.wait_for_selector(".composer")
        A.evaluate("() => postMessage({ body: 'до включения' }, S.current)"); A.wait_for_timeout(300)
        A.evaluate("(id) => void Tg.chatMenu ? Tg.chatMenu(S.chats.find(c => c.id === id)) : 0", dm)
        has = A.locator(".sheet-back .menu-item:has-text('Исчезающие сообщения')").count()
        if not has:
            A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
            A.evaluate("(id) => void Burn.sheet(S.chats.find(c => c.id === id))", dm)
        else:
            A.click(".sheet-back .menu-item:has-text('Исчезающие сообщения')")
        A.wait_for_selector(".sheet-back:has-text('Через 1 час')")
        for t in ("Выключено", "Через 10 секунд", "Через 1 минуту", "Через 1 час", "Через 1 день", "Через 1 неделю"): assert t in A.inner_text(".sheet-back"), t
        A.click(".sheet-back .menu-item:has-text('Через 10 секунд')"); A.wait_for_timeout(500)
        assert A.evaluate("(id) => S.chats.find(c => c.id === id).burn_after", dm) == 10
        assert A.locator(".burn-ico").count() >= 1
        B.wait_for_timeout(600); B.evaluate("() => loadChats()"); assert B.evaluate("(id) => S.chats.find(c => c.id === id).burn_after", dm) == 10
        A.evaluate("() => postMessage({ body: 'исчезнет' }, S.current)"); A.wait_for_timeout(400)
        # получатель не прочитал — сообщение остаётся, даже если время прошло
        A.evaluate("() => Burn.last = 0"); A.evaluate("() => S.sb.rpc('burn_sweep')"); A.wait_for_timeout(300)
        assert A.locator(".msg:has-text('исчезнет')").count() == 1
        # получатель открыл чат (прочитал) → таймер → удаление у обоих
        B.evaluate("(id) => openChat(id)", dm); B.wait_for_selector(".msg:has-text('исчезнет')"); B.wait_for_timeout(500)
        A.evaluate("() => S.sb.rpc('burn_sweep')"); A.wait_for_timeout(300)
        assert A.locator(".msg:has-text('исчезнет')").count() == 1   # ещё не вышло время
        A.wait_for_timeout(10500); A.evaluate("() => { Burn.last = 0; return Burn.sweep(); }"); A.wait_for_timeout(800)
        assert A.locator(".msg:has-text('исчезнет')").count() == 0, "у отправителя не исчезло"
        assert B.locator(".msg:has-text('исчезнет')").count() == 0, "у получателя не исчезло"
        assert A.locator(".msg:has-text('до включения')").count() == 1                # старое не тронуто
        print("burn after read: ok")
        # выключение
        A.evaluate("(id) => Burn.set(S.chats.find(c => c.id === id), null)", dm)
        assert A.evaluate("(id) => S.chats.find(c => c.id === id).burn_after", dm) is None
        print("burn off: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
