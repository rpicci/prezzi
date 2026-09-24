const KEY="price-watch-mvp";
let products=JSON.parse(localStorage.getItem(KEY)||"[]");
let deferredPrompt=null;

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;document.getElementById("installBtn").classList.remove("hidden")});
document.getElementById("installBtn").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null}};

function save(){localStorage.setItem(KEY,JSON.stringify(products))}
function money(v){return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(v)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function render(){
 const box=document.getElementById("cards"), empty=document.getElementById("empty");
 box.innerHTML="";
 empty.classList.toggle("hidden",products.length>0);
 products.forEach(p=>{
   const prev=p.history.length>1?p.history[p.history.length-2].price:p.price;
   const d=p.price-prev;
   const c=document.createElement("article"); c.className="card";
   c.onclick=()=>showDetail(p.id);
   c.innerHTML=`<div class="card-head"><div><b>${esc(p.name)}</b><div class="muted">${esc(p.store)}</div></div><span class="pill">${p.active?"Attivo":"Pausa"}</span></div>
   <div class="price">${money(p.price)}</div>
   <div class="delta ${d<0?"down":d>0?"up":""}">${d<0?"↓":d>0?"↑":"→"} ${money(Math.abs(d))} rispetto al controllo precedente</div>
   <p class="muted">Obiettivo: ${p.target?money(p.target):"non impostato"} · ogni giorno alle ${p.time}</p>`;
   box.appendChild(c);
 });
}
function showDashboard(){document.getElementById("dashboard").classList.remove("hidden");document.getElementById("detail").classList.add("hidden");document.getElementById("add").classList.add("hidden");render()}
function openAdd(){document.getElementById("dashboard").classList.add("hidden");document.getElementById("detail").classList.add("hidden");document.getElementById("add").classList.remove("hidden")}
function showDetail(id){
 const p=products.find(x=>x.id===id); if(!p)return;
 document.getElementById("dashboard").classList.add("hidden");document.getElementById("add").classList.add("hidden");
 const d=document.getElementById("detail");d.classList.remove("hidden");
 const vals=p.history.map(x=>x.price), min=Math.min(...vals), max=Math.max(...vals), avg=vals.reduce((a,b)=>a+b,0)/vals.length;
 d.innerHTML=`<button class="secondary back" onclick="showDashboard()">← Indietro</button><div class="panel">
 <h1>${esc(p.name)}</h1><p class="muted">${esc(p.store)}</p><div class="price">${money(p.price)}</div>
 <p>Obiettivo: <b>${p.target?money(p.target):"—"}</b></p>
 <div class="statgrid"><div class="stat">Minimo<b>${money(min)}</b></div><div class="stat">Massimo<b>${money(max)}</b></div><div class="stat">Media<b>${money(avg)}</b></div></div>
 <canvas class="chart" id="chart" height="220"></canvas>
 <h2>Storico</h2>${p.history.slice().reverse().map(x=>`<p>${new Date(x.at).toLocaleString("it-IT")} — <b>${money(x.price)}</b></p>`).join("")}
 <button class="secondary" onclick="simulateCheck('${p.id}')">Simula controllo prezzo</button>
 </div>`;
 drawChart(p.history);
}
function drawChart(h){
 const c=document.getElementById("chart"),ctx=c.getContext("2d"),w=c.width=c.clientWidth*2,hg=c.height=220*2;ctx.scale(2,2);
 const W=c.clientWidth,H=220, vals=h.map(x=>x.price),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
 ctx.beginPath();h.forEach((x,i)=>{let X=10+i*(W-20)/Math.max(1,h.length-1),Y=H-15-(x.price-min)/range*(H-30);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y)});ctx.stroke();
}
function simulateCheck(id){
 const p=products.find(x=>x.id===id);const factor=.98+Math.random()*.05;
 const price=Math.round(p.price*factor*100)/100;p.price=price;p.history.push({at:new Date().toISOString(),price});save();showDetail(id);
}
document.getElementById("addBtn").onclick=openAdd;
document.getElementById("productForm").onsubmit=e=>{
 e.preventDefault();
 const url=document.getElementById("url").value.trim(), name=document.getElementById("name").value.trim(), price=+document.getElementById("price").value,target=+document.getElementById("target").value||null,time=document.getElementById("time").value;
 let host="Sito web";try{host=new URL(url).hostname.replace(/^www\./,"")}catch{}
 const p={id:crypto.randomUUID(),name,url,store:host,price,target,time,frequency:document.getElementById("frequency").value,rule:document.getElementById("rule").value,active:true,history:[{at:new Date().toISOString(),price}]};
 products.push(p);save();e.target.reset();document.getElementById("time").value="08:30";showDashboard();
};
render();
