// Настройки мессенджера. Адрес и ключ берутся из Supabase → Project Settings → API.
// Ключ anon (public) можно хранить открыто: доступ к данным защищён правилами в базе.
window.CHAT_CONFIG = {
  appName: "Семья",
  supabaseUrl: "",      // например: https://abcdxyz.supabase.co
  supabaseKey: "",      // длинный ключ «anon public»
  loginDomain: "family-chat.app",   // логин превращается в адрес вида login@family-chat.app
  // Серверы для звонков. STUN — бесплатные. Если звонки не соединяются через
  // мобильный интернет, добавьте TURN-сервер (например, бесплатный от metered.ca).
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // { urls: "turn:ваш-сервер:3478", username: "логин", credential: "пароль" },
  ],
};
