"""КИРПРОФ: потяни вниз — обновление раздела."""
import json, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = "/home/claude/family-chat"; errors = []; calls = []
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
H.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8769), functools.partial(type("Q", (http.server.SimpleHTTPRequestHandler,), {"log_message": lambda *a, **k: None}), directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
def handler(route):
    req = route.request; fn = req.url.split("/rpc/")[1]; calls.append(fn)
    hd = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST"}
    if req.method == "OPTIONS": route.fulfill(status=204, headers=hd); return
    body = {"kp_reviews_list": {"n": 0, "avg": 0, "items": []}, "kp_settings_get": {}, "kp_materials_list": []}.get(fn, {})
    route.fulfill(status=200, content_type="application/json", headers=hd, body=json.dumps(body))
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
    ctx.route("https://roqpbkwpuvlavmiscoxs.supabase.co/rest/v1/rpc/*", handler)
    ctx.route("**/tile.openstreetmap.org/**", lambda r: r.abort()); ctx.route("**/unpkg.com/**", lambda r: r.abort())
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("http://127.0.0.1:8769/kirprof/index.html"); pg.wait_for_timeout(1200)
    pg.evaluate("go('reviews')"); pg.wait_for_timeout(700)
    n0 = calls.count("kp_reviews_list")
    pg.evaluate("""()=>{const p=document.querySelectorAll('.panel-v')[3];const mk=(t,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,touches:t==='touchend'?[]:[new Touch({identifier:1,target:p,clientX:200,clientY:y})]});
      p.dispatchEvent(mk('touchstart',200));p.dispatchEvent(mk('touchmove',260));p.dispatchEvent(mk('touchmove',400));p.dispatchEvent(mk('touchend',400));}""")
    pg.wait_for_timeout(300)
    assert pg.evaluate("document.querySelector('.ptr').classList.contains('spin')"), "нет индикатора"
    pg.wait_for_timeout(1300)
    assert calls.count("kp_reviews_list") > n0, "отзывы не перезагрузились"
    assert not pg.evaluate("document.querySelector('.ptr').classList.contains('spin')"), "индикатор завис"
    pg.screenshot(path="/tmp/fc-shots/kp-ptr.png"); b.close()
print("ERRORS:", errors or "нет")
