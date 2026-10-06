"""КИРПРОФ v2: отзывы, кабинет, карта, ассистент (Supabase, Leaflet, OSRM подменяются)."""
import json, os, time, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = "/home/claude/family-chat"
errors = []
db = {}      # hash(token) -> review
calls = []
users = {}   # email -> {pw,name,phone}
sess = {}    # token -> email
orders = []
CODES = {"OSEN10": {"kind": "coupon", "percent": 10}, "GIFT5000": {"kind": "certificate", "percent": None, "balance": 5000}}
LEAFLET = '''window.L={_c:function(){var o={};["addTo","bindPopup","setView","fitBounds","invalidateSize","removeLayer","getBounds"].forEach(function(k){o[k]=function(){return o}});return o},
map:function(){window.__map=(window.__map||0)+1;return L._c()},tileLayer:function(){return L._c()},marker:function(){return L._c()},geoJSON:function(){window.__route=(window.__route||0)+1;return L._c()},circleMarker:function(){return L._c()}};'''

def handler(route):
    req = route.request; fn = req.url.split("/rpc/")[1]; a = json.loads(req.post_data or "{}"); calls.append(fn)
    def ok(v): route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(v))
    def bad(m): route.fulfill(status=400, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"message": m}))
    if req.method == "OPTIONS": route.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST"}); return
    if fn == "kp_reviews_list":
        items = [{"id": r["id"], "name": r["name"], "rating": r["rating"], "text": r["text"], "pc": len(r["photos"]), "ts": "2026-10-06T10:00:00Z", "mine": k == a.get("tok")} for k, r in db.items()]
        n = len(items); ok({"n": n, "avg": sum(i["rating"] for i in items) / n if n else 0, "items": items})
    elif fn == "kp_review_photos":
        ok(next((r["photos"] for r in db.values() if r["id"] == a["rid"]), []))
    elif fn == "kp_review_mine":
        r = db.get(a["tok"]); ok({"name": r["name"], "rating": r["rating"], "text": r["text"], "photos": r["photos"]} if r else None)
    elif fn == "kp_review_save":
        if len(a["ph"]) > 3: bad("bad_photos"); return
        db[a["tok"]] = {"id": "00000000-0000-0000-0000-%012d" % (len(db) + 1), "name": a["nm"], "rating": a["rt"], "text": a["tx"], "photos": a["ph"]}; ok({"ok": True})
    elif fn == "kp_review_delete":
        db.pop(a["tok"], None); ok({"ok": True})
    elif fn == "kp_register":
        if a["em"] in users: ok({"error": "exists"}); return
        users[a["em"]] = {"pw": a["pw"], "name": a["nm"], "phone": ""}; t = "T%d" % len(sess); sess[t] = a["em"]; ok({"token": t, "name": a["nm"]})
    elif fn == "kp_login":
        u = users.get(a["em"])
        if not u or u["pw"] != a["pw"]: ok({"error": "bad_login"}); return
        t = "T%d" % len(sess); sess[t] = a["em"]; ok({"token": t, "name": u["name"]})
    elif fn == "kp_logout":
        sess.pop(a["tok"], None); ok(True)
    elif fn == "kp_me":
        e = sess.get(a["tok"])
        if not e: ok(None); return
        u = users[e]; done = sum(1 for o in orders if o["em"] == e and o["status"] == "done")
        ok({"name": u["name"], "email": e, "phone": u["phone"], "done": done, "level": {"name": "Постоянный клиент" if done else "Клиент", "percent": 3 if done else 0, "next": 3 if done else 1},
            "codes": [{"code": "HELLO-AB12CD", "kind": "coupon", "percent": 5, "balance": None, "amount": None, "until": "2027-01-01T00:00:00Z", "note": "Скидка на первый заказ"}],
            "orders": [{"num": o["num"], "ts": "2026-10-06T10:00:00Z", "final": o["final"], "status": o["status"]} for o in orders if o["em"] == e]})
    elif fn == "kp_profile_save":
        users[sess[a["tok"]]].update(name=a["nm"], phone=a["ph"]); ok(True)
    elif fn == "kp_code_check":
        c = CODES.get(a["cd"])
        if not c: bad("not_found"); return
        ok({"ok": True, "kind": c["kind"], "percent": c.get("percent"), "balance": c.get("balance")})
    elif fn == "kp_code_add":
        bad("not_found") if a["cd"] not in CODES else ok(True)
    elif fn == "kp_order_create":
        total = sum(i["p"] * i["q"] for i in a["items"]); c = CODES.get(a["cd"]) if a.get("cd") else None
        disc = total * (c["percent"] or 0) // 100 if c and c["kind"] == "coupon" else 0
        cert = min(c["balance"], total - disc) if c and c["kind"] == "certificate" else 0
        o = {"num": len(orders) + 1, "em": sess.get(a.get("tok")), "status": "new", "final": total - disc - cert, "items": a["items"], "nm": a["nm"], "ph": a["ph"]}; orders.append(o)
        ok({"num": o["num"], "total": total, "discount": disc, "cert": cert, "final": o["final"]})
    else: bad("unknown")

img = Image.new("RGB", (1600, 1200), (150, 70, 40)); b = io.BytesIO(); img.save(b, "JPEG"); open("/tmp/work.jpg", "wb").write(b.getvalue())

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 780}, has_touch=True)
    ctx.route("https://*.supabase.co/**", handler)
    for host in ("https://fonts.googleapis.com/**", "https://fonts.gstatic.com/**"): ctx.route(host, lambda r: r.abort())
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=LEAFLET))
    ctx.route("https://tile.openstreetmap.org/**", lambda r: r.abort())
    osrm = []
    ctx.route("https://router.project-osrm.org/**", lambda r: (osrm.append(r.request.url), r.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"routes": [{"distance": 12400, "duration": 1500, "geometry": {"type": "LineString", "coordinates": [[37.5, 55.7], [37.6, 55.75]]}}]}))))
    ctx.route("https://nominatim.openstreetmap.org/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps([{"lat": "55.70", "lon": "37.50"}])))
    ctx.grant_permissions(["geolocation"]); ctx.set_geolocation({"latitude": 55.70, "longitude": 37.55})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("file://" + ROOT + "/kirprof/index.html"); pg.wait_for_timeout(500)
    assert "Отзывов пока нет" in pg.inner_text("#rlist"), pg.inner_text("#rlist")
    # вкладки и свайп
    pg.click(".tb:nth-child(3)"); pg.wait_for_timeout(900); assert pg.evaluate("cur") == 2
    pg.evaluate("pager.scrollBy({left: pager.clientWidth, behavior: 'auto'})"); pg.wait_for_timeout(700); assert pg.evaluate("cur") == 3
    pg.click(".tb:nth-child(3)"); pg.wait_for_timeout(900)
    # публикация с фото
    pg.click("#rate button:nth-child(5)"); pg.fill("#rName", "Анна"); pg.fill("#rText", "Диван перетянули за четыре дня, очень аккуратно")
    pg.set_input_files("#rFiles", "/tmp/work.jpg"); pg.wait_for_selector("#thumbs .th")
    assert pg.evaluate("myPhotos[0].length") < 120000, pg.evaluate("myPhotos[0].length")
    pg.click("#rSend"); pg.wait_for_selector("#rlist .rtext"); pg.wait_for_selector("#rlist .ph-t img")
    assert "Диван перетянули" in pg.inner_text("#rlist") and "ваш отзыв" in pg.inner_text("#rlist").lower()
    assert pg.evaluate("document.querySelector('#rDel').hidden") is False
    assert "5,0" in pg.inner_text("#score")
    pg.click("#rlist .ph-t"); assert pg.evaluate("!document.querySelector('#box').hidden"); pg.click("#boxClose"); assert pg.evaluate("document.querySelector('#box').hidden")
    # изменение
    pg.fill("#rText", "Диван перетянули за четыре дня, очень аккуратно. Рекомендую!"); pg.click("#rSend"); pg.wait_for_timeout(500)
    assert "Рекомендую" in pg.inner_text("#rlist") and len(db) == 1
    # перезагрузка: форма заполняется своим отзывом
    pg.reload(); pg.wait_for_selector("#rlist .rtext"); pg.wait_for_timeout(500)
    assert pg.input_value("#rName") == "Анна" and pg.evaluate("myPhotos.length") == 1, (pg.input_value("#rName"), pg.evaluate("myPhotos.length"))
    # ошибки сети
    pg.click("#rDel"); pg.click("#rDel"); pg.wait_for_timeout(500)
    assert len(db) == 0 and "Отзывов пока нет" in pg.inner_text("#rlist")
    assert pg.evaluate("document.documentElement.scrollWidth") <= 390
    # ---- калькулятор и корзина
    pg.click(".tb:nth-child(2)"); pg.wait_for_timeout(700)
    pg.select_option("#cType", "sofa"); pg.click("#cAdd"); assert pg.evaluate("cart.length") == 1
    # ---- ассистент: навигация, добавление, расчёт, бюджет
    pg.click("#afab"); assert pg.evaluate("!document.querySelector('#asst').hidden")
    def say(t): pg.fill("#aText", t); pg.press("#aText", "Enter"); pg.wait_for_timeout(450)
    say("как добраться"); assert pg.evaluate("KP.tab") == "contacts", pg.evaluate("KP.tab")
    say("покажи отзывы"); assert pg.evaluate("KP.tab") == "reviews"
    say("мои скидки"); assert pg.evaluate("KP.tab") == "cabinet"
    say("очисти корзину"); assert pg.evaluate("cart.length") == 0
    say("добавь два стула и угловой диван"); lines = pg.evaluate("cart.map(l=>[l.k,l.q])")
    assert ["ichair", 2] in lines and ["icorner", 1] in lines and len(lines) == 2, lines
    say("сколько стоит диван из велюра"); assert "около" in pg.inner_text("#aMsgs") and pg.evaluate("KPAsst.AS.pending.step") == "addcalc"
    say("нет"); assert pg.evaluate("cart.length") == 2
    say("очисти корзину"); say("собери заказ на 20 тысяч"); assert pg.evaluate("KPAsst.AS.pending.step") == "addbudget"
    say("да"); s = pg.evaluate("cartSum()"); assert 0 < s <= 20000, (s, pg.inner_text("#aMsgs")[-600:], pg.evaluate("JSON.stringify(KPAsst.AS.pending)"))
    say("примени код OSEN10"); assert pg.evaluate("KP.promo.percent") == 10
    # оформление голосом: имя, телефон, подтверждение
    say("оформи заказ"); assert pg.evaluate("KPAsst.AS.pending.step") == "name"
    say("Иван"); assert pg.evaluate("KPAsst.AS.pending.step") == "phone"
    say("плюс семь девятьсот"); assert pg.evaluate("KPAsst.AS.pending.step") == "phone"
    say("+7 916 123-45-67"); assert pg.evaluate("KPAsst.AS.pending.step") == "confirm"
    say("нет"); assert len(orders) == 0 and pg.evaluate("cart.length") > 0
    say("отправь заказ"); say("да"); pg.wait_for_timeout(300)
    assert len(orders) == 1 and orders[0]["nm"] == "Иван" and orders[0]["final"] == int(s - s * 10 // 100) or abs(orders[0]["final"] - (s - s * 10 // 100)) <= 1, (orders, s)
    assert pg.evaluate("cart.length") == 0 and "отправлена" in pg.inner_text("#aMsgs")
    say("закрой"); assert pg.evaluate("document.querySelector('#asst').hidden")
    # ---- карта и маршрут
    pg.click(".tb:nth-child(6)"); pg.wait_for_timeout(700); assert pg.evaluate("window.__map") == 1
    pg.click("#routeMe"); pg.wait_for_timeout(700); assert "км" in pg.inner_text("#routeInfo") and pg.evaluate("window.__route") == 1, pg.inner_text("#routeInfo")
    pg.fill("#routeFrom", "Москва, Тверская 1"); pg.click("#routeGo"); pg.wait_for_timeout(700); assert pg.evaluate("window.__route") == 2 and len(osrm) == 2
    assert pg.evaluate("document.querySelectorAll('#extLinks a').length") == 3
    # ---- кабинет: регистрация, выход, вход, неверный пароль
    pg.click(".tb:nth-child(5)"); pg.wait_for_timeout(700)
    pg.click("#segUp"); pg.fill("#aName", "Мария"); pg.fill("#aMail", "m@example.test"); pg.fill("#aPass", "short"); pg.click("#aSend")
    assert "8 символов" in pg.inner_text("#aErr")
    pg.fill("#aPass", "longenough1"); pg.click("#aSend"); pg.wait_for_selector("#cabIn:not([hidden])")
    assert "HELLO-AB12CD" in pg.inner_text("#codes") and "Клиент" in pg.inner_text("#lvName")
    pg.click("#certAdd"); pg.wait_for_timeout(700); assert pg.evaluate("cart[0].p") == 5000 and pg.evaluate("KP.tab") == "cart"
    pg.click(".tb:nth-child(5)"); pg.wait_for_timeout(700); pg.click("#logout"); pg.wait_for_selector("#cabOut:not([hidden])")
    pg.click("#segIn"); pg.fill("#aMail", "m@example.test"); pg.fill("#aPass", "wrongpass1"); pg.click("#aSend"); pg.wait_for_timeout(300)
    assert "Неверная" in pg.inner_text("#aErr")
    pg.fill("#aPass", "longenough1"); pg.click("#aSend"); pg.wait_for_selector("#cabIn:not([hidden])")
    pg.reload(); pg.wait_for_timeout(900); assert pg.evaluate("!!KP.me") and pg.evaluate("KP.me.email") == "m@example.test"
    pg.screenshot(path="/tmp/kp_phone.png")
    assert pg.evaluate("document.documentElement.scrollWidth") <= 390
    pg.set_viewport_size({"width": 1280, "height": 800}); pg.wait_for_timeout(500); pg.screenshot(path="/tmp/kp_desk.png")
    br.close()
print("calls:", sorted(set(calls)))
print("ERRORS:", errors or "нет")
