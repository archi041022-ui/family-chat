"""v4.11 встроено в телефон (мост, переключатель, открытие ассистента). Прежнее: v4.5: ассистент Макс (команды, настройки, приветствие голосом) и видеоредактор (звук, кадр, разрезание)."""
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
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.add_init_script("""window.__calls = []; window.__launch = false; window.__state = 'off';
          window.AndroidBridge = { speak() {}, speak2() {}, stop() {}, muteBeeps() {}, resetVoice() {}, listen() { window.__calls.push('listen'); }, listenWake() {}, stopListen() {},
            takeLaunchAction() { const v = window.__launch; window.__launch = false; return v; },
            agentOverlay(on) { window.__calls.push('overlay:' + on); window.__state = on ? (window.__perm ? 'ok' : 'permission') : 'off'; return window.__state; },
            agentOverlayState() { return window.__state; } };""")
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000); A.wait_for_timeout(1500)
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        # открытие по нажатию на кнопку/ярлык (приложение запущено)
        A.evaluate("window.__agentAt = 0; window.onOpenAgent()"); A.wait_for_selector("#asstInput", timeout=4000)
        assert A.evaluate("Assistant.mini") is True
        print("onOpenAgent открывает ассистента: ok")
        A.evaluate("Assistant.closeMini()"); A.wait_for_timeout(400)
        # холодный запуск: нативная сторона оставила флаг
        A.evaluate("window.__agentAt = 0; window.__launch = true"); A.wait_for_selector("#asstInput", timeout=5000)
        assert A.evaluate("window.__launch") is False
        print("отложенный запуск подхватывается: ok")
        A.evaluate("Assistant.closeMini()"); A.wait_for_timeout(400)
        # переключатель в настройках
        A.evaluate("Assistant.load(); Assistant.loaded = true; Assistant.settingsSheet()"); A.wait_for_selector("#agentBubble")
        assert A.evaluate("document.querySelector('#agentBubble').checked") is False
        A.evaluate("document.querySelector('#agentBubble').click()"); A.wait_for_timeout(200)
        assert "overlay:true" in A.evaluate("window.__calls")
        A.evaluate("window.__perm = true; document.querySelector('#agentBubble').click(); document.querySelector('#agentBubble').click()"); A.wait_for_timeout(200)
        assert A.evaluate("window.__calls.filter(c => c === 'overlay:false').length") >= 1
        print("переключатель «кнопка поверх приложений»: ok")
        # голосовая активация при закрытом приложении: фраза с командой
        A.evaluate("Assistant.closeMini?.()"); A.wait_for_timeout(300)
        A.evaluate("window.__agentAt = 0; window.__calls = []; window.__asked = null; Assistant.ask = (t, v) => { window.__asked = [t, v]; }; window.onOpenAgent('Макс, позвони маме')")
        A.wait_for_function("window.__asked !== null", timeout=3000)
        assert A.evaluate("window.__asked") == ["позвони маме", True], A.evaluate("window.__asked")
        assert "listen" not in A.evaluate("window.__calls")
        A.evaluate("Assistant.closeMini?.()"); A.wait_for_timeout(300)
        A.evaluate("window.__agentAt = 0; window.__asked = null; window.onOpenAgent('Макс')"); A.wait_for_selector("#asstInput")
        assert A.evaluate("window.__asked") is None
        # двойной вызов (нативный + опрос) не открывает второго ассистента и не повторяет команду
        A.evaluate("Assistant.closeMini?.()"); A.wait_for_timeout(300)
        A.evaluate("window.__asked = []; window.__agentAt = 0; Assistant.ask = (t, v) => { window.__asked.push(t); }; window.onOpenAgent('Макс, открой почту'); window.onOpenAgent('Макс, открой почту')")
        A.wait_for_timeout(900)
        assert A.evaluate("window.__asked") == ["открой почту"], A.evaluate("window.__asked")
        assert A.evaluate("document.querySelectorAll('#asstInput').length") == 1
        assert A.evaluate("Maks.on = true; Maks.canListen()") is False
        A.evaluate("Maks.on = false")
        print("«Макс, команда» из фона: ok")
        # переключатель фонового слушания
        A.evaluate("window.__calls = []; window.AndroidBridge.wakeBg = (on) => { window.__calls.push('wake:' + on); return on ? 'ok' : 'off'; }; window.AndroidBridge.wakeBgState = () => 'off'")
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove()); Assistant.settingsSheet()"); A.wait_for_selector("#wakeBg")
        A.evaluate("document.querySelector('#wakeBg').click()"); A.wait_for_timeout(200)
        assert "wake:true" in A.evaluate("window.__calls")
        print("переключатель «Макс при закрытом приложении»: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
