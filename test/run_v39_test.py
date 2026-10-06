"""v3.9: оповещения на iPhone и в браузерах (Web Push): подписка, служба оповещений, переход в чат."""
import os, shutil, subprocess, time, sys, json
from playwright.sync_api import sync_playwright

ROOT = "/home/claude/family-chat"
T = "/tmp/fc-test"
shutil.rmtree(T, ignore_errors=True); shutil.copytree(f"{ROOT}/web", T)
os.makedirs(f"{T}/vendor", exist_ok=True)
shutil.copy(f"{ROOT}/test/mock-supabase.js", f"{T}/vendor/supabase.js")
open(f"{T}/vendor/qrcode.js", "w").write("window.qrcode=()=>({addData(){},make(){},createDataURL(){return ''}});")
open(f"{T}/config.js", "w").write(open(f"{ROOT}/web/config.js").read()
    .replace('supabaseUrl: ""', 'supabaseUrl: "https://mock"').replace('supabaseKey: ""', 'supabaseKey: "mock"'))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", T], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
URL = "http://localhost:8765/index.html"

FAKE = """
window.__perm = sessionStorage.getItem('perm') || 'default'; window.__sub = sessionStorage.getItem('sub') ? 1 : null;
Object.defineProperty(Notification, 'permission', { get: () => window.__perm });
Notification.requestPermission = async () => { if (window.__allow) { window.__perm = 'granted'; sessionStorage.setItem('perm', 'granted'); } return window.__perm; };
const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/fake123', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) } }; }, unsubscribe: async () => { window.__sub = null; sessionStorage.removeItem('sub'); return true; } };
PushManager.prototype.subscribe = async function (o) { window.__subOpts = o && { uso: o.userVisibleOnly, key: o.applicationServerKey && o.applicationServerKey.length }; window.__sub = fake; sessionStorage.setItem('sub', '1'); return fake; };
PushManager.prototype.getSubscription = async function () { return window.__sub ? fake : null; };
"""

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
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 800}, permissions=["notifications"])
        ctx.add_init_script("window.__noWelcome = true")
        ctx.add_init_script(FAKE)
        for host in ("https://translate.google.com/**", "https://fonts.gstatic.com/**", "https://translate.googleapis.com/**", "https://api.github.com/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page()
        A.on("pageerror", lambda e: errors.append(f"A: {e}"))
        A.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"A console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item")

        # 1) служба оповещений зарегистрирована
        A.wait_for_function("navigator.serviceWorker.getRegistration().then(r => !!r)")
        print("service worker: ok")

        # 2) раздел в меню, разрешения ещё нет → кнопка «Включить»
        A.evaluate("void WebPush.sheet()"); A.wait_for_selector(".sheet-back:has-text('Оповещения на этом устройстве выключены')")
        assert A.evaluate("JSON.parse(localStorage.getItem('mockdb')).webPush || []").__len__() == 0
        # пользователь не разрешил → понятное сообщение, подписки нет
        A.click(".sheet-back button:has-text('Включить оповещения')"); A.wait_for_timeout(500)
        assert A.evaluate("!window.__sub"), "подписка без разрешения"
        # разрешил
        A.evaluate("window.__allow = true")
        A.click(".sheet-back button:has-text('Включить оповещения')")
        A.wait_for_selector(".sheet-back:has-text('Оповещения на этом устройстве включены')")
        rows = A.evaluate("JSON.parse(localStorage.getItem('mockdb')).webPush")
        assert len(rows) == 1 and rows[0]["ep"].startswith("https://fcm.googleapis.com/") and len(rows[0]["k"]) == 87, rows
        opts = A.evaluate("window.__subOpts"); assert opts["uso"] is True and opts["key"] == 65, opts
        print("subscribe: ok", opts)

        # 3) проверка отправки и отключение
        A.click(".sheet-back button:has-text('Проверить на этом устройстве')"); A.wait_for_timeout(500)
        assert A.evaluate("window.__wpTests") == 1
        A.click(".sheet-back button:has-text('Отключить')"); A.wait_for_selector(".sheet-back:has-text('выключены')")
        assert A.evaluate("(JSON.parse(localStorage.getItem('mockdb')).webPush || []).length") == 0
        print("disable: ok")

        # 4) после перезапуска подписка (если она есть) заново сообщается серверу
        A.evaluate("() => WebPush.enable()")
        A.evaluate("() => { const db = JSON.parse(localStorage.getItem('mockdb')); db.webPush = []; localStorage.setItem('mockdb', JSON.stringify(db)); }")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); A.wait_for_timeout(1200)
        assert A.evaluate("(JSON.parse(localStorage.getItem('mockdb')).webPush || []).length") == 1
        print("resync: ok")

        # 5) нажатие на оповещение открывает нужный чат (сообщение от службы и ссылка ?chat=)
        chats = A.evaluate("S.chats.map(c => c.id)")
        cid = chats[0]
        A.evaluate("() => { if (S.current) closeChat(); }"); A.wait_for_timeout(300)
        assert A.evaluate("S.current") != cid
        A.evaluate("(id) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'open', chat: id } }))", cid)
        A.wait_for_function("(id) => S.current === id", arg=cid, timeout=4000)
        A.evaluate("history.replaceState(null, '', location.pathname)")
        A.goto(URL + "?chat=" + cid); A.wait_for_selector("#chatList .chat-item"); A.wait_for_function("(id) => S.current === id", arg=cid, timeout=5000)
        assert "chat=" not in A.url, A.url
        print("open chat: ok")

        # 6) служба показывает оповещение на push (зашифрованный текст расшифровывает браузер, здесь — уже открытый)
        sw = None
        for _ in range(20):
            if ctx.service_workers: sw = ctx.service_workers[0]; break
            time.sleep(0.2)
        assert sw, "нет службы"
        res = sw.evaluate("""async () => {
            const calls = [];
            self.registration.showNotification = async (t, o) => { calls.push({ t, b: o.body, tag: o.tag, c: o.data && o.data.c, ri: o.requireInteraction, renotify: o.renotify }); };
            const push = async (d) => { self.dispatchEvent(new PushEvent('push', { data: d })); await new Promise(r => setTimeout(r, 200)); };
            await push(JSON.stringify({ t: 'Папа', b: 'Привет', k: 'message', c: 'abc' }));
            await push(JSON.stringify({ t: 'Папа', b: 'Входящий звонок', k: 'call' }));
            await push('просто текст');
            await push('');
            return calls;
        }""")
        print("RES", res)
        assert res[0] == {"t": "Папа", "b": "Привет", "tag": "chat-abc", "c": "abc", "ri": False, "renotify": True}, res[0]
        assert res[1]["ri"] is True and res[1]["tag"] == "call", res[1]
        assert res[2]["t"] == "Семья" and res[2]["b"] == "просто текст", res[2]
        assert res[3]["t"] == "Семья" and res[3]["b"] == "Новое в «Семье»", res[3]
        print("sw push: ok")
        # 7) iPhone в обычном Safari (не с экрана «Домой») — инструкция вместо кнопки
        A.evaluate("() => { document.querySelectorAll('.sheet-back').forEach(e => e.remove()); WebPush.available = () => false; WebPush.isIos = () => true; WebPush.standalone = () => false; void WebPush.sheet(); }")
        A.wait_for_selector(".sheet-back:has-text('На экран «Домой»')")
        assert A.locator(".sheet-back button:has-text('Включить оповещения')").count() == 0
        print("ios hint: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
