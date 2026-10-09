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

WIKI = """Борщ — первое блюдо.

== Ингредиенты ==
* Свёкла — 2 шт.
* Говядина — 500 г
* Капуста — 300 г
* Картофель — 3 шт.

== Приготовление ==
# Сварите бульон из говядины, 1,5 часа.
# Нарежьте свёклу и обжарьте.
# Добавьте капусту и картофель.
# Варите 20 минут и подавайте со сметаной.
"""
LLM = "НАЗВАНИЕ: Блины\nИНГРЕДИЕНТЫ:\n- Молоко 500 мл\n- Мука 200 г\n- Яйца 2 шт.\nШАГИ:\n1. Смешайте яйца с молоком.\n2. Добавьте муку и перемешайте.\n3. Жарьте на сковороде по минуте с каждой стороны."
import json
state = {"wiki": True, "llm": True}
def wiki(route):
    u = route.request.url; h = {"access-control-allow-origin": "*"}
    if "list=search" in u:
        body = {"query": {"search": [{"title": "Кулинарная книга/Борщ"}] if state["wiki"] else []}}
    else:
        body = {"query": {"pages": [{"revisions": [{"slots": {"main": {"content": WIKI}}}]}]}}
    route.fulfill(status=200, content_type="application/json", headers=h, body=json.dumps(body))
def poll(route):
    if state["llm"]: route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"choices": [{"message": {"content": LLM}}]}))
    else: route.abort()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        ctx.add_init_script("window.__keepFamily = false; window.__spoken = [];")
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        ctx.route("https://ru.wikibooks.org/**", wiki); ctx.route("https://text.pollinations.ai/**", poll)
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList", timeout=10000); A.wait_for_timeout(1200)
        A.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        A.evaluate("Voice2.speak = (t) => { window.__spoken.push(t); }; Assistant.load(); Assistant.loaded = true; Assistant.settings.speak = true")
        cmd = lambda t: A.evaluate("(t) => Maks.command(t)", t)
        last = lambda: A.evaluate("window.__spoken.at(-1)")
        for ph, dish in [("рецепт борща", "борща"), ("расскажи рецепт пельменей пошагово", "пельменей"), ("как приготовить блины", "блины"), ("Макс, как испечь пирог с яблоками", "пирог с яблоками"), ("научи меня готовить плов", "плов"), ("подскажи как сварить кашу", "кашу")]:
            got = A.evaluate("(t) => Cook.dishFrom(Maks.strip(t))", ph)
            assert got == dish, (ph, got)
        for ph in ["как сделать заметку", "как приготовить заметку", "расскажи анекдот", "рецепт", "как позвонить маме"]:
            assert A.evaluate("(t) => Cook.dishFrom(t)", ph) is None, ph
        print("распознавание просьбы: ok")
        assert cmd("Макс, расскажи рецепт борща") is True
        A.wait_for_function("Cook.active", timeout=8000)
        assert A.evaluate("Cook.active.source").startswith("Викиучебник") and A.evaluate("Cook.active.steps.length") == 4 and A.evaluate("Cook.active.ing.length") == 4
        assert "Понадобится" in last() and "Всего 4 шага" in last(), last()
        A.wait_for_selector(".cook-steps li")
        assert cmd("дальше") is True and "Шаг 1 из 4" in last() and "Сварите бульон" in last(), last()
        assert cmd("дальше") is True and "Шаг 2 из 4" in last()
        assert cmd("повтори") is True and "Шаг 2 из 4" in last()
        assert cmd("назад") is True and "Шаг 1 из 4" in last()
        assert cmd("шаг 3") is True and "Шаг 3 из 4" in last() and "капусту" in last()
        assert A.evaluate("document.querySelector('.cook-steps li.now').textContent").startswith("Добавьте")
        assert cmd("ингредиенты") is True and "Свёкла" in last()
        assert cmd("сколько шагов осталось") is True and "Осталось 1" in last(), last()
        assert cmd("поставь таймер на 1 секунду") is True and "таймер" in last().lower()
        A.wait_for_function("window.__spoken.at(-1).includes('сработал')", timeout=4000)
        assert cmd("шаг 4") is True and "последний" in last()
        assert cmd("дальше") is True and "Приятного аппетита" in last() and A.evaluate("!Cook.active")
        print("рецепт по шагам из интернета: ok")
        state["wiki"] = False
        assert cmd("как приготовить блины") is True; A.wait_for_function("Cook.active", timeout=8000)
        assert "нейросеть" in A.evaluate("Cook.active.source") and A.evaluate("Cook.active.steps.length") == 3 and A.evaluate("Cook.active.title") == "Блины"
        A.evaluate("window.__heard = null; Maks.run = async (c) => { window.__heard = c; }")
        A.evaluate("Maks.hear('дальше')"); A.wait_for_timeout(300)
        assert A.evaluate("window.__heard") == "дальше"
        assert cmd("стоп") is True and A.evaluate("!Cook.active") and "закрыл" in last()
        A.evaluate("window.__heard = null; Maks.hear('дальше')"); A.wait_for_timeout(300)
        assert A.evaluate("window.__heard") is None
        state["llm"] = False
        assert cmd("рецепт гомеопатического супа") is True; A.wait_for_function("window.__spoken.at(-1).includes('Не нашёл рецепт')", timeout=8000)
        print("запасной путь и ошибки: ok")
        assert A.evaluate("VOICES.some(v => v.id === 'soft' && v.gender === 'female')")
        A.evaluate("Assistant.settingsSheet()"); A.wait_for_selector(".voice-card[data-voice=soft]")
        print("голос «Нежный»: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
