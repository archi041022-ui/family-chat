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
        import json as _j, urllib.parse as up
        def tr(route):
            q = up.parse_qs(up.urlparse(route.request.url).query)
            text, tl = q["q"][0], q["tl"][0]
            out = {"ru": "Привет, как дела?", "en": "Hello, how are you?"}.get(tl, text)
            src = "en" if any("a" <= ch.lower() <= "z" for ch in text) else "ru"
            route.fulfill(status=200, content_type="application/json", body=_j.dumps([[[out, text, None, None]], None, src]))
        ctx.route("https://translate.googleapis.com/**", tr)
        ctx.route("https://api.github.com/**", lambda r: r.fulfill(status=404, headers={"Access-Control-Allow-Origin": "*"}, body="{}"))
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        name = lambda n: f"#chatItems .chat-item:has(.name:text-is('{n}'))"
        # ── 5. эмодзи-статус
        A.click("#tabBtnSettings"); A.click("#tabSettings >> text=Эмодзи-статус"); A.click(".es-grid button >> nth=1")
        B.wait_for_selector("#chatItems .chat-item[data-user] .estatus", timeout=8000); shot(B, "x1_B_emoji_status")
        A.click("#tabBtnChats")
        print("emoji status: ok")
        # ── 3. перевод
        A.click(name("Мама")); A.wait_for_selector("#input")
        B.reload(); B.wait_for_selector("#chatList .chat-item"); B.click(name("Папа")); B.wait_for_selector("#input")
        B.fill("#input", "Hello, how are you?"); B.click(".composer .send")
        A.wait_for_selector(".msg.in .tr-box .tr-text >> text=Привет, как дела?", timeout=8000); shot(A, "x2_A_translated")
        A.click("button[title='Ещё']"); A.click(".sheet >> text=Перевод сообщений")
        A.select_option(".sheet select >> nth=1", "en"); A.click(".sheet-back", position={"x": 5, "y": 5})
        A.fill("#input", "Привет, как дела?"); A.click(".composer .send")
        B.wait_for_selector(".msg.in .text >> text=Hello, how are you?"); B.wait_for_selector(".msg.in .tr-orig >> text=Привет, как дела?")
        A.click("button[title='Ещё']"); A.click(".sheet >> text=Перевод сообщений"); A.select_option(".sheet select >> nth=1", ""); A.click(".sheet-back", position={"x": 5, "y": 5})
        print("translation: ok")
        # ── 7. эффекты
        A.fill("#input", "С праздником!"); A.click(".composer .send", button="right"); A.click(".fx-grid >> text=Сердечки")
        A.wait_for_selector(".fx-layer.fx-hearts", timeout=3000)
        try: B.wait_for_selector(".fx-layer.fx-hearts", timeout=8000)
        except Exception:
            print("DBG", B.evaluate("[S.current, document.visibilityState, [...document.querySelectorAll('.msg .text')].slice(-3).map(x=>x.textContent), localStorage.getItem('fxPlayed'), (S.msgs.get(S.current)||[]).slice(-2).map(m=>JSON.stringify(m.body))]")); raise
        B.wait_for_selector(".msg.in .fx-mark"); shot(B, "x3_B_effect")
        print("effects: ok")
        # ── 6. защита содержимого
        A.evaluate("() => { window.AndroidBridge = Object.assign(window.AndroidBridge || {}, { setSecure: (on) => { window.__secure = on; } }); }")
        A.click("button[title='Ещё']"); A.click(".sheet >> text=Защитить от копирования")
        A.wait_for_selector("#chatView.protected"); assert A.evaluate("window.__secure") is True
        B.wait_for_timeout(1200); B.click(".back-btn"); B.click(name("Папа")); B.wait_for_selector("#chatView.protected")
        B.click(".msg.in .bubble >> nth=-1", button="right")
        assert B.locator(".sheet >> text=Копировать текст").count() == 0 and B.locator(".sheet >> text=Переслать").count() == 0
        B.wait_for_selector(".sheet >> text=Защищённый чат"); shot(B, "x4_B_protected"); B.click(".sheet-back", position={"x": 5, "y": 5})
        A.click(".back-btn"); assert A.evaluate("window.__secure") is False
        print("protection: ok")
        # ── 4. каналы
        A.click(".fab"); A.click(".sheet >> text=Создать канал")
        A.fill(".sheet input[placeholder='Название канала']", "Новости семьи"); A.click(".sheet .segmented >> text=Открытый")
        A.click(".sheet >> text=Создать канал >> nth=-1"); A.wait_for_selector("#chatView.channel")
        A.fill("#input", "Первый пост канала"); A.click(".composer .send")
        B.click(".back-btn"); B.click(".fab"); B.click(".sheet >> text=Найти группы и каналы"); B.wait_for_selector(".sheet >> text=Новости семьи")
        shot(B, "x5_B_discover"); B.click(".sheet .btn.small >> text=Подписаться"); B.wait_for_selector("#chatView.channel .composer")
        B.wait_for_selector(".msg .text >> text=Первый пост канала")
        A.fill("#input", "Второй пост"); A.click(".composer .send"); B.wait_for_selector(".msg .text >> text=Второй пост", timeout=8000)
        B.fill("#input", "Пост подписчика"); B.click(".composer .send"); A.wait_for_selector(".msg.in .text >> text=Пост подписчика", timeout=8000)   # в открытом канале пишут все
        shot(B, "x6_B_channel")
        print("channels: ok")
        B.click(".back-btn"); A.click(".back-btn")
        # ── 2. расшифровка голосовых (движок проверяется в CI; здесь — интерфейс)
        for pg in (A, B): pg.evaluate("() => { STT.cached = async () => true; STT.transcribe = async () => 'Привет, я буду через десять минут.'; }")
        A.click(name("Мама")); A.wait_for_selector("#input")
        import struct, wave
        w = wave.open("/tmp/v.wav", "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(b"\0\0" * 8000); w.close()
        A.set_input_files(".composer input[type=file]", "/tmp/v.wav")
        B.click(name("Папа")); B.wait_for_selector(".msg.in .stt-text >> text=Привет, я буду через десять минут", timeout=10000)
        A.wait_for_selector(".msg.out .stt .stt-btn"); A.click(".msg.out .stt .stt-btn"); A.wait_for_selector(".msg.out .stt-text")
        shot(B, "x7_B_transcribed")
        print("voice transcription UI: ok")
        A.click(".back-btn"); B.click(".back-btn")
        # ── 8. задачи и ассистент
        A.click(".tasks-item"); A.wait_for_selector("#taskInput")
        A.fill("#taskInput", "Купить хлеб завтра в 18"); A.press("#taskInput", "Enter")
        A.wait_for_selector(".task-row >> text=Купить хлеб"); A.wait_for_selector(".task-row small >> text=завтра в 18:00")
        A.click("button[title='Попросить ассистента']"); A.wait_for_selector("#asstInput"); A.fill("#asstInput", "Поручи маме купить молоко сегодня в 20:00"); A.click("#asstMic")
        A.wait_for_selector(".sheet >> text=Поручил: Мама")
        B.wait_for_selector("text=поручил(а) вам: Купить молоко", timeout=8000)
        A.click(".sheet-back", position={"x": 5, "y": 5})
        B.click(".tasks-item"); B.wait_for_selector(".task-row >> text=Купить молоко"); shot(B, "x8_B_tasks")
        B.click(".task-row:has-text('Купить молоко') .task-check"); B.wait_for_timeout(800)
        A.wait_for_function("Tasks.list.some(t => t.title === 'Купить молоко' && t.done)", timeout=8000)
        A.evaluate("Tasks.add({ title: 'Позвонить бабушке', due_at: new Date(Date.now() - 1000).toISOString() }).then(() => Tasks.tick())")
        A.wait_for_selector("text=⏰ Позвонить бабушке", timeout=5000); shot(A, "x9_A_reminder")
        A.click(".back-btn"); A.click(".assistant-item"); A.fill("#asstInput", "мои задачи"); A.click("#chatView .composer .send")
        A.wait_for_selector("#asstMsgs .msg.in:last-child >> text=Купить хлеб")
        A.fill("#asstInput", "Напомни позвонить врачу"); A.click("#chatView .composer .send"); A.wait_for_selector("#asstMsgs >> text=Когда напомнить?")
        A.fill("#asstInput", "завтра в 9"); A.click("#chatView .composer .send"); A.wait_for_selector("#asstMsgs >> text=напомню завтра в 09:00")
        A.click(".back-btn")
        print("tasks + assistant: ok")
        # ── 1. вход по отпечатку (мост Android подменён)
        A.evaluate("""() => { window.__unlocks = 0; window.AndroidBridge = Object.assign(window.AndroidBridge || {}, { lockAvailable: () => true,
            unlock: () => { window.__unlocks++; setTimeout(() => window.onUnlock(true, 'ok'), 100); } }); }""")
        A.click("#tabBtnSettings"); A.click("#tabSettings >> text=Вход по отпечатку"); A.click(".sheet .toggle-row:has-text('Вход по отпечатку или лицу')")
        A.wait_for_function("Prefs.get('bioLock') === true"); A.click(".sheet .seg >> text=Сразу"); A.click(".sheet-back", position={"x": 5, "y": 5})
        A.evaluate("() => { window.onAppBackground(); }"); A.wait_for_timeout(50)
        A.evaluate("() => { window.AndroidBridge.unlock = () => { window.__unlocks++; window.__pending = true; }; window.onAppForeground(); }")
        A.wait_for_selector(".lock-screen"); shot(A, "x10_A_lock")
        A.wait_for_function("window.__pending === true && typeof window.onUnlock === 'function'"); A.evaluate("() => window.onUnlock(true, 'ok')"); A.wait_for_selector(".lock-screen", state="detached")
        print("biometric lock: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
