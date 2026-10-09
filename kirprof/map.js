/* Карта проезда и построение маршрута: Leaflet + OpenStreetMap, маршрут OSRM, адрес через Nominatim. */
"use strict";
let map = null, shopMark = null, routeLine = null, fromMark = null;
function setInfo(t) { $("#routeInfo").textContent = t || ""; }
function setRouteErr(t) { $("#routeErr").textContent = t || ""; }
function extLinks(from) {
  const s = KP.shop, box = $("#extLinks"); box.innerHTML = "";
  const f = from ? from.lat + "," + from.lon : "";
  const L = [
    ["Яндекс Карты", "https://yandex.ru/maps/?rtext=" + (from ? f : "") + "~" + s.lat + "," + s.lon + "&rtt=auto"],
    ["Google Карты", "https://www.google.com/maps/dir/?api=1&destination=" + s.lat + "," + s.lon + (from ? "&origin=" + f : "")],
    ["2ГИС", "https://2gis.ru/routeSearch/rsType/car/" + (from ? "from/" + from.lon + "," + from.lat + "/" : "") + "to/" + s.lon + "," + s.lat],
  ];
  L.forEach(([n, h]) => { const a = document.createElement("a"); a.href = h; a.target = "_blank"; a.rel = "noopener"; a.textContent = n + " ↗"; box.appendChild(a); });
}
function ensureMap() {
  if (map) return map;
  if (typeof L === "undefined") { $("#map").innerHTML = '<div class="note" style="padding:20px">Карта не загрузилась. Воспользуйтесь ссылками ниже.</div>'; return null; }
  const s = KP.shop;
  map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([s.lat, s.lon], 14);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  shopMark = L.marker([s.lat, s.lon]).addTo(map).bindPopup("<b>КИРПРОФ</b><br>" + s.addr.replace(/</g, "&lt;"));
  return map;
}
function showMap() {
  if (!ensureMap()) return;
  setTimeout(() => map.invalidateSize(), 60);
}
async function buildRoute(from) {
  setRouteErr(""); setInfo("Строим маршрут…");
  const s = KP.shop;
  extLinks(from);
  if (!ensureMap()) { setInfo(""); return; }
  try {
    const r = await fetch("https://router.project-osrm.org/route/v1/driving/" + from.lon + "," + from.lat + ";" + s.lon + "," + s.lat + "?overview=full&geometries=geojson");
    const j = await r.json();
    if (!j.routes || !j.routes[0]) throw new Error("none");
    const rt = j.routes[0], km = rt.distance / 1000, min = Math.max(1, Math.round(rt.duration / 60));
    if (routeLine) map.removeLayer(routeLine); if (fromMark) map.removeLayer(fromMark);
    routeLine = L.geoJSON(rt.geometry, { style: { color: "#74bdb3", weight: 5, opacity: .9 } }).addTo(map);
    fromMark = L.circleMarker([from.lat, from.lon], { radius: 8, color: "#d4b072", fillColor: "#d4b072", fillOpacity: 1 }).addTo(map).bindPopup("Вы здесь");
    map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
    const h = Math.floor(min / 60), m = min % 60;
    const tm = h ? h + " ч " + (m ? m + " мин" : "") : m + " мин";
    setInfo("Расстояние " + km.toFixed(km < 10 ? 1 : 0) + " км, в пути на машине около " + tm.trim() + ".");
    return { km, min };
  } catch (e) {
    setInfo(""); setRouteErr("Не удалось построить маршрут здесь. Откройте его в навигаторе по ссылкам ниже.");
  }
}
function routeFromMe() {
  setRouteErr("");
  if (!navigator.geolocation) { setRouteErr("Браузер не определяет местоположение. Введите адрес вручную."); return; }
  setInfo("Определяем, где вы находитесь…");
  navigator.geolocation.getCurrentPosition(p => buildRoute({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => { setInfo(""); setRouteErr("Нет доступа к местоположению. Разрешите его в браузере или введите адрес вручную."); },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
}
async function routeFromAddress(q) {
  q = String(q || "").trim(); setRouteErr("");
  if (q.length < 3) { setRouteErr("Введите адрес, откуда поедете."); return; }
  setInfo("Ищем адрес…");
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=" + encodeURIComponent(q));
    const j = await r.json();
    if (!j.length) { setInfo(""); setRouteErr("Такой адрес не найден. Уточните город и улицу."); return; }
    return buildRoute({ lat: +j[0].lat, lon: +j[0].lon });
  } catch (e) { setInfo(""); setRouteErr("Не удалось найти адрес. Проверьте интернет."); }
}
function initMap() {
  extLinks(null);
  $("#routeMe").onclick = routeFromMe;
  $("#routeGo").onclick = () => routeFromAddress($("#routeFrom").value);
  $("#routeFrom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); routeFromAddress($("#routeFrom").value); } });
  KP.onTab("contacts", showMap);
}
