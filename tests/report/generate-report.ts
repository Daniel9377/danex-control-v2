import * as fs from "fs";
import * as path from "path";

const REPORTS_DIR = path.resolve(process.cwd(), "tests/reports");
const RESULTS_PATH = path.join(REPORTS_DIR, "results.json");
const CUMULATIVE_PATH = path.join(REPORTS_DIR, "cumulative.json");
const SCREENSHOTS_DIR = path.join(REPORTS_DIR, "screenshots");
const REPORT_PATH = path.join(REPORTS_DIR, "RAPPORT_NUIT.md");

type PlaywrightStats = {
  expected?: number;
  unexpected?: number;
  flaky?: number;
  skipped?: number;
};

export type ParsedFailure = {
  key: string;
  zone: string;
  title: string;
  file: string;
  message: string;
  expected: string;
  obtained: string;
  action: string;
  severity: "critical" | "medium" | "minor";
  screenshotPaths: string[];
};

export type ParsedResults = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: ParsedFailure[];
};

type CumulativeIteration = {
  iteration: number;
  status: "completed" | "blocked";
  failures?: ParsedFailure[];
  summary?: ParsedResults;
};

type CumulativeReport = {
  status?: "completed" | "blocked";
  reason?: string;
  requested_iterations?: number;
  completed_iterations?: number;
  iterations?: CumulativeIteration[];
};

type FailureWithRepeat = ParsedFailure & {
  failedRuns: number;
  completedRuns: number;
  repeatLabel: string;
};

export function parsePlaywrightResults(resultsPath = RESULTS_PATH): ParsedResults {
  if (!fs.existsSync(resultsPath)) {
    return { total: 0, passed: 0, failed: 0, skipped: 0, failures: [] };
  }

  const raw = JSON.parse(fs.readFileSync(resultsPath, "utf-8")) as {
    stats?: PlaywrightStats;
    suites?: unknown[];
  };

  const failures: ParsedFailure[] = [];
  walkSuites(raw.suites ?? [], failures);

  const stats = raw.stats ?? {};
  const passed = Number(stats.expected ?? 0);
  const failed = Number(stats.unexpected ?? failures.length);
  const skipped = Number(stats.skipped ?? 0);
  const flaky = Number(stats.flaky ?? 0);
  const total = passed + failed + skipped + flaky;

  return { total, passed, failed, skipped, failures };
}

export function generateReport(): string {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const cumulative = readCumulative();
  const latest = parsePlaywrightResults();
  const screenshots = listScreenshots();
  const completedRuns = Number(cumulative?.completed_iterations ?? cumulative?.iterations?.filter((i) => i.status === "completed").length ?? 0);
  const failures = mergeRepeatInfo(latest.failures, cumulative, completedRuns);
  const failureSource = failures.length > 0 ? failures : mergeRepeatInfo([], cumulative, completedRuns);
  const critical = failureSource.filter((failure) => failure.severity === "critical");
  const medium = failureSource.filter((failure) => failure.severity === "medium");
  const minor = failureSource.filter((failure) => failure.severity === "minor");
  const zoneFragility = topFragileZones(failureSource);

  const blocked = cumulative?.status === "blocked" && completedRuns === 0;
  const stableLabel = blocked
    ? "Non testée (précondition manquante)"
    : latest.failed === 0 && failureSource.length === 0
      ? "Application stable"
      : critical.length > 0
        ? "Application instable"
        : "Application à surveiller";

  const lines: string[] = [];
  lines.push(`# Rapport de test nuit — DANEX Control — ${formatDate(new Date())}`);
  lines.push("");
  lines.push("## 1. Résumé général");
  lines.push(`- État : ${stableLabel}`);
  if (blocked) {
    lines.push(`- Tests réussis : 0 / 0`);
    lines.push(`- Tests échoués : 0`);
    lines.push(`- Blocage : ${cumulative?.reason ?? "Les tests n'ont pas pu démarrer."}`);
  } else {
    lines.push(`- Tests réussis : ${latest.passed} / ${latest.total}`);
    lines.push(`- Tests échoués : ${latest.failed}`);
    lines.push(`- Lancements terminés cette nuit : ${completedRuns}`);
  }
  lines.push(`- Zones les plus fragiles : ${zoneFragility.length > 0 ? zoneFragility.join(", ") : "Aucune zone fragile détectée"}`);
  lines.push("");

  appendBugSection(lines, "## 2. Bugs critiques", critical);
  appendBugSection(lines, "## 3. Bugs moyens", medium);
  appendBugSection(lines, "## 4. Bugs mineurs", minor);

  lines.push("## 5. Captures d'écran");
  if (failureSource.length === 0 && screenshots.length === 0) {
    lines.push("Aucune capture d'écran liée à un échec.");
  } else {
    lines.push("| Bug | Capture |");
    lines.push("| --- | --- |");
    for (const failure of failureSource) {
      const paths = failure.screenshotPaths.length > 0 ? failure.screenshotPaths : screenshots.slice(0, 1);
      if (paths.length === 0) {
        lines.push(`| ${escapeTable(failure.title)} | Aucune capture trouvée |`);
      } else {
        for (const screenshot of paths) {
          lines.push(`| ${escapeTable(failure.title)} | ${escapeTable(toRelativePath(screenshot))} |`);
        }
      }
    }
    if (failureSource.length === 0) {
      for (const screenshot of screenshots) {
        lines.push(`| Capture disponible | ${escapeTable(toRelativePath(screenshot))} |`);
      }
    }
  }
  lines.push("");

  lines.push("## 6. Recommandation pour demain");
  if (blocked) {
    lines.push("1. Démarrer le serveur avec `npm run dev` avant de relancer la nuit de tests.");
    lines.push("2. Vérifier que `.env.test` pointe vers le projet Supabase de test.");
    lines.push("3. Relancer `npm run test:night 10`.");
  } else if (failureSource.length === 0) {
    lines.push("1. Garder cette base de tests comme filet de sécurité quotidien.");
    lines.push("2. Ajouter les nouveaux scénarios métier dès qu'un nouveau bug réel apparaît.");
  } else {
    lines.push("1. Corriger d'abord les bugs critiques confirmés.");
    lines.push("2. Corriger ensuite les bugs moyens qui reviennent plusieurs fois.");
    lines.push("3. Finir par les bugs mineurs d'affichage et de confort.");
    lines.push("4. Relancer une nuit complète pour vérifier que les corrections tiennent dans le temps.");
  }
  lines.push("");

  const report = lines.join("\n");
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  return REPORT_PATH;
}

function walkSuites(suites: unknown[], failures: ParsedFailure[]) {
  for (const suite of suites) {
    const item = suite as {
      file?: string;
      title?: string;
      suites?: unknown[];
      specs?: unknown[];
    };
    if (Array.isArray(item.suites)) walkSuites(item.suites, failures);
    for (const spec of item.specs ?? []) {
      collectSpecFailures(spec, item.file ?? "", failures);
    }
  }
}

function collectSpecFailures(spec: unknown, suiteFile: string, failures: ParsedFailure[]) {
  const item = spec as {
    title?: string;
    file?: string;
    tests?: Array<{
      status?: string;
      results?: Array<{
        status?: string;
        error?: { message?: string; stack?: string };
        errors?: Array<{ message?: string; stack?: string }>;
        attachments?: Array<{ name?: string; contentType?: string; path?: string }>;
      }>;
    }>;
  };

  const title = item.title ?? "Scénario sans titre";
  const file = normalizeFile(item.file ?? suiteFile);
  const zone = zoneFromFile(file);

  for (const testCase of item.tests ?? []) {
    const resultFailures = (testCase.results ?? []).filter((result) =>
      ["failed", "timedOut", "interrupted"].includes(result.status ?? "") ||
      result.error ||
      (result.errors?.length ?? 0) > 0
    );
    const unexpected = testCase.status === "unexpected";
    if (!unexpected && resultFailures.length === 0) continue;

    const result = resultFailures[0] ?? testCase.results?.[0];
    const message =
      result?.error?.message ??
      result?.errors?.find((error) => error.message)?.message ??
      "Le scénario a échoué sans message détaillé.";
    const screenshots = (result?.attachments ?? [])
      .filter((attachment) => attachment.path && (attachment.contentType?.includes("image") || /screenshot/i.test(attachment.name ?? "")))
      .map((attachment) => attachment.path!)
      .concat(listScreenshotsFor(title));

    failures.push({
      key: failureKey(file, title),
      zone,
      title,
      file,
      message: cleanMessage(message),
      expected: expectedFromMessage(message),
      obtained: obtainedFromMessage(message),
      action: actionFromTitle(title),
      severity: classifyFailure(zone, title, message),
      screenshotPaths: unique(screenshots),
    });
  }
}

function readCumulative(): CumulativeReport | null {
  if (!fs.existsSync(CUMULATIVE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CUMULATIVE_PATH, "utf-8")) as CumulativeReport;
  } catch {
    return null;
  }
}

function mergeRepeatInfo(latestFailures: ParsedFailure[], cumulative: CumulativeReport | null, completedRuns: number): FailureWithRepeat[] {
  if (cumulative?.iterations?.some((iteration) => iteration.status === "completed")) {
    const map = new Map<string, FailureWithRepeat>();
    for (const iteration of cumulative.iterations) {
      if (iteration.status !== "completed") continue;
      for (const failure of iteration.failures ?? []) {
        const current = map.get(failure.key);
        if (current) {
          current.failedRuns += 1;
          current.screenshotPaths = unique([...current.screenshotPaths, ...failure.screenshotPaths]);
        } else {
          map.set(failure.key, {
            ...failure,
            failedRuns: 1,
            completedRuns,
            repeatLabel: "observé une fois",
          });
        }
      }
    }

    for (const failure of map.values()) {
      failure.completedRuns = completedRuns;
      failure.repeatLabel =
        completedRuns > 0 && failure.failedRuns >= completedRuns
          ? "confirmé"
          : failure.failedRuns > 1
            ? "intermittent"
            : "observé une fois";
    }

    return [...map.values()].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }

  const map = new Map<string, FailureWithRepeat>();
  for (const failure of latestFailures) {
    map.set(failure.key, {
      ...failure,
      failedRuns: 1,
      completedRuns,
      repeatLabel: completedRuns > 1 ? "intermittent" : "observé",
    });
  }

  for (const iteration of cumulative?.iterations ?? []) {
    if (iteration.status !== "completed") continue;
    for (const failure of iteration.failures ?? []) {
      const current = map.get(failure.key);
      if (current) {
        current.failedRuns += latestFailures.some((item) => item.key === failure.key) ? 0 : 1;
      } else {
        map.set(failure.key, {
          ...failure,
          failedRuns: 1,
          completedRuns,
          repeatLabel: "intermittent",
        });
      }
    }
  }

  for (const failure of map.values()) {
    failure.completedRuns = completedRuns;
    failure.repeatLabel =
      completedRuns > 0 && failure.failedRuns >= completedRuns
        ? "confirmé"
        : failure.failedRuns > 1
          ? "intermittent"
          : "observé une fois";
  }

  return [...map.values()].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function appendBugSection(lines: string[], title: string, failures: FailureWithRepeat[]) {
  lines.push(title);
  if (failures.length === 0) {
    lines.push("Aucun bug dans cette catégorie.");
    lines.push("");
    return;
  }

  for (const [index, failure] of failures.entries()) {
    lines.push(`${index + 1}. ${failure.title} — ${failure.repeatLabel}`);
    lines.push(`   - Zone : ${failure.zone}`);
    lines.push(`   - Action faite : ${failure.action}`);
    lines.push(`   - Résultat attendu : ${failure.expected}`);
    lines.push(`   - Résultat obtenu : ${failure.obtained}`);
    lines.push(`   - Capture d'écran : ${failure.screenshotPaths[0] ? toRelativePath(failure.screenshotPaths[0]) : "Aucune capture trouvée"}`);
  }
  lines.push("");
}

function topFragileZones(failures: ParsedFailure[]) {
  const counts = new Map<string, number>();
  for (const failure of failures) counts.set(failure.zone, (counts.get(failure.zone) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([zone, count]) => `${zone} (${count})`);
}

function classifyFailure(zone: string, title: string, message: string): "critical" | "medium" | "minor" {
  const text = `${zone} ${title} ${message}`.toLowerCase();
  if (
    zone === "cross-consistency" ||
    /currency integrity|double submit|double-submit|double clic|money created|money lost|argent cr..|perdu|conserve|nan|crash|118 usd|solde physique|dettes . payer/.test(text)
  ) {
    return "critical";
  }
  if (/cache|stale|statut|status|persist|devise|currency|slow|timeout|trop lent/.test(text)) return "medium";
  if (/overflow|d.bord|align|contrast|clair|sombre|theme|mobile|tablet|lisible/.test(text)) return "minor";
  return zone === "ui-global" ? "minor" : "medium";
}

function actionFromTitle(title: string) {
  return `Le test a exécuté le scénario "${title}".`;
}

function expectedFromMessage(message: string) {
  const clean = cleanMessage(message);
  const match = clean.match(/attendu[^.]*\./i) ?? clean.match(/expected[^.]*\./i);
  return match?.[0] ?? "Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.";
}

function obtainedFromMessage(message: string) {
  const clean = cleanMessage(message);
  const match = clean.match(/actuel[^.]*\./i) ?? clean.match(/received[^.]*\./i);
  return match?.[0] ?? clean.split("\n")[0] ?? "Le scénario a échoué.";
}

function cleanMessage(message: string) {
  return message
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function zoneFromFile(file: string) {
  const normalized = file.replace(/\\/g, "/");
  const match = normalized.match(/zones\/([^/]+)\.spec\.ts$/);
  if (match) return match[1];
  return normalized.replace(/\.spec\.ts$/, "") || "inconnu";
}

function normalizeFile(file: string) {
  return file.replace(/\\/g, "/");
}

function failureKey(file: string, title: string) {
  return `${normalizeFile(file)}::${title}`;
}

function severityRank(severity: ParsedFailure["severity"]) {
  return severity === "critical" ? 0 : severity === "medium" ? 1 : 2;
}

function listScreenshots() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) return [];
  const result: string[] = [];
  walkFiles(SCREENSHOTS_DIR, result);
  return result.filter((file) => /\.(png|jpe?g|webp)$/i.test(file)).sort();
}

function listScreenshotsFor(title: string) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 3);
  if (words.length === 0) return [];
  return listScreenshots().filter((file) => {
    const lower = file.toLowerCase();
    return words.some((word) => lower.includes(word));
  });
}

function walkFiles(dir: string, output: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, output);
    else output.push(fullPath);
  }
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function toRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function escapeTable(value: string) {
  return value.replace(/\|/g, "\\|");
}

function formatDate(date: Date) {
  return date.toLocaleString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

if (require.main === module) {
  const reportPath = generateReport();
  console.log(`Rapport généré : ${reportPath}`);
}
