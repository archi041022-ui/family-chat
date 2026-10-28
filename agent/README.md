# ИИ-агент с голосом

Один файл `agent.js` без зависимостей. Появляется кнопка 💬: чат, голосовой разговор, выбор голоса, ползунки тембра и скорости.

## Вставка на сайт (1 строка)

```html
<script src="https://archi041022-ui.github.io/family-chat/agent/agent.js"
        data-name="Анна" data-voice="soft" data-color="#7A5AF8"
        data-persona="Ты консультант магазина цветов."
        data-knowledge="Доставка 300 ₽, бесплатно от 3000 ₽. Работаем с 9 до 21."></script>
```

Удобнее собрать строку в конструкторе: `…/agent/index.html`.

## Настройки (data-атрибуты или `AIAgent.init({...})`)

| Параметр | Что делает |
|---|---|
| `name`, `title`, `greeting` | имя, заголовок окна, первое сообщение |
| `persona` | роль и характер |
| `knowledge`, `knowledgeUrl` | что агент должен знать; адрес текстового файла со знаниями |
| `voice` | `soft` `female` `bright` `male` `calm` `butler` `robot` `cartoon` |
| `pitch`, `rate` | тембр и скорость, множители 0.6–1.6 |
| `voiceName` | точное имя голоса устройства (иначе подбирается сам) |
| `speak`, `mic`, `handsfree` | озвучка, микрофон, разговор без нажатий |
| `color`, `position`, `theme` | цвет, `right`/`left`, `auto`/`light`/`dark` |
| `provider`, `endpoint`, `apiKey`, `model` | какой ИИ отвечает (см. ниже) |
| `id` | если на сайте несколько агентов |
| `remember` | помнить беседу в браузере |

## Какой ИИ отвечает

- **По умолчанию** — бесплатный сервис pollinations, без ключа. Подходит для пробы; стабильность не гарантируется.
- **`provider: "openai"`** — любой OpenAI-совместимый API: `endpoint`, `apiKey`, `model`. Ключ на странице виден всем, поэтому для публичного сайта лучше сервер.
- **`provider: "custom"`** — ваш сервер. Получает `{ system, messages, name, id }`, отвечает `{ reply }`. Пример для Cloudflare Workers: `server-example.js`.

## Управление из кода

```js
const a = AIAgent.init({ name: "Анна", voice: "soft" });
a.on("message", m => console.log(m.role, m.text));   // события: open, close, message, speak, error
a.open(); a.ask("Сколько стоит доставка?"); a.say("Добрый день!"); a.reset(); a.destroy();
```

## Приложения

- **Android / iOS WebView:** загрузите страницу с агентом в WebView или добавьте тег `<script>` на страницу. Если в приложении есть `AndroidBridge.speak2`, озвучка идёт через него.
- **React / Vue / Angular:** добавьте `<script>` через `useEffect` / `mounted` и вызовите `AIAgent.init({...})`.

## Важно

- Голос озвучки — это голоса устройства; одно и то же имя на разных телефонах звучит по-разному. Настоящие голоса актёров и дикторов копировать нельзя.
- Микрофон и озвучка работают только на https и в браузерах с Web Speech API (Chrome, Edge, Safari; в Firefox микрофона нет).
- Ответы ИИ могут быть неточными: для цен и условий укажите их в `knowledge`.
