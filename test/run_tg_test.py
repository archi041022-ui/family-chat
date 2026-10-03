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
        ctx.route("https://translate.google.com/**", lambda r: r.abort())
        A = ctx.new_page(); B = ctx.new_page(); C = ctx.new_page()
        for pg, nm in ((A, "A"), (B, "B"), (C, "C")):
            pg.on("pageerror", lambda e, nm=nm: errors.append(f"{nm}: {e}"))
            pg.on("console", lambda m, nm=nm: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{nm} console: {m.text}"))
        register(A, "papa", "Папа"); A.wait_for_selector("#chatList .chat-item")
        register(B, "mama", "Мама"); B.wait_for_selector("#chatList .chat-item")
        register(C, "son", "Сын"); C.wait_for_selector("#chatList .chat-item")
        A.reload(); A.wait_for_selector("#chatList .chat-item"); B.reload(); B.wait_for_selector("#chatList .chat-item")
        # все участники сразу видны в списке чатов, даже без переписки
        A.wait_for_selector("#chatItems .chat-item[data-user]:has-text('Мама')"); A.wait_for_selector("#chatItems .chat-item[data-user]:has-text('Сын')")
        shot(A, "t1_A_all_people")
        A.click("#chatItems .chat-item[data-user]:has-text('Мама')"); A.wait_for_selector("#chatView .topbar >> text=Мама")
        A.fill("#input", "Привет, это личное"); A.click(".composer .send"); A.wait_for_selector(".msg.out .text >> text=Привет, это личное")
        A.click(".back-btn")
        assert A.locator("#chatItems .chat-item[data-user]:has-text('Мама')").count() == 0      # стала обычной перепиской
        print("all people listed: ok")
        # папки
        A.click("#folders >> text=Группы"); assert A.locator("#chatItems .chat-item:has-text('Семья')").count() == 1   # «Семья» — обычная строка в списке
        assert A.locator("#chatItems .quick-bar").count() == 0
        A.click("#folders >> text=Личные"); assert A.locator("#chatItems .chat-item:not(.quick-pill):has-text('Семья')").count() == 0
        A.click("#folders >> text=Все")
        print("folders: ok")
        # у каждого свой ассистент: переписка Папы не видна Маме
        A.click(".assistant-item"); A.fill("#asstInput", "который час"); A.click("#chatView .composer .send"); A.wait_for_selector("#asstMsgs .msg.in >> text=Сейчас"); A.click(".back-btn")
        assert A.evaluate("Assistant.history.length") > 0 and B.evaluate("(Assistant.loaded || Assistant.load(), Assistant.history.length)") == 0
        print("personal assistant: ok")
        # закрепить и без звука
        A.click("#chatItems .chat-item[data-chat]:has-text('Мама')", button="right"); A.click(".sheet >> text=Закрепить")
        assert "Мама" in A.inner_text("#chatItems .chat-item[data-chat]:not(.quick-pill) >> nth=0")
        A.click("#chatItems .chat-item[data-chat]:not(.quick-pill):has-text('Мама')", button="right"); A.click(".sheet >> text=Без звука")
        A.wait_for_selector("#chatItems .chat-item:has-text('Мама') .muted-ico"); shot(A, "t2_A_pinned_muted")
        print("pin/mute: ok")
        # «печатает…»
        A.click("#chatItems .chat-item:has-text('Семья')"); A.wait_for_selector("#input")
        B.click("#chatItems .chat-item:has-text('Семья')"); B.wait_for_selector("#input")
        B.type("#input", "Иду"); A.wait_for_selector("#chatSub.typing-text >> text=Мама печатает", timeout=5000)
        print("typing: ok")
        B.fill("#input", ""); 
        # редактирование
        A.fill("#input", "Ужин в 7"); A.click(".composer .send"); B.wait_for_selector(".msg.in .text >> text=Ужин в 7")
        A.click(".msg.out .bubble:has-text('Ужин в 7')", button="right"); A.click(".sheet >> text=Изменить")
        A.wait_for_selector(".replying.editing"); A.fill("#input", "Ужин в 8"); A.click(".composer .send")
        B.wait_for_selector(".msg.in .text >> text=Ужин в 8", timeout=5000); B.wait_for_selector(".msg.in .edited")
        assert B.locator(".msg.in .text >> text=Ужин в 7").count() == 0
        shot(B, "t3_B_edited")
        print("edit: ok")
        # пересылка: Мама пересылает Сыну
        B.click(".msg.in .bubble:has-text('Ужин в 8')", button="right"); B.click(".sheet >> text=Переслать")
        B.click(".sheet .menu-item >> text=Сын"); B.wait_for_selector("#chatView .topbar >> text=Сын")
        C.click("#chatItems .chat-item:has-text('Мама')"); C.wait_for_selector(".msg.in .fwd >> text=Папа"); C.wait_for_selector(".msg.in .text >> text=Ужин в 8")
        shot(C, "t4_C_forwarded"); C.click(".back-btn"); B.click(".back-btn")
        print("forward: ok")
        # поиск по чату
        A.click("button[title='Ещё']"); A.click(".sheet >> text=Поиск по чату"); A.fill(".sheet input", "ужин")
        A.wait_for_selector(".search-hit >> text=Ужин в 8"); A.click(".search-hit"); A.wait_for_timeout(400)
        print("search: ok")
        A.click(".back-btn")
        # контакты
        A.click("#tabBtnContacts"); A.wait_for_selector("#tabContacts .contact-row:has-text('Сын')"); shot(A, "t5_A_contacts")
        # звонок: вызов повторяется, пока не ответят, и «занято» не приходит
        A.click("#tabContacts .contact-row:has-text('Мама') button[title='Позвонить']")
        B.wait_for_selector(".call.ringing", timeout=8000); B.wait_for_timeout(7000)
        assert A.locator(".call").count() == 1, "вызов оборвался"
        assert B.locator(".call.ringing").count() == 1
        B.click(".cbtn.green"); A.wait_for_function("!document.querySelector('.call.ringing') && /\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        print("ringing with resend, answer: ok")
        A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000)
        # ответ из уведомления (answerIncoming) до появления экрана звонка
        B.evaluate("window.answerIncoming()")
        A.click("#tabContacts .contact-row:has-text('Мама') button[title='Видеозвонок']")
        A.wait_for_function("!!document.querySelector('.call') && /\\d:\\d\\d/.test(document.querySelector('.call .status')?.textContent || '')", timeout=15000)
        print("answer from notification: ok")
        A.click(".call .cbtn.red"); B.wait_for_selector(".call", state="detached", timeout=8000)
        # пропущенный звонок у Сына
        A.click("#tabContacts .contact-row:has-text('Сын') button[title='Позвонить']"); C.wait_for_selector(".call.ringing", timeout=8000)
        C.click(".call .cbtn.red"); A.wait_for_selector(".call", state="detached", timeout=8000)
        C.wait_for_selector("#callsBadge:not(.hidden)", timeout=8000)
        C.click("#tabBtnCalls"); C.wait_for_selector("#tabCalls .call-row.missed"); shot(C, "t6_C_calls")
        A.click("#tabBtnCalls"); A.wait_for_selector("#tabCalls .call-row >> text=Исходящий видеозвонок"); shot(A, "t6_A_calls")
        print("calls tab: ok")
        # настройки
        A.evaluate("S.tab === 'menu' || showTab('menu')"); A.click("#tabMenu .mn-tile:has-text('Настройки')"); A.wait_for_selector("#tabSettings .set-profile >> text=Папа"); shot(A, "t7_A_settings")
        A.click("#tabSettings >> text=Звонки"); A.wait_for_selector(".sheet >> text=В браузере звонки"); A.click(".sheet-back", position={"x": 5, "y": 5})
        A.click("#tabSettings >> text=Уведомления и звуки"); A.click(".sheet .toggle-row >> text=Звук новых сообщений")
        assert A.evaluate("Prefs.get('sound')") is False
        A.click(".sheet-back", position={"x": 5, "y": 5})
        A.click("#tabSettings >> text=Оформление и цвета"); A.click(".fs-seg >> text=Крупный"); A.click(".sheet .btn.wide")
        assert A.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()") == "18px"
        print("settings: ok")
        # серверы для звонков: есть ретранслятор с вычисленным паролем
        ice = A.evaluate("Ice.get().then(l => l.map(x => [String(x.urls), !!x.credential, x.username || '']))")
        assert any(c and "turn:" in u for u, c, _ in ice), ice
        print("ice:", ice[-1][0][:60], ice[-1][2][:16])
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors or "нет")
