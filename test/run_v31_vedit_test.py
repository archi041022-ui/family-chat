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
        ctx.add_init_script("window.__noWelcome = true"); ctx.add_init_script("window.__media = new Set(); const __op = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__media.add(this); return __op.apply(this, arguments); };")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page()
        A = ctx.new_page()
        ctx.route("https://api.github.com/**", lambda r: r.abort())
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"A console: {m.text}"))
        import base64
        V = "/tmp/fc-ve"
        playing = lambda: A.evaluate("[...window.__media].filter(m => !m.paused && m.isConnected !== undefined).length")
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        def open_editor(files):
            A.evaluate("S.tab === 'menu' || showTab('menu')"); A.click("#tabMenu .mn-tile:has-text('Видеоредактор')"); A.wait_for_selector(".ve-cam")
            with A.expect_file_chooser() as fc: A.click(".ve-gallery")
            fc.value.set_files([f"{V}/{f}" for f in files]); A.wait_for_selector(".ve-edit .ve-canvas", timeout=10000)
        # ── 1) музыка из интернета и остановка звука
        open_editor(["clip1.webm"])
        A.click(".ve-tools [data-t=music]"); A.click(".ve-panel .menu-item:has-text('Найти музыку в интернете')")
        A.wait_for_selector(".sheet .ve-ml-row >> text=Happy Morning", timeout=8000); shot(A, "w1_music_search")
        assert A.evaluate("window.__musicCalls[0]") == {"action": "search", "q": "happy"}
        A.click(".sheet .ve-moods button:has-text('Спокойная')"); A.wait_for_function("window.__musicCalls.some(c => c.q === 'calm piano')")
        A.click(".sheet .ve-ml-row >> nth=0 >> .ve-ml-play"); A.wait_for_function("VideoEditor.mlPreview && !VideoEditor.mlPreview.paused", timeout=8000)
        print("preview plays: ok")
        A.click(".sheet .ve-ml-row >> nth=0 >> .ve-ml-add"); A.wait_for_selector(".sheet-back", state="detached", timeout=8000)
        A.wait_for_function("VideoEditor.st.music && VideoEditor.st.music.credit && VideoEditor.player.playing", timeout=8000)
        assert A.evaluate("VideoEditor.mlPreview") is None, "превью не остановлено"
        cr = A.evaluate("VideoEditor.st.music.credit"); assert cr == {"title": "Happy Morning", "artist": "Test Band", "license": "CC BY 4.0"}, cr
        A.wait_for_selector(".ve-panel >> text=Happy Morning"); shot(A, "w2_music_added")
        assert playing() >= 1
        # свернули приложение — всё на паузе
        A.evaluate("window.onAppBackground()"); A.wait_for_timeout(300)
        assert playing() == 0, "звук играет после сворачивания"
        print("background pause: ok")
        # снова играем и выходим из редактора «назад» → «Выйти без сохранения»
        A.evaluate("VideoEditor.player.play()"); A.wait_for_timeout(600); assert playing() >= 1
        A.evaluate("window.handleBack()"); A.wait_for_selector(".ve-cam"); assert playing() == 0, "играет после выхода из монтажа"
        A.evaluate("window.handleBack()"); A.click(".sheet .menu-item.danger:has-text('Выйти без сохранения')")
        A.wait_for_selector(".ve-root", state="detached"); A.wait_for_timeout(1500)
        assert playing() == 0, "музыка играет после закрытия редактора"
        assert A.evaluate("VideoEditor.st") is None and A.evaluate("[...window.__media].every(m => !m.getAttribute('src') || m.paused)")
        print("music stops on exit: ok")
        # кнопка ✕ на камере после монтажа с музыкой
        open_editor(["clip2.webm"]); A.click(".ve-tools [data-t=music]"); A.click(".ve-panel .menu-item:has-text('Найти музыку в интернете')")
        A.click(".sheet .ve-ml-row >> nth=0 >> .ve-ml-add"); A.wait_for_function("VideoEditor.st.music && VideoEditor.player.playing", timeout=8000)
        A.click(".ve-top .icon-btn"); A.wait_for_selector(".ve-cam"); A.click(".ve-cam-top .icon-btn"); A.click(".sheet .menu-item.danger:has-text('Выйти без сохранения')")
        A.wait_for_selector(".ve-root", state="detached"); A.wait_for_timeout(1000); assert playing() == 0
        print("close button: ok")
        # ── 2) спецэффекты, частицы, переходы, анимация текста
        open_editor(["clip2.webm", "clip1.webm"])
        A.click(".ve-tools [data-t=effects]")
        for lbl in ["Размытый фон", "VHS-кассета", "Глитч", "Пульс в ритм"]: A.click(f".ve-panel .ve-chips button:has-text('{lbl}')")
        A.click(".ve-panel .ve-chips button:has-text('Снег')")
        fx = A.evaluate("[...VideoEditor.st.effects].sort().join(',') + '|' + VideoEditor.st.particles"); assert fx == "blurbg,glitch,pulse,vhs|snow", fx
        A.click(".ve-tools [data-t=transitions]"); A.click(".ve-panel .ve-chips button:has-text('Сдвиг')")
        assert A.evaluate("VideoEditor.st.transition") == "slide"
        A.click(".ve-tools [data-t=text]"); A.fill(".ve-text-in", "С днём рождения!"); A.click(".ve-panel .btn:has-text('Добавить')")
        A.click(".ve-panel .ve-chips button:has-text('Печать')"); assert A.evaluate("VideoEditor.st.overlays[0].anim") == "type"
        A.wait_for_timeout(2000); A.evaluate("VideoEditor.player.seek(1.5)"); A.wait_for_timeout(400); shot(A, "w3_effects")
        total = A.evaluate("VideoEditor.total()")
        A.click(".ve-done"); A.wait_for_selector(".sheet >> text=Видео готово", timeout=int(total * 1000) + 25000)
        out = A.evaluate("(async () => { const b = VideoEditor.result; const r = new FileReader(); return await new Promise(res => { r.onload = () => res(r.result.split(';base64,')[1]); r.readAsDataURL(b); }); })()")
        open(f"{V}/fx.webm", "wb").write(base64.b64decode(out))
        print("effects export: ok", total)
        A.click(".sheet .menu-item:has-text('Вернуться к монтажу')"); A.evaluate("window.handleBack()"); A.evaluate("window.handleBack()")
        A.click(".sheet .menu-item.danger:has-text('Выйти без сохранения')"); A.wait_for_selector(".ve-root", state="detached")
        assert playing() == 0
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
