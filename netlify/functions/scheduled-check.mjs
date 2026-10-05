import { get, set, romeNow, runCheck } from "./lib/core.mjs";

// Gira ogni 15 minuti; esegue una sola volta al giorno, dopo l'orario scelto (fuso Europa/Roma)
export default async () => {
  const cfg = await get("config");
  if (!cfg || cfg.active === false || !cfg.products?.length) return;
  const n = romeNow();
  if (n.hhmm < (cfg.time || "08:00")) return;
  if ((await get("lastRunDate")) === n.date) return;
  await set("lastRunDate", n.date); // segna subito: evita doppie esecuzioni
  await runCheck(cfg, { push: true });
};

export const config = { schedule: "*/15 * * * *" };
