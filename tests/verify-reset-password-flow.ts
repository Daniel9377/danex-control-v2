/**
 * End-to-end check of the password-reset mechanics against the TEST database.
 *
 * This exercises the exact Supabase calls the UI relies on:
 *   1. admin.generateLink({ type: "recovery" })   <- what resetPasswordForEmail triggers
 *   2. verifyOtp({ type: "recovery" })             <- what detectSessionInUrl does on /reset-password
 *   3. updateUser({ password })                    <- what the reset-password form submits
 *   4. signInWithPassword with the NEW password    <- proves the change took effect
 *   5. restore the original password               <- leaves the test user untouched
 *
 * Runs ONLY on the test project (guarded by DANEX_ENV === "test").
 */
import { createTestAdminClient, getTestSupabaseConfig } from "./config/test-db";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const { url, anonKey } = getTestSupabaseConfig(); // throws unless DANEX_ENV=test
  const email = process.env.TEST_USER_EMAIL?.trim() || "test@danex.local";
  const originalPassword = process.env.TEST_USER_PASSWORD?.trim() || "123456789";
  const tempPassword = "Reset-Test-" + originalPassword;

  console.log(`Target test project: ${url}`);
  console.log(`Test user: ${email}\n`);

  const admin = createTestAdminClient();
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Generate a recovery link (server-side equivalent of resetPasswordForEmail)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`);
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) throw new Error("No hashed_token returned from generateLink");
  console.log("1. Recovery link generated ✓");

  // 2. Verify the recovery OTP -> establishes a recovery session
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (verifyErr) throw new Error(`verifyOtp failed: ${verifyErr.message}`);
  if (!verifyData.session) throw new Error("verifyOtp returned no session");
  console.log("2. Recovery session established ✓");

  // 3. Update the password using that session
  const { error: updErr } = await anon.auth.updateUser({ password: tempPassword });
  if (updErr) throw new Error(`updateUser failed: ${updErr.message}`);
  console.log("3. Password updated ✓");

  // 4. Sign in with the NEW password (fresh client, no carried session)
  const fresh = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await fresh.auth.signInWithPassword({
    email,
    password: tempPassword,
  });
  if (signInErr) throw new Error(`Sign-in with new password failed: ${signInErr.message}`);
  console.log("4. Sign-in with NEW password works ✓");

  // 5. Restore the original password so the test user is left unchanged
  const { error: restoreErr } = await fresh.auth.updateUser({ password: originalPassword });
  if (restoreErr) throw new Error(`Restore password failed: ${restoreErr.message}`);
  console.log("5. Original password restored ✓");

  console.log("\n✅ Full reset-password flow verified on the TEST database.");
}

main().catch((err) => {
  console.error("\n❌ Flow verification failed:");
  console.error(err.message || err);
  process.exit(1);
});
