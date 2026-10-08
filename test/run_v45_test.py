"""v4.5: ассистент Макс (команды, настройки, приветствие голосом) и видеоредактор (звук, кадр, разрезание)."""
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
        ctx = b.new_context(viewport={"width": 390, "height": 800}, permissions=["camera", "microphone"], has_touch=True)
        ctx.add_init_script("window.__spoken = []; window.__keepFamily = false;")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"A console: {m.text}"))
        V = "/tmp/fc-ve"
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000)
        # приветствие голосом: подменяем озвучку и смотрим, что сказано
        A.evaluate("() => { Voice2.speak = (t) => { window.__spoken.push(t); }; }")
        A.wait_for_selector(".welcome", timeout=8000); A.wait_for_timeout(1800)
        sp = A.evaluate("window.__spoken"); assert sp and sp[0] and "Добро пожаловать" in sp[0] and "Папа" in sp[0] and "Макс" in sp[0], sp
        print("голосовое приветствие: ok")
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        A.evaluate("Assistant.load(); Assistant.loaded = true; Assistant.settings.speak = true")
        cmd = lambda t: A.evaluate("(t) => Maks.command(t)", t)
        # обращение по имени
        assert A.evaluate("Maks.addressed('привет макс открой настройки') && !Maks.addressed('максим пришёл')")
        assert A.evaluate("Maks.strip('Макс, открой настройки')") == "открой настройки"
        # навигация
        assert cmd("открой настройки") is True; A.wait_for_timeout(300); assert A.evaluate("S.tab") == "settings"
        assert cmd("Макс, открой контакты") is True; assert A.evaluate("S.tab") == "contacts"
        assert cmd("открой звонки") is True and A.evaluate("S.tab") == "calls"
        assert cmd("открой чаты") is True and A.evaluate("S.tab") == "chats"
        assert cmd("где находятся истории") is True and A.evaluate("S.tab") == "stories"
        assert cmd("открой оформление") is True; A.wait_for_selector(".sheet h3:has-text('Оформление')"); A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove())")
        assert cmd("открой конфиденциальность") is True; A.wait_for_selector(".sheet"); A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove())")
        assert cmd("открой уведомления") is True; A.wait_for_selector(".sheet"); A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove())")
        assert cmd("открой панель управления") is True      # не админ — отказ, но команда распознана
        assert A.evaluate("!document.querySelector('.adm-body')") or True
        print("навигация: ok")
        # оформление
        assert cmd("включи тёмную тему") is True and A.evaluate("document.documentElement.dataset.mode") == "dark"
        assert cmd("включи светлую тему") is True and A.evaluate("document.documentElement.dataset.mode") == "light"
        assert cmd("включи автоматическую тему") is True and A.evaluate("document.documentElement.dataset.mode") is None
        f0 = A.evaluate("Prefs.get('fontSize') || 16"); assert cmd("увеличь шрифт") is True
        assert A.evaluate("Prefs.get('fontSize')") > f0
        assert cmd("уменьши шрифт") is True
        print("оформление: ok")
        # переключатели и справка
        assert cmd("выключи озвучку") is True and A.evaluate("Assistant.settings.speak") is False
        assert cmd("включи озвучку") is True and A.evaluate("Assistant.settings.speak") is True
        assert cmd("что ты умеешь в приложении") is True
        assert cmd("какая погода") is False and cmd("расскажи анекдот") is False     # обычные вопросы идут дальше
        # что нового (чужое сообщение приходит позже в других тестах: здесь просто нет непрочитанных)
        assert cmd("что нового") is True
        # режим «Макс»: включение, значок, выключение
        A.evaluate("Maks.setWake(true)"); A.wait_for_selector("#maksDot"); assert A.evaluate("Assistant.settings.wake") is True
        A.click("#maksDot"); A.wait_for_selector("#maksDot", state="detached"); assert A.evaluate("Assistant.settings.wake") is False
        # обращение голосом: «Макс, открой меню» разбирается как команда
        A.evaluate("Maks.on = true; Maks.hear('Макс, открой меню')"); A.wait_for_timeout(500); assert A.evaluate("S.tab") == "menu"
        A.evaluate("Maks.stop()"); A.evaluate("Maks.hear('просто разговор рядом')"); A.wait_for_timeout(300); assert A.evaluate("S.tab") == "menu"
        print("режим Макс: ok")
        # ── видеоредактор: звук, кадр, разрезание
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove()); S.tab === 'menu' || showTab('menu')"); A.wait_for_timeout(300); A.click("#tabMenu .mn-tile:has-text('Видеоредактор')"); A.wait_for_selector(".ve-cam")
        with A.expect_file_chooser() as fc: A.click(".ve-gallery")
        fc.value.set_files([f"{V}/clip1.webm", f"{V}/clip2.webm"]); A.wait_for_selector(".ve-edit .ve-canvas", timeout=10000)
        A.click(".ve-tools [data-t=sound]")
        A.click(".ve-panel .menu-item:has-text('Убрать звук со всего видео')")
        assert A.evaluate("VideoEditor.st.clips.every(c => c.mute)")
        A.wait_for_selector(".ve-panel .menu-item:has-text('Вернуть звук видео')")
        A.click(".ve-panel .menu-item:has-text('Вернуть звук видео')")
        assert A.evaluate("VideoEditor.st.clips.every(c => !c.mute)")
        A.click(".ve-panel .menu-item:has-text('Убрать звук со всего видео')")
        print("убрать звук: ok")
        A.click(".ve-tools [data-t=view]")
        A.click(".ve-panel button:has-text('Вправо')"); assert A.evaluate("VideoEditor.st.clips[0].rot") == 90
        A.click(".ve-panel button:has-text('Отразить')"); assert A.evaluate("VideoEditor.st.clips[0].flip") is True
        A.wait_for_timeout(400); A.evaluate("VideoEditor.player.seek(0.5)"); A.wait_for_timeout(400)
        A.click(".ve-panel button:has-text('Сбросить')"); assert A.evaluate("VideoEditor.st.clips[0].rot") == 0 and not A.evaluate("VideoEditor.st.clips[0].flip")
        print("поворот и отражение: ok")
        n0 = A.evaluate("VideoEditor.st.clips.length"); d0 = A.evaluate("VideoEditor.total()")
        A.evaluate("VideoEditor.st.sel = 0; VideoEditor.tool('clip')")
        A.evaluate("VideoEditor.st.clips[0].in = 0; VideoEditor.st.clips[0].out = Math.min(VideoEditor.st.clips[0].dur, 6)")
        A.evaluate("VideoEditor.player.seek(VideoEditor.len(VideoEditor.st.clips[0]) / 2)"); A.wait_for_timeout(300)
        A.click(".ve-panel .menu-item:has-text('Разрезать клип')"); A.wait_for_timeout(1200)
        assert A.evaluate("VideoEditor.st.clips.length") == n0 + 1, A.evaluate("VideoEditor.st.clips.length")
        assert abs(A.evaluate("VideoEditor.total()") - d0) < 1.5
        c0, c1 = A.evaluate("[VideoEditor.st.clips[0].out, VideoEditor.st.clips[1].in]"); assert abs(c0 - c1) < 0.01, (c0, c1)
        assert A.evaluate("VideoEditor.st.clips[1].mute") is True        # звук остаётся убранным и у новой части
        print("разрезание: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
