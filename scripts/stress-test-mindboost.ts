/**
 * Mindboost stress test — synthetic messages, in-process AI calls.
 * NEVER runs against production. Configurable count + concurrency.
 * Usage: npx tsx scripts/stress-test-mindboost.ts [count=20] [concurrency=3]
 *
 * Output: tests/manual/stress-results.jsonl + console summary.
 * Cleanup: npx tsx scripts/stress-test-mindboost.ts --cleanup
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// ── Safety: force TEST project ──────────────────────────────────────────
dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), override: true });
if (process.env.NEXT_PUBLIC_SUPABASE_URL_TEST) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_TEST;
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY_TEST) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST;
}
// Also load .env.local for DEEPSEEK_API_KEY (not in .env.test)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROD_PROJECT = "dhrcuyzrwwjkenjvpeow";
const PROD_USER_ID = "834b7e29-fcae-4e30-a0c1-2f989defea94";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const USER_ID = process.env.MINDBOOST_USER_ID ?? "unknown";

if (SUPABASE_URL.includes(PROD_PROJECT)) {
  console.error("⛔ SAFETY GUARD: Refusing to run against PRODUCTION project!");
  console.error(`   URL: ${SUPABASE_URL}`);
  console.error("   Set .env.test or override NEXT_PUBLIC_SUPABASE_URL.");
  process.exit(1);
}
if (USER_ID === PROD_USER_ID) {
  console.error("⛔ SAFETY GUARD: Refusing to run with PRODUCTION user ID!");
  console.error(`   USER_ID: ${USER_ID}`);
  console.error("   Override MINDBOOST_USER_ID in your env.");
  process.exit(1);
}
if (!process.env.DEEPSEEK_API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY — load from .env.local?");
  process.exit(1);
}

console.log(`✓ Safety OK — target: ${SUPABASE_URL.slice(0, 50)}..., user: ${USER_ID}`);

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

// Cleanup mode
if (args.includes("--cleanup")) {
  runCleanup().then(() => process.exit(0));
}

const TOTAL = Math.max(1, parseInt(args.find((a) => /^\d+$/.test(a)) ?? "20"));
const CONCURRENCY = Math.max(1, Math.min(10, parseInt(
  args[args.findIndex((a) => /^\d+$/.test(a)) + 1] ?? "3"
) || 3));
const OUT_FILE = path.resolve(process.cwd(), "tests/manual/stress-results.jsonl");

// ── Imports (after env safety) ──────────────────────────────────────────
async function runCleanup() {
  const { createAdminClient: ca } = await import("@/lib/supabase/admin");
  const db = ca();
  const tables = ["mindboost_conversation", "mindboost_mentions", "mindboost_daily_summary", "mindboost_memory"];
  for (const table of tables) {
    const { error } = await db.from(table).delete().eq("user_id", USER_ID).neq("user_id", "noop");
    if (error) console.error(`  Cleanup ${table}: ${error.message}`);
    else console.log(`  Cleaned ${table}`);
  }
  await db.from("mindboost_client_intake").update({ status: "cancelled" }).eq("user_id", USER_ID).eq("status", "collecting");
  console.log("✓ Cleanup done.");
}

// ── Template-based message generator ────────────────────────────────────
const CLIENTS = ["Divine Test", "Cedric Test", "Marc", "Sophie", "Idriss", "Fatima", "Serge", "Kevin"];
const DEBTS = ["Jean-Luc Test", "Jasmine"];
const SEEN = new Set<string>();

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function maybe(fn: () => string, pct = 0.5): string { return Math.random() < pct ? fn() : ""; }
function typos(s: string): string {
  return Math.random() < 0.3
    ? s.replace(/[éèêë]/g, "e").replace(/[àâ]/g, "a").replace(/[ùû]/g, "u").replace(/[ç]/g, "c")
        .replace(/'/g, "").replace(/\s+/g, Math.random() < 0.5 ? " " : "")
    : s;
}

function generateMessage(): string {
  for (let i = 0; i < 20; i++) {
    const cat = Math.random();
    let msg = "";

    if (cat < 0.12) {
      // INFO queries
      const c = pick(CLIENTS);
      const tpl = pick([
        `comment va ${c}`, `ou en est la commande de ${c}`,
        `${c} a paye combien`, `c koi le statut de ${c}`,
        `donne moi les infos sur ${c}`, `combien ${c} a envoye`,
        `quel est le solde de ${c}`, `tu peux me parler de ${c} stp`,
      ]);
      msg = tpl;
    } else if (cat < 0.24) {
      // MENTION with need-cue
      const c = pick(CLIENTS);
      const tpl = pick([
        `${c} a besoin de ${pick(["50 sacs", "des Air Max", "un telephone", "des montres", "200 pagnes"])}`,
        `${c} demande ${pick(["un devis", "des echantillons", "un rendez-vous", "le prix"])}`,
        `${c} veut ${pick(["commander", "negocier", "voir les photos", "payer plus tard"])}`,
        `${c} cherchait ${pick(["des chaussures", "un fournisseur", "des accessoires"])}`,
        `${c} attend ${pick(["ma reponse", "la livraison", "le paiement"])}`,
      ]);
      msg = tpl;
    } else if (cat < 0.30) {
      // Mention resolve
      const c = pick([...CLIENTS, ...DEBTS]);
      msg = pick([`c'est bon pour ${c}`, `regle pour ${c}`, `${c} c'est fait`, `resolu pour ${c}`]);
    } else if (cat < 0.40) {
      // CREATION triggers
      const name = pick(["Boubacar", "Amina", "Christophe", "Nadia", "Yann"]);
      msg = pick([`nouveau client ${name}`, `ajoute ${name} stp`, `${name} veut commander`, `nouvelle cliente ${name}`]);
    } else if (cat < 0.50) {
      // DECISION / cooperative
      msg = pick([
        "oui je le fais ce soir", "d accord je commence par les dettes",
        "ok je gere ca maintenant", "vas y je te suis", "bien vu je m en occupe",
        "c est parti je lance", "je suis d accord avec ton plan",
        "ok pour ce soir je fais tout", "tkt frere je gere",
      ]);
    } else if (cat < 0.58) {
      // EVASION (sequences of 3 built externally, these are singles)
      msg = pick(["bof", "je sais pas", "on verra", "mouais", "pas sur", "laisse tomber", "a", "euh", "hmm", "je reflechis"]);
    } else if (cat < 0.66) {
      // NEUTRE / small talk
      msg = pick(["salut", "ca va", "il fait beau", "bon", "je dors", "tg", "laisse moi tranquille", "je vais au sport", "j ai rien fait aujourd hui"]);
    } else if (cat < 0.72) {
      // BLOQUE
      msg = pick(["je suis bloque", "je sais pas quoi faire", "boss je suis perdu", "je sais plus par ou commencer"]);
    } else if (cat < 0.78) {
      // Anti-repeat acknowledgments
      msg = pick(["oui", "d accord", "ok", "nickel", "ca marche", "👍", "ok merci"]);
    } else if (cat < 0.85) {
      // Mixed fr/en, typos
      let base = pick([
        `j ai depense ${pick(["80", "120", "45", "200"])} kuai pour ${pick(["manger", "le taxi", "le tel", "les fringues"])}`,
        `j ai recu ${pick(["500", "200", "1000"])} dollars de ${pick(CLIENTS)}`,
        `je dois ${pick(["300", "150", "50"])} a ${pick(DEBTS)}`,
        `achete le truc pour ${pick(CLIENTS)}`,
      ]);
      msg = typos(base);
    } else if (cat < 0.92) {
      // Edge cases
      msg = pick(["", "💸💸💸", "a" + "a".repeat(Math.floor(Math.random() * 200)), `${pick(CLIENTS)} a paye ${Math.floor(Math.random() * 9999)} dollars USD CNY RMB tout ca`]);
    } else {
      // Mixed amounts/currencies
      msg = `recu ${Math.floor(Math.random() * 5000)} de ${pick(CLIENTS)} en ${pick(["USD", "CNY", "EUR", "CDF", "RMB"])}`;
    }

    // Typos sometimes
    msg = Math.random() < 0.2 ? typos(msg) : msg;
    // Ensure non-empty
    if (!msg.trim()) continue;
    // Deduplicate
    if (SEEN.has(msg)) continue;
    SEEN.add(msg);
    return msg;
  }
  return `msg_${SEEN.size}_${Date.now()}`;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const { processMessageWithAI } = await import("@/lib/mindboost/decision-engine");
  const { createAdminClient: ca } = await import("@/lib/supabase/admin");
  const db = ca();

  // Pre-clean
  await runCleanup();

  console.log(`\nStress test: ${TOTAL} messages, concurrency=${CONCURRENCY}\n`);
  fs.writeFileSync(OUT_FILE, "");

  let apiCalls = 0;
  let errors = 0;
  let totalLatency = 0;
  let maxLatency = 0;
  const errorMessages: string[] = [];
  const allReplies: string[] = [];

  // Add BOUCLE sequences: 3 evasions in a row, 5 times interspersed
  const boucleSeqs = 5;
  const evasionTemplates = ["bof", "je sais pas", "on verra", "mouais", "pas sur", "hmm", "je reflechis", "a", "euh"];
  const boucleMessages: string[] = [];
  for (let b = 0; b < boucleSeqs; b++) {
    for (let i = 0; i < 3; i++) {
      boucleMessages.push(pick(evasionTemplates));
    }
    for (const m of boucleMessages) SEEN.add(m);
  }

  const msgs = [...boucleMessages];
  // Fill remaining with generated messages
  while (msgs.length < TOTAL) {
    msgs.push(generateMessage());
  }

  // Concurrency-limited execution
  const pool: Promise<void>[] = [];
  let idx = 0;

  async function runOne(msg: string): Promise<void> {
    const start = Date.now();
    let reply = "";
    let error = "";
    let coop = "";
    try {
      const result = await processMessageWithAI(msg);
      reply = result.reply;
      coop = result.cooperationSignal;
      apiCalls += 2; // classifier + main
    } catch (e: any) {
      error = e.message || String(e);
      errors++;
      errorMessages.push(error.slice(0, 200));
    }
    const latency = Date.now() - start;
    totalLatency += latency;
    if (latency > maxLatency) maxLatency = latency;

    allReplies.push(reply);

    const log = JSON.stringify({
      idx: idx + 1,
      msg: msg.slice(0, 300),
      reply: reply.slice(0, 500),
      cooperation: coop,
      latency_ms: latency,
      error,
      ts: new Date().toISOString(),
    });
    fs.appendFileSync(OUT_FILE, log + "\n");

    if ((idx + 1) % 10 === 0) {
      console.log(`  ${idx + 1}/${TOTAL} | calls: ${apiCalls} | avg: ${(totalLatency / (idx + 1)).toFixed(0)}ms | errors: ${errors}`);
    }
  }

  for (let i = 0; i < msgs.length; i++) {
    idx = i;
    const p = runOne(msgs[i]);
    pool.push(p);
    if (pool.length >= CONCURRENCY) {
      await Promise.race(pool);
      // Remove completed promises
      for (let j = pool.length - 1; j >= 0; j--) {
        const res = await Promise.race([pool[j].then(() => true), Promise.resolve(false)]);
        if (res === true || (await pool[j].then(() => true).catch(() => false))) {
          pool.splice(j, 1);
        }
      }
    }
  }
  await Promise.all(pool);

  // ── Summary ───────────────────────────────────────────────────────────
  const avgLatency = totalLatency / TOTAL;
  const duplicateReplies = allReplies.filter((r, i) => r && allReplies.indexOf(r) !== i).length;
  const suspicious: string[] = [];
  for (const r of allReplies) {
    if (!r) suspicious.push("empty reply");
    else if (r.includes("undefined") || r.includes("NaN")) suspicious.push("contains undefined/NaN");
    else if (r.length > 2000) suspicious.push(`very long reply (${r.length} chars)`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Messages:      ${TOTAL}`);
  console.log(`Errors:        ${errors}`);
  if (errorMessages.length) console.log(`  ${errorMessages.slice(0, 5).join("\n  ")}`);
  console.log(`API calls:     ${apiCalls} (~${(apiCalls * 0.0005).toFixed(3)} USD estimated)`);
  console.log(`Avg latency:   ${avgLatency.toFixed(0)}ms`);
  console.log(`Max latency:   ${maxLatency}ms`);
  console.log(`Duplicates:    ${duplicateReplies} (same reply text as another message)`);
  console.log(`Suspicious:    ${suspicious.length}`);
  if (suspicious.length) console.log(`  ${suspicious.slice(0, 5).join("\n  ")}`);
  console.log(`\nFull log: ${OUT_FILE}`);
  console.log(`Cleanup:  npx tsx scripts/stress-test-mindboost.ts --cleanup`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
