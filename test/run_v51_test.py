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

import json
state = {"mode": "ok", "bodies": []}
def poll(route):
    state["bodies"].append(json.loads(route.request.post_data or "{}"))
    h = {"access-control-allow-origin": "*"}
    if route.request.method == "OPTIONS": route.fulfill(status=204, headers={**h, "access-control-allow-headers": "*"}); return
    if state["mode"] == "ok": route.fulfill(status=200, content_type="application/json", headers=h, body=json.dumps({"choices": [{"message": {"content": "**Доставка** стоит 300 ₽."}}]}))
    elif state["mode"] == "xss": route.fulfill(status=200, content_type="application/json", headers=h, body=json.dumps({"choices": [{"message": {"content": "<img src=x onerror=window.__x=1>Привет"}}]}))
    elif state["mode"] == "custom": route.fulfill(status=200, content_type="application/json", headers=h, body=json.dumps({"reply": "Ответ вашего сервера"}))
    else: route.abort()
open(f"{T}/agent/embed.html", "w").write("""<!doctype html><meta charset=utf-8><title>t</title><h1>Сайт</h1>
<script src="agent.js" data-name="Борис" data-voice="butler" data-pitch="1.2" data-rate="0.9" data-speak="false" data-color="#ff0000" data-position="left" data-persona="Ты повар." data-id="emb"></script>""")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 420, "height": 800})
        ctx.route("https://text.pollinations.ai/**", poll); ctx.route("https://agent.example/**", poll)
        A = ctx.new_page(); A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.add_init_script("window.__u = []; window.__rec = null; (() => { const ss = window.speechSynthesis; if (!ss) return; ss.speak = (u) => { window.__u.push({ pitch: u.pitch, rate: u.rate, text: u.text }); setTimeout(() => u.onend && u.onend(), 5); }; })();")
        A.goto("http://localhost:8765/agent/index.html"); A.wait_for_selector("[data-ai-agent] .panel", state="attached", timeout=8000)
        A.wait_for_timeout(600)
        assert A.locator("[data-ai-agent] .panel").is_visible()                       # конструктор открывает агента сразу
        assert "Здравствуйте! Подскажу" in A.inner_text("[data-ai-agent] .ms")
        code = A.inner_text("#code"); assert 'data-name="Анна"' in code and "data-voice=\"soft\"" in code and "agent.js" in code, code
        # диалог: роль и знания уходят в запрос, ответ чистится и озвучивается
        A.fill("[data-ai-agent] textarea", "Сколько стоит доставка?"); A.keyboard.press("Enter")
        A.wait_for_selector("[data-ai-agent] .m.bot >> text=Доставка стоит 300", timeout=6000)
        req = state["bodies"][-1]; sysmsg = req["messages"][0]["content"]
        assert req["messages"][0]["role"] == "system" and "консультантка" in sysmsg and "300 ₽" in sysmsg and "Анна" in sysmsg, sysmsg[:200]
        assert req["messages"][-1] == {"role": "user", "content": "Сколько стоит доставка?"} and req.get("private") is True
        A.wait_for_function("window.__u.length >= 1", timeout=3000)
        u = A.evaluate("window.__u[0]"); assert abs(u["pitch"] - 1.05) < 0.01 and abs(u["rate"] - 0.93) < 0.01 and "Доставка стоит" in u["text"] and "**" not in u["text"], u
        print("чат, роль, знания, озвучка: ok")
        # ползунки в окне агента меняют тембр и скорость
        A.click("[data-ai-agent] .ib[title=Голос]")
        A.evaluate("() => { const sh = document.querySelector('[data-ai-agent]').shadowRoot; const r = sh.querySelectorAll('.set input[type=range]'); r[0].value = '130'; r[0].dispatchEvent(new Event('input')); r[0].dispatchEvent(new Event('change')); }")
        A.wait_for_function("window.__u.length >= 2", timeout=3000)
        u2 = A.evaluate("window.__u.at(-1)"); assert abs(u2["pitch"] - 1.05 * 1.3) < 0.02 and abs(u2["rate"] - 0.93) < 0.01, u2
        A.select_option("[data-ai-agent] select[aria-label=Голос]", "calm"); A.wait_for_function("window.__u.length >= 3", timeout=3000)
        u3 = A.evaluate("window.__u.at(-1)"); assert abs(u3["pitch"] - 0.85 * 1.3) < 0.02 and abs(u3["rate"] - 0.92) < 0.01, u3
        print("голос, тембр, скорость: ok")
        # безопасность: разметка из ответа не выполняется
        state["mode"] = "xss"; A.fill("[data-ai-agent] textarea", "тест"); A.keyboard.press("Enter")
        A.wait_for_selector("[data-ai-agent] .m.bot >> text=Привет", timeout=6000)
        assert A.evaluate("window.__x") is None and A.evaluate("document.querySelector('[data-ai-agent]').shadowRoot.querySelectorAll('.m img').length") == 0
        # ошибка сети — понятное сообщение
        state["mode"] = "down"; A.fill("[data-ai-agent] textarea", "ещё"); A.keyboard.press("Enter")
        A.wait_for_selector("[data-ai-agent] .m.err", timeout=6000)
        print("защита от разметки и ошибки сети: ok")
        # свой сервер
        state["mode"] = "custom"; state["bodies"].clear()
        A.evaluate("() => { window.AIAgent.init({ id: 'c', provider: 'custom', endpoint: 'https://agent.example/chat', open: true, name: 'Мария', persona: 'Ты учитель.' }); }")
        A.fill("[data-ai-agent] textarea", "Привет"); A.keyboard.press("Enter")
        A.wait_for_selector("[data-ai-agent] .m.bot >> text=Ответ вашего сервера", timeout=6000)
        cb = state["bodies"][-1]; assert "учитель" in cb["system"] and cb["messages"][-1]["content"] == "Привет" and cb["name"] == "Мария", cb
        # память беседы
        n1 = A.evaluate("document.querySelector('[data-ai-agent]').shadowRoot.querySelectorAll('.m').length")
        A.evaluate("() => { window.AIAgent.init({ id: 'c', provider: 'custom', endpoint: 'https://agent.example/chat', open: true, name: 'Мария' }); }")
        assert A.evaluate("document.querySelector('[data-ai-agent]').shadowRoot.querySelectorAll('.m').length") == n1
        print("свой сервер и память беседы: ok")
        # вставка одной строкой с data-атрибутами
        B = ctx.new_page(); B.on("pageerror", lambda e: errors.append(f"B: {e}"))
        B.goto("http://localhost:8765/agent/embed.html"); B.wait_for_selector("[data-ai-agent]", state="attached")
        c = B.evaluate("({ n: AIAgent.instance.cfg.name, v: AIAgent.instance.cfg.voice, p: AIAgent.instance.cfg.pitch, r: AIAgent.instance.cfg.rate, s: AIAgent.instance.cfg.speak, pos: AIAgent.instance.cfg.position, id: AIAgent.instance.cfg.id })")
        assert c == {"n": "Борис", "v": "butler", "p": 1.2, "r": 0.9, "s": False, "pos": "left", "id": "emb"}, c
        assert B.locator("[data-ai-agent] .fab").is_visible() and "left" in B.evaluate("document.querySelector('[data-ai-agent]').shadowRoot.querySelector('.w').className")
        shot(B, "v51_embed"); B.click("[data-ai-agent] .fab"); B.wait_for_selector("[data-ai-agent] .panel >> visible=true"); shot(B, "v51_embed_open")
        print("вставка одной строкой: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
