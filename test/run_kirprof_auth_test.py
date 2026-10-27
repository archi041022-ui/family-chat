"""КИРПРОФ: восстановление пароля по кодовому слову и вход разработчика (RPC подменяются)."""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = "/home/claude/family-chat"; OUT = "/tmp/fc-shots"; os.makedirs(OUT, exist_ok=True)
users = {}; sess = {}; calls = []; devcode = {"v": "dev-secret-123", "sessions_expire": False}
def handler(route):
    req = route.request; fn = req.url.split("/rpc/")[1]; a = json.loads(req.post_data or "{}")
    H = {"access-control-allow-origin": "*"}
    if req.method == "OPTIONS": route.fulfill(status=204, headers={**H, "access-control-allow-headers": "*", "access-control-allow-methods": "POST"}); return
    calls.append(fn)
    def ok(v): route.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps(v))
    def tok(em):
        t = "T" * 32 + str(len(sess)); sess[t] = em; return t
    me = lambda t: users.get(sess.get(t))
    if fn == "kp_register":
        users[a["em"]] = {"pw": a["pw"], "name": a["nm"], "word": None, "email": a["em"]}; ok({"token": tok(a["em"]), "name": a["nm"]})
    elif fn == "kp_login":
        u = users.get(a["em"]); ok({"token": tok(a["em"]), "name": u["name"]} if u and u["pw"] == a["pw"] else {"error": "bad_login"})
    elif fn == "kp_me":
        u = me(a["tok"]); ok(None if not u else {"name": u["name"], "email": u["email"], "phone": "", "done": 0, "level": {"name": "Клиент", "percent": 0, "next": 1}, "codes": [], "orders": []})
    elif fn == "kp_has_word": u = me(a["tok"]); ok(bool(u and u["word"]))
    elif fn == "kp_set_word":
        u = me(a["tok"])
        if len((a["word"] or "").strip()) < 3: route.fulfill(status=400, content_type="application/json", headers=H, body=json.dumps({"message": "bad_word"})); return
        u["word"] = a["word"].strip().lower(); ok({"ok": True})
    elif fn == "kp_reset_password":
        u = users.get(a["em"])
        if not u or not u["word"]: ok({"error": "no_word" if u else "wrong"}); return
        if u["word"] != a["word"].strip().lower(): ok({"error": "wrong"}); return
        u["pw"] = a["pw"]; ok({"token": tok(a["em"]), "name": u["name"]})
    elif fn == "kp_dev_login":
        if a["code"] != devcode["v"]: ok({"error": "bad_code"}); return
        users.setdefault("developer@kirprof.local", {"pw": "x", "name": "Разработчик", "word": None, "email": "developer@kirprof.local"}); ok({"token": tok("developer@kirprof.local"), "name": "Разработчик", "dev": True})
    elif fn == "kp_reviews_list": ok({"n": 0, "avg": 0, "items": []})
    else: ok(None)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "-d", f"{ROOT}/kirprof"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        for host in ("https://fonts.googleapis.com/**", "https://cdnjs.cloudflare.com/**", "https://**.tile.openstreetmap.org/**"): ctx.route(host, lambda r: r.abort())
        ctx.route("https://roqpbkwpuvlavmiscoxs.supabase.co/rest/v1/rpc/*", handler)
        A = ctx.new_page(); A.on("pageerror", lambda e: errors.append(str(e)))
        A.goto("http://localhost:8767/index.html"); A.wait_for_timeout(700)
        A.evaluate("go('cabinet', false)"); A.wait_for_timeout(500)
        # регистрация с кодовым словом
        A.click("#segUp"); A.fill("#aName", "Анна"); A.fill("#aMail", "anna@mail.ru"); A.fill("#aPass", "password1"); A.fill("#aWord", "Мурзик"); A.click("#aSend")
        A.wait_for_selector("#cabIn:not([hidden])", timeout=4000)
        assert users["anna@mail.ru"]["word"] == "мурзик"
        assert "Кодовое слово задано" in A.inner_text("#wordNote")
        print("регистрация с кодовым словом: ok")
        # выход, «Забыли пароль?»
        A.click("#logout"); A.wait_for_selector("#cabOut:not([hidden])"); A.click("#segIn")
        assert A.is_visible("#forgotBtn"); A.fill("#aMail", "anna@mail.ru"); A.click("#forgotBtn")
        assert A.is_visible("#resetForm") and not A.is_visible("#authForm") and A.input_value("#rMail") == "anna@mail.ru"
        A.fill("#rWord", "кот"); A.fill("#rPass", "newpassword9"); A.click("#rSend2"); A.wait_for_timeout(500)
        assert "Неверная почта или кодовое слово" in A.inner_text("#rErr")
        A.fill("#rWord", "  МУРЗИК "); A.click("#rSend2"); A.wait_for_selector("#cabIn:not([hidden])", timeout=4000)
        assert users["anna@mail.ru"]["pw"] == "newpassword9"
        print("смена пароля по кодовому слову: ok")
        # без слова: понятная ошибка
        users["old@mail.ru"] = {"pw": "x", "name": "Старый", "word": None, "email": "old@mail.ru"}
        A.click("#logout"); A.wait_for_selector("#cabOut:not([hidden])"); A.fill("#aMail", "old@mail.ru"); A.click("#forgotBtn"); A.fill("#rWord", "abc"); A.fill("#rPass", "password22"); A.click("#rSend2"); A.wait_for_timeout(500)
        assert "не задано" in A.inner_text("#rErr")
        A.click("#rBack"); assert A.is_visible("#authForm")
        print("нет кодового слова: ok")
        # задать слово в кабинете
        A.fill("#aMail", "anna@mail.ru"); A.fill("#aPass", "newpassword9"); A.click("#aSend"); A.wait_for_selector("#cabIn:not([hidden])")
        A.fill("#pWord", "ab"); A.click("#wordForm button"); A.wait_for_timeout(400); assert "не короче 3" in A.inner_text("#wErr")
        A.fill("#pWord", "Барсик"); A.click("#wordForm button"); A.wait_for_timeout(400); assert users["anna@mail.ru"]["word"] == "барсик"
        print("смена кодового слова в кабинете: ok")
        # вход разработчика: семь нажатий на логотип
        A.click("#logout"); A.wait_for_selector("#cabOut:not([hidden])")
        for _ in range(7): A.click(".brand")
        A.wait_for_selector("#devBox"); A.fill("#devCode", "wrong"); A.click("#devBox button[type=submit]"); A.wait_for_timeout(400)
        assert "Неверный код" in A.inner_text("#devErr")
        A.fill("#devCode", "dev-secret-123"); A.click("#devBox button[type=submit]"); A.wait_for_selector("#cabIn:not([hidden])", timeout=4000)
        assert A.is_visible("#devTag") and A.evaluate("KP.me.email") == "developer@kirprof.local"
        assert A.evaluate("localStorage.getItem('kp_devcode')") == "dev-secret-123"
        A.screenshot(path=f"{OUT}/kp_dev.png")
        print("вход разработчика по коду: ok")
        # сессия истекла — разработчик заходит заново сам, без вопросов
        sess.clear(); A.reload(); A.wait_for_timeout(1200); A.evaluate("go('cabinet', false)"); A.wait_for_timeout(600)
        assert A.is_visible("#cabIn") and A.evaluate("KP.me && KP.me.email") == "developer@kirprof.local", A.evaluate("[KP.sess, KP.me]")
        print("авто-вход разработчика после истечения: ok")
        A.click("#logout"); A.wait_for_timeout(500); assert A.evaluate("localStorage.getItem('kp_devcode')") is None
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
