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
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        ctx.add_init_script("window.__keepFamily = false; window.__spoken = [];")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        mode = {"v": "ok"}
        def poll(route):
            if mode["v"] == "ok": route.fulfill(status=200, content_type="application/json", body='{"choices":[{"message":{"content":"**Динозавры** жили давно."}}]}')
            elif mode["v"] == "get": route.fulfill(status=200, content_type="text/plain", body="Ответ по запасному пути") if route.request.method == "GET" else route.fulfill(status=402, body="pay")
            else: route.abort()
        ctx.route("https://text.pollinations.ai/**", poll)
        A, B = ctx.new_page(), ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        for x, lg, nm in ((A, "papa", "Папа"), (B, "mama", "Мама"), (B, "x", "x")[:0] or (B, "mama", "Мама")):
            pass
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000); A.wait_for_timeout(1200)
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList", timeout=10000); B.wait_for_timeout(800)
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())"); A.evaluate("S.profiles.size >= 2 || loadProfiles()")
        A.evaluate("Assistant.load(); Assistant.loaded = true; Assistant.settings.speak = false")
        A.evaluate("() => { window.__calls = []; window.__offers = []; Assistant.callTarget = (t, v) => { window.__calls.push([t.name, !!v]); return true; }; Assistant.offer = (t, x) => { window.__offers.push([t.name, x]); }; }")
        phrases = [("позвони маме", "Мама", False), ("Позвонить маме", "Мама", False), ("ну давай позвони маме", "Мама", False), ("можешь позвонить маме", "Мама", False),
                   ("мне нужно позвонить маме", "Мама", False), ("набери маму", "Мама", False), ("свяжись с мамой", "Мама", False), ("давай позвоним маме", "Мама", False),
                   ("видеозвонок маме", "Мама", True), ("позвони маме по видео", "Мама", True), ("хочу позвонить маме по видеосвязи", "Мама", True)]
        for ph, who, vid in phrases:
            A.evaluate("() => { window.__calls = []; }")
            A.evaluate("(t) => Assistant.command(t)", ph)
            got = A.evaluate("window.__calls[0]")
            assert got and got[0] == who and got[1] == vid, (ph, got)
        for ph, txt in [("напиши маме привет", "Привет"), ("отправь маме сообщение что скоро буду", "Скоро буду"), ("можешь написать маме что я дома", "Я дома"), ("пошли маме поцелуй", "Поцелуй"), ("хочу написать маме спасибо", "Спасибо")]:
            A.evaluate("() => { window.__offers = []; }")
            A.evaluate("(t) => Assistant.command(t)", ph)
            got = A.evaluate("window.__offers[0]")
            assert got and got[0] == "Мама" and got[1] == txt, (ph, got)
        print("команды звонка и сообщений: ok")
        # нейросеть: сервер недоступен → напрямую с телефона
        A.evaluate("() => { S.sb.functions = { invoke: async () => ({ data: null, error: new Error('boom') }) }; }")
        ask = lambda q: A.evaluate("async (q) => { Assistant.history = []; Assistant.busy = false; await Assistant.ask(q); return Assistant.history.at(-1).content; }", q)
        r = ask("расскажи про динозавров"); assert r == "Динозавры жили давно.", r
        # сервер ответил «не смог» (source=data) → тоже пробуем напрямую
        A.evaluate("() => { S.sb.functions = { invoke: async () => ({ data: { reply: 'Сейчас не получается связаться с нейросетью.', source: 'data' }, error: null }) }; }")
        r = ask("расскажи про динозавров"); assert r == "Динозавры жили давно.", r
        # первый способ не работает — запасной
        mode["v"] = "get"; r = ask("расскажи про кошек"); assert r == "Ответ по запасному пути", r
        # везде недоступно — понятное сообщение, команды остаются
        mode["v"] = "down"; r = ask("расскажи про море"); assert "Нейросеть сейчас не отвечает" in r and "позвони маме" in r, r
        # сервер исправен — работает как раньше
        A.evaluate("() => { S.sb.functions = { invoke: async () => ({ data: { reply: 'Ответ сервера', source: 'llm' }, error: null }) }; }")
        mode["v"] = "ok"; r = ask("расскажи про горы"); assert r == "Ответ сервера", r
        print("нейросеть и запасной путь: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
