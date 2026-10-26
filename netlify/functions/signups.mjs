// Live sign-up storage for the FVA Book Club potluck.
// GET  /api/signups  -> slots with who's bringing what (emails stay private)
// POST /api/signups  -> { name, email, comment, items: [slotId, ...] }

import { getStore } from "@netlify/blobs";

/* ============================================================
   EDIT HERE to change the menu. "needed" = how many people
   can sign up for that item. Groups are just headings.
   ============================================================ */
const SLOTS = [
  { group: "The Main Monster" },
  { id: "chili",    emoji: "🌶️", name: "Chili",                  note: "In a slow cooker",                  needed: 2 },
  { id: "hotdogs",  emoji: "🌭", name: "Hot dogs",               note: "About 10 each, cooked & kept warm", needed: 2 },
  { id: "buns",     emoji: "🍞", name: "Hot dog buns",           note: "2 packs",                           needed: 1 },
  { group: "Toppings of Terror" },
  { id: "onions",   emoji: "🧅", name: "Chopped onions",         note: "1 container",                       needed: 1 },
  { id: "cheese",   emoji: "🧀", name: "Shredded cheese",        note: "1–2 bags",                          needed: 1 },
  { group: "Sides & Sweets" },
  { id: "chips",    emoji: "🥔", name: "Chips",                  note: "1–2 bags",                          needed: 2 },
  { id: "side",     emoji: "🥗", name: "Side of your choice",    note: "Tell us what in the comment",       needed: 3 },
  { id: "dessert",  emoji: "🧁", name: "Dessert of your choice", note: "Tell us what in the comment",       needed: 3 },
];

const ITEM_IDS = new Set(SLOTS.filter((s) => s.id).map((s) => s.id));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function loadSignups(store) {
  const { blobs } = await store.list();
  const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a, b) => a.at - b.at);
}

function buildSlots(signups) {
  return SLOTS.map((s) => {
    if (s.group) return s;
    const taken = [];
    for (const su of signups) {
      if (su.items.includes(s.id)) taken.push({ name: su.name, comment: su.comment || "" });
    }
    return { ...s, taken };
  });
}

export default async (req) => {
  const store = getStore({ name: "bookclub-signups", consistency: "strong" });

  if (req.method === "GET") {
    const signups = await loadSignups(store);
    return json({ slots: buildSlots(signups) });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

    // Honeypot: bots fill hidden fields; quietly accept and drop.
    if (body.website) return json({ ok: true });

    const name = clean(body.name, 60);
    const email = clean(body.email, 120);
    const comment = clean(body.comment, 200);
    const items = [...new Set(Array.isArray(body.items) ? body.items : [])].filter((id) => ITEM_IDS.has(id));

    if (!name) return json({ error: "Please enter your name." }, 400);
    if (!items.length) return json({ error: "Please pick at least one item." }, 400);

    const slots = buildSlots(await loadSignups(store));
    const full = slots.filter((s) => s.id && items.includes(s.id) && s.taken.length >= s.needed);
    if (full.length) {
      return json({ error: `Sorry, someone just took: ${full.map((s) => s.name).join(", ")}. The list has been refreshed.`, full: true }, 409);
    }

    const at = Date.now();
    const key = `${at}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(key, { name, email, comment, items, at });
    return json({ ok: true, slots: buildSlots(await loadSignups(store)) });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/signups" };
