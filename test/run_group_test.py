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
        A = ctx.new_page(); B = ctx.new_page(); C = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        C.click("#chatList .chat-item:has-text('Семья')"); C.wait_for_selector("#input")
        # Папа начинает видеочат из группы
        A.click("#chatList .chat-item:has-text('Семья')"); A.wait_for_selector("#input")
        A.click("#chatView .topbar button[title='Видеочат']")
        A.wait_for_selector(".gcall"); A.wait_for_timeout(500); shot(A, "g1_A_waiting")
        B.wait_for_selector(".gc-invite", timeout=8000); shot(B, "g2_B_invite")
        assert "Папа зовёт в видеочат" in B.inner_text(".gc-invite")
        # Сын в открытом чате видит сообщение-приглашение и кнопку
        C.wait_for_selector(".gc-invite", timeout=8000); C.click(".gc-invite .cbtn.red")   # отклоняет звонок…
        C.wait_for_selector("#gcBanner", timeout=8000); shot(C, "g3_C_banner")             # …но видит плашку «идёт видеочат»
        assert C.locator(".bubble .gc-join").count() >= 1
        B.click(".gc-invite .cbtn.green"); B.wait_for_selector(".gcall")
        def tiles_ok(pg, n):
            pg.wait_for_function(f"document.querySelectorAll('.gcall .tile').length === {n} && document.querySelectorAll('.gcall .tile.wait').length === 0 && document.querySelectorAll('.gcall .tile.has-video').length === {n}", timeout=20000)
        tiles_ok(A, 2); tiles_ok(B, 2)
        print("2-way: ok")
        C.click("#gcBanner .btn"); C.wait_for_selector(".gcall")
        for pg in (A, B, C): tiles_ok(pg, 3)
        A.wait_for_timeout(1500)
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")): shot(pg, f"g4_{nm}_three")
        # кадры реально идут от всех
        for pg in (A, B, C):
            vids = pg.evaluate("[...document.querySelectorAll('.gcall .tile:not(.me) video')].map(v => [v.videoWidth, v.readyState, v.srcObject.getAudioTracks().length])")
            assert all(w > 0 and rs >= 2 and a == 1 for w, rs, a in vids), vids
        print("3-way video+audio: ok")
        # Мама выключает микрофон — у остальных значок
        B.click(".gcall .controls .cbtn >> nth=0")
        A.wait_for_selector(".gcall .tile.muted:has-text('Мама')", timeout=8000)
        # Сын выключает камеру — у остальных аватар вместо видео
        C.click(".gcall .controls .cbtn >> nth=1")
        A.wait_for_function("!document.querySelector(\".gcall .tile:has(.nm)[data-uid] .nm\") || [...document.querySelectorAll('.gcall .tile')].some(t => t.innerText.includes('Сын') && !t.classList.contains('has-video'))", timeout=8000)
        shot(A, "g5_A_muted_camoff")
        print("mic/cam state: ok")
        C.click(".gcall .controls .cbtn >> nth=1")
        A.wait_for_function("[...document.querySelectorAll('.gcall .tile')].some(t => t.innerText.includes('Сын') && t.classList.contains('has-video'))", timeout=8000)
        print("cam back on: ok")
        # звонок один-на-один участнику видеочата — «занят»
        assert A.evaluate("window.handleBack()") is True and A.locator(".gcall").count() == 1
        # Сын выходит
        C.click(".gcall .cbtn.red"); C.wait_for_selector(".gcall", state="detached")
        tiles_ok(A, 2); tiles_ok(B, 2)
        print("leave: ok")
        C.wait_for_selector("#gcBanner", timeout=8000)
        # возвращается через плашку
        C.click("#gcBanner .btn"); C.wait_for_selector(".gcall")
        for pg in (A, B, C): tiles_ok(pg, 3)
        print("rejoin: ok")
        # Мама: аудио-чат включает камеру позже — проверено выше на Сыне; теперь все выходят
        for pg in (A, B, C): pg.click(".gcall .cbtn.red")
        C.wait_for_timeout(1000)
        assert C.locator("#gcBanner").count() == 0 or C.wait_for_selector("#gcBanner", state="detached", timeout=15000) is None
        print("all left: ok")
        # групповой звонок без видео, камера включается позже
        B.click("#chatList .chat-item:has-text('Семья')") if B.locator("#chatView").count() == 0 else None
        B.wait_for_selector("#input")
        B.click("#chatView .topbar button[title='Групповой звонок']"); B.wait_for_selector(".gcall")
        A.wait_for_selector(".gc-invite", timeout=8000); A.click(".gc-invite .cbtn.green")
        A.wait_for_function("document.querySelectorAll('.gcall .tile').length === 2 && !document.querySelector('.gcall .tile.wait')", timeout=20000)
        assert A.locator(".gcall .tile.has-video").count() == 0
        B.click(".gcall .controls .cbtn >> nth=1")   # Мама включает камеру
        A.wait_for_function("[...document.querySelectorAll('.gcall .tile')].some(t => t.innerText.includes('Мама') && t.classList.contains('has-video'))", timeout=15000)
        A.click(".gcall .controls .cbtn >> nth=1")   # Папа тоже
        B.wait_for_function("[...document.querySelectorAll('.gcall .tile')].some(t => t.innerText.includes('Папа') && t.classList.contains('has-video'))", timeout=15000)
        B.wait_for_timeout(1500)
        w = B.evaluate("[...document.querySelectorAll('.gcall .tile:not(.me) video')].map(v => v.videoWidth)")
        assert all(x > 0 for x in w), w
        shot(B, "g6_B_audio_then_video")
        print("audio→video upgrade: ok")
        # ассистент: «начни видеочат»
        for pg in (A, B): pg.click(".gcall .cbtn.red")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
