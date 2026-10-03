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
        # модель Android: как Sounds.kt — одна очередь (главный поток), один плеер, «стоп» отменяет не начавшийся запуск;
        # уведомление о звонке (приложение в фоне) тоже запускает мелодию
        B.add_init_script("""(() => { if (!/index/.test(location.pathname)) return;
          const q = (f) => setTimeout(f, 5);
          window.AndroidBridge = { fg: false, seq: 0, ringing: false, starts: 0, log: [],
            isForeground() { return this.fg; },
            ringStart() { const s = this.seq; q(() => { if (s !== this.seq || this.ringing) return; this.ringing = true; this.starts++; this.log.push('start'); }); },
            ringStop() { this.seq++; q(() => { if (this.ringing) this.log.push('stop'); this.ringing = false; }); },
            incomingCall2(n, v) { if (!this.fg) this.ringStart(); }, incomingCall(n) { if (!this.fg) this.ringStart(); },
            cancelCall() { this.ringStop(); }, callState() {}, notify() {}, loggedIn() {}, loggedOut() {}, takeShared() { return ''; } }; })()""")
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        A.click("#tabBtnContacts"); A.wait_for_selector("#tabContacts .contact-row:has-text('Мама')")
        ringing = lambda: B.evaluate("AndroidBridge.ringing")
        def call(video=False):
            A.click("#tabContacts .contact-row:has-text('Мама') button[title='%s']" % ("Видеозвонок" if video else "Позвонить"))
            B.wait_for_selector(".call.ringing", timeout=8000); B.wait_for_timeout(300)
            assert ringing(), "мелодия не началась"
            assert B.evaluate("AndroidBridge.starts") >= 1
        def hang():
            A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000); A.wait_for_selector(".call", state="detached", timeout=8000)
        # 1) ответ в приложении — мелодия остановилась и больше не начинается (повторные вызовы звонящего)
        call(); B.click(".call .cbtn.green")
        A.wait_for_function("/\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        B.wait_for_timeout(5000)                                  # звонящий продолжает слать повторы — не должны будить мелодию
        assert not ringing(), B.evaluate("AndroidBridge.log")
        print("answer in app: ok", B.evaluate("AndroidBridge.log"))
        hang(); assert not ringing()
        # 2) ответ из уведомления («Ответить» до показа экрана)
        B.evaluate("AndroidBridge.log = []; window.answerIncoming()")
        A.click("#tabContacts .contact-row:has-text('Мама') button[title='Видеозвонок']")
        A.wait_for_function("/\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        B.wait_for_timeout(1500); assert not ringing(), B.evaluate("AndroidBridge.log")
        print("answer from notification: ok", B.evaluate("AndroidBridge.log"))
        hang(); assert not ringing()
        # 3) отклонить
        call(); B.click(".call .cbtn.red"); A.wait_for_selector(".call", state="detached", timeout=8000); B.wait_for_timeout(500)
        assert not ringing(); print("decline: ok")
        # 4) звонящий сбросил до ответа
        call(); A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000); B.wait_for_timeout(500)
        assert not ringing(); print("caller hung up: ok")
        # 5) приложение на экране — уведомление мелодию не дублирует, ответ останавливает
        B.evaluate("AndroidBridge.fg = true; AndroidBridge.starts = 0")
        call(); B.click(".call .cbtn.green"); A.wait_for_function("/\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        B.wait_for_timeout(1500); assert not ringing() and B.evaluate("AndroidBridge.starts") == 1
        hang(); print("foreground: ok")
        # 6) групповой видеочат: приглашение звенит, «Войти» останавливает (и повторные приглашения тоже не звенят)
        B.evaluate("AndroidBridge.fg = false")
        A.click("#tabBtnChats"); A.click("#chatItems .quick-bar .family-pill"); A.wait_for_selector("#input")
        A.evaluate("GroupCall.start('00000000-0000-0000-0000-000000000001', false)")
        B.wait_for_selector(".gc-invite", timeout=8000); B.wait_for_timeout(300); assert ringing()
        B.click(".gc-invite .cbtn.green"); B.wait_for_timeout(9000)    # повтор приглашения через 7 с
        assert not ringing(), B.evaluate("AndroidBridge.log"); print("group call: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
