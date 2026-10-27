"""КИРПРОФ: кабинет мастера, каталог материалов в примерке, настройки сайта (RPC подменяются)."""
import json, subprocess, sys, time, os, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = "/home/claude/family-chat"; OUT = "/tmp/fc-shots"; os.makedirs(OUT, exist_ok=True)
buf = io.BytesIO(); Image.new("RGB", (64, 64), (30, 90, 160)).save(buf, "PNG"); PNG = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
calls = []; admin_ok = {"v": True}
settings = {"shop": {"phone": "+7 (495) 111-22-33", "mail": "info@kirprof.ru", "addr": "Москва, ул. Ткацкая, 5", "hours": "Пн–Пт 10–18", "lat": 55.7, "lon": 37.6}, "banner": "Скидка 10% по коду OSEN10", "about": "Мастерская с 2010 года."}
mats = [{"id": "m1", "name": "Велюр Тест", "kind": "vel", "color": "#1f5c4c", "article": "V-1", "price": 1200, "stock": "15 м", "note": None, "photo": None, "active": True},
        {"id": "m2", "name": "Образец синий", "kind": "rog", "color": "#2c4a7a", "article": "R-7", "price": 900, "stock": None, "note": None, "photo": PNG, "active": True}]
orders = [{"num": 7, "ts": "2026-10-27T10:00:00Z", "name": "Иван", "phone": "+7 900 123-45-67", "email": "i@x.ru", "address": "Центр", "comment": "Позвонить после 18", "items": [{"t": "Перетяжка дивана", "q": 1, "p": 9500}], "total": 9500, "discount": 475, "cert": 0, "final": 9025, "code": "HELLO-1", "status": "new"}]
reviews = [{"id": "00000000-0000-0000-0000-000000000001", "name": "Ольга", "rating": 5, "text": "Отличная работа, диван как новый!", "pc": 2, "ts": "2026-10-20T10:00:00Z"}]
def handler(route):
    req = route.request; fn = req.url.split("/rpc/")[1]; a = json.loads(req.post_data or "{}"); H = {"access-control-allow-origin": "*"}
    if req.method == "OPTIONS": route.fulfill(status=204, headers={**H, "access-control-allow-headers": "*", "access-control-allow-methods": "POST"}); return
    calls.append((fn, a))
    def ok(v): route.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps(v))
    def bad(m): route.fulfill(status=400, content_type="application/json", headers=H, body=json.dumps({"message": m}))
    admin = fn.startswith("kp_adm_")
    if admin and not admin_ok["v"]: bad("forbidden"); return
    if fn == "kp_settings_get": ok(settings)
    elif fn == "kp_materials_list": ok([m for m in mats if m["active"]])
    elif fn == "kp_admin_check": ok(admin_ok["v"])
    elif fn == "kp_me": ok({"name": "Мастер", "email": "master@mail.ru", "phone": "", "done": 0, "level": {"name": "Клиент", "percent": 0, "next": 1}, "codes": [], "orders": []})
    elif fn == "kp_has_word": ok(True)
    elif fn == "kp_reviews_list": ok({"n": 0, "avg": 0, "items": []})
    elif fn == "kp_adm_stats": ok({"users": 12, "users7": 3, "orders": 5, "o_new": 2, "o_work": 1, "o_done": 2, "o_cancel": 0, "revenue": 18000, "pipeline": 7000, "reviews": 4, "avg": 4.75, "coupons": 1, "cert_balance": 3000, "materials": 2, "days": [{"d": "%02d.10" % (15 + i), "n": i % 3} for i in range(14)]})
    elif fn == "kp_adm_orders": ok([o for o in orders if a.get("st") in (None, o["status"])])
    elif fn == "kp_adm_order_status":
        for o in orders:
            if o["num"] == a["n"]: o["status"] = a["st"]
        ok({"ok": True})
    elif fn == "kp_adm_reviews": ok(reviews)
    elif fn == "kp_adm_review_delete": reviews.clear(); ok({"ok": True})
    elif fn == "kp_adm_users": ok([{"email": "a@b.ru", "name": "Аня", "phone": "+7 900", "ts": "2026-10-10T10:00:00Z", "admin": False, "orders": 2, "done": 1}])
    elif fn == "kp_adm_user_password": ok({"ok": True} if len(a["pw"]) >= 8 else None) if len(a["pw"]) >= 8 else bad("bad_password")
    elif fn == "kp_adm_materials": ok(mats)
    elif fn == "kp_adm_material_save":
        m = a["m"]; mats.append({"id": "m%d" % (len(mats) + 1), "name": m["name"], "kind": m["kind"], "color": m["color"], "article": m["article"] or None, "price": int(m["price"]) if m["price"] else None, "stock": m["stock"] or None, "note": None, "photo": m.get("photo"), "active": m["active"]}); ok({"id": "x"})
    elif fn == "kp_adm_setting_set": settings[a["k"]] = a["v"]; ok({"ok": True})
    elif fn == "kp_adm_mint": ok({"code": "KP-TEST" if a["kind"] == "certificate" else a["cd"].upper()})
    elif fn == "kp_adm_codes": ok([{"code": "ZIMA10", "kind": "coupon", "percent": 10, "uses": None, "until": "2026-11-27T00:00:00Z", "balance": None, "amount": None}])
    else: ok(None)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8768", "-d", f"{ROOT}/kirprof"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        for host in ("https://fonts.googleapis.com/**", "https://cdnjs.cloudflare.com/**", "https://**.tile.openstreetmap.org/**"): ctx.route(host, lambda r: r.abort())
        ctx.route("https://roqpbkwpuvlavmiscoxs.supabase.co/rest/v1/rpc/*", handler)
        ctx.add_init_script("localStorage.setItem('kp_sess', 'S' + 'x'.repeat(40)); window.__saved = []; window.KirprofBridge = { saveText(t, n, m) { window.__saved.push([t, n]); } };")
        A = ctx.new_page(); A.on("pageerror", lambda e: errors.append(str(e)))
        # ── сайт: настройки мастерской и каталог
        A.goto("http://localhost:8768/index.html"); A.wait_for_timeout(1200)
        assert A.is_visible("#banner") and "OSEN10" in A.inner_text("#banner")
        assert A.inner_text("#shopPhone") == "+7 (495) 111-22-33" and not A.is_visible("#demoNote") and "Ткацкая" in A.inner_text("#shopAddr")
        assert "Мастерская с 2010" in A.inner_text("#aboutTxt")
        print("настройки мастерской на сайте: ok")
        A.evaluate("go('cabinet', false)"); A.wait_for_timeout(700); assert A.is_visible("#adminBtn")
        print("кнопка «Панель мастера» у администратора: ok")
        A.evaluate("go('fit', false)"); A.wait_for_timeout(500); assert A.locator("#fitCatChip").count() == 1
        A.click("#fitSamples .chip >> nth=0"); A.wait_for_function("document.getElementById('fitEmpty').hidden", timeout=5000)
        A.evaluate("document.getElementById('fitCv').scrollIntoView({block:'center'})"); box = A.locator("#fitCv").bounding_box(); A.mouse.click(box["x"] + box["width"] * .5, box["y"] + box["height"] * .5); A.wait_for_timeout(400)
        A.click("#fitCatChip"); A.wait_for_timeout(300); assert A.locator("#fitSw .fsw").count() == 2
        A.click("#fitSw .fsw >> nth=1"); A.wait_for_timeout(600)
        assert "Образец синий" in A.inner_text("#fitMat") and "R-7" in A.inner_text("#fitMat")
        r, g, bl = A.evaluate("(() => { const m = FIT.mask, W = FIT.W; for (let i = 0; i < m.length; i++) if (FIT.soft[i] === 255) { const d = document.getElementById('fitCv').getContext('2d').getImageData(i % W, (i / W) | 0, 1, 1).data; return [d[0], d[1], d[2]]; } })()")
        assert bl > r + 20, (r, g, bl)
        A.click("#fitSw .fsw >> nth=0"); A.wait_for_timeout(400); assert "Велюр Тест" in A.inner_text("#fitMat") and "15 м" in A.inner_text("#fitMat")
        A.click("#fitOrder"); A.wait_for_timeout(600); assert "Велюр Тест, арт. V-1" in A.input_value("#fNote")
        print("каталог мастерской в примерке: ok")
        # ── кабинет мастера
        A.goto("http://localhost:8768/admin.html"); A.wait_for_selector("#admNav:not([hidden])", timeout=5000); A.wait_for_selector(".tile")
        assert "12" in A.inner_text(".tiles") and "18 000" in A.inner_text(".tiles").replace(" ", " ") and A.locator(".bars i").count() == 14
        A.screenshot(path=f"{OUT}/adm1.png")
        print("обзор со статистикой: ok")
        A.click("#admNav [data-t=orders]"); A.wait_for_selector(".card2"); assert "Иван" in A.inner_text("#admMain") and "Позвонить после 18" in A.inner_text("#admMain")
        A.click(".card2 .pill:has-text('В работе')"); A.wait_for_timeout(500); assert orders[0]["status"] == "work"
        A.click(".pills .pill:has-text('Новые')"); A.wait_for_timeout(400); assert "Заявок нет" in A.inner_text("#admMain")
        A.click(".pills .pill:has-text('Все')"); A.wait_for_timeout(300)
        A.click("text=Скачать список (CSV)"); A.wait_for_function("window.__saved.length === 1"); t, n = A.evaluate("window.__saved[0]"); assert "Иван" in t and n.endswith(".csv") and t.startswith("﻿")
        print("заявки: статус, фильтр, CSV: ok")
        A.click("#admNav [data-t=reviews]"); A.wait_for_selector(".card2"); A.click(".card2 .pill.bad"); assert reviews; A.click(".card2 .pill.bad"); A.wait_for_timeout(500); assert not reviews
        print("модерация отзывов: ok")
        A.click("#admNav [data-t=users]"); A.wait_for_selector(".card2"); A.click(".card2 .pill:has-text('Новый пароль')"); A.fill(".card2 input[placeholder^='Новый']", "short"); A.click(".card2 .pill:has-text('Сохранить')"); A.wait_for_timeout(400)
        assert "не короче 8" in A.inner_text("#admToast"); A.fill(".card2 input[placeholder^='Новый']", "longenough1"); A.click(".card2 .pill:has-text('Сохранить')"); A.wait_for_timeout(400); assert "Пароль изменён" in A.inner_text("#admToast")
        print("клиенты и новый пароль: ok")
        A.click("#admNav [data-t=materials]"); A.wait_for_selector("form.adm-form")
        A.fill("form.adm-form input[maxlength='80']", "Шенилл Новый"); A.select_option("form.adm-form select", "chen"); A.fill("form.adm-form input[maxlength='40'] >> nth=0", "S-5"); A.fill("form.adm-form input[type=number]", "1500")
        A.set_input_files("form.adm-form input[type=file]", files=[{"name": "p.png", "mimeType": "image/png", "buffer": base64.b64decode(PNG.split(",")[1])}]); A.wait_for_timeout(500)
        A.click("form.adm-form button[type=submit]"); A.wait_for_timeout(700)
        assert mats[-1]["name"] == "Шенилл Новый" and mats[-1]["photo"].startswith("data:image/jpeg") and mats[-1]["price"] == 1500 and "Шенилл Новый" in A.inner_text("#admMain")
        print("добавление материала с фото: ok")
        A.click("#admNav [data-t=info]"); A.wait_for_selector("form.adm-form"); A.fill("form.adm-form input >> nth=0", "+7 900 000-00-01"); A.click("form.adm-form button[type=submit]"); A.wait_for_timeout(700)
        assert settings["shop"]["phone"] == "+7 900 000-00-01" and "banner" in settings
        print("информация о мастерской: ok")
        A.click("#admNav [data-t=tools]"); A.wait_for_selector("form.adm-form"); A.fill("form.adm-form input >> nth=0", "zima15"); A.click("form.adm-form >> nth=0 >> button[type=submit]"); A.wait_for_timeout(600)
        assert "ZIMA15" in A.inner_text("#admMain"); A.click("form.adm-form >> nth=1 >> button[type=submit]"); A.wait_for_timeout(500); assert "KP-TEST" in A.inner_text("#admMain")
        print("инструменты: промокод и сертификат: ok")
        # ── без прав
        admin_ok["v"] = False; A.goto("http://localhost:8768/admin.html"); A.wait_for_timeout(1000); assert "нет прав" in A.inner_text("#admMain").lower() and not A.is_visible("#admNav")
        print("без прав доступа нет: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
