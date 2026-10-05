import { getStore } from "@netlify/blobs";
import webpush from "web-push";

// ---------- storage ----------
const st = () => getStore({ name: "price-watch", consistency: "strong" });
export const get = async (k, d = null) => (await st().get(k, { type: "json" })) ?? d;
export const set = (k, v) => st().setJSON(k, v);
export const del = (k) => st().delete(k);

export function romeNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, month: `${p.year}-${p.month}` };
}

// ---------- utils ----------
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const compact = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const eur = (n) => "€" + n.toFixed(2).replace(".", ",");

export function parsePrice(s) {
  if (typeof s === "number") return s;
  let t = String(s || "").replace(/[^\d.,]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

export const offerKey = (o) => compact(o.shop) + "|" + compact(o.title).slice(0, 60);
const minOf = (h) => { if (!h.length) return null; const m = h.reduce((a, b) => (b.p < a.p ? b : a)); return { p: m.p, d: m.d, s: m.s }; };

// ---------- providers ----------
async function searchSerpapi(q) {
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google_shopping", q, gl: "it", hl: "it", google_domain: "google.it",
    api_key: process.env.SERPAPI_KEY,
  });
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error("SerpApi: " + (j.error || r.status));
  return (j.shopping_results || []).map((i) => ({
    title: i.title, shop: i.source || "", price: i.extracted_price ?? parsePrice(i.price),
    link: i.link || i.product_link || "", used: !!i.second_hand_condition,
  }));
}

async function searchSerper(q) {
  const r = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: "it", hl: "it", num: 40 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Serper: " + (j.message || r.status));
  return (j.shopping || []).map((i) => ({
    title: i.title, shop: i.source || "", price: parsePrice(i.price), link: i.link || "", used: false,
  }));
}

const call = (prov, q) => (prov === "serpapi" ? searchSerpapi(q) : searchSerper(q));

// SerpApi finché c'è quota mensile gratuita, poi Serper
function allocate(u) {
  const lim = +process.env.SERPAPI_LIMIT || 250;
  if (process.env.SERPAPI_KEY && (u.serpapi || 0) < lim) { u.serpapi = (u.serpapi || 0) + 1; return "serpapi"; }
  if (process.env.SERPER_KEY) { u.serper = (u.serper || 0) + 1; return "serper"; }
  throw new Error("Nessun provider disponibile (chiavi mancanti o quota SerpApi esaurita)");
}

// ---------- filtro anti-accessori / falsi positivi ----------
const DEFAULT_EXCLUDE = [
  "custodia", "cover", "pellicola", "vetro temperato", "ricambio", "ricambi", "compatibile",
  "usato", "ricondizionato", "rigenerato", "refurbished", "cinturino", "tracolla", "sacca",
];
const TRUSTED = [
  "amazon", "mediaworld", "unieuro", "decathlon", "euronics", "expert", "trony", "eprice",
  "monclick", "esselunga", "leroy merlin", "ikea", "zalando", "carrefour", "conforama",
  "apple", "samsung", "sony", "philips", "dyson", "nike", "adidas",
];
const isTrusted = (shop, brand) =>
  TRUSTED.some((t) => norm(shop).includes(t)) || (brand.length >= 3 && compact(shop).includes(brand));

export function filterOffers(items, p) {
  const w = words(p.name);
  const brand = w[0] || "";
  const required = [brand, ...w.filter((x) => /\d/.test(x))].filter(Boolean);
  const nameN = norm(p.name);
  const ex = [...DEFAULT_EXCLUDE.filter((x) => !nameN.includes(x)), ...(p.exclude || []).map(norm)].filter(Boolean);
  const exRe = ex.map((x) => new RegExp("(^|[^a-z0-9])" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)"));

  const blocked = new Set(p.blocked || []);
  let ok = items.filter((i) => i.price > 0 && i.title && !i.used && !blocked.has(offerKey(i)));
  ok = ok.filter((i) => {
    const c = compact(i.title), t = norm(i.title);
    return required.every((r) => c.includes(compact(r))) && !exRe.some((re) => re.test(t));
  });
  const matched = ok.length;
  if (ok.length >= 4) { const m = median(ok.map((i) => i.price)); ok = ok.filter((i) => i.price >= m * 0.4); }
  if (p.minPrice) ok = ok.filter((i) => i.price >= p.minPrice);
  if (p.maxPrice) ok = ok.filter((i) => i.price <= p.maxPrice);
  ok = ok.map((i) => ({ ...i, trusted: isTrusted(i.shop, brand) }));
  if (p.onlyTrusted) ok = ok.filter((i) => i.trusted);

  const byShop = new Map();
  for (const i of ok.sort((a, b) => a.price - b.price)) if (!byShop.has(norm(i.shop))) byShop.set(norm(i.shop), i);
  return { offers: [...byShop.values()], total: items.length, matched };
}

// ---------- ricerca prodotto ----------
async function checkProduct(p, usage) {
  const run = async (q) => {
    let prov = allocate(usage);
    try { return { items: await call(prov, q), prov }; }
    catch (e) {
      if (prov === "serpapi" && process.env.SERPER_KEY) {
        usage.serper = (usage.serper || 0) + 1; prov = "serper";
        return { items: await call(prov, q), prov };
      }
      throw e;
    }
  };
  let { items, prov } = await run(p.name);
  let f = filterOffers(items, p);
  if (!f.offers.length && p.ean) { const r2 = await run(p.ean); prov = r2.prov; f = filterOffers(r2.items, p); }
  const offers = f.offers.slice(0, 6).map((o) => ({ shop: o.shop, title: o.title, price: o.price, link: o.link, trusted: o.trusted }));
  return { id: p.id, name: p.name, provider: prov, found: f.matched, total: f.total, offers, best: offers[0] || null };
}

// ---------- push ----------
export async function sendPush(payload) {
  const sub = await get("sub");
  if (!sub) return "nessun dispositivo registrato";
  if (!process.env.VAPID_PUBLIC_KEY) return "VAPID mancante";
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  try { await webpush.sendNotification(sub, JSON.stringify(payload)); return "inviata"; }
  catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await del("sub"); return "sottoscrizione scaduta"; }
    return "errore: " + e.message;
  }
}

function buildMessage(cfg, results) {
  const lines = results.map((r) => {
    const p = cfg.products.find((x) => x.id === r.id) || {};
    if (r.error) return `${r.name}: errore ricerca`;
    if (!r.best) return `${r.name}: nessuna offerta valida`;
    let s = `${r.name}: ${eur(r.best.price)} · ${r.best.shop}`;
    if (r.delta) s += ` (${r.delta < 0 ? "▼" : "▲"}${eur(Math.abs(r.delta))})`;
    if (r.record) s += " 🏆 nuovo minimo";
    else if (r.min && r.best.price > r.min.p) s += ` · +${eur(r.best.price - r.min.p)} dal min`;
    if (p.targetPrice && r.best.price <= p.targetPrice) s += " 🎯";
    return s;
  });
  return { title: "Price Watch · prezzi di oggi", body: lines.join("\n"), url: "/" };
}

// ---------- esecuzione completa ----------
export async function runCheck(cfg, { push = false } = {}) {
  const n = romeNow();
  const usage = await get("usage", {});
  if (usage.month !== n.month) { usage.month = n.month; usage.serpapi = 0; }

  const results = await Promise.all(
    cfg.products.map((p) => checkProduct(p, usage).catch((e) => ({ id: p.id, name: p.name, error: e.message })))
  );

  for (const r of results) {
    if (r.error || !r.best) continue;
    const h = await get("hist:" + r.id, []);
    const before = h.filter((x) => x.d !== n.date);
    const prev = before.at(-1);
    r.delta = prev ? +(r.best.price - prev.p).toFixed(2) : null;
    r.record = before.length > 0 && r.best.price < Math.min(...before.map((x) => x.p));
    const newH = [...before, { d: n.date, p: r.best.price, s: r.best.shop, t: r.best.title }].slice(-120);
    r.min = minOf(newH);
    await set("hist:" + r.id, newH);
  }
  await set("usage", usage);

  const last = { at: new Date().toISOString(), date: n.date, results };
  if (push && results.length) last.pushed = await sendPush(buildMessage(cfg, results));
  await set("last", last);
  return last;
}

// ---------- falso positivo ----------
// Con shop+title: esclude l'offerta per sempre, la toglie dallo storico e ricalcola il risultato di oggi.
// Con solo d (data): se il punto storico ha il titolo fa lo stesso, altrimenti elimina solo quel punto.
export async function flagOffer(id, { shop, title, d }) {
  const cfg = await get("config");
  const p = cfg?.products?.find((x) => x.id === id);
  if (!p) throw new Error("Prodotto non trovato");
  let h = await get("hist:" + id, []);
  let key = title ? offerKey({ shop: shop || "", title }) : null;
  if (!key && d) {
    const e = h.find((x) => x.d === d);
    if (!e) throw new Error("Punto non trovato");
    if (!e.t) { await set("hist:" + id, h.filter((x) => x.d !== d)); return; }
    key = offerKey({ shop: e.s, title: e.t });
  }
  if (!key) throw new Error("Dati mancanti");

  p.blocked = [...new Set([...(p.blocked || []), key])].slice(-50);
  await set("config", cfg);
  h = h.filter((x) => !(x.t && offerKey({ shop: x.s, title: x.t }) === key));

  const last = await get("last");
  const r = last?.results?.find((x) => x.id === id);
  if (r && !r.error) {
    r.offers = (r.offers || []).filter((o) => offerKey(o) !== key);
    r.best = r.offers[0] || null;
    h = h.filter((x) => x.d !== last.date);
    const prev = h.at(-1);
    if (r.best) {
      r.delta = prev ? +(r.best.price - prev.p).toFixed(2) : null;
      r.record = h.length > 0 && r.best.price < Math.min(...h.map((x) => x.p));
      h = [...h, { d: last.date, p: r.best.price, s: r.best.shop, t: r.best.title }];
    } else { r.delta = null; r.record = false; }
    r.min = minOf(h);
    await set("last", last);
  }
  await set("hist:" + id, h);
}
