"""КИРПРОФ: примерка материала на мебель (образец, палочка, кисть, ткани, заказ, сохранение)."""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = "/home/claude/family-chat"; OUT = "/tmp/fc-shots"; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8766", "-d", f"{ROOT}/kirprof"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True)
        for host in ("https://fonts.googleapis.com/**", "https://cdnjs.cloudflare.com/**", "https://roqpbkwpuvlavmiscoxs.supabase.co/**", "https://**.tile.openstreetmap.org/**"):
            ctx.route(host, lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: errors.append(str(e)))
        A.goto("http://localhost:8766/index.html"); A.wait_for_timeout(800)
        A.evaluate("window.__saved = null; window.KirprofBridge = { saveImage(u, n) { window.__saved = [u.slice(0, 23), n]; } }")
        assert A.locator(".tb").count() == 7
        A.click(".tb:nth-child(3)"); A.wait_for_timeout(600)
        assert A.evaluate("KP.tab") == "fit"
        A.click("#fitSamples .chip >> nth=0"); A.wait_for_function("document.getElementById('fitEmpty').hidden", timeout=5000)
        print("образец загружен: ok")
        # палочка по сиденью дивана
        A.evaluate("document.getElementById('fitCv').scrollIntoView({block:'center'})"); A.wait_for_timeout(300)
        def at(fx, fy):
            box = A.locator("#fitCv").bounding_box(); return (box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
        base = A.evaluate("Array.from(FIT.base.data)")
        x, y = at(0.5, 0.5); A.mouse.click(x, y); A.wait_for_timeout(400)
        area = A.evaluate("FIT.area"); assert 3000 < area < 300000, area
        print("палочка выделила область:", area)
        A.screenshot(path=f"{OUT}/fit1.png")
        # материал: Велюр / Изумруд
        A.click("#fitTypes .chip >> nth=1"); A.click("#fitSw .fsw >> nth=3"); A.wait_for_timeout(400)
        px = lambda fx, fy: A.evaluate(f"(() => {{ const c = document.getElementById('fitCv'); const d = c.getContext('2d').getImageData(Math.round(c.width*{fx}), Math.round(c.height*{fy}), 1, 1).data; return [d[0], d[1], d[2]]; }})()")
        inside = A.evaluate("(() => { const m = FIT.mask, W = FIT.W; for (let i = 0; i < m.length; i++) if (FIT.soft[i] === 255) return [i % W, (i / W) | 0]; })()")
        r, g, bl = A.evaluate(f"(() => {{ const d = document.getElementById('fitCv').getContext('2d').getImageData({inside[0]}, {inside[1]}, 1, 1).data; return [d[0], d[1], d[2]]; }})()")
        assert g > r and g > bl - 10, (r, g, bl)                      # изумруд: зелёный преобладает
        corner = px(0.02, 0.02); i0 = 0
        assert corner == [base[0], base[1], base[2]], (corner, base[:3])  # вне выделения без изменений
        A.screenshot(path=f"{OUT}/fit2.png")
        print("велюр изумруд применён, вне выделения без изменений: ok")
        # рогожка: фактура даёт разброс яркости
        A.click("#fitTypes .chip >> nth=0"); A.wait_for_timeout(400)
        sd = A.evaluate("""(() => { const c = document.getElementById('fitCv'), g = c.getContext('2d'); const idx = []; for (let i = 0; i < FIT.soft.length && idx.length < 400; i++) if (FIT.soft[i] === 255 && i % 7 === 0) idx.push(i);
          const v = idx.map(i => g.getImageData(i % FIT.W, (i / FIT.W) | 0, 1, 1).data[1]); const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); })()""")
        assert sd > 3, sd
        print("фактура рогожки видна, разброс:", round(sd, 1))
        # ластик убирает выделение
        a0 = A.evaluate("FIT.area"); A.click("#fitModes .chip >> nth=2"); A.evaluate("FIT.st.brush = 60"); x, y = at(0.5, 0.5)
        A.mouse.move(x, y); A.mouse.down(); A.mouse.move(x + 20, y + 5); A.mouse.up(); A.wait_for_timeout(300)
        assert A.evaluate("FIT.area") < a0
        A.click("#fitUndo"); A.wait_for_timeout(300); assert A.evaluate("FIT.area") == a0
        # кисть добавляет
        A.click("#fitClear"); assert A.evaluate("FIT.area") == 0
        A.click("#fitModes .chip >> nth=1"); x, y = at(0.5, 0.4); A.mouse.move(x, y); A.mouse.down(); A.mouse.move(x + 30, y); A.mouse.up(); A.wait_for_timeout(300)
        assert A.evaluate("FIT.area") > 300
        print("ластик, отмена, кисть: ok")
        # повторное выделение палочкой и смена ползунков
        A.click("#fitModes .chip >> nth=0"); A.mouse.click(*at(0.5, 0.5)); A.wait_for_timeout(300)
        A.evaluate("() => { for (const [id, v] of [['fitScale', 160], ['fitRot', 30], ['fitInt', 80]]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } }")
        assert A.inner_text("#fitScaleV") == "160%" and A.inner_text("#fitRotV") == "30°"
        # своя ткань по фото
        A.evaluate("""() => { const c = document.createElement('canvas'); c.width = c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#d33'; g.fillRect(0, 0, 120, 120); g.fillStyle = '#fff'; for (let i = 0; i < 120; i += 20) g.fillRect(i, 0, 8, 120); window.__fab = c.toDataURL('image/png'); }""")
        A.set_input_files("#fitFab", files=[{"name": "t.png", "mimeType": "image/png", "buffer": bytes(__import__('base64').b64decode(A.evaluate("window.__fab").split(',')[1]))}])
        A.wait_for_function("FIT.st.custom !== null", timeout=3000); A.wait_for_timeout(300)
        assert "своя ткань" in A.inner_text("#fitMat")
        A.screenshot(path=f"{OUT}/fit3.png")
        print("своя ткань и ползунки: ok")
        # сохранение и заказ
        A.click("#fitSave"); A.wait_for_function("window.__saved !== null"); assert A.evaluate("window.__saved")[0] == "data:image/jpeg;base64," and A.evaluate("window.__saved")[1].endswith(".jpg")
        A.click("#fitOrder"); A.wait_for_timeout(700)
        assert A.evaluate("KP.tab") == "cart" and "Хочу обить в материале: своя ткань" in A.input_value("#fNote")
        print("сохранение и заказ: ok")
        # фото с камеры
        A.click(".tb:nth-child(3)"); A.wait_for_timeout(500)
        A.set_input_files("#fitFile", files=[{"name": "f.png", "mimeType": "image/png", "buffer": __import__('base64').b64decode(A.evaluate("window.__fab").split(',')[1])}])
        A.wait_for_function("FIT.W === 120 || FIT.W > 0 && FIT.st.sample === null", timeout=3000)
        print("загрузка своего фото: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
