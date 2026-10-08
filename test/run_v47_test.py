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
        A, B = ctx.new_page(), ctx.new_page()
        for nm, x in (("A", A), ("B", B)):
            x.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            x.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        for x, lg, nm in ((A, "papa", "Папа"), (B, "mama", "Мама")):
            register(x, lg, nm); x.wait_for_selector("#chatList", timeout=10000); x.wait_for_timeout(1200)
            x.evaluate("document.querySelectorAll('.welcome').forEach(e => e.remove())")
        pid = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        A.evaluate("async (id) => { await openDm(id); }", pid["Мама"]); A.wait_for_function("S.chats.length > 0", timeout=8000); A.evaluate("Maks.leave()")
        A.evaluate("Voice2.speak = (t) => { window.__spoken.push(t); }; Assistant.load(); Assistant.loaded = true; Assistant.settings.speak = true")
        cmd = lambda t: A.evaluate("(t) => Maks.command(t)", t)
        # заметки
        assert cmd("Макс, создай заметку купить хлеб") is True
        assert A.evaluate("MaksPlus.notes()[0].text") == "Купить хлеб"
        assert cmd("создай заметку") is True and cmd("позвонить врачу") is True
        assert A.evaluate("MaksPlus.notes().length") == 2
        assert cmd("открой заметки") is True; A.wait_for_selector(".sheet h3:has-text('Заметки')"); A.evaluate("document.querySelectorAll('.sheet-back').forEach(e => e.remove())")
        print("заметки: ok")
        # память
        assert cmd("запомни, мама любит чай с лимоном") is True
        assert A.evaluate("Object.values(MaksPlus.mem().people)[0].facts[0].text") == "любит чай с лимоном"
        assert cmd("запомни что завтра выходной") is True and A.evaluate("MaksPlus.mem().facts.length") == 1
        assert cmd("что ты знаешь про маму") is True
        sp = A.evaluate("window.__spoken.at(-1)"); assert "любит чай" in sp, sp
        # обучение манере по входящим
        A.evaluate("""() => { const mid = Object.keys(MaksPlus.mem().people)[0]; const c = S.chats[0]; let t = Date.now() + 5000;
          for (let i = 0; i < 8; i++) MaksPlus.learn({ id: 'x' + i, chat_id: c.id, user_id: mid, body: 'Привет 😄 как дела?', created_at: new Date(t += 1000).toISOString() }); }""")
        assert cmd("расскажи про маму") is True
        sp = A.evaluate("window.__spoken.at(-1)"); assert "пишет коротко" in sp and "любит эмодзи" in sp, sp
        assert cmd("забудь про маму") is True and A.evaluate("Object.keys(MaksPlus.mem().people).length") == 0
        print("память и обучение: ok")
        # группа по голосу с подтверждением
        assert cmd("создай группу Друзья с мамой") is True
        assert A.evaluate("MaksPlus.await && MaksPlus.await.type") == "confirm"
        sp = A.evaluate("window.__spoken.at(-1)"); assert "Друзья" in sp and "Мама" in sp, sp
        assert cmd("да") is True; A.wait_for_function("S.chats.some(c => c.is_group && c.title === 'Друзья')", timeout=8000)
        print("создание группы: ok")
        A.evaluate("Maks.leave()")
        assert cmd("создай открытый канал Новости") is True and cmd("да") is True
        A.wait_for_function("S.chats.some(c => c.is_channel && c.title === 'Новости')", timeout=8000)
        print("создание канала: ok")
        # отмена
        assert cmd("создай группу Лишняя") is True and cmd("нет") is True and not A.evaluate("S.chats.some(c => c.title === 'Лишняя')")
        # пропущенное: Мама звонит и не дожидается
        B.evaluate("window.__x = 1"); ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        A.evaluate("""(mid) => { S.missedSeen = 0; S.callLog = [{ id: 'm1', chat_id: S.chats[0].id, user_id: mid, body: '📞 Звонок: без ответа', created_at: new Date().toISOString() }]; S.unread.set(S.chats[0].id, 3); }""", ids["Мама"])
        A.evaluate("MaksPlus.lastRemind = 0; MaksPlus.lastKey = ''; MaksPlus.remind(false)")
        sp = A.evaluate("window.__spoken.at(-1)"); assert "Пропущенные звонки: Мама" in sp and "Непрочитанных сообщений: 3" in sp, sp
        A.evaluate("MaksPlus.remind(false)"); assert A.evaluate("window.__spoken.length") == A.evaluate("window.__spoken.length")
        n0 = A.evaluate("window.__spoken.length"); A.evaluate("MaksPlus.remind(false)"); assert A.evaluate("window.__spoken.length") == n0   # не повторяет сразу
        assert cmd("не напоминай о пропущенных") is True and A.evaluate("!MaksPlus.enabled()")
        assert cmd("напоминай о пропущенных звонках") is True and A.evaluate("MaksPlus.enabled()")
        assert cmd("что я пропустил") is True and "Пропущенные звонки" in A.evaluate("window.__spoken.at(-1)")
        print("напоминания: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
