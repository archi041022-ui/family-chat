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
        A = ctx.new_page()
        ctx.route("https://api.github.com/**", lambda r: r.abort())
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"A console: {m.text}"))
        import base64, json as _j
        V = "/tmp/fc-ve"
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        # статус → «Снять и смонтировать видео»
        A.click("#tabBtnStories"); A.evaluate("Stories.create()")
        A.click(".sheet >> text=Снять и смонтировать видео")
        A.wait_for_selector(".ve-cam .ve-rec"); A.wait_for_function("document.querySelector('.ve-cam-video').videoWidth > 0", timeout=8000)
        shot(A, "v1_camera")
        # снимаем фрагмент 2 секунды на скорости 2x
        A.click(".ve-side-btn:has-text('Скорость')"); A.click(".ve-side-btn:has-text('Скорость')")
        assert "2x" in A.inner_text(".ve-side-btn:has-text('Скорость')")
        A.click(".ve-rec"); A.wait_for_timeout(2200); A.click(".ve-rec")
        A.wait_for_function("VideoEditor.st.clips.length === 1", timeout=8000)
        cam = A.evaluate("(() => { const c = VideoEditor.st.clips[0]; return [c.dur, c.speed, isFinite(c.el.duration) ? c.el.duration : -1, c.blob.size]; })()")
        print("camera segment:", cam)
        assert 1.8 < cam[0] < 2.8 and cam[1] == 2 and cam[2] > 1.5, cam      # длительность записана в файл (WebmFix)
        seg = A.evaluate("(async () => { const b = VideoEditor.st.clips[0].blob; const r = new FileReader(); return await new Promise(res => { r.onload = () => res(r.result.split(';base64,')[1]); r.readAsDataURL(b); }); })()")
        open("/tmp/fc-ve/seg.webm", "wb").write(base64.b64decode(seg))
        # галерея: два видео и фото
        with A.expect_file_chooser() as fc: A.click(".ve-gallery")
        fc.value.set_files([f"{V}/clip1.webm", f"{V}/clip2.webm", f"{V}/photo.jpg"])
        A.wait_for_selector(".ve-edit .ve-canvas", timeout=10000)
        A.wait_for_function("VideoEditor.st.clips.length === 4")
        lens = A.evaluate("VideoEditor.st.clips.map(c => [c.kind, +VideoEditor.len(c).toFixed(2)])"); print("clips:", lens)
        # обрезка второго клипа (clip1.webm 4 с → 1..3.5)
        A.click(".ve-clip >> nth=1"); A.click(".ve-tools [data-t=clip]")
        A.evaluate("""() => { const [a, b] = document.querySelectorAll('.ve-panel input[type=range]'); a.value = 1; a.dispatchEvent(new Event('input')); b.value = 3.5; b.dispatchEvent(new Event('input')); b.dispatchEvent(new Event('change')); }""")
        c1 = A.evaluate("[VideoEditor.st.clips[1].in, VideoEditor.st.clips[1].out]"); assert c1 == [1, 3.5], c1
        # фильтр, текст, стикер, эффекты
        A.click(".ve-tools [data-t=filters]"); A.click(".ve-filters button:has-text('Яркий')")
        A.click(".ve-tools [data-t=text]"); A.fill(".ve-text-in", "Привет, семья!"); A.click(".ve-panel .btn:has-text('Добавить')")
        A.click(".ve-panel .ve-chips button:has-text('С фоном')"); A.click(".ve-colors button >> nth=2")
        A.click(".ve-tools [data-t=stickers]"); A.click(".ve-stickers button:has-text('🎉')")
        A.click(".ve-tools [data-t=effects]"); A.click(".ve-chips button:has-text('Виньетка')")
        # перетаскиваем текст пальцем
        A.evaluate("VideoEditor.st.overlays[1].y = 0.85; VideoEditor.player.redrawFrame()")
        box = A.evaluate("(() => { const o = VideoEditor.st.overlays[0], r = document.querySelector('.ve-canvas').getBoundingClientRect(); return [r.x + (o.box[0] + o.box[2]) / 2 * r.width, r.y + (o.box[1] + o.box[3]) / 2 * r.height, r.width, r.height, o.y]; })()")
        A.mouse.move(box[0], box[1]); A.mouse.down(); A.mouse.move(box[0], box[1] - box[3] * 0.2, steps=6); A.mouse.up()
        ny = A.evaluate("VideoEditor.st.overlays[0].y"); assert ny < box[4] - 0.1, (ny, box[4])
        r = A.evaluate("(() => { const r = document.querySelector('.ve-canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
        A.mouse.click(r[0] + r[2] * 0.08, r[1] + r[3] * 0.08); A.wait_for_timeout(200)            # первое касание снимает выделение текста
        assert A.evaluate("VideoEditor.st.ovSel") is None and A.evaluate("VideoEditor.player.playing") is False
        A.mouse.click(r[0] + r[2] * 0.08, r[1] + r[3] * 0.08); A.wait_for_timeout(300); assert A.evaluate("VideoEditor.player.playing") is True
        A.mouse.click(r[0] + r[2] * 0.08, r[1] + r[3] * 0.08); A.wait_for_timeout(200); assert A.evaluate("VideoEditor.player.playing") is False
        print("tap play/pause: ok")
        # музыка
        A.click(".ve-tools [data-t=music]")
        with A.expect_file_chooser() as fc: A.click(".ve-panel .menu-item:has-text('Выбрать музыку')")
        fc.value.set_files(f"{V}/music.ogg"); A.wait_for_selector(".ve-panel >> text=Музыка: music")
        A.wait_for_timeout(1200); A.evaluate("VideoEditor.player.pause()")
        # порядок: фото — вперёд
        A.click(".ve-clip >> nth=3"); A.click(".ve-tools [data-t=order]"); A.click(".ve-panel button:has-text('Раньше')")
        assert A.evaluate("VideoEditor.st.clips[2].kind") == "image"
        A.evaluate("VideoEditor.player.seek(1.0)"); A.wait_for_timeout(400); shot(A, "v2_editor")
        total = A.evaluate("VideoEditor.total()"); print("total", total)
        # сборка видео
        A.click(".ve-done"); A.wait_for_selector(".ve-export"); shot(A, "v3_export")
        A.wait_for_selector(".sheet >> text=Видео готово", timeout=int(total * 1000) + 25000)
        shot(A, "v4_ready")
        out = A.evaluate("(async () => { const b = VideoEditor.result; const r = new FileReader(); return [b.type, await new Promise(res => { r.onload = () => res(r.result.split(';base64,')[1]); r.readAsDataURL(b); })]; })()")
        open("/tmp/fc-ve/out.webm", "wb").write(base64.b64decode(out[1])); print("result type", out[0])
        # публикация в статус
        A.fill(".ve-caption", "Наши выходные"); A.click(".sheet .btn:has-text('Опубликовать в статус')")
        A.wait_for_selector(".ve-root", state="detached", timeout=10000)
        st = A.evaluate("Stories.list.filter(s => s.user_id === S.me.id).map(s => [s.media_type, s.body, s.media_path.endsWith('.webm')])")
        assert st == [["video", "Наши выходные", True]], st
        A.evaluate("Stories.open(S.me.id)"); A.wait_for_selector(".story-viewer video")
        A.wait_for_function("(() => { const v = document.querySelector('.story-viewer video'); return v && v.readyState >= 2 && isFinite(v.duration) && v.duration > 3; })()", timeout=8000)
        shot(A, "v5_story"); print("story video duration:", A.evaluate("document.querySelector('.story-viewer video').duration"))
        A.evaluate("Stories.closeViewer && Stories.closeViewer()")
        # из чата: редактор открывается и закрывается кнопкой «назад»
        A.click("#tabBtnChats"); A.click("#chatItems .quick-bar .family-pill"); A.wait_for_selector("#input")
        A.evaluate("VideoEditor.open({ chat: S.current })"); A.wait_for_selector(".ve-cam")
        A.evaluate("window.handleBack()"); A.wait_for_selector(".ve-root", state="detached")
        print("video editor: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
