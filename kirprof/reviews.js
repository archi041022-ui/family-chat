/* ───── Отзывы: общая база Supabase, вход не нужен. Автор определяется секретным кодом в этом браузере ───── */
"use strict";
let TOK="";
try{TOK=localStorage.getItem("kp_tok")||"";if(!TOK){TOK="kp-"+crypto.randomUUID().replace(/-/g,"")+Math.random().toString(36).slice(2,10);localStorage.setItem("kp_tok",TOK)}}catch(e){}
if(!TOK)TOK="kp-"+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)+Date.now().toString(36);
const STAR='<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.2 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/>';
const stars=n=>'<span class="stars" role="img" aria-label="Оценка '+n+' из 5">'+[1,2,3,4,5].map(i=>'<svg viewBox="0 0 24 24" class="'+(i<=Math.round(n)?'on':'off')+'" aria-hidden="true">'+STAR+'</svg>').join("")+'</span>';
const WORDS=["","Плохо","Так себе","Нормально","Хорошо","Отлично"];
let myPhotos=[],myRate=0,filled=false,delArm=false,loaded=false;
const photoCache=new Map();
function drawRate(){const r=$("#rate");r.innerHTML="";
  for(let i=1;i<=5;i++){const b=document.createElement("button");b.type="button";b.setAttribute("role","radio");b.setAttribute("aria-checked",i===myRate);b.setAttribute("aria-label",i+" из 5");b.className=i<=myRate?"on":"";
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+STAR+'</svg>';b.onclick=()=>{myRate=i;drawRate()};r.appendChild(b)}
  const em=document.createElement("em");em.textContent=WORDS[myRate]||"Выберите оценку";r.appendChild(em)}
drawRate();
try{const n=localStorage.getItem("kp_rname");if(n)$("#rName").value=n}catch(e){}
const okImg=u=>typeof u==="string"&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(u)&&u.length<130000;
function drawThumbs(){const w=$("#thumbs");w.innerHTML="";
  myPhotos.forEach((u,i)=>{const d=document.createElement("div");d.className="th";const im=document.createElement("img");im.src=u;im.alt="Фото работы";const x=document.createElement("button");x.type="button";x.setAttribute("aria-label","Убрать фото");x.textContent="×";x.onclick=()=>{myPhotos.splice(i,1);drawThumbs()};d.append(im,x);w.appendChild(d)});
  $("#pickPhoto").hidden=myPhotos.length>=3;$("#pCount").textContent=myPhotos.length?myPhotos.length+" из 3":""}
/* фото сжимаются в браузере: до ~1000 px и примерно 70 КБ */
function shrink(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),im=new Image();
  im.onload=()=>{URL.revokeObjectURL(url);let side=1000,q=.74,out="";
    for(let k=0;k<8;k++){const sc=Math.min(1,side/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(im.width*sc));c.height=Math.max(1,Math.round(im.height*sc));
      const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);out=c.toDataURL("image/jpeg",q);
      if(out.length<80000)break;q=Math.max(.45,q-.08);side*=.85}
    out.length<120000?res(out):rej(new Error("big"))};
  im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("bad"))};im.src=url})}
$("#pickPhoto").addEventListener("click",()=>$("#rFiles").click());
$("#rFiles").addEventListener("change",async e=>{const err=$("#rErr");err.textContent="";
  const files=[...e.target.files].filter(f=>/^image\//.test(f.type)).slice(0,3-myPhotos.length);e.target.value="";
  if(!files.length)return;$("#pCount").textContent="Обрабатываем…";
  for(const f of files){try{myPhotos.push(await shrink(f))}catch(x){err.textContent="Не удалось обработать одно из фото. Выберите другое."}}
  drawThumbs()});
function openBox(u){$("#boxImg").src=u;$("#box").hidden=false;$("#boxClose").focus()}
function closeBox(){$("#box").hidden=true;$("#boxImg").removeAttribute("src")}
$("#boxClose").onclick=closeBox;$("#box").addEventListener("click",e=>{if(e.target.id==="box")closeBox()});
function rlistMsg(t){const ul=$("#rlist");ul.innerHTML="";const li=document.createElement("li");const s=document.createElement("span");s.className="empty";s.textContent=t;li.appendChild(s);ul.appendChild(li)}
async function fillPhotos(box,id){
  try{let ph=photoCache.get(id);if(!ph){ph=await rpc("kp_review_photos",{rid:id});photoCache.set(id,ph)}
    (Array.isArray(ph)?ph.filter(okImg).slice(0,3):[]).forEach(u=>{const b=document.createElement("button");b.type="button";b.className="ph-t";b.setAttribute("aria-label","Открыть фото работы");const im=document.createElement("img");im.src=u;im.alt="Фото работы";im.loading="lazy";b.appendChild(im);b.onclick=()=>openBox(u);box.appendChild(b)})}
  catch(e){box.remove()}}
function drawReviews(data){
  const items=Array.isArray(data&&data.items)?data.items:[],n=+data.n||0,avg=+data.avg||0;
  const w=n%10===1&&n%100!==11?"отзыв":(n%10>=2&&n%10<=4&&(n%100<12||n%100>14))?"отзыва":"отзывов";
  $("#score").innerHTML=n?'<b>'+avg.toFixed(1).replace(".",",")+'</b>'+stars(avg)+'<span>'+n+' '+w+'</span>':'<b>–</b><span>Оценок пока нет</span>';
  const mine=items.some(d=>d.mine);
  $("#rSend").textContent=mine?"Сохранить изменения":"Опубликовать отзыв";$("#rDel").hidden=!mine;
  const ul=$("#rlist");ul.innerHTML="";
  if(!items.length){rlistMsg("Отзывов пока нет. Станьте первым.");return}
  items.forEach(d=>{const li=document.createElement("li");
    const date=d.ts?new Date(d.ts).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}):"";
    li.innerHTML='<div class="rmeta"><span><b></b><span class="mine" hidden>Ваш отзыв</span></span><span>'+stars(d.rating)+' <small></small></span></div><p class="rtext"></p>';
    li.querySelector("b").textContent=d.name||"Клиент";li.querySelector("small").textContent=date;li.querySelector(".rtext").textContent=d.text||"";
    if(d.mine)li.querySelector(".mine").hidden=false;
    if(d.pc>0){const box=document.createElement("div");box.className="rphotos";li.appendChild(box);fillPhotos(box,d.id)}
    ul.appendChild(li)})}
async function loadReviews(){
  try{const data=await rpc("kp_reviews_list",{tok:TOK});drawReviews(data);loaded=true;
    if(!filled&&data.items.some(d=>d.mine)){filled=true;const m=await rpc("kp_review_mine",{tok:TOK});
      if(m){myRate=m.rating;$("#rName").value=m.name||"";$("#rText").value=m.text||"";myPhotos=(m.photos||[]).filter(okImg).slice(0,3);drawRate();drawThumbs()}}}
  catch(e){if(!loaded)rlistMsg("Не удалось загрузить отзывы. Проверьте интернет и вернитесь на этот экран.")}}
$("#rform").addEventListener("submit",async e=>{e.preventDefault();
  const err=$("#rErr");err.textContent="";
  const name=$("#rName").value.trim(),text=$("#rText").value.trim();
  if(!myRate){err.textContent="Поставьте оценку от 1 до 5.";return}
  if(!name){err.textContent="Укажите имя.";$("#rName").focus();return}
  if(text.length<10){err.textContent="Напишите хотя бы пару предложений.";$("#rText").focus();return}
  const b=$("#rSend");b.disabled=true;
  try{await rpc("kp_review_save",{tok:TOK,nm:name,rt:myRate,tx:text,ph:myPhotos});photoCache.clear();filled=true;try{localStorage.setItem("kp_rname",name)}catch(x){}
    $("#rNote").textContent="Спасибо! Отзыв опубликован, его видят все посетители.";await loadReviews()}
  catch(x){err.textContent=x.code==="limit"?"Сейчас слишком много новых отзывов. Попробуйте позже.":"Не удалось сохранить. Попробуйте ещё раз."}
  b.disabled=false});
$("#rDel").onclick=async()=>{const b=$("#rDel");
  if(!delArm){delArm=true;b.textContent="Нажмите ещё раз, чтобы удалить";setTimeout(()=>{delArm=false;b.textContent="Удалить мой отзыв"},3000);return}
  delArm=false;b.textContent="Удалить мой отзыв";
  try{await rpc("kp_review_delete",{tok:TOK});myRate=0;filled=false;myPhotos=[];$("#rText").value="";drawRate();drawThumbs();photoCache.clear();$("#rNote").textContent="Ваш отзыв удалён.";await loadReviews()}
  catch(x){$("#rErr").textContent="Не удалось удалить."}};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#box").hidden)closeBox()});

KP.onTab("reviews", () => loadReviews());
