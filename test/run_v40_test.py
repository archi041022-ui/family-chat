"""v3.9: оповещения на iPhone и в браузерах (Web Push): подписка, служба оповещений, переход в чат."""
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
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); B.reload(); B.wait_for_selector("#chatList .chat-item")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        dm = A.evaluate("(id) => S.sb.rpc('get_or_create_dm', { other: id }).then(x => x.data)", ids["Мама"])
        A.evaluate("() => loadChats().then(renderChatList)"); B.evaluate("() => loadChats().then(renderChatList)")
        B.evaluate("() => { window.__cb = []; Calls.start = (id, v) => window.__cb.push([id, v]); }")

        # ── 1. пропущенный звонок: плашка с кнопкой, кнопка в переписке и во вкладке «Звонки»
        A.evaluate("(id) => postMessage({ body: '📞 Видеозвонок: без ответа' }, id)", dm)
        B.wait_for_selector(".toast.missed:has-text('Перезвонить')")
        B.click(".toast.missed button"); B.wait_for_timeout(200)
        assert B.evaluate("window.__cb") == [[ids["Папа"], True]], B.evaluate("window.__cb")
        B.evaluate("(id) => openChat(id)", dm); B.wait_for_selector(".msg.call-log .cb-btn")
        B.click(".msg.call-log .cb-btn"); B.wait_for_timeout(200)
        assert B.evaluate("window.__cb").__len__() == 2
        # у того, кто звонил, кнопки «Перезвонить» нет (он сам позвонил)
        A.evaluate("(id) => openChat(id)", dm); A.wait_for_selector(".msg.call-log")
        assert A.locator(".msg.call-log .cb-btn").count() == 0
        # принятый звонок — без кнопки
        A.evaluate("(id) => postMessage({ body: '📞 Звонок, 0:42' }, id)", dm); B.wait_for_selector(".msg.call-log:has-text('0:42')")
        assert B.locator(".msg.call-log:has-text('0:42') .cb-btn").count() == 0
        B.evaluate("() => { if (S.current) closeChat(); showTab('calls'); }"); B.wait_for_selector("#tabCalls .call-row.missed .cb-btn")
        B.click("#tabCalls .call-row.missed .cb-btn"); B.wait_for_timeout(200)
        assert B.evaluate("window.__cb").__len__() == 3
        print("callback: ok")

        # ── 2. свайп по папкам: Все → Личные → Группы → Непрочитанные → (край) Контакты
        B.evaluate("() => { closeChat && S.current && closeChat(); showTab('chats'); S.folder = 'all'; renderChatList(); }")
        B.wait_for_selector("#folders button.on:has-text('Все')")
        def swipe(page, dx):
            page.evaluate("""(dx) => {
              const el = document.querySelector('#chatItems .chat-item') || document.querySelector('#chatList');
              const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
              const fire = (type, x, y, list) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, changedTouches: [mk(x, y)] }));
              const x0 = dx < 0 ? 300 : 90, y0 = 420;
              fire('touchstart', x0, y0, [mk(x0, y0)]);
              for (let i = 1; i <= 6; i++) fire('touchmove', x0 + dx * i / 6, y0 + 2, [mk(x0 + dx * i / 6, y0 + 2)]);
              fire('touchend', x0 + dx, y0 + 2, []);
            }""", dx)
            page.wait_for_timeout(350)
        folder = lambda: B.evaluate("S.folder || 'all'")
        swipe(B, -200); assert folder() == "personal", folder()
        B.wait_for_selector("#folders button.on:has-text('Личные')")
        swipe(B, -200); assert folder() == "groups", folder()
        swipe(B, -200); assert folder() == "unread", folder()
        swipe(B, 200); assert folder() == "groups", folder()
        swipe(B, 200); swipe(B, 200); assert folder() == "all", folder()
        # с края «Все» вправо — к Меню; с «Непрочитанные» влево — к Контактам
        swipe(B, 200); assert B.evaluate("S.tab") == "menu", B.evaluate("S.tab")
        B.evaluate("() => { showTab('chats'); S.folder = 'unread'; renderChatList(); }"); B.wait_for_timeout(200)
        swipe(B, -200); assert B.evaluate("S.tab") == "contacts", B.evaluate("S.tab")
        print("folder swipe: ok")

        # ── 3. контакты: нет доступа / пусто / системное окно
        A.evaluate("""() => { window.__settings = 0; window.AndroidBridge = { loadContacts() { setTimeout(() => window.onContactsList(null, 'denied'), 30); },
          openAppSettings() { window.__settings++; }, shareText(t) { window.__share = t; } }; void Invite.fromContacts('SEMYA-4825'); }""")
        A.wait_for_selector(".sheet-back:has-text('Контакты недоступны')")
        assert "Разрешите" in A.inner_text(".sheet-back")
        A.click(".sheet-back button:has-text('Открыть настройки приложения')"); A.wait_for_timeout(200)
        assert A.evaluate("window.__settings") == 1
        A.evaluate("() => { document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close()); void Invite.fromContacts('SEMYA-4825'); }")
        A.wait_for_selector(".sheet-back:has-text('Контакты недоступны')")
        assert A.locator(".sheet-back button:has-text('Выбрать через окно телефона')").count() == 0   # системное окно (вешало телефон) убрано
        A.click(".sheet-back button:has-text('Отправить через другое приложение')"); A.wait_for_timeout(300)
        assert "SEMYA-4825" in (A.evaluate("window.__share") or ""), A.evaluate("window.__share")
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        # пустой список
        A.evaluate("""() => { window.AndroidBridge.loadContacts = () => setTimeout(() => window.onContactsList([]), 30); void Invite.fromContacts('SEMYA-4825'); }""")
        A.wait_for_selector(".sheet-back:has-text('не увидело в телефоне контактов')")
        assert A.locator(".sheet-back button:has-text('Открыть настройки приложения')").count() == 0
        print("contacts fallback: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
