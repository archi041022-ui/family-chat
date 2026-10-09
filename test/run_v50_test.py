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
        ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000); A.wait_for_timeout(1500)
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        # ── ползунки тембра и скорости
        A.evaluate("() => { window.__args = null; window.AndroidBridge = { speak() {}, speak2(t, g, p, r) { window.__args = [p, r]; }, stop() {}, resetVoice() {}, muteBeeps() {} }; Voice2.native = null; Voice2.waiting = false; Assistant.load(); Assistant.loaded = true; Assistant.settings.speak = true; }")
        A.evaluate("Assistant.settingsSheet()"); A.wait_for_selector(".voice-slider")
        assert A.locator(".voice-slider").count() == 2
        A.evaluate("() => { const s = document.querySelectorAll('.voice-slider'); s[0].value = '130'; s[0].dispatchEvent(new Event('input', { bubbles: true })); s[1].value = '70'; s[1].dispatchEvent(new Event('input', { bubbles: true })); s[1].dispatchEvent(new Event('change', { bubbles: true })); }")
        assert abs(A.evaluate("Assistant.settings.pitchAdj") - 1.3) < 0.001 and abs(A.evaluate("Assistant.settings.rateAdj") - 0.7) < 0.001
        A.wait_for_function("window.__args !== null", timeout=3000)
        pr = A.evaluate("window.__args"); assert abs(pr[0] - 1.3) < 0.01 and abs(pr[1] - 0.7) < 0.01, pr          # голос «Женский»: 1 × 1,3 и 1 × 0,7
        assert A.evaluate("JSON.parse(localStorage.getItem('assistant:s:' + S.me.id)).pitchAdj") == 1.3
        A.click(".sheet >> text=Сбросить тембр и скорость"); assert A.evaluate("Assistant.settings.pitchAdj") == 1 and A.evaluate("Assistant.settings.rateAdj") == 1
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove())")
        print("ползунки тембра и скорости: ok")
        # ── голосовое сообщение не обрывается при обновлении чата
        A.click("#chatList >> text=Семья"); A.wait_for_selector(".composer .send")
        A.evaluate("""async () => {
          const sr = 8000, n = sr * 20, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
          const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
          w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
          for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 3000, true);
          S.urls.set('t.wav', URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
          const list = S.msgs.get(S.current) || []; S.msgs.set(S.current, list);
          list.push({ id: 'aud1', chat_id: S.current, user_id: S.me.id, body: null, media_type: 'audio', media_path: 't.wav', created_at: new Date().toISOString() });
          renderMessages(true); }""")
        A.wait_for_selector(".msg[data-id=aud1] audio")
        A.evaluate("() => { const a = document.querySelector('.msg[data-id=aud1] audio'); window.__aud = a; return a.play(); }")
        A.wait_for_function("window.__aud.currentTime > 0.4", timeout=6000)
        t0 = A.evaluate("window.__aud.currentTime")
        A.evaluate("renderMessages(false)"); A.evaluate("renderMessages(false)")
        A.evaluate("rerenderMessage('aud1')")
        A.wait_for_timeout(700)
        same = A.evaluate("document.querySelector('.msg[data-id=aud1] audio') === window.__aud")
        assert same and A.evaluate("!window.__aud.paused") and A.evaluate("window.__aud.currentTime") > t0 + 0.3, (same, t0, A.evaluate("[window.__aud.paused, window.__aud.currentTime]"))
        print("плеер переживает перерисовку чата: ok")
        # звуки приложения ждут конца воспроизведения
        A.evaluate("() => { window.__beeps = 0; window.beep = () => { window.__beeps++; }; Snd.message(); }"); A.wait_for_timeout(400)
        assert A.evaluate("window.__beeps") == 0
        assert A.evaluate("Maks.on = true; Maks.canListen()") is False
        A.evaluate("window.__aud.pause(); Maks.on = false"); A.evaluate("Snd.message()"); A.wait_for_timeout(500)
        assert A.evaluate("window.__beeps") == 1, A.evaluate("window.__beeps")
        print("уведомления не перебивают голосовое: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
