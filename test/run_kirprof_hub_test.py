"""КИРПРОФ: разделы в «Услугах», чат, обратный звонок; кабинет: каталог, поддержка, сотрудники и права."""
import json, threading, functools, http.server, os
from playwright.sync_api import sync_playwright
ROOT = "/home/claude/family-chat"; OUT = "/tmp/fc-shots"; os.makedirs(OUT, exist_ok=True); errors = []
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8770), functools.partial(type("Q", (http.server.SimpleHTTPRequestHandler,), {"log_message": lambda *a, **k: None}), directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
items = {"product": [{"id": "i1", "title": "Диван Лофт", "descr": "Кожа, перетяжка", "price": 15000, "photo": None, "active": True}], "interior": [], "tool": []}
chat = []; calls_q = []; staff = {"me": {"owner": True, "dev": True, "perms": [], "name": "Разработчик"}}
people = [{"email": "op@x.ru", "name": "Оператор", "perms": ["support"], "owner": False, "dev": False}]
def handler(route):
    req = route.request; fn = req.url.split("/rpc/")[1]; a = json.loads(req.post_data or "{}"); H = {"access-control-allow-origin": "*"}
    if req.method == "OPTIONS": route.fulfill(status=204, headers={**H, "access-control-allow-headers": "*", "access-control-allow-methods": "POST"}); return
    def ok(v): route.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps(v))
    if fn == "kp_materials_list": ok([{"id": "m1", "name": "Велюр Тест", "kind": "vel", "color": "#1f5c4c", "article": "V-1", "price": 1200, "stock": "15 м", "note": None, "photo": None}])
    elif fn == "kp_items_list": ok([i for i in items[a["k"]] if i["active"]])
    elif fn == "kp_settings_get": ok({})
    elif fn == "kp_chat_send": chat.append({"id": len(chat) + 1, "staff": False, "who": None, "body": a["tx"], "ts": "2026-10-28T10:00:00Z"}); ok({"ok": True})
    elif fn == "kp_chat_get": ok({"closed": False, "items": [m for m in chat if m["id"] > a.get("after", 0)]})
    elif fn == "kp_callback_create":
        if len("".join(c for c in a["ph"] if c.isdigit())) < 10: ok({"error": "bad_phone"}); return
        calls_q.append({"id": len(calls_q) + 1, "name": a["nm"], "phone": a["ph"], "pref": a["pf"], "note": a["nt"], "status": "new", "ts": "2026-10-28T10:00:00Z"}); ok({"ok": True})
    elif fn == "kp_dev_login": ok({"token": "T" * 40})
    elif fn == "kp_admin_check": ok(staff["me"])
    elif fn == "kp_adm_stats": ok({"users": 1, "users7": 1, "orders": 0, "o_new": 0, "o_work": 0, "o_done": 0, "o_cancel": 0, "revenue": 0, "pipeline": 0, "reviews": 0, "avg": 0, "coupons": 0, "cert_balance": 0, "materials": 1, "days": [{"d": "01.10", "n": 0}] * 14})
    elif fn == "kp_adm_support_counts": ok({"chats": 1, "calls": len([c for c in calls_q if c["status"] == "new"])})
    elif fn == "kp_adm_items": ok(items[a["k"]])
    elif fn == "kp_adm_item_save":
        m = a["m"]; items[a["k"]].append({"id": "i%d" % (len(items[a["k"]]) + 9), "title": m["title"], "descr": m.get("descr"), "price": int(m["price"]) if m.get("price") else None, "photo": m.get("photo"), "active": m["active"]}); ok({"id": "x"})
    elif fn == "kp_adm_item_delete":
        for k in items: items[k] = [i for i in items[k] if i["id"] != a["iid"]]
        ok({"ok": True})
    elif fn == "kp_adm_chats": ok([{"id": "c1", "name": "Аня", "closed": False, "ts": "2026-10-28T10:00:00Z", "last": chat[-1]["body"] if chat else "", "unread": 1}])
    elif fn == "kp_adm_chat_get": ok({"closed": False, "name": "Аня", "items": [m for m in chat if m["id"] > a.get("after", 0)]})
    elif fn == "kp_adm_chat_send": chat.append({"id": len(chat) + 1, "staff": True, "who": "Оператор", "body": a["tx"], "ts": "2026-10-28T10:01:00Z"}); ok({"ok": True})
    elif fn == "kp_adm_callbacks": ok(calls_q)
    elif fn == "kp_adm_callback_status":
        for c in calls_q:
            if c["id"] == a["cid"]: c["status"] = a["st"]
        ok({"ok": True})
    elif fn == "kp_adm_staff": ok([{"email": "dev@x", "name": "Я", "perms": [], "owner": False, "dev": True}] + people)
    elif fn == "kp_adm_staff_set":
        people.append({"email": a["em"], "name": "Новый", "perms": a["pr"], "owner": False, "dev": False}) if not any(p["email"] == a["em"] for p in people) else [p.update(perms=a["pr"]) for p in people if p["email"] == a["em"]]
        ok({"ok": True})
    else: ok({})
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
    ctx.route("https://roqpbkwpuvlavmiscoxs.supabase.co/rest/v1/rpc/*", handler)
    ctx.route("**/tile.openstreetmap.org/**", lambda r: r.abort()); ctx.route("**/unpkg.com/**", lambda r: r.abort()); ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.add_init_script("window.__push=[];window.KirprofBridge={setPush:function(j){window.__push.push(JSON.parse(j))},shareApp:function(){window.__shared=(window.__shared||0)+1}}")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("http://127.0.0.1:8770/kirprof/index.html"); pg.wait_for_timeout(1000); pg.evaluate("go('services')"); pg.wait_for_timeout(500)
    assert pg.locator(".hub-tile").count() == 6, "плитки"
    pg.screenshot(path=f"{OUT}/kp-hub.png"); print("разделы выделены в «Услугах»: ok")
    pg.click(".hub-tile[data-k=product]"); pg.wait_for_selector(".hub-card"); assert "Диван Лофт" in pg.inner_text("#hubBody"); print("изделия у клиента: ok")
    pg.click("#hubBack"); assert pg.evaluate("HUB.open") is False
    pg.click(".hub-tile[data-k=interior]"); pg.wait_for_selector("#hubBody .note"); assert "Пока пусто" in pg.inner_text("#hubBody"); pg.click("#hubBack")
    pg.click(".hub-tile[data-k=materials]"); pg.wait_for_selector(".hub-card"); assert "Велюр Тест" in pg.inner_text("#hubBody") and "примерить" in pg.inner_text("#hubBody").lower(); pg.click("#hubBack")
    pg.click(".hub-tile[data-k=chat]"); pg.wait_for_selector(".chat-log"); pg.fill("#hubBody input", "Аня"); pg.fill("#hubBody textarea", "Сколько стоит диван?"); pg.click("#hubBody .btn"); pg.wait_for_timeout(500)
    assert "Сколько стоит диван?" in pg.inner_text(".chat-log") and chat[0]["body"] == "Сколько стоит диван?"; print("чат: сообщение клиента: ok")
    pg.screenshot(path=f"{OUT}/kp-chat.png")
    chat.append({"id": 2, "staff": True, "who": "Оператор", "body": "От 9500 ₽", "ts": "2026-10-28T10:01:00Z"}); pg.wait_for_function("document.querySelector('.chat-log').innerText.includes('От 9500')", timeout=8000); print("чат: ответ оператора приходит сам: ok")
    assert any(len(x["ck"]) >= 16 for x in pg.evaluate("__push")); print("приложению передан ключ чата для уведомлений: ok")
    pg.click("#hubBack"); pg.click(".hub-tile[data-k=call]"); pg.wait_for_selector("#hubBody select"); pg.fill("#hubBody input >> nth=0", "Иван"); pg.fill("#hubBody input >> nth=1", "123"); pg.click("#hubBody .btn"); pg.wait_for_timeout(400)
    assert "проверьте номер" in pg.inner_text("#hubBody").lower(); pg.fill("#hubBody input >> nth=1", "+7 900 123-45-67"); pg.click("#hubBody .btn"); pg.wait_for_timeout(400)
    assert "заявка принята" in pg.inner_text("#hubBody").lower() and calls_q[0]["name"] == "Иван"; print("обратный звонок: ok")
    pg.click("#hubBack")
    pg.evaluate("go('contacts')"); pg.wait_for_timeout(400); pg.click("#v-contacts [data-share]"); pg.wait_for_timeout(200); assert pg.evaluate("window.__shared") == 1; print("поделиться приложением: ok")
    pg.screenshot(path=f"{OUT}/kp-share.png")
    # ── кабинет
    A = ctx.new_page(); A.on("pageerror", lambda e: errors.append(str(e)))
    A.goto("http://127.0.0.1:8770/kirprof/admin.html"); A.evaluate("localStorage.setItem('kp_sess','" + "T" * 40 + "')"); A.reload(); A.wait_for_selector("#admNav:not([hidden])", timeout=6000)
    tabs = A.eval_on_selector_all("#admNav button", "b=>b.map(x=>x.dataset.t)"); assert tabs == ["overview", "orders", "support", "reviews", "users", "materials", "product", "interior", "tool", "staff", "info", "codes"], tabs
    assert "Поддержка · 2" in A.inner_text("#admNav"); print("владелец видит все разделы, значок на «Поддержке»: ok")
    pa = A.evaluate("__push"); assert pa and pa[-1]["tok"] and json.loads(pa[-1]["adm"]) == {"support": True, "orders": True}, pa; print("приложению передано, за чем следить сотруднику: ok")
    A.click("#admNav [data-t=interior]"); A.wait_for_selector("form.adm-form"); A.fill("form.adm-form input >> nth=0", "Гостиная лофт"); A.fill("form.adm-form textarea", "Диван и кресла"); A.click("form.adm-form button[type=submit]"); A.wait_for_timeout(500)
    assert items["interior"][0]["title"] == "Гостиная лофт" and "Гостиная лофт" in A.inner_text("#admMain"); print("загрузка интерьера: ok")
    A.click("#admNav [data-t=support]"); A.wait_for_selector(".card2.clk"); assert "Иван" in A.inner_text("#admMain"); A.click(".card2.clk"); A.wait_for_selector(".chat-log .msg"); A.fill("#admMain textarea", "Приезжайте на замер"); A.click("#admMain .btn"); A.wait_for_timeout(500)
    assert chat[-1]["body"] == "Приезжайте на замер" and chat[-1]["staff"]; print("ответ оператора в чате: ok")
    A.click(".pill:has-text('Все обращения')"); A.wait_for_selector("text=Иван"); A.click(".pill:has-text('Отметить: перезвонили')"); A.wait_for_timeout(400); assert calls_q[0]["status"] == "done"; print("отметка «перезвонили»: ok")
    A.click("#admNav [data-t=staff]"); A.wait_for_selector("form.adm-form"); A.fill("form.adm-form input[type=email]", "new@x.ru"); A.click("form.adm-form button[type=submit]"); A.wait_for_timeout(500)
    assert any(x["email"] == "new@x.ru" and x["perms"] == ["support"] for x in people), people; assert "new@x.ru" in A.inner_text("#admMain"); A.screenshot(path=f"{OUT}/kp-staff.png"); print("сотрудники и права: ok")
    # сотрудник только с «поддержкой»
    staff["me"] = {"owner": False, "dev": False, "perms": ["support"], "name": "Оператор"}; A.reload(); A.wait_for_selector("#admNav:not([hidden])", timeout=6000)
    tabs = A.eval_on_selector_all("#admNav button", "b=>b.map(x=>x.dataset.t)"); assert tabs == ["overview", "support"], tabs; print("сотрудник видит только разрешённое: ok")
    b.close()
print("ERRORS:", errors or "нет")
