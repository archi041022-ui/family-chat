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
        # сеть «режет» звонки: напрямую соединиться нельзя (только через ретранслятор, которого нет)
        ctx.add_init_script("(() => { const O = window.RTCPeerConnection; const W = function (cfg) { cfg = cfg || {}; cfg.iceTransportPolicy = 'relay'; return new O(cfg); }; W.prototype = O.prototype; window.RTCPeerConnection = W; })()")
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
        # кодек: туда-обратно без заметных потерь
        err = A.evaluate("() => { const f = new Float32Array(3200).map((_, i) => Math.sin(i / 9) * 0.6); const r = CallRelay.dec(CallRelay.unb64(CallRelay.b64(CallRelay.enc(f)))); let m = 0; for (let i = 0; i < f.length; i++) m = Math.max(m, Math.abs(f[i] - r[i])); return m; }")
        assert err < 0.05, err
        print("codec: ok", round(err, 4))
        A.evaluate("(id) => void Calls.start(id, false)", ids["Мама"])
        B.wait_for_selector(".call.ringing", timeout=8000); B.click(".cbtn.green")
        A.wait_for_function("/через сервер/.test(document.querySelector('.call .status')?.textContent || '')", timeout=25000)
        B.wait_for_function("/через сервер/.test(document.querySelector('.call .status')?.textContent || '')", timeout=25000)
        A.wait_for_timeout(2500)
        a, bb = A.evaluate("[CallRelay.tx, CallRelay.rx]"), B.evaluate("[CallRelay.tx, CallRelay.rx]")
        assert a[0] > 3 and bb[0] > 3 and a[1] > 3 and bb[1] > 3, (a, bb)
        print("relay call: ok", a, bb)
        A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000)
        assert not A.evaluate("CallRelay.on") and not B.evaluate("CallRelay.on") and not A.evaluate("Calls.relay")
        print("relay stop: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
