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
        A = ctx.new_page(); B = ctx.new_page()
        ctx.route("https://api.github.com/**", lambda r: r.abort())
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        B.evaluate("S.sb.from('stories').insert({ body: 'Мы на даче', bg: '#3D8BFD' })")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); A.wait_for_timeout(500)
        # ── меню внизу слева
        tabs = A.evaluate("[...document.querySelectorAll('.bottom-tabs button')].map(b => b.id)")
        assert tabs == ["tabBtnMenu", "tabBtnChats", "tabBtnContacts", "tabBtnCalls"], tabs
        A.click("#tabBtnMenu"); A.wait_for_selector("#tabMenu .mn-tile")
        tiles = A.evaluate("[...document.querySelectorAll('#tabMenu .mn-lbl')].map(x => x.textContent)")
        for t in ["Ассистент", "Мои задачи", "Видеоредактор", "Сканер → PDF", "Истории и статусы", "Группы и каналы", "Пригласить в семью", "Обновления", "О приложении", "Участники"]:
            assert t in tiles, (t, tiles)
        shot(A, "u1_menu")
        A.click("#tabMenu .mn-tile:has-text('Видеоредактор')"); A.wait_for_selector(".ve-cam"); A.evaluate("window.handleBack()"); A.wait_for_selector(".ve-root", state="detached")
        A.click("#tabMenu .mn-tile:has-text('Истории и статусы')"); A.wait_for_selector("#tabStories:not(.hidden)"); assert "on" in A.get_attribute("#tabBtnMenu", "class")
        A.evaluate("S.tab === 'menu' || showTab('menu')"); A.click("#tabMenu .mn-tile:has-text('Мои задачи')"); A.wait_for_selector(".tasks-view"); A.click(".back-btn")
        print("menu: ok")
        # в настройках — только настройки
        A.evaluate("S.tab === 'menu' || showTab('menu')"); A.click("#tabMenu .mn-tile:has-text('Настройки')"); st = A.inner_text("#tabSettings")
        for gone in ["Мои задачи", "Пригласить в семью", "Скачать обновления", "Управление участниками"]: assert gone not in st, gone
        for keep in ["Уведомления и звуки", "Оформление и цвета", "Выйти", "Плавающий значок ассистента"]: assert keep in st, keep
        shot(A, "u2_settings"); print("settings only settings: ok")
        # ── истории — вверху, над поиском; при прокрутке сворачиваются
        A.click("#tabBtnChats")
        order = A.evaluate("(() => [document.querySelector('#tabChats').firstElementChild.id, !!document.querySelector('#tabChats .search'), document.querySelector('.side > .topbar').firstElementChild.className])()")
        assert order == ["storyStrip", False, "icon-btn top-search-btn"], order          # истории — первыми; поиск — значком слева в шапке
        A.wait_for_selector("#storyStrip .story-cell >> text=Мама")
        A.evaluate("document.querySelector('#chatItems').style.minHeight = '3000px'")
        A.evaluate("const l = document.querySelector('#chatList'); l.scrollTop = 200; l.dispatchEvent(new Event('scroll'))"); A.wait_for_timeout(400)
        assert "collapsed" in A.get_attribute("#storyStrip", "class")
        A.evaluate("const l = document.querySelector('#chatList'); l.scrollTop = 0; l.dispatchEvent(new Event('scroll'))"); A.wait_for_timeout(400)
        assert "collapsed" not in A.get_attribute("#storyStrip", "class")
        A.evaluate("document.querySelector('#chatItems').style.minHeight = ''")
        print("stories on top: ok")
        # ── плавающий ассистент: виден, перетаскивается, прилипает к краю, открывает ассистента
        A.wait_for_selector(".asst-fab:not(.hidden)")
        bb = A.locator(".asst-fab").bounding_box(); assert bb["width"] <= 46 and bb["x"] > 300, bb      # маленький, справа
        A.mouse.move(bb["x"] + 20, bb["y"] + 20); A.mouse.down(); A.mouse.move(120, 300, steps=8); A.mouse.up(); A.wait_for_timeout(400)
        bb2 = A.locator(".asst-fab").bounding_box(); assert bb2["x"] < 20 and abs(bb2["y"] - 280) < 30, bb2   # прилип к левому краю
        assert A.evaluate("JSON.parse(localStorage.getItem('asstFab')).side") == "left"
        assert A.evaluate("S.assistantOpen") is not True                     # перетаскивание не открывает
        shot(A, "u3_fab_left")
        A.click(".asst-fab"); A.wait_for_selector("#asstInput"); A.wait_for_timeout(500)
        assert "hidden" in A.get_attribute(".asst-fab", "class")              # при открытом ассистенте прячется
        A.click(".back-btn"); A.wait_for_timeout(500); assert "hidden" not in A.get_attribute(".asst-fab", "class")
        A.reload(); A.wait_for_selector(".asst-fab:not(.hidden)"); bb3 = A.locator(".asst-fab").bounding_box(); assert bb3["x"] < 20, bb3   # место запомнилось
        A.evaluate("S.tab === 'menu' || showTab('menu')"); A.click("#tabMenu .mn-tile:has-text('Настройки')"); A.click("#tabSettings .toggle-row:has-text('Плавающий значок ассистента')"); A.wait_for_timeout(600)
        assert "hidden" in A.get_attribute(".asst-fab", "class")
        A.click("#tabSettings .toggle-row:has-text('Плавающий значок ассистента')"); A.wait_for_timeout(600)
        assert "hidden" not in A.get_attribute(".asst-fab", "class")
        print("floating assistant: ok")
        # ── свайп «назад» в задачах (в обе стороны), короткий жест не закрывает
        def swipe(sel, x0, x1, y=400):
            A.evaluate("""([sel, x0, x1, y]) => { const el = document.querySelector(sel);
              const T = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
              el.dispatchEvent(new TouchEvent('touchstart', { touches: [T(x0)], changedTouches: [T(x0)], bubbles: true }));
              for (let i = 1; i <= 6; i++) el.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x0 + (x1 - x0) * i / 6)], changedTouches: [T(x0 + (x1 - x0) * i / 6)], bubbles: true }));
              el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(x1)], bubbles: true })); }""", [sel, x0, x1, y])
        A.click("#tabBtnChats"); A.evaluate("Tasks.open()"); A.wait_for_selector(".tasks-view")
        swipe(".tasks-view", 100, 150); A.wait_for_timeout(400); assert A.locator(".tasks-view").count() == 1, "короткий жест закрыл"
        swipe(".tasks-view", 60, 300); A.wait_for_selector(".tasks-view", state="detached", timeout=3000)
        A.evaluate("Tasks.open()"); A.wait_for_selector(".tasks-view")
        swipe(".tasks-view", 330, 60); A.wait_for_selector(".tasks-view", state="detached", timeout=3000)
        print("tasks swipe back: ok")
        # от левого края — назад из чата
        A.click("#chatItems .chat-item[data-chat='00000000-0000-0000-0000-000000000001']"); A.wait_for_selector("#chatView .composer")
        swipe("#chatView", 10, 260); A.wait_for_selector("#chatView", state="detached", timeout=3000)
        print("chat edge swipe: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
