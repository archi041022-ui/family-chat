"""КИРПРОФ: открытый сайт с отзывами (REST-вызовы Supabase подменяются)."""
import json, os, time, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = "/home/claude/family-chat"
errors = []
db = {}      # hash(token) -> review
calls = []

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
    else: bad("unknown")

img = Image.new("RGB", (1600, 1200), (150, 70, 40)); b = io.BytesIO(); img.save(b, "JPEG"); open("/tmp/work.jpg", "wb").write(b.getvalue())

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 780}, has_touch=True)
    ctx.route("https://*.supabase.co/**", handler)
    for host in ("https://fonts.googleapis.com/**", "https://fonts.gstatic.com/**"): ctx.route(host, lambda r: r.abort())
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
    br.close()
print("calls:", sorted(set(calls)))
print("ERRORS:", errors or "нет")
