"""Сквозная проверка интерфейса на тестовом сервере: регистрация, чаты, реакции, фото, звонок."""
import os, shutil, subprocess, time, sys
from playwright.sync_api import sync_playwright

ROOT = "/home/claude/family-chat"
T = "/tmp/fc-test"
OUT = "/tmp/fc-shots"
shutil.rmtree(T, ignore_errors=True); shutil.copytree(f"{ROOT}/web", T)
os.makedirs(f"{T}/vendor", exist_ok=True); os.makedirs(OUT, exist_ok=True)
shutil.copy(f"{ROOT}/test/mock-supabase.js", f"{T}/vendor/supabase.js")
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
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and errors.append(f"{nm} console: {m.text}"))

        # неверный код
        register(A, "papa", "Папа", invite="nope")
        A.wait_for_selector("text=Неверный код приглашения"); shot(A, "01_bad_invite")
        A.fill("input[placeholder='выдаёт создатель чата']", "SEMYA-4825"); A.click("button[type=submit]")
        A.wait_for_selector("#chatList .chat-item"); shot(A, "02_list")
        register(B, "mama", "Мама")
        B.wait_for_selector("#chatList .chat-item")

        # общий чат
        A.click("#chatList >> text=Семья"); A.wait_for_selector("#input")
        A.fill("#input", "Всем привет! Сегодня у сына день рождения 🎂"); A.click(".composer .send")
        B.wait_for_timeout(500); shot(B, "03_B_list_unread")
        assert B.locator(".badge").count() >= 1, "нет счётчика непрочитанных"
        B.click("#chatList >> text=Семья"); B.wait_for_selector(".msg .text >> text=Сегодня у сына")
        # реакция через меню
        B.click(".msg.in .bubble", button="right"); B.click(".emoji-row button >> nth=1")
        A.wait_for_selector(".react"); shot(A, "04_A_reaction")
        # ответ
        B.click(".msg.in .bubble", button="right"); B.click("text=Ответить")
        B.fill("#input", "Поздравляю! ❤️"); B.press("#input", "Enter")
        A.wait_for_selector(".msg.in .reply"); shot(A, "05_A_reply")
        # фото
        A.set_input_files(".composer input[type=file]", "/tmp/fc_icon_432.png")
        B.wait_for_selector("img.photo"); B.wait_for_timeout(300); shot(B, "06_B_photo")
        # личный чат и звонок
        B.click(".back-btn"); B.click(".fab"); B.click(".sheet .menu-item >> text=Папа")
        B.wait_for_selector("#input"); B.fill("#input", "Позвоню тебе"); B.press("#input", "Enter")
        A.wait_for_timeout(400); A.click(".back-btn"); A.wait_for_timeout(300); shot(A, "07_A_list")
        B.click("button[title='Видеозвонок']")
        A.wait_for_selector(".call.ringing"); shot(A, "08_A_incoming")
        A.click(".cbtn.green")
        A.wait_for_function("document.querySelector('.call .status') && /\\d+:\\d\\d/.test(document.querySelector('.call .status').textContent)", timeout=15000)
        B.wait_for_function("document.querySelector('.call .status') && /\\d+:\\d\\d/.test(document.querySelector('.call .status').textContent)", timeout=15000)
        A.wait_for_timeout(1500); shot(A, "09_A_in_call"); shot(B, "10_B_in_call")
        has_video = A.evaluate("Calls.hasRemoteVideo()")
        # демонстрация экрана (путь Android: кадры приходят от приложения)
        B.evaluate("""() => { window.AndroidBridge = { startScreenShare() {
            const c = document.createElement('canvas'); c.width = 360; c.height = 640; const x = c.getContext('2d'); let n = 0;
            window.__fake = setInterval(() => { x.fillStyle = n++ % 2 ? '#2EAD6B' : '#3D8BFD'; x.fillRect(0,0,360,640); x.fillStyle='#fff'; x.font='40px sans-serif'; x.fillText('Экран ' + n, 60, 320);
              window.onScreenFrame && window.onScreenFrame(c.toDataURL('image/jpeg', .6)); }, 120); return true; },
          stopScreenShare() { clearInterval(window.__fake); } }; }""")
        B.click(".scr-btn"); B.wait_for_selector(".share-banner")
        A.wait_for_selector(".call.remote-screen", timeout=8000); A.wait_for_timeout(2500); shot(A, "20_A_sees_screen"); shot(B, "21_B_sharing")
        rv = A.evaluate("(() => { const v = document.querySelector('.call video.remote'); return [v.videoWidth, v.videoHeight]; })()")
        print("screen share frames at A:", rv)
        B.click(".share-banner button"); A.wait_for_selector(".call:not(.remote-screen)", timeout=8000)
        print("screen share stop: ok")
        B.click(".cbtn.red"); A.wait_for_selector(".call", state="detached", timeout=5000)
        B.wait_for_selector(".msg .text >> text=📞 Видеозвонок"); shot(B, "11_B_call_log")
        # статус
        A.goto(URL); B.goto(URL); A.wait_for_selector("#chatItems .chat-item"); B.wait_for_selector("#chatItems .chat-item")
        A.click("button[title='Профиль']")
        A.click(".status-presets >> text=💼 На работе"); A.click(".sheet .btn.wide")
        B.click("#tabBtnStories"); B.wait_for_selector("#tabStories >> text=💼 На работе"); shot(B, "13_B_statuses")
        # текстовая история
        A.click("#tabBtnStories"); A.click(".add-story"); A.click("text=Текст на цветном фоне")
        A.fill(".story-text-input", "С днём рождения, сынок! 🎂"); A.click("text=Опубликовать на 24 часа")
        B.wait_for_selector("#storiesBadge:not(.hidden)"); B.wait_for_timeout(300); shot(B, "14_B_stories_tab")
        B.click("#tabStories .story-row >> nth=1"); B.wait_for_selector(".story-viewer .sv-text"); B.wait_for_timeout(700); shot(B, "15_B_story_view")
        B.click(".sv-quick button >> nth=0"); B.wait_for_timeout(400)
        B.click(".sv-head button[title='Закрыть']")
        # фото-история и просмотры у автора
        A.set_input_files("#tabStories input[type=file]", "/tmp/fc_icon_432.png") if A.locator("#tabStories input[type=file]").count() else None
        A.click(".add-story"); A.set_input_files(".sheet input[type=file]", "/tmp/fc_icon_432.png")
        A.wait_for_timeout(800)
        A.click("#tabStories .story-row >> nth=0"); A.wait_for_selector(".sv-views"); A.wait_for_timeout(500); shot(A, "16_A_own_story")
        views_txt = A.inner_text(".sv-views")
        A.click(".sv-head button[title='Закрыть']")
        A.click("#tabBtnChats"); A.wait_for_timeout(300); shot(A, "17_A_chats_strip")
        B.click("#tabBtnChats"); B.wait_for_timeout(300)
        print("views:", views_txt)
        # восстановление пароля: Мама задаёт кодовое слово, выходит и меняет пароль по нему
        B.click("button[title='Профиль']"); B.click("text=Кодовое слово для восстановления")
        B.fill(".sheet input", "Барсик"); B.click(".sheet .btn.wide"); B.wait_for_timeout(300)
        B.click("button[title='Профиль']"); B.click(".sheet .menu-item.danger"); B.wait_for_selector("text=Забыли пароль?")
        B.click("text=Забыли пароль?")
        f = B.locator(".sheet input")
        f.nth(0).fill("mama"); f.nth(1).fill("мурзик"); f.nth(2).fill("newpass1"); f.nth(3).fill("newpass1")
        B.click(".sheet .btn.wide"); B.wait_for_selector(".sheet >> text=Неверный логин или кодовое слово"); shot(B, "18_B_forgot_wrong")
        f.nth(1).fill("барсик"); B.click(".sheet .btn.wide"); B.wait_for_selector(".sheet", state="detached")
        B.fill("input[type=password]", "secret123"); B.click("button[type=submit]"); B.wait_for_selector("text=Неверный логин или пароль")
        B.fill("input[type=password]", "newpass1"); B.click("button[type=submit]"); B.wait_for_selector("#chatItems .chat-item")
        print("word reset: ok")
        # администратор (Папа) сбрасывает пароль Маме
        A.click("button[title='Профиль']"); A.click("text=Сбросить пароль участнику"); A.click(".sheet .menu-item >> text=Мама")
        A.wait_for_selector(".sheet >> text=Логин: mama"); A.fill(".sheet input", "admin777"); A.click(".sheet .btn.wide")
        A.wait_for_selector("text=Пароль: admin777"); shot(A, "19_A_admin_reset")
        assert B.locator("text=Сбросить пароль участнику").count() == 0
        print("admin reset: ok")
        # широкий экран
        W = ctx.new_page(); W.set_viewport_size({"width": 1280, "height": 800}); W.goto(URL)
        W.wait_for_timeout(500); shot(W, "12_desktop_login")
        print("remote video:", has_video)
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
