import { get, set, del, runCheck, sendPush, flagOffer } from "./lib/core.mjs";

export const config = { path: "/api/*" };

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; };

function sanitize(c) {
  return {
    active: c.active !== false,
    time: /^\d{2}:\d{2}$/.test(c.time) ? c.time : "08:00",
    products: (c.products || []).slice(0, 5).map((p) => ({
      id: String(p.id || crypto.randomUUID().slice(0, 8)),
      name: String(p.name || "").trim().slice(0, 80),
      ean: String(p.ean || "").replace(/\D/g, "").slice(0, 14),
      exclude: (Array.isArray(p.exclude) ? p.exclude : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20),
      minPrice: num(p.minPrice), maxPrice: num(p.maxPrice), targetPrice: num(p.targetPrice),
      onlyTrusted: !!p.onlyTrusted,
      blocked: (Array.isArray(p.blocked) ? p.blocked : []).map(String).slice(-50),
    })).filter((p) => p.name),
  };
}

export default async (req) => {
  if (process.env.APP_KEY && req.headers.get("x-key") !== process.env.APP_KEY) return J({ error: "Non autorizzato" }, 401);
  const route = new URL(req.url).pathname.replace(/^\/api\//, "");
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  try {
    switch (route) {
      case "state": {
        const cfg = (await get("config")) || { active: true, time: "08:00", products: [] };
        const hist = {};
        for (const p of cfg.products) hist[p.id] = await get("hist:" + p.id, []);
        return J({
          config: cfg, last: await get("last"), usage: await get("usage", {}), hist,
          hasSub: !!(await get("sub")), vapid: process.env.VAPID_PUBLIC_KEY || "",
          limits: { serpapi: +process.env.SERPAPI_LIMIT || 250 },
          providers: { serpapi: !!process.env.SERPAPI_KEY, serper: !!process.env.SERPER_KEY },
        });
      }
      case "config": {
        const cfg = sanitize(body);
        await set("config", cfg);
        return J({ config: cfg });
      }
      case "check": {
        const cfg = (await get("config")) || { products: [] };
        if (!cfg.products.length) return J({ error: "Nessun prodotto configurato" }, 400);
        return J({ last: await runCheck(cfg, { push: body.push === true }) });
      }
      case "identify": {
        const q = String(body.q || "").trim();
        if (!q) return J({ items: [] });
        const isEan = /^\d{8,14}$/.test(q);
        const url = isEan
          ? `https://api.upcitemdb.com/prod/trial/lookup?upc=${q}`
          : `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(q)}&match_mode=0&type=product`;
        const r = await fetch(url);
        if (!r.ok) return J({ items: [], note: "Servizio EAN non disponibile (limite giornaliero?)" });
        const j = await r.json();
        const items = (j.items || []).slice(0, 8).map((i) => ({ title: i.title, brand: i.brand, model: i.model, ean: i.ean || i.upc }));
        return J({ items });
      }
      case "flag":
        await flagOffer(String(body.id || ""), { shop: body.shop, title: body.title, d: body.d });
        return J({ ok: true });
      case "sub": await set("sub", body.subscription); return J({ ok: true });
      case "unsub": await del("sub"); return J({ ok: true });
      case "test-push":
        return J({ result: await sendPush({ title: "Price Watch", body: "Notifiche attive ✅", url: "/" }) });
      default: return J({ error: "Not found" }, 404);
    }
  } catch (e) {
    return J({ error: e.message }, 500);
  }
};
