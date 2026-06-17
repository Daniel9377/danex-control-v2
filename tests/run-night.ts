import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getTestSupabaseConfig } from "./config/test-db";
import { generateReport, parsePlaywrightResults, type ParsedFailure, type ParsedResults } from "./report/generate-report";

const REPORTS_DIR = path.resolve(process.cwd(), "tests/reports");
const RESULTS_PATH = path.join(REPORTS_DIR, "results.json");
const CUMULATIVE_PATH = path.join(REPORTS_DIR, "cumulative.json");
const npmBin = "npm";
const npxBin = "npx";

type CommandResult = {
  ok: boolean;
  exitCode: number | null;
  error?: string;
};

type NightIteration = {
  iteration: number;
  started_at: string;
  finished_at: string;
  status: "completed" | "blocked";
  seed: CommandResult;
  playwright?: CommandResult;
  summary?: ParsedResults;
  failures?: ParsedFailure[];
};

type CumulativeNightLog = {
  status: "completed" | "blocked";
  generated_at: string;
  requested_iterations: number;
  completed_iterations: number;
  reason?: string;
  iterations: NightIteration[];
  failure_summary: Array<{
    key: string;
    zone: string;
    title: string;
    failed_runs: number;
    completed_runs: number;
    repeat: "confirmé" | "intermittent" | "observé une fois";
  }>;
};

type RepeatKind = CumulativeNightLog["failure_summary"][number]["repeat"];

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const requestedIterations = parseIterations(process.argv[2]);

  console.log(`QA nuit DANEX — ${requestedIterations} itération(s) demandée(s).`);

  const serverReady = await isDevServerRunning();
  if (!serverReady) {
    const reason = "Le serveur http://localhost:3000 ne répond pas. Lance d'abord 'npm run dev', puis relance 'npm run test:night 10'.";
    console.log(reason);
    writeCumulative({
      status: "blocked",
      generated_at: new Date().toISOString(),
      requested_iterations: requestedIterations,
      completed_iterations: 0,
      reason,
      iterations: [],
      failure_summary: [],
    });
    const reportPath = generateReport();
    console.log(`Rapport généré malgré le blocage : ${reportPath}`);
    return;
  }

  const iterations: NightIteration[] = [];

  for (let iteration = 1; iteration <= requestedIterations; iteration += 1) {
    console.log(`\n=== Itération ${iteration}/${requestedIterations} ===`);
    const startedAt = new Date().toISOString();

    try {
      getTestSupabaseConfig();
      console.log('Garde test DB OK: DANEX_ENV est exactement "test".');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`Blocage sécurité test DB: ${reason}`);
      iterations.push(blockedIteration(iteration, startedAt, reason));
      const cumulative = buildCumulative("blocked", requestedIterations, iterations, reason);
      writeCumulative(cumulative);
      const reportPath = generateReport();
      console.log(`Rapport généré : ${reportPath}`);
      return;
    }

    const seed = runCommand(npmBin, ["run", "test:seed"]);
    if (!seed.ok) {
      const reason = seed.error ?? `Seed échoué avec code ${seed.exitCode}.`;
      iterations.push({
        iteration,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "blocked",
        seed,
      });
      const cumulative = buildCumulative("blocked", requestedIterations, iterations, reason);
      writeCumulative(cumulative);
      const reportPath = generateReport();
      console.log(`Seed impossible. Rapport généré : ${reportPath}`);
      return;
    }

    if (fs.existsSync(RESULTS_PATH)) fs.rmSync(RESULTS_PATH, { force: true });
    const playwright = runCommand(npxBin, ["playwright", "test"]);
    const summary = parsePlaywrightResults();
    iterations.push({
      iteration,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "completed",
      seed,
      playwright,
      summary,
      failures: summary.failures,
    });

    const cumulative = buildCumulative("completed", requestedIterations, iterations);
    writeCumulative(cumulative);
    console.log(
      `Itération ${iteration}: ${summary.passed}/${summary.total} réussis, ${summary.failed} échoué(s).`
    );
  }

  const cumulative = buildCumulative("completed", requestedIterations, iterations);
  writeCumulative(cumulative);
  const reportPath = generateReport();

  console.log("\n=== Résumé final ===");
  console.log(`Itérations terminées : ${cumulative.completed_iterations}/${requestedIterations}`);
  console.log(`Scénarios en échec distincts : ${cumulative.failure_summary.length}`);
  console.log(`Confirmés : ${cumulative.failure_summary.filter((item) => item.repeat === "confirmé").length}`);
  console.log(`Intermittents : ${cumulative.failure_summary.filter((item) => item.repeat === "intermittent").length}`);
  console.log(`Rapport final : ${reportPath}`);
}

function parseIterations(raw?: string) {
  const parsed = Number(raw ?? "10");
  if (!Number.isInteger(parsed) || parsed < 1) return 10;
  return parsed;
}

async function isDevServerRunning() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    await fetch("http://localhost:3000", { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function runCommand(command: string, args: string[]): CommandResult {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  return {
    ok: result.status === 0 && !result.error,
    exitCode: result.status,
    error: result.error?.message,
  };
}

function blockedIteration(iteration: number, startedAt: string, reason: string): NightIteration {
  return {
    iteration,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: "blocked",
    seed: { ok: false, exitCode: null, error: reason },
  };
}

function buildCumulative(
  status: "completed" | "blocked",
  requestedIterations: number,
  iterations: NightIteration[],
  reason?: string
): CumulativeNightLog {
  const completedIterations = iterations.filter((iteration) => iteration.status === "completed").length;
  return {
    status,
    generated_at: new Date().toISOString(),
    requested_iterations: requestedIterations,
    completed_iterations: completedIterations,
    reason,
    iterations,
    failure_summary: summarizeFailures(iterations, completedIterations),
  };
}

function summarizeFailures(iterations: NightIteration[], completedRuns: number): CumulativeNightLog["failure_summary"] {
  const map = new Map<string, { failure: ParsedFailure; count: number }>();
  for (const iteration of iterations) {
    if (iteration.status !== "completed") continue;
    for (const failure of iteration.failures ?? []) {
      const current = map.get(failure.key);
      if (current) current.count += 1;
      else map.set(failure.key, { failure, count: 1 });
    }
  }

  return [...map.values()]
    .map(({ failure, count }) => ({
      key: failure.key,
      zone: failure.zone,
      title: failure.title,
      failed_runs: count,
      completed_runs: completedRuns,
      repeat: (
        completedRuns > 0 && count >= completedRuns
          ? "confirmé"
          : count > 1
            ? "intermittent"
            : "observé une fois"
      ) as RepeatKind,
    }))
    .sort((a, b) => b.failed_runs - a.failed_runs);
}

function writeCumulative(cumulative: CumulativeNightLog) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(CUMULATIVE_PATH, JSON.stringify(cumulative, null, 2), "utf-8");
}

main().catch((error) => {
  console.error("La boucle de nuit a rencontré une erreur inattendue.");
  console.error(error);
  process.exit(1);
});
