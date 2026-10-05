import { get, runCheck } from "./lib/core.mjs";

// Background function (nome con suffisso -background): nessun limite di 10 secondi
export default async (req) => {
  const KEY = (process.env.APP_KEY || "").trim();
  if (KEY && (req.headers.get("x-key") || "").trim() !== KEY) return new Response("unauthorized", { status: 401 });
  const cfg = await get("config");
  if (!cfg?.products?.length) return;
  await runCheck(cfg, { push: false });
};
