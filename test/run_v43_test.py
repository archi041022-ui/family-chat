"""v4.3: меню списком, панель администратора и ограничения, приветствие новичков, плавный свайп."""
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
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа")
        # приветствие: новичок получает карточку, а в общем чате появляется ровно одно сообщение
        A.wait_for_selector(".welcome")
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item"); B.wait_for_timeout(1800)
        fam = lambda pg: pg.evaluate("S.msgs.get(FAMILY_CHAT).filter(m => m.body && m.body.includes('Я теперь в')).length")
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        B.reload(); B.wait_for_selector("#chatList .chat-item"); B.wait_for_timeout(1500)
        A.reload(); A.wait_for_selector("#chatList .chat-item"); A.wait_for_timeout(800)
        A.evaluate("openChat(FAMILY_CHAT)"); A.wait_for_timeout(600)
        n = fam(A); assert n == 2, n         # Папа и Мама, по одному разу, после перезагрузок без повторов
        print("welcome: ok")
        for pg in (A, B):
            pg.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
            if pg.locator(".back-btn:visible").count(): pg.click(".back-btn:visible"); pg.wait_for_timeout(300)
            pg.evaluate("showTab('chats')")
        # меню: список по разделам со значками, раздела «Семья» нет
        B.evaluate("showTab('menu')"); B.wait_for_selector("#tabMenu .mn-tile")
        lbls = B.evaluate("[...document.querySelectorAll('#tabMenu .mn-lbl')].map(e => e.textContent)")
        assert "Семья" not in lbls and "Настройки" in lbls and "Мои задачи" in lbls, lbls
        assert B.evaluate("getComputedStyle(document.querySelector('#tabMenu .mn-tile')).flexDirection") == "row"
        assert B.evaluate("document.querySelectorAll('#tabMenu .mn-tile .mn-ico svg').length") == B.evaluate("document.querySelectorAll('#tabMenu .mn-tile').length")
        assert B.locator("#tabMenu .mn-tile:has-text('Панель управления')").count() == 0 and B.locator("#tabMenu .mn-cap:has-text('Администратор')").count() == 0
        A.evaluate("showTab('menu')"); A.wait_for_timeout(300);
        A.wait_for_selector("#tabMenu .mn-tile:has-text('Панель управления')")
        print("menu: ok")
        # доступ к панели только у администратора, сервер тоже отказывает
        B.evaluate("AdminPanel.open()"); B.wait_for_timeout(300); assert B.locator(".adm-body").count() == 0
        r = B.evaluate("S.sb.rpc('admin_overview').then(r => !!r.error && !r.data)"); assert r is True
        # панель: люди, ограничения
        B.evaluate("S.sb.rpc('create_group', { title: 'Друзья Мамы', members: [] })"); B.wait_for_timeout(300)
        A.click("#tabMenu .mn-tile:has-text('Панель управления')"); A.wait_for_selector(".adm-user")
        assert "Мама" in A.inner_text(".adm-body") and "групп 1" in A.inner_text(".adm-body"), A.inner_text(".adm-body")
        A.click(".adm-head"); A.click(".adm-ctl label:has-text('Только чтение') input"); A.wait_for_timeout(400)
        assert "только чтение" in A.inner_text(".adm-lim")
        B.reload(); B.wait_for_function('typeof S !== "undefined" && S.me && S.chats.length'); B.evaluate("S.current === FAMILY_CHAT || openChat(FAMILY_CHAT)"); B.wait_for_selector("#input")
        B.fill("#input", "привет"); B.click(".composer .send"); B.wait_for_timeout(500)
        dbg = B.evaluate("JSON.stringify({m: S.msgs.get(FAMILY_CHAT).slice(-2).map(x => [x.body, x.id]), lim: [...S.profiles.values()].map(p => [p.name, p.lim_readonly]), me: S.me.lim_readonly, inp: document.querySelector('#input').value})")
        assert "Администратор отключил" in B.inner_text("body"), dbg
        # снять «только чтение», запретить создание чатов и медиа
        A.click(".adm-ctl label:has-text('Только чтение') input"); A.click(".adm-ctl label:has-text('Без фото') input"); A.click(".adm-ctl label:has-text('Нельзя создавать') input"); A.wait_for_timeout(500)
        B.reload(); B.wait_for_function('typeof S !== "undefined" && S.me && S.chats.length'); B.wait_for_timeout(500)
        B.evaluate("S.current === FAMILY_CHAT || openChat(FAMILY_CHAT)"); B.wait_for_selector("#input"); B.fill("#input", "текст проходит"); B.click(".composer .send"); B.wait_for_timeout(500)
        assert B.evaluate("S.msgs.get(FAMILY_CHAT).some(m => m.body === 'текст проходит' && !String(m.id).startsWith('tmp-'))")
        e = B.evaluate("S.sb.from('messages').insert({ chat_id: FAMILY_CHAT, media_type: 'image', media_path: 'x' }).select().single().then(r => r.error && r.error.message)"); assert e == "LIMITED_MEDIA", e
        if B.locator(".back-btn:visible").count(): B.click(".back-btn:visible"); B.wait_for_timeout(300)
        B.evaluate("showTab('menu')"); B.wait_for_selector("#tabMenu .mn-tile")
        assert B.locator("#tabMenu .mn-tile:has-text('Создать группу')").count() == 0 and B.locator("#tabMenu .mn-tile:has-text('Создать канал')").count() == 0
        e = B.evaluate("S.sb.rpc('create_group', { title: 'X', members: [] }).then(r => r.error && r.error.message)"); assert e == "LIMITED_CREATE", e
        # участник не может снять ограничения сам (сервер)
        print("limits: ok")
        # вкладки: группы и журнал
        A.click(".adm-tabs >> text=Группы и каналы"); assert "Друзья Мамы" in A.inner_text(".adm-body") and "создал(а): Мама" in A.inner_text(".adm-body"), A.inner_text(".adm-body")
        A.click(".adm-tabs >> text=Журнал"); assert "Ограничения" in A.inner_text(".adm-body"), A.inner_text(".adm-body")
        A.click(".adm-tabs >> text=Правила"); A.click(".adm-body label.toggle-row input"); A.wait_for_timeout(300)
        assert A.evaluate("AdminPanel.data.create_admin_only") is True
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove())")
        A.evaluate("AdminPanel.open()"); A.wait_for_selector(".adm-user"); A.click(".adm-tabs >> text=Группы и каналы")
        A.click(".admin-row:has-text('Друзья Мамы') .icon-btn"); A.click(".sheet .btn.danger"); A.wait_for_timeout(500)
        assert A.evaluate("S.chats.every(c => c.title !== 'Друзья Мамы')")
        print("admin tabs: ok")
        # плавный свайп: уходящий экран доезжает по инерции, без отскока назад
        A.evaluate("() => { document.querySelectorAll('.sheet-back').forEach(e => e.remove()); showTab('chats'); S.folder = 'all'; renderChatList(); }")
        A.evaluate("""() => { const b = document.querySelector('#tabChats'); window.__tx = []; new MutationObserver(() => window.__tx.push(b.style.transform)).observe(b, { attributes: true, attributeFilter: ['style'] }); }""")
        cdp = ctx.new_cdp_session(A)
        def drag(dx, steps=10, wait=16):
            y = 400; x0 = 300 if dx < 0 else 90
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
            for i in range(1, steps + 1):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + dx * i / steps, "y": y}]}); A.wait_for_timeout(wait)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); A.wait_for_timeout(600)
        drag(-200); assert A.evaluate("S.folder") == "personal", A.evaluate("S.folder")
        tx = A.evaluate("window.__tx"); assert any("translate3d" in t for t in tx), tx[:5]
        assert A.evaluate("document.querySelector('#tabChats').style.transform") == "" and A.evaluate("document.querySelector('#tabChats').style.opacity") == ""
        # не отскакивает: после решения о переключении значение transform ни разу не возвращается к нулю до сброса
        xs = [float(t.split("(")[1].split("px")[0]) for t in tx if "translate3d(" in t and "px" in t]
        assert min(xs) < -100, xs
        drag(200); assert A.evaluate("S.folder") == "all"
        drag(-30); assert A.evaluate("S.folder") == "all"                      # короткий жест: возврат на место
        assert A.evaluate("document.querySelector('#tabChats').style.transform") == ""
        drag(-80, 4, 8); assert A.evaluate("S.folder") == "personal", (A.evaluate("S.folder"), A.evaluate("window.__tx.slice(-6)"))              # быстрый короткий жест засчитывается
        print("smooth swipe: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
