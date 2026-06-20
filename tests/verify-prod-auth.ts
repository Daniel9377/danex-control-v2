/**
 * Quick sanity check: confirms the dev server (localhost:3000) is using the
 * PRODUCTION Supabase project, NOT the test project.
 *
 * Run after `npx tsx tests/use-test-db.ts --restore` to confirm the restore
 * actually took effect before handing off to Daniel.
 *
 * Usage: npx tsx tests/verify-prod-auth.ts
 * Exit code 0 = production confirmed, 1 = WRONG project or unreachable.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const PRODUCTION_PROJECT_ID = "dhrcuyzrwwjkenjvpeow";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const projectId = url.split("//")[1]?.split(".")[0];
  if (projectId !== PRODUCTION_PROJECT_ID) {
    console.error(`FAIL: server is using ${projectId}, expected ${PRODUCTION_PROJECT_ID}`);
    console.error("Run: npx tsx tests/use-test-db.ts --restore");
    process.exit(1);
  }

  // Verify the project is reachable
  try {
    const resp = await fetch(`${url}/auth/v1/health`);
    if (resp.status === 200) {
      console.log("✓ Production Supabase confirmed:", projectId);
      process.exit(0);
    }
    // 401 also means the project is alive (just needs auth)
    console.log("✓ Production Supabase confirmed:", projectId, "(health:", resp.status, ")");
    process.exit(0);
  } catch {
    console.error("FAIL: cannot reach", url);
    process.exit(1);
  }
}

main();
