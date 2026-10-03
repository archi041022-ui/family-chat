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
        A = ctx.new_page(); B = ctx.new_page(); C = ctx.new_page()
        ctx.route("https://api.github.com/**", lambda r: r.abort())
        BRIDGE = """(() => { if (location.pathname.indexOf('index') < 0 && location.pathname !== '/') return;
          window.AndroidBridge = { fg: true, notes: [], prefs: null, alive: 0, reset: false,
            isForeground() { return this.fg; }, notify(t, x, c) { if (!this.fg) this.notes.push([t, x, c]); else (this.fgNotes = this.fgNotes || []).push([t, x, c]); },
            pushKey(u, a) { this.cfg = [u, a]; return '%s'.repeat(40); }, pushPrefs(j) { this.prefs = JSON.parse(j); },
            pushAlive() { this.alive = Date.now(); }, pushReset() { this.reset = true; }, loggedIn() {}, loggedOut() {}, takeShared() { return ''; } }; })()"""
        B.add_init_script(BRIDGE % "b"); C.add_init_script(BRIDGE % "c")
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")
        FAM = "00000000-0000-0000-0000-000000000001"
        db = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('mockdb'))")
        ids = {p["name"]: p["id"] for p in db(A)["profiles"]}
        devs = db(A).get("devices", [])
        assert {d["user_id"] for d in devs} == {ids["Мама"], ids["Сын"]}, devs        # браузер без Android ключ не регистрирует
        assert B.evaluate("AndroidBridge.cfg[0]").startswith("https://") and B.evaluate("AndroidBridge.cfg[1]").startswith("eyJ") and B.evaluate("AndroidBridge.prefs.stories") is True
        print("device registered: ok")
        notes = lambda: B.evaluate("AndroidBridge.notes.map(n => n.join(' | '))")
        def send(text, chat=FAM): A.evaluate("([c, t]) => S.sb.from('messages').insert({ chat_id: c, body: t })", [chat, text])
        # 1) Мама свернула приложение: сообщение — ровно одно уведомление (живое + серверное не дублируются)
        B.evaluate("AndroidBridge.fg = false")
        send("Ужин в 7"); B.wait_for_timeout(2600)
        n = notes(); assert sum("Ужин в 7" in x for x in n) == 1, n
        assert any(x.startswith("Семья | Папа: Ужин в 7") for x in n), n
        print("message once: ok", n)
        # 2) история
        A.evaluate("S.sb.from('stories').insert({ body: 'Мы на даче', bg: '#3D8BFD' })"); B.wait_for_timeout(2600)
        n = notes(); assert sum("новая история" in x for x in n) == 1 and any("📸 Папа — новая история | Мы на даче" in x for x in n), n
        print("story: ok")
        # 3) реакция на моё сообщение
        B.evaluate("S.sb.from('messages').insert({ chat_id: '%s', body: 'Кто купит хлеб?' })" % FAM); A.wait_for_timeout(800)
        mid = [m for m in db(A)["messages"] if m["body"] == "Кто купит хлеб?"][0]["id"]
        A.evaluate("([m, c]) => S.sb.from('reactions').insert({ message_id: m, chat_id: c, emoji: '👍' })", [mid, FAM]); B.wait_for_timeout(2600)
        n = notes(); assert any("Папа | 👍 к вашему сообщению: Кто купит хлеб?" in x for x in n), n
        # 4) задача — одно уведомление (старый путь убран)
        A.evaluate("(u) => S.sb.from('tasks').insert({ title: 'Купить хлеб', assignee_id: u })", ids["Мама"]); B.wait_for_timeout(2600)
        n = notes(); assert sum("Купить хлеб" in x and "задача" in x for x in n) == 1, n
        print("reaction, task: ok")
        # 5) чат без звука — ничего; настройка ушла в фоновую службу
        B.evaluate("(c) => Prefs.toggle('muted', c)", FAM)
        assert FAM in B.evaluate("AndroidBridge.prefs.muted")
        before = len(notes()); send("Тихое сообщение"); B.wait_for_timeout(2600)
        assert len(notes()) == before, notes()
        B.evaluate("(c) => Prefs.toggle('muted', c)", FAM)
        print("mute: ok")
        # 6) истории можно отключить в настройках
        B.evaluate("AndroidBridge.fg = true"); B.click("#tabBtnSettings"); B.click("#tabSettings >> text=Уведомления и звуки")
        B.click(".sheet .toggle-row >> text=Новые истории семьи"); assert B.evaluate("AndroidBridge.prefs.stories") is False
        B.click(".sheet-back", position={"x": 5, "y": 5}); B.evaluate("AndroidBridge.fg = false")
        before = len(notes()); A.evaluate("S.sb.from('stories').insert({ body: 'Вторая история', bg: '#3D8BFD' })"); B.wait_for_timeout(2600)
        assert not any("Вторая история" in x for x in notes()), notes()
        print("stories toggle: ok")
        # 7) приложение открыто — оповещения забираются молча (на сервере не копятся)
        B.evaluate("AndroidBridge.fg = true"); before = len(notes())
        send("Видно в чате"); B.wait_for_timeout(2600)
        assert len(notes()) == before
        assert B.evaluate("(AndroidBridge.fgNotes || []).filter(n => /Видно в чате/.test(n[1])).length") == 1   # (Android сам не показывает при открытом приложении)
        assert not [x for x in db(A).get("notices", []) if x["user_id"] == ids["Мама"]], "оповещения Мамы остались на сервере"
        print("foreground silent claim: ok")
        # 8) страница Сына «уснула» (закрыта) — фоновая служба забирает всё сама, по одному разу
        C.close()
        send("Пока ты спал"); A.evaluate("S.sb.from('stories').insert({ body: 'Ночная история', bg: '#000' })"); A.wait_for_timeout(500)
        pulled = A.evaluate("__mockDevicePull('%s')" % ("c" * 40))
        kinds = sorted((p["kind"], p["body"]) for p in pulled)
        assert ("message", "Папа: Пока ты спал") in kinds and ("story", "Ночная история") in kinds, kinds
        assert A.evaluate("__mockDevicePull('%s')" % ("c" * 40)) == [], "повторная выдача"
        assert A.evaluate("__mockDevicePull('%s')" % ("x" * 40)) == []
        print("background pull once: ok", len(pulled))
        # 9) модерация: сообщение на одобрение и «опубликовано»
        gid = A.evaluate("(u) => S.sb.rpc('create_group', { title: 'Рыбалка', members: [u] }).then(r => r.data)", ids["Мама"])
        A.evaluate("(g) => S.sb.rpc('chat_settings2', { cid: g, settings: { moderated: true } })", gid)
        B.evaluate("AndroidBridge.fg = false"); B.reload(); B.wait_for_selector("#chatList .chat-item"); B.evaluate("AndroidBridge.fg = false")
        B.evaluate("(g) => S.sb.from('messages').insert({ chat_id: g, body: 'Едем в субботу?' })", gid); A.wait_for_timeout(800)
        pend = [x for x in db(A).get("notices", []) if x["kind"] == "pending"]
        assert len(pend) == 1 and pend[0]["user_id"] == ids["Папа"], pend
        mid = [m for m in db(A)["messages"] if m["body"] == "Едем в субботу?"][0]["id"]
        A.evaluate("(m) => S.sb.rpc('moderate_message', { mid: m, ok: true })", mid); B.wait_for_timeout(2600)
        assert any("✅ Опубликовано в «Рыбалка» | Едем в субботу?" in x for x in notes()), notes()
        print("moderation notices: ok")
        # 9б) связь у Мамы прерывалась и живое событие потерялось — сообщение всё равно придёт с сервера
        B.evaluate("""(u) => { const d = JSON.parse(localStorage.getItem('mockdb')); d.nseq = (d.nseq || 0) + 1;
          d.notices.push({ id: d.nseq, user_id: u, kind: 'message', chat_id: '%s', ref: crypto.randomUUID(), actor: null, title: 'Семья', body: 'Папа: Пропущенное', created_at: new Date().toISOString() });
          localStorage.setItem('mockdb', JSON.stringify(d)); }""" % FAM, ids["Мама"])
        B.evaluate("Push.claim()"); B.wait_for_timeout(500)
        assert sum("Пропущенное" in x for x in notes()) == 1, notes()
        print("missed realtime recovered: ok")
        # 10) выход — ключ устройства удалён
        B.evaluate("AndroidBridge.fg = true"); B.click("#tabBtnSettings"); B.click("#tabSettings >> text=Выйти")
        B.click(".sheet .menu-item.danger"); B.wait_for_selector("text=Регистрация", timeout=8000)
        assert ids["Мама"] not in {d["user_id"] for d in db(A).get("devices", [])}
        print("logout unregister: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
