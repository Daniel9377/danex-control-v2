import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log("[supabase] url:", url?.slice(0, 40) ?? "MISSING", "| key:", key ? "present" : "MISSING");

  if (!url || !key) {
    throw new Error(
      `Supabase environment variables are not set. URL: ${url ?? "undefined"}, KEY: ${key ? "[set]" : "undefined"}`
    );
  }

  return createBrowserClient(url, key);
}
