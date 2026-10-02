// Настройки мессенджера. Адрес и ключ берутся из Supabase → Project Settings → API.
// Ключ anon (public) можно хранить открыто: доступ к данным защищён правилами в базе.
window.CHAT_CONFIG = {
  appName: "Семья",
  supabaseUrl: "https://roqpbkwpuvlavmiscoxs.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcXBia3dwdXZsYXZtaXNjb3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MDI4MjIsImV4cCI6MjEwNjQ3ODgyMn0.Uqpg7hmm7OWuTv1xMYp6Zw80RjI0BG9wPF8Ivav1LAw",
  loginDomain: "family-chat.app",   // логин превращается в адрес вида login@family-chat.app
  // Серверы для звонков. STUN — бесплатные. Если звонки не соединяются через
  // мобильный интернет, добавьте TURN-сервер (например, бесплатный от metered.ca).
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // { urls: "turn:ваш-сервер:3478", username: "логин", credential: "пароль" },
  ],
};
