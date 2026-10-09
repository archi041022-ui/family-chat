// Пример своего сервера для агента (Cloudflare Workers). Ключ ИИ хранится на сервере, а не на сайте.
// Подключение: <script src=".../agent.js" data-provider="custom" data-endpoint="https://ваш-воркер.workers.dev"></script>
// Агент присылает: { system, messages: [{role, content}], name, id } — вы отвечаете: { reply: "текст" }.
export default {
  async fetch(req, env) {
    const cors = { "Access-Control-Allow-Origin": "https://ваш-сайт.ru", "Access-Control-Allow-Headers": "content-type", "Content-Type": "application/json" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const { system, messages } = await req.json();
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: system }, ...messages.slice(-24)] }),
    });
    const j = await r.json();
    return new Response(JSON.stringify({ reply: j.choices?.[0]?.message?.content || "" }), { headers: cors });
  },
};
