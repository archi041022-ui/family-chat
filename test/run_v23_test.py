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
        ctx.route("https://translate.google.com/**", lambda r: r.abort())
        ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page(); C = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        name = lambda n: f"#chatItems .chat-item:has(.name:text-is('{n}'))"
        # ── приватная группа
        A.click(".fab"); A.click(".sheet >> text=Создать группу")
        A.fill(".sheet input[placeholder='Название группы']", "Рыбалка"); A.fill(".sheet textarea", "Ездим на Волгу")
        A.click(".sheet .people-pick label:has-text('Мама') input"); A.click(".sheet >> text=Создать группу >> nth=-1")
        A.wait_for_selector("#chatView .topbar >> text=Рыбалка")
        B.wait_for_selector(name("Рыбалка"), timeout=8000)
        C.wait_for_timeout(1500); assert C.locator(name("Рыбалка")).count() == 0, "Сын видит чужую группу"
        A.click("#chatView .topbar .title"); A.wait_for_selector(".sheet >> text=Приватная группа"); A.wait_for_selector(".sheet >> text=Ездим на Волгу"); shot(A, "v1_A_group_info")
        A.click(".sheet >> text=Добавить участников"); A.click(".sheet .people-pick label:has-text('Сын') input"); A.click(".sheet .btn.wide")
        C.wait_for_selector(name("Рыбалка"), timeout=8000)
        A.click("#chatView .topbar .title"); A.click(".member-row:has-text('Мама') button[title='Убрать из группы']")
        B.wait_for_function("!document.querySelector(`#chatItems .chat-item[data-chat]`) || ![...document.querySelectorAll('#chatItems .chat-item .name')].some(n => n.textContent === 'Рыбалка')", timeout=8000)
        A.click(".sheet-back", position={"x": 5, "y": 5})
        C.click(name("Рыбалка")); C.click("#chatView .topbar .title"); assert C.locator(".sheet >> text=Изменить название").count() == 0
        C.click(".sheet >> text=Выйти из группы"); C.click(".sheet .menu-item.danger >> text=Выйти"); C.wait_for_selector("#chatView", state="detached")
        A.wait_for_selector(".msg.in .text >> text=вышел", timeout=8000)
        print("private groups: ok")
        A.click(".back-btn")
        # ── эмодзи и стикеры
        A.click(name("Семья")); A.wait_for_selector("#input")
        A.click(".composer .emoji-btn"); A.wait_for_selector(".sticker-grid button"); shot(A, "v2_A_stickers")
        A.click(".sticker-grid button >> nth=0"); A.wait_for_selector(".msg.out .emoji-bubble .big-emoji")
        A.click(".composer .emoji-btn"); A.click(".emoji-tabs >> text=😀"); A.click(".emoji-grid button >> nth=2"); A.click(".sheet-back", position={"x": 5, "y": 5})
        assert A.input_value("#input") == "😄", A.input_value("#input"); A.fill("#input", "")
        B.click(name("Семья")); B.wait_for_selector(".msg.in .emoji-bubble .big-emoji")
        print("stickers: ok")
        # ── анимация отправки
        A.fill("#input", "Первое"); A.click(".composer .send"); A.wait_for_selector(".msg.just-sent", state="attached", timeout=3000)
        A.fill("#input", "Второе"); A.click(".composer .send")
        A.fill("#input", "Третье"); A.click(".composer .send"); B.wait_for_selector(".msg.in .text >> text=Третье")
        # ── выборочное удаление
        A.click(".msg.out .bubble:has-text('Первое')", button="right"); A.click(".sheet >> text=Выбрать несколько")
        A.wait_for_selector("#selBar"); A.click(".msg.out:has-text('Второе')"); A.wait_for_selector("#selBar >> text=Выбрано: 2"); shot(A, "v3_A_select")
        A.click("#selBar button[title='Удалить']"); A.click(".sheet >> text=Удалить у всех")
        A.wait_for_selector(".dust-layer"); shot(A, "v4_A_dust")
        A.wait_for_function("!document.querySelector('.msg .text') || ![...document.querySelectorAll('.msg .text')].some(t => /Первое|Второе/.test(t.textContent))", timeout=8000)
        B.wait_for_function("![...document.querySelectorAll('.msg .text')].some(t => /Первое|Второе/.test(t.textContent))", timeout=8000)
        assert A.locator(".msg .text >> text=Третье").count() == 1
        # удалить у меня — чужое сообщение
        B.fill("#input", "Сообщение мамы"); B.click(".composer .send"); A.wait_for_selector(".msg.in .text >> text=Сообщение мамы")
        A.click(".msg.in .bubble:has-text('Сообщение мамы')", button="right"); A.click(".sheet >> text=Удалить у меня")
        A.wait_for_selector(".msg.in .text >> text=Сообщение мамы", state="detached"); B.wait_for_timeout(500)
        assert B.locator(".msg .text >> text=Сообщение мамы").count() == 1
        print("selective delete: ok")
        # ── исправить подпись к фото
        import base64
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4dOkSAATsAm3jYRpjAAAAAElFTkSuQmCC")
        open("/tmp/one.png", "wb").write(png)
        A.fill("#input", "Наше фото"); A.set_input_files(".composer input[type=file]", "/tmp/one.png")
        B.wait_for_selector(".msg.in .text >> text=Наше фото", timeout=10000)
        A.click(".msg.out .bubble:has-text('Наше фото')", button="right"); A.click(".sheet >> text=Изменить")
        A.fill("#input", "Наше лучшее фото"); A.click(".composer .send")
        B.wait_for_selector(".msg.in .text >> text=Наше лучшее фото", timeout=8000)
        print("edit caption: ok")
        # ── фон чата
        A.click("button[title='Ещё']"); A.click(".sheet >> text=Фон чата"); A.click(".wp-sw >> text=Море")
        A.wait_for_selector("#msgs.has-wp"); assert "gradient" in A.evaluate("document.querySelector('#msgs').style.background")
        A.click("button[title='Ещё']"); A.click(".sheet >> text=Фон чата"); A.set_input_files(".sheet input[type=file]", "/tmp/one.png")
        A.wait_for_selector("#msgs.wp-photo"); shot(A, "v5_A_wallpaper")
        A.click(".back-btn"); A.click(name("Мама")); A.wait_for_timeout(300); assert A.locator("#msgs.has-wp").count() == 0   # фон только у того чата
        A.click(".back-btn")
        print("wallpaper: ok")
        # ── мелодия звонка (в браузере — свой файл) и фон экрана звонка
        import struct, wave
        w = wave.open("/tmp/tone.wav", "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
        w.writeframes(b"".join(struct.pack("<h", int(8000 * ((i // 20) % 2 * 2 - 1))) for i in range(8000))); w.close()
        B.click(".back-btn"); B.evaluate("S.tab === 'menu' || showTab('menu')"); B.click("#tabMenu .mn-tile:has-text('Настройки')"); B.click("#tabSettings >> text=Мелодии")
        B.set_input_files(".snd-row:has-text('Мелодия звонка') input[type=file]", "/tmp/tone.wav"); B.wait_for_selector(".snd-row >> text=tone")
        shot(B, "v6_B_sounds"); B.click(".sheet-back", position={"x": 5, "y": 5}); B.click("#tabBtnChats")
        A.click("#tabBtnContacts"); A.click("#tabContacts .contact-row:has-text('Мама') button[title='Позвонить']")
        B.wait_for_selector(".call.ringing .call-bg", timeout=10000); B.wait_for_timeout(600)
        assert B.evaluate("!!Snd.loopAudio"), "своя мелодия не играет"
        shot(B, "v7_B_call_bg")
        B.click(".call .cbtn.red"); A.wait_for_selector(".call", state="detached", timeout=8000)
        assert B.evaluate("!Snd.loopAudio")
        print("ringtone + call background: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
