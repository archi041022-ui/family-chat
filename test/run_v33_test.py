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
        NOTO = open("/tmp/fc-ve/noto.gif", "rb").read()
        ctx.route("https://fonts.gstatic.com/**", lambda r: r.fulfill(status=200, content_type="image/gif", body=NOTO))
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); B.reload(); B.wait_for_selector("#chatList .chat-item")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        FAM = "00000000-0000-0000-0000-000000000001"
        menu = lambda pg, tile: (pg.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())"), pg.evaluate("S.tab === 'menu' || showTab('menu')"), pg.click(f"#tabMenu .mn-tile:has-text('{tile}')"))
        A.wait_for_selector(f"#chatItems .chat-item[data-chat='{FAM}']")
        CLOSE = "document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())"
        # свайп пальцем: синтетические touch-события на элементе
        def swipe(pg, sel, dx, dy=0, x0=200, y0=400):
            pg.evaluate("""([sel, x0, y0, dx, dy]) => {
              const el = document.querySelector(sel); if (!el) throw new Error('no element ' + sel); const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
                el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
              mk('touchstart', x0, y0); for (let i = 1; i <= 6; i++) mk('touchmove', x0 + dx * i / 6, y0 + dy * i / 6); mk('touchend', x0 + dx, y0 + dy); }""", [sel, x0, y0, dx, dy])
            pg.wait_for_timeout(450)
        tab = lambda pg: pg.evaluate("S.tab")
        # ── 1. свайп между разделами: Меню ↔ Чаты ↔ Контакты ↔ Звонки
        assert tab(A) == "chats"
        for f in ("personal", "groups", "unread"):                       # в «Чатах» свайп сначала листает папки
            swipe(A, "#chatList", -180); assert tab(A) == "chats" and A.evaluate("S.folder") == f, (tab(A), A.evaluate("S.folder"))
        swipe(A, "#chatList", -180); assert tab(A) == "contacts", tab(A)
        swipe(A, "#tabContacts", -180); assert tab(A) == "calls", tab(A)
        swipe(A, "#tabCalls", -180); assert tab(A) == "calls"            # дальше раздела нет
        swipe(A, "#tabCalls", 180); assert tab(A) == "contacts"
        swipe(A, "#tabContacts", 180); assert tab(A) == "chats"
        A.evaluate("() => { S.folder = 'all'; renderChatList(); }")
        swipe(A, "#chatList", 180); assert tab(A) == "menu", tab(A)
        swipe(A, "#tabMenu", 180); assert tab(A) == "menu"               # левее меню разделов нет
        swipe(A, "#tabMenu", -180); assert tab(A) == "chats"
        swipe(A, "#chatList", -30); assert tab(A) == "chats"             # короткое движение — не переход
        swipe(A, "#chatList", -60, 200); assert tab(A) == "chats"        # больше вертикальное — прокрутка списка
        swipe(A, "#storyStrip", -200); assert tab(A) == "chats"          # лента историй листается сама
        swipe(A, "#folders", -200); assert tab(A) == "chats"             # папки — тоже
        A.evaluate("void sheet([h('p', null, 'окно')])"); swipe(A, ".sheet", -200); assert tab(A) == "chats"; A.evaluate(CLOSE)
        shot(A, "w1_swipe")
        print("swipe sections: ok")
        # ── 2. значки меню: округлые
        A.evaluate("showTab('menu')")
        st = A.evaluate("(() => { const s = getComputedStyle(document.querySelector('#tabMenu .mn-ico')); return [s.borderRadius, s.width, s.backgroundImage.includes('gradient')]; })()")
        assert st[0] in ("50%", "23px") and st[1] == "46px" and st[2], st
        A.wait_for_timeout(700); shot(A, "w2_menu_icons"); print("menu icons: ok")
        # ── 3. настройки администратора — только администратору
        A.evaluate("Menu.render()"); B.evaluate("showTab('menu')"); B.wait_for_timeout(400)
        for t in ("Участники", "Сброс пароля", "Мгновенные оповещения", "GIF: ключ GIPHY"):
            assert A.locator(f"#tabMenu .mn-tile:has-text('{t}')").count() == 1, t
            assert B.locator(f"#tabMenu .mn-tile:has-text('{t}')").count() == 0, t
        assert B.locator("#tabMenu .mn-cap:has-text('Администратор')").count() == 0
        for fn in ("membersAdmin()", "adminResetSheet()", "Gifs.adminSheet()", "FcmSetup.sheet().then(() => 0)"):
            B.evaluate(fn); B.wait_for_timeout(250)
        assert B.evaluate("[...document.querySelectorAll('.sheet-back')].every(s => !/Участник|Сброс|GIPHY/.test(s.textContent) || /только администратору/.test(s.textContent))")
        B.evaluate(CLOSE)
        assert B.evaluate("S.sb.rpc('set_gif_key', { k: 'a'.repeat(32) }).then(r => r.data)") == "NOT_ADMIN"
        assert A.evaluate("S.sb.rpc('set_gif_key', { k: 'плохой ключ' }).then(r => r.data)") == "BAD_KEY"
        A.evaluate("Gifs.adminSheet()"); A.wait_for_selector(".sheet >> text=GIPHY не подключён")
        A.fill(".sheet .gif-q", "a1B2c3D4e5F6g7H8i9J0"); A.click(".sheet .btn.wide:has-text('Сохранить ключ')"); A.wait_for_timeout(500)
        assert A.evaluate("S.sb.rpc('gif_status').then(r => r.data)") is True and B.evaluate("S.sb.rpc('gif_status').then(r => r.data)") is False
        A.evaluate(CLOSE); print("admin only: ok")
        # ── 4. обновление: подсветка до установки
        for pg in (A, B): pg.evaluate("window.AndroidBridge = Object.assign(window.AndroidBridge || {}, { updateNotice(v) { window.__un = v; }, updateClear() { window.__uc = (window.__uc || 0) + 1; } })")
        A.evaluate("Updates.latest = { build: 99, version: '3.9', url: 'https://x/Semya.apk' }; Updates.paint()")
        assert A.evaluate("document.querySelector('#tabBtnMenu').classList.contains('upd-glow')")
        assert A.evaluate("window.__un") == "3.9" and A.evaluate("localStorage.getItem('updPending')") == "99"
        A.wait_for_selector("#tabMenu .mn-tile.glow:has-text('Обновить')"); shot(A, "w3_update_glow")
        A.evaluate("Updates.latest = null; Updates.paint()")
        assert not A.evaluate("document.querySelector('#tabBtnMenu').classList.contains('upd-glow')") and A.evaluate("window.__uc") >= 1
        A.evaluate("localStorage.setItem('updPending', '5'); Updates.own = { build: 9, version: '3.3' }; window.__uc = 0; Updates.start()"); A.wait_for_timeout(500)
        assert A.evaluate("window.__uc") == 1 and A.evaluate("localStorage.getItem('updPending')") is None     # поставили — погасло
        print("update glow: ok")
        # ── 5. GIF: найти, скачать в «Мои», добавить свой, отправить
        A.evaluate("showTab('chats')"); A.evaluate(f"openChat('{FAM}')"); A.wait_for_selector("#chatView .composer")
        A.click(".emoji-btn"); A.click(".emoji-tabs button:has-text('GIF')"); A.wait_for_selector(".gif-grid .gif-cell")
        assert A.locator(".gif-grid .gif-cell").count() == 14; shot(A, "w4_gif_find")
        A.click(".gif-cats button:has-text('Смех')"); A.wait_for_function("window.__gifCalls.some(c => c.q === 'laughing')")
        A.fill(".gif-q", "котики"); A.press(".gif-q", "Enter"); A.wait_for_function("window.__gifCalls.some(c => c.q === 'котики')")
        A.wait_for_selector(".gif-grid .gif-cell")
        A.click(".gif-grid .gif-cell >> nth=0 >> .gif-act"); A.wait_for_selector(".gif-act.done"); assert A.evaluate("Gifs.mine") is None
        A.click(".gif-tabs button:has-text('Мои')"); A.wait_for_selector(".gif-grid .gif-cell"); assert A.locator(".gif-grid .gif-cell").count() == 1
        A.click(".gif-tabs button:has-text('Добавить')")
        A.set_input_files(".gif-pane input[type=file]", "/tmp/fc-ve/noto.gif"); A.wait_for_selector(".gif-grid .gif-cell >> nth=1")
        assert A.locator(".gif-grid .gif-cell").count() == 2
        A.click(".gif-grid .gif-cell >> nth=1 >> .gif-act"); A.wait_for_function("document.querySelectorAll('.gif-grid .gif-cell').length === 1")
        n0 = A.locator(".msg").count()
        A.click(".gif-grid .gif-cell >> nth=0"); A.wait_for_selector(".emoji-body", state="detached")
        A.wait_for_function("n => document.querySelectorAll('.msg').length > n", arg=n0, timeout=8000)
        assert A.evaluate("S.msgs.get(S.current).at(-1).media_type") == "image" and A.evaluate("/gif/.test(S.msgs.get(S.current).at(-1).media_path)")
        B.evaluate("showTab('chats')"); B.wait_for_selector(f"#chatItems .chat-item[data-chat='{FAM}']")
        # из поиска — сразу отправить
        A.click(".emoji-btn"); A.click(".emoji-tabs button:has-text('GIF')"); A.wait_for_selector(".gif-grid .gif-cell")
        A.click(".gif-grid .gif-cell >> nth=2"); A.wait_for_function("n => document.querySelectorAll('.msg').length > n", arg=n0 + 1, timeout=8000)
        assert A.evaluate("window.__gifCalls.filter(c => c.action === 'get').length") >= 2
        shot(A, "w5_gif_sent"); print("gif: ok")
        # ── 6. правка старого сообщения — не «новое» у других; уход из чата выключает запись голоса
        B.evaluate(f"openChat('{FAM}')"); B.wait_for_selector("#chatView .composer"); B.click(".back-btn")
        A.fill("#input", "первое"); A.click(".composer .send"); A.wait_for_timeout(300)
        A.fill("#input", "второе"); A.click(".composer .send"); A.wait_for_timeout(500)
        ids_m = A.evaluate("S.msgs.get(S.current).filter(m => ['первое','второе'].includes(m.body)).map(m => m.id)")
        last0 = B.evaluate(f"S.lastByChat.get('{FAM}').id"); u0 = B.evaluate(f"S.unread.get('{FAM}') || 0")
        A.evaluate("(id) => S.sb.from('messages').update({ body: 'первое (исправлено)' }).eq('id', id)", ids_m[0]); B.wait_for_timeout(900)
        assert B.evaluate(f"S.lastByChat.get('{FAM}').id") == last0 and B.evaluate(f"S.unread.get('{FAM}') || 0") == u0
        A.evaluate("Voice.start(document.querySelector('.composer'))"); A.wait_for_function("!!Voice.cancel", timeout=5000)
        A.click(".back-btn"); assert A.evaluate("Voice.cancel") is None
        print("edit / voice leave: ok")
        # ── 7. обрыв сети не стирает список чатов
        n = A.evaluate("S.chats.length")
        A.evaluate("""() => { const real = S.sb.from; S.sb.from = () => { const p = new Proxy({}, { get: (_, k) => k === 'then' ? (res) => res({ data: null, error: { message: 'net' } }) : () => p }); return p; };
          return loadChats().then(() => { S.sb.from = real; }); }""")
        assert A.evaluate("S.chats.length") == n and n > 0
        print("offline loadChats: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
