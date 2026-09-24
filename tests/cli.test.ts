import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import path from "node:path";

const execFileAsync = promisify(execFile);

test("validate CLI 以 JSON 回報 Day 1 的示範文章", async () => {
  const projectRoot = path.resolve(".");
  const result = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli.ts",
      "validate",
      "--date",
      "2099-09-01",
      "--json",
    ],
    { cwd: projectRoot },
  );
  const output = JSON.parse(result.stdout) as {
    day: number;
    ready: Array<{ seriesKey: string; signupId: number }>;
    skipped: Array<{ seriesKey: string }>;
  };

  assert.equal(output.day, 1);
  assert.deepEqual(output.ready, [
    { seriesKey: "sample-series", signupId: 99999902 },
  ]);
  assert.deepEqual(output.skipped, []);
});

test("validate CLI 依各系列天數驗證完整文章", async () => {
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "validate", "--all", "--json"],
    { cwd: path.resolve(".") },
  );
  const output = JSON.parse(result.stdout) as {
    validated: Array<{ seriesKey: string; articleCount: number }>;
    errors: unknown[];
  };

  assert.deepEqual(output.validated, [
    { seriesKey: "sample-series", articleCount: 30 },
  ]);
  assert.deepEqual(output.errors, []);
});
