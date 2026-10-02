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
        for pg, nm in ((A, "A"), (B, "B")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        name = lambda n: f"#chatItems .chat-item:not(.quick-pill):has(.name:text-is('{n}'))"
        # ── 1. панель сверху
        A.wait_for_selector(".quick-bar .assistant-item"); A.wait_for_selector(".quick-bar .tasks-item"); A.wait_for_selector(".quick-bar .family-pill")
        assert A.locator(name("Семья")).count() == 0
        shot(A, "y1_A_quickbar")
        A.click(".quick-bar .family-pill"); A.wait_for_selector("#chatView .topbar >> text=Семья"); A.click(".back-btn")
        print("quick bar: ok")
        # ── 5. обновление свайпом вниз
        A.evaluate("""() => { const el = document.querySelector('#chatList'); const t = (y) => new Touch({ identifier: 1, target: el, clientX: 150, clientY: y });
            el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(100)], bubbles: true }));
            el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(330)], bubbles: true }));
            el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })); }""")
        A.wait_for_selector(".ptr.spin", timeout=2000); shot(A, "y2_A_pull"); A.wait_for_selector(".ptr.done", timeout=5000)
        print("pull to refresh: ok")
        # ── 4. приватная группа по заявке
        A.click(".fab"); A.click(".sheet >> text=Создать группу")
        A.fill(".sheet input[placeholder='Название группы']", "Рыбалка"); A.click(".sheet >> text=Создать группу >> nth=-1"); A.wait_for_selector("#chatView .topbar >> text=Рыбалка")
        A.click(".back-btn")
        B.click(".fab"); B.click(".sheet >> text=Найти группы и каналы"); B.wait_for_selector(".dir-row >> text=Рыбалка"); shot(B, "y3_B_directory")
        B.click(".dir-row:has-text('Рыбалка') .btn"); B.wait_for_selector(".dir-row:has-text('Рыбалка') .btn >> text=Заявка отправлена")
        A.wait_for_selector("text=просит вступить", timeout=8000); A.wait_for_selector(name("Рыбалка") + " .req-badge")
        A.click(name("Рыбалка")); A.click("#chatView .topbar .title"); A.wait_for_selector(".req-block >> text=Мама"); shot(A, "y4_A_request")
        A.click(".req-block button[title='Принять']")
        B.wait_for_selector("text=Вас приняли", timeout=8000); B.click(".sheet-back", position={"x": 5, "y": 5})
        B.wait_for_selector(name("Рыбалка"))
        print("join by request: ok")
        # ── 3. сообщения после одобрения
        A.click(".sheet-back", position={"x": 5, "y": 5}) if A.locator(".sheet-back").count() else None
        A.click("#chatView .topbar .title"); A.click(".sheet .toggle-row:has-text('после одобрения')"); A.wait_for_timeout(400); A.click(".sheet-back", position={"x": 5, "y": 5})
        B.click(name("Рыбалка")); B.wait_for_selector("#input")
        B.fill("#input", "Можно на рыбалку в субботу?"); B.click(".composer .send")
        B.wait_for_selector(".msg.out .mod-bar >> text=после одобрения")
        A.wait_for_selector(".msg.in .mod-bar >> text=Ждёт вашего одобрения", timeout=8000); shot(A, "y5_A_moderation")
        A.click(".msg.in .mod-bar .btn >> text=Опубликовать")
        B.wait_for_selector(".msg.out .mod-bar", state="detached", timeout=8000)
        B.fill("#input", "Спам"); B.click(".composer .send"); A.wait_for_selector(".msg.in .text >> text=Спам", timeout=8000)
        A.click(".msg.in:has-text('Спам') .mod-bar .btn >> text=✕")
        B.wait_for_selector(".msg .text >> text=Спам", state="detached", timeout=8000)
        print("moderation: ok")
        B.click(".back-btn"); A.click(".back-btn")
        # ── 2. открытый канал: пишут все
        A.click(".fab"); A.click(".sheet >> text=Создать канал"); A.fill(".sheet input[placeholder='Название канала']", "Новости")
        A.click(".sheet .segmented >> text=Открытый"); A.click(".sheet >> text=Создать канал >> nth=-1"); A.wait_for_selector("#chatView.channel")
        B.click(".fab"); B.click(".sheet >> text=Найти группы и каналы"); B.click(".dir-row:has-text('Новости') .btn"); B.wait_for_selector("#chatView.channel .composer")
        B.fill("#input", "Привет всем подписчикам"); B.click(".composer .send"); A.wait_for_selector(".msg.in .text >> text=Привет всем подписчикам", timeout=8000)
        assert A.locator(".msg.in .mod-bar").count() == 0
        print("open channel posting: ok")
        B.click(".back-btn"); A.click(".back-btn")
        # ── 6. сканер документов → PDF
        A.click(name("Мама")) if A.locator(name("Мама")).count() else A.click("#chatItems .chat-item[data-user]:has-text('Мама')")
        A.wait_for_selector("#input")
        A.click(".composer button[title='Фото, видео, файл']"); A.click(".sheet >> text=Сканер документов")
        A.wait_for_selector(".camera.doc"); A.wait_for_function("document.querySelector('.cam-video').videoWidth > 0", timeout=10000); shot(A, "y6_A_camera")
        A.click(".cam-shutter"); A.wait_for_selector(".scan-quad circle"); A.wait_for_timeout(300); shot(A, "y7_A_corners")
        A.click(".scan-editor .btn >> text=Дальше"); A.wait_for_selector(".scan-filters", timeout=15000); shot(A, "y8_A_filter")
        A.click(".scan-editor .btn >> text=Ещё страница"); A.wait_for_selector(".cam-pages >> text=Страниц: 1")
        A.click(".cam-shutter"); A.click(".scan-editor .btn >> text=Дальше"); A.wait_for_selector(".scan-filters", timeout=15000)
        A.click(".scan-filters >> text=Улучшить"); A.click(".scan-editor .btn >> text=Готово")
        A.wait_for_selector(".sheet >> text=PDF готов · 2 страницы", timeout=15000); shot(A, "y9_A_pdf")
        import base64
        b64 = A.evaluate("new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(Camera.lastPdf); })")
        open("/tmp/scan.pdf", "wb").write(base64.b64decode(b64))
        import pypdf
        rd = pypdf.PdfReader("/tmp/scan.pdf"); assert len(rd.pages) == 2, len(rd.pages)
        print("pdf pages:", len(rd.pages), "size:", len(base64.b64decode(b64)))
        A.click(".sheet .btn >> text=Отправить в этот чат"); B.click(name("Папа")) if B.locator(name("Папа")).count() else None
        A.wait_for_selector(".msg.out .file >> text=.pdf", timeout=10000)
        # распознавание листа на искусственном снимке
        q = A.evaluate("""() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d');
            x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, 800, 600); x.fillStyle = '#f4f4f4'; x.beginPath(); x.moveTo(150, 80); x.lineTo(640, 120); x.lineTo(600, 540); x.lineTo(120, 500); x.closePath(); x.fill();
            return DocScan.detect(c).map(p => p.map(Math.round)); }""")
        exp = [[150, 80], [640, 120], [600, 540], [120, 500]]
        assert all(abs(a[0] - e[0]) < 20 and abs(a[1] - e[1]) < 20 for a, e in zip(q, exp)), q
        print("document detection:", q)
        print("scanner + pdf: ok")
        # ── обычное фото камерой приложения
        A.click(".composer button[title='Фото, видео, файл']"); A.click(".sheet >> text=Сделать фото")
        A.wait_for_function("document.querySelector('.cam-video') && document.querySelector('.cam-video').videoWidth > 0", timeout=10000)
        A.click(".cam-shutter"); A.click(".scan-editor .btn >> text=Отправить"); A.wait_for_selector(".msg.out img.photo", timeout=10000)
        print("in-app photo: ok")
        # ── 7. реакции в видеозвонке
        A.click("#chatView .topbar button[title='Видеозвонок']")
        B.wait_for_selector(".call.ringing", timeout=10000); B.click(".cbtn.green")
        A.wait_for_function("/\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        A.click(".call .react-btn"); A.click(".react-bar button >> text=❤️")
        B.wait_for_selector(".call .call-react-layer .call-react-big >> text=❤️", timeout=5000); shot(B, "y10_B_call_reaction")
        B.click(".call .react-btn"); B.click(".react-bar button >> text=🎉"); A.wait_for_selector(".call .call-react-big >> text=🎉", timeout=5000)
        A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000)
        print("call reactions: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
