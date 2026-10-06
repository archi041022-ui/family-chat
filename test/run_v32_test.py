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
        NOTO = open("/tmp/fc-ve/noto.gif", "rb").read()
        ctx.route("https://fonts.gstatic.com/**", lambda r: r.fulfill(status=200, content_type="image/gif", body=NOTO))
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); B.reload(); B.wait_for_selector("#chatList .chat-item")
        ids = {p["name"]: p["id"] for p in A.evaluate("JSON.parse(localStorage.getItem('mockdb')).profiles")}
        FAM = "00000000-0000-0000-0000-000000000001"
        menu = lambda pg, tile: (pg.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())"), pg.evaluate("S.tab === 'menu' || showTab('menu')"), pg.click(f"#tabMenu .mn-tile:has-text('{tile}')"))
        # ── 1. главный экран: без блоков «Задачи/Семья», без вкладки настроек, поиск — значком слева
        assert A.locator(".quick-bar").count() == 0 and A.locator("#tabBtnSettings").count() == 0
        A.wait_for_selector(f"#chatItems .chat-item[data-chat='{FAM}']")
        A.click(".top-search-btn"); A.wait_for_selector("#topSearch:not(.hidden) #chatSearch"); A.fill("#chatSearch", "мам")
        A.wait_for_function("[...document.querySelectorAll('#chatItems .chat-item')].every(x => /Мама/.test(x.textContent))")
        shot(A, "z1_search"); A.click("#topSearch .icon-btn"); A.wait_for_selector("#topSearch", state="hidden")
        assert A.evaluate("S.filter") == ""
        # меню — открыть и закрыть той же кнопкой
        A.click("#tabBtnMenu"); A.wait_for_selector("#tabMenu:not(.hidden)")
        for t in ["Конфиденциальность", "Подарки", "Стикеры", "Избранное", "Мои задачи", "Настройки"]: assert A.locator(f"#tabMenu .mn-tile:has-text('{t}')").count() == 1, t
        shot(A, "z2_menu")
        A.click("#tabBtnMenu"); A.wait_for_selector("#tabChats:not(.hidden)"); assert A.evaluate("S.tab") == "chats"
        A.evaluate("openChat(FAMILY_CHAT)"); A.wait_for_selector("#chatView .topbar >> text=Семья"); A.click(".back-btn")
        print("main screen: ok")
        # ── 2. конфиденциальность (Мама)
        menu(B, "Конфиденциальность"); B.wait_for_selector(".sheet >> text=Чёрный список")
        shot(B, "z3_privacy")
        def rule(pg, label, mode, people=()):
            pg.click(f".sheet .tg-set:has-text('{label}')"); pg.wait_for_selector(".pv-modes")
            pg.click(f".pv-radio:has-text('{'Никто' if mode == 'nobody' else 'Все в семье'}')")
            for n in people: pg.click(f".pv-person:has-text('{n}') input")
            pg.click(".sheet .btn.wide:has-text('Сохранить')"); pg.wait_for_timeout(300)
        rule(B, "Время захода", "nobody")
        rule(B, "Фотография профиля", "nobody", ["Папа"])          # фото — только Папе
        rule(B, "Личные сообщения", "nobody", ["Папа"])           # писать — только Папе
        rule(B, "Звонки", "nobody")
        rule(B, "Приглашения в группы", "nobody")
        B.click(".pv-flags .toggle-row:has-text('Отметки о прочтении') input")
        B.wait_for_timeout(600)
        assert B.evaluate("Privacy.mine.messages.mode") == "nobody" and B.evaluate("Privacy.mine.read") is False
        B.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        A.wait_for_timeout(1200); C.wait_for_timeout(300)
        # Папа: время захода скрыто — «был(а) недавно», не «в сети»
        A.wait_for_function("(id) => !S.online.has(id) && S.profiles.get(id)._seenHidden", arg=ids["Мама"], timeout=5000)
        A.click("#tabBtnContacts"); A.wait_for_selector("#tabContacts .contact-row:has-text('Мама') >> text=был(а) недавно")
        # Сын: не может писать и звонить; Папа — может писать
        C.click("#tabBtnContacts"); C.click("#tabContacts .contact-row:has-text('Мама')"); C.wait_for_selector("#chatView .pv-banner >> text=ограничил(а) личные сообщения")
        shot(C, "z4_restricted"); C.click(".back-btn")
        C.click("#tabBtnContacts"); C.click("#tabContacts .contact-row:has-text('Мама') button[title='Позвонить']"); C.wait_for_selector("text=ограничил(а) звонки"); assert C.locator(".call").count() == 0
        r = C.evaluate("(id) => S.sb.rpc('get_or_create_dm', { other: id }).then(x => S.sb.from('messages').insert({ chat_id: x.data, body: 'в обход' }).select().single()).then(r => r.error && r.error.message)", ids["Мама"])
        assert r == "PRIVACY_MESSAGES", r                          # и сервер не пропускает
        A.click("#tabContacts .contact-row:has-text('Мама')"); A.wait_for_selector("#chatView .composer"); A.fill("#input", "Папа пишет"); A.click(".composer .send")
        B.click("#tabBtnChats"); B.wait_for_selector("#chatItems .chat-item:has-text('Папа пишет')")
        # отметки о прочтении выключены — у Папы одна галочка, хотя Мама прочитала
        B.click("#chatItems .chat-item:has-text('Папа пишет')"); B.wait_for_timeout(800)
        assert A.locator(".msg.out .ticks").last.inner_text() == "✓", A.locator(".msg.out .ticks").last.inner_text()
        B.click(".back-btn"); A.click(".back-btn")
        # звонок в обход (если у звонящего старая версия): Мама сама отклоняет по своим правилам
        C.evaluate("(id) => Privacy.view.set(id, { ...Privacy.view.get(id), calls: true })", ids["Мама"])
        C.click("#tabBtnContacts"); C.click("#tabContacts .contact-row:has-text('Мама') button[title='Позвонить']")
        C.wait_for_selector("text=Пользователь ограничил звонки", timeout=8000); B.wait_for_timeout(500); assert B.locator(".call").count() == 0
        # группы: Сын создаёт группу с Мамой и Папой — Мамы в ней нет
        gid = C.evaluate("(ids) => S.sb.rpc('create_group', { title: 'Сюрприз', members: ids }).then(r => r.data)", [ids["Мама"], ids["Папа"]])
        mem = A.evaluate("(g) => JSON.parse(localStorage.getItem('mockdb')).chat_members.filter(m => m.chat_id === g).length", gid); assert mem == 2, mem
        # чёрный список: Папа блокирует Сына
        A.evaluate("(id) => Tg.profileView(id)", ids["Сын"]); A.click(".sheet .menu-item:has-text('Заблокировать')"); A.wait_for_timeout(800)
        C.wait_for_function("(id) => Privacy.blockedMe(id)", arg=ids["Папа"], timeout=5000)
        C.click("#tabBtnContacts"); C.click("#tabContacts .contact-row:has-text('Папа')"); C.wait_for_selector("#chatView .pv-banner"); C.click(".back-btn")
        menu(A, "Конфиденциальность"); A.click(".sheet .tg-set:has-text('Чёрный список')"); A.wait_for_selector(".sheet .pv-person:has-text('Сын')"); shot(A, "z5_blocked")
        A.click(".sheet .pv-person:has-text('Сын') button"); A.wait_for_timeout(600); assert A.evaluate("Privacy.blocked.length") == 0
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        print("privacy: ok")
        # ── 3. подарки
        menu(A, "Подарки"); A.wait_for_selector(".gift-wallet >> text=⭐ 100")
        A.click(".gift-wallet .btn:has-text('бонус')"); A.wait_for_selector(".gift-wallet >> text=⭐ 120")
        A.click(".sheet .btn.wide:has-text('Подарить подарок')"); A.click(".sheet .menu-item:has-text('Мама')")
        A.wait_for_selector(".gift-catalog .gift-cell"); A.click(".gift-catalog .gift-cell:has-text('Роза')")
        A.fill(".gift-msg-in", "Любимой маме"); shot(A, "z6_catalog")
        A.click(".sheet .btn.wide:has-text('Подарить «Роза»')")
        B.wait_for_selector(".gift-reveal >> text=Папа дарит вам «Роза»", timeout=8000); shot(B, "z7_reveal")
        # лимитированный: «Ракета» (1 шт.) — Папа дарит Маме, у Сына — «закончился»
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())"); A.evaluate("Gifts.compose(%r)" % ids["Мама"]); A.click(".gift-catalog .gift-cell:has-text('Ракета')"); A.click(".sheet .btn.wide:has-text('Подарить «Ракета»')")
        A.wait_for_timeout(800)
        C.evaluate("Gifts.load().then(() => Gifts.compose(%r))" % ids["Папа"]); C.wait_for_selector(".gift-catalog .gift-cell.sold:has-text('Ракета') >> text=закончился")
        C.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        # Мама: свои подарки, закрепить, обменять на звёзды
        B.evaluate("document.querySelectorAll('.gift-reveal').forEach(x => x.remove())")
        menu(B, "Подарки"); B.wait_for_selector(".sheet .gift-grid .gift-cell >> nth=1")
        B.click(".sheet .gift-grid .gift-cell >> nth=0"); B.wait_for_selector(".gift-detail")
        B.click(".sheet .menu-item:has-text('Обменять')"); B.click(".sheet .btn.wide:has-text('Обменять')"); B.wait_for_timeout(600)
        bal = B.evaluate("Gifts.home.balance"); assert bal in (124, 120), bal          # 100 + 80% цены
        # витрина в профиле: Папа видит подарок у Мамы
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        A.evaluate("(id) => Tg.profileView(id)", ids["Мама"]); A.wait_for_selector(".pv-gifts .gift-cell", timeout=5000); shot(A, "z8_profile_gifts")
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        # кто может дарить: Мама — «Никто» → Сыну нельзя
        menu(B, "Конфиденциальность"); rule(B, "Подарки — кто может дарить", "nobody"); B.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        C.wait_for_timeout(1000)
        res = C.evaluate("(id) => S.sb.rpc('send_gift', { target: id, gift: 'heart', msg: null, anon: false }).then(r => r.data)", ids["Мама"]); assert res == "PRIVACY", res
        print("gifts: ok")
        # ── 4. голосовые по очереди
        A.evaluate("(id) => openChat(id)", FAM); A.wait_for_selector("#chatView .composer")
        for f in ("v1.wav", "v2.wav"):
            A.set_input_files(".composer input[type=file]", f"/tmp/fc-ve/{f}"); A.wait_for_timeout(700)
        B.evaluate("(id) => openChat(id)", FAM); B.wait_for_function("document.querySelectorAll('.messages audio').length >= 2", timeout=8000)
        B.evaluate("() => { const a = [...document.querySelectorAll('.messages audio')]; window.__aud = a.slice(-2); }")
        B.evaluate("__aud[0].play()"); B.wait_for_timeout(300); B.evaluate("__aud[1].play()"); B.wait_for_timeout(300)
        assert B.evaluate("[__aud[0].paused, __aud[1].paused]") == [True, False], "наложение голосовых"
        B.evaluate("__aud[1].pause(); __aud[0].currentTime = 0; __aud[0].play()"); B.wait_for_timeout(2200)
        assert B.evaluate("__aud[0].ended || __aud[0].paused") and B.evaluate("!__aud[1].paused || __aud[1].currentTime > 0"), "следующее не включилось"
        print("voice queue: ok")
        B.evaluate("__aud.forEach(a => a.pause())")
        # ── 5. избранное и стикеры
        A.click(".msg.out .bubble >> nth=-1", button="right"); A.click(".sheet .menu-item:has-text('В избранное')")
        A.wait_for_selector("text=Сохранено в «Избранное»"); A.click(".back-btn")
        A.click("#tabBtnChats"); A.wait_for_selector("#chatItems .chat-item:has-text('Избранное') .saved-av")
        menu(A, "Избранное"); A.wait_for_selector("#chatView .topbar >> text=Избранное"); A.wait_for_selector("#chatSub >> text=для себя"); A.wait_for_selector(".messages audio")
        assert A.locator("#chatView .topbar button[title='Аудиозвонок']").count() == 0
        shot(A, "z9_saved"); A.click(".back-btn")
        # свой стикер из картинки
        import base64
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
        open("/tmp/st.png", "wb").write(png)
        A.evaluate("(id) => openChat(id)", FAM); A.wait_for_selector("#chatView .composer")
        A.evaluate("Stickers.store()"); A.click(".st-pack:has-text('Животные') .btn:has-text('Скачать')"); A.wait_for_selector(".st-pack:has-text('Животные') .btn:has-text('Убрать')", timeout=10000)
        assert "animals" in A.evaluate("Stickers.packs()")
        with A.expect_file_chooser() as fc: A.click(".sheet .menu-item:has-text('Создать свой стикер')")
        fc.value.set_files("/tmp/st.png"); A.wait_for_selector("text=Стикер добавлен", timeout=8000)
        A.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())")
        A.evaluate("Emoji.panel(document.querySelector('#input'))"); A.click(".emoji-tabs button[data-k='stickers']")
        A.click(".st-tabs button[data-k='mine']"); A.wait_for_selector(".st-body .sticker-grid button img"); shot(A, "z10_stickers")
        A.click(".st-body .sticker-grid button:not(.st-add) >> nth=0")
        B.wait_for_selector(".msg.in .sticker-bubble img.sticker-img", timeout=8000); shot(B, "z11_sticker_in")
        assert B.evaluate("previewText(S.lastByChat.get('%s'))" % FAM).endswith("Стикер")
        B.click(".msg.in .sticker-bubble >> nth=-1", button="right"); B.click(".sheet .menu-item:has-text('Добавить в мои стикеры')"); B.wait_for_selector("text=Стикер добавлен", timeout=8000)
        assert B.evaluate("Stickers.loadMine().then(l => l.length)") == 1
        # анимированный эмодзи → в избранные стикеры
        A.fill("#input", "🐶"); A.click(".composer .send"); B.wait_for_selector(".msg.in .big-emoji")
        B.click(".msg.in .emoji-bubble >> nth=-1", button="right"); B.click(".sheet .menu-item:has-text('Добавить в избранные стикеры')")
        assert B.evaluate("Stickers.favs()") == ["🐶"]
        print("saved & stickers: ok")
        # ── 6. звонок: фон — фото звонящего, свернуть в окно
        for pg in (A, B):
            pg.evaluate("""async () => { const c = document.createElement('canvas'); c.width = c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0,0,120,120);
              const b = await new Promise(r => c.toBlob(r, 'image/jpeg')); const path = 'avatars/' + S.me.id + '.jpg';
              await S.sb.storage.from('media').upload(path, b); await S.sb.from('profiles').update({ avatar_path: path }).eq('id', S.me.id); }""")
        A.wait_for_timeout(800); B.click(".back-btn"); A.click(".back-btn")
        menu(B, "Конфиденциальность"); rule(B, "Звонки", "all"); B.evaluate("document.querySelectorAll('.sheet-back').forEach(x => x._close && x._close())"); A.wait_for_timeout(1000)
        A.click("#tabBtnContacts"); A.click("#tabContacts .contact-row:has-text('Мама') button[title='Видеозвонок']")
        B.wait_for_selector(".call.ringing .call-bg.photo", timeout=8000)
        f = B.evaluate("getComputedStyle(document.querySelector('.call .call-bg')).filter"); assert "blur(5px)" in f, f
        shot(B, "z12_incoming_photo")
        B.click(".call .cbtn.green"); A.wait_for_function("/\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        A.click(".call .call-min"); A.wait_for_selector(".call.mini"); shot(A, "z13_mini_call")
        A.click("#tabBtnChats"); assert A.evaluate("S.tab") == "chats"      # приложением можно пользоваться
        A.click(".call.mini"); A.wait_for_selector(".call:not(.mini)")
        A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000)
        print("call photo & minimize: ok")
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
