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
        ctx.route("https://translate.google.com/**", lambda r: r.abort())
        import json as _j
        ctx.route("https://api.github.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=_j.dumps({
            "tag_name": "build-9", "published_at": "2026-10-02T19:00:00Z", "body": "v2.3: новые функции\n\nCo-Authored-By: x",
            "assets": [{"name": "Semya.apk", "browser_download_url": "https://github.com/x/releases/download/build-9/Semya.apk"}]})))
        open(f"{T}/build.json", "w").write('{"build": 5, "version": "2.2"}')
        A = ctx.new_page(); B = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        # анимированное приветствие нового участника
        register(A, "papa", "Папа")
        A.wait_for_selector(".welcome"); A.wait_for_timeout(2200); shot(A, "w1_A_welcome")
        assert "Добро пожаловать в семью, Папа!" in A.evaluate("document.querySelector('.welcome').textContent.replace(/\\u00a0/g, ' ')")
        A.click(".wl-go"); A.wait_for_selector(".welcome", state="detached")
        A.click("#chatItems .chat-item:has-text('Семья')"); A.wait_for_selector(".welcome-card >> text=Папа теперь с нами")
        register(B, "mama", "Мама"); B.wait_for_selector(".welcome"); B.click(".wl-go")
        A.wait_for_selector(".welcome-card >> text=Мама теперь с нами", timeout=8000); A.wait_for_selector(".confetti.burst"); shot(A, "w2_A_new_member")
        A.click(".welcome-card:has-text('Мама') .btn")
        B.click("#chatItems .chat-item:has-text('Семья')"); B.wait_for_selector(".msg.in .text >> text=Добро пожаловать в семью")
        B.click(".back-btn")
        print("welcome: ok")
        # анкета «О себе»
        A.click(".back-btn"); A.click("button[title='Профиль']"); A.click("#tabSettings >> text=Изменить профиль")
        A.click(".sheet .status-presets >> text=Папа")
        A.fill(".sheet textarea", "Люблю рыбалку и шашлык")
        import datetime
        today = datetime.date.today(); A.fill(".sheet input[type=date]", f"{today.year - 35}-{today.month:02d}-{today.day:02d}")
        A.fill(".sheet input[placeholder='Например: Казань']", "Казань"); A.fill(".sheet input[type=tel]", "+7 900 111-22-33")
        A.click(".sheet .btn.wide"); A.wait_for_timeout(500)
        B.reload(); B.wait_for_selector("#chatList .chat-item")
        B.click("#tabBtnContacts"); B.wait_for_selector(".contact-row .role-chip >> text=Папа"); B.wait_for_selector(".bday-banner >> text=день рождения сегодня")
        B.click(".contact-row:has-text('Папа') .avatar"); B.wait_for_selector(".pv-info >> text=Люблю рыбалку"); B.wait_for_selector(".pv-info >> text=35 лет")
        shot(B, "w3_B_profile"); B.click(".sheet-back", position={"x": 5, "y": 5}); B.click("#tabBtnChats")
        print("profile info: ok")
        # ассистент рядом с микрофоном в переписке
        A.click("#tabBtnChats"); A.click("#chatItems .chat-item:has(.name:text-is('Мама'))"); A.wait_for_selector(".composer .asst-btn")
        A.click(".composer .asst-btn"); A.wait_for_selector(".sheet .asst-mini-msgs"); A.wait_for_timeout(600)
        A.fill("#asstInput", "напиши ей привет из ассистента"); A.click("#asstMic")
        A.wait_for_selector(".sheet .asst-card .btn >> text=Отправить"); shot(A, "w4_A_mini_assistant")
        A.click(".sheet .asst-card .btn >> text=Отправить"); A.wait_for_selector(".sheet >> text=Отправлено ✓")
        B.click("#chatItems .chat-item:has(.name:text-is('Папа'))"); B.wait_for_selector(".msg.in .text >> text=Привет из ассистента"); B.click(".back-btn")
        A.fill("#asstInput", "который час"); A.click("#asstMic"); A.wait_for_selector(".sheet .asst-insert")
        A.click(".sheet .asst-insert >> nth=-1"); assert "Сейчас" in A.input_value("#input"); A.fill("#input", "")
        A.click(".composer .asst-btn"); A.wait_for_selector(".sheet .asst-mini-msgs")
        A.fill("#asstInput", "позвони"); A.click("#asstMic")
        B.wait_for_selector(".call.ringing", timeout=10000); B.click(".cbtn.red"); A.wait_for_selector(".call", state="detached", timeout=8000)
        print("assistant in chat: ok")
        # голос-персонаж «Джарвис»
        A.click(".back-btn"); A.click(".assistant-item"); A.click("button[title='Настройки']")
        A.click(".voice-card >> text=Джарвис"); A.wait_for_timeout(200); shot(A, "w5_A_voices"); A.click(".sheet .btn.wide")
        A.fill("#asstInput", "который час"); A.click("#chatView .composer .send"); A.wait_for_selector("#asstMsgs .msg.in:last-child >> text=Сэр, сейчас")
        assert "Джарвис" in A.evaluate("Assistant.llmName()")
        A.click(".back-btn")
        print("jarvis voice: ok")
        # приглашение через контакты (на телефоне) — подменяем мост Android
        A.evaluate("""() => { window.AndroidBridge = { pickContact() { setTimeout(() => window.onContactPicked({ name: 'Иван Петров', phone: '8 900 123-45-67' }), 50); },
            sendSms(p, t) { window.__sms = [p, t]; }, openUrl(u) { window.__url = u; }, shareText(t) { window.__share = t; } }; }""")
        A.click("#tabBtnContacts"); A.click("#tabContacts >> text=Пригласить из контактов телефона")
        A.wait_for_selector(".sheet >> text=Иван Петров"); shot(A, "w6_A_invite_contact")
        A.click(".sheet .menu-item >> text=SMS"); sms = A.evaluate("window.__sms")
        assert sms[0] == "8 900 123-45-67" and sms[1].startswith("Иван, привет!") and "SEMYA-4825" in sms[1], sms
        A.click("#tabContacts >> text=Пригласить из контактов телефона"); A.click(".sheet .menu-item >> text=WhatsApp")
        assert A.evaluate("window.__url").startswith("https://wa.me/79001234567?text="), A.evaluate("window.__url")
        print("invite via contacts: ok")
        # обновления: приложение (мост Android) видит новую сборку и скачивает её
        A.evaluate("() => { window.AndroidBridge.downloadUpdate = (u) => { window.__dl = u; [10, 55, 100].forEach((p, i) => setTimeout(() => window.onUpdateProgress(p), 200 * (i + 1))); }; window.AndroidBridge.notify = () => {}; }")
        A.evaluate("Prefs.set('autoUpdate', false)")
        A.evaluate("Updates.check(true)"); A.click("#tabBtnChats"); A.wait_for_selector(".upd-banner >> text=Доступна новая версия 2.3"); shot(A, "w7_A_update_banner")
        A.click("#tabBtnMenu"); A.click("#tabMenu .mn-tile:has-text('О приложении')"); A.wait_for_selector(".sheet .upd-dl.has"); A.wait_for_selector(".sheet .toggle-row.switch >> text=Автообновление")
        A.click(".sheet .upd-dl"); A.wait_for_selector(".sheet .upd-progress:not(.hidden)"); shot(A, "w8_A_about_download")
        assert A.evaluate("window.__dl").endswith("build-9/Semya.apk")
        A.wait_for_function("Updates.progress === 100"); A.click(".sheet-back", position={"x": 5, "y": 5})
        # автообновление: включили ползунок — следующая новая сборка скачивается сама
        A.evaluate("() => { window.__dl = null; localStorage.removeItem('updStarted'); Prefs.set('autoUpdate', true); return Updates.check(false); }"); A.wait_for_timeout(300)
        print("dbg", A.evaluate("[window.__dl, Updates.progress, Prefs.get('autoUpdate'), localStorage.getItem('updStarted'), !!Updates.latest, Updates.latest && Updates.latest.build]"))
        assert A.evaluate("window.__dl"), "автообновление не началось"
        print("updates: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
