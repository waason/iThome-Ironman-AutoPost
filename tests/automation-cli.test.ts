import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import path from "node:path";

const execFileAsync = promisify(execFile);

test("automation CLI 計畫模式可列出 Day 2 建立入口且不需要登入狀態", async () => {
  const result = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/automation-cli.ts",
      "--mode",
      "save-draft",
      "--date",
      "2099-09-02",
      "--series",
      "sample-series",
      "--plan",
      "--json",
    ],
    { cwd: path.resolve(".") },
  );
  const output = JSON.parse(result.stdout) as {
    mode: string;
    day: number;
    targets: Array<{
      seriesKey: string;
      entryUrl: string;
    }>;
  };

  assert.equal(output.mode, "plan-only:save-draft");
  assert.equal(output.day, 2);
  assert.deepEqual(output.targets, [
    {
      seriesKey: "sample-series",
      signupId: 99999902,
      entryUrl: "https://ithelp.ithome.com.tw/2099ironman/create/99999902",
      articleTitle: "Day 2｜文章標題",
      receiptPath: path.join(
        "output",
        "receipts",
        "2099-09-02-sample-series-day-02.json",
      ),
    },
  ]);
});

test("真實儲存在公開範本模式於開啟瀏覽器前失敗", async () => {
  await assert.rejects(
    () => execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/automation-cli.ts",
        "--mode",
        "save-draft",
        "--date",
        "2099-09-01",
      ],
      { cwd: path.resolve(".") },
    ),
    /templateMode: true/u,
  );
});

test("真實發布在公開範本模式於開啟瀏覽器前失敗", async () => {
  await assert.rejects(
    () => execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/automation-cli.ts",
        "--mode",
        "publish",
        "--date",
        "2099-09-01",
      ],
      { cwd: path.resolve(".") },
    ),
    /templateMode: true/u,
  );
});

test("排程在 30 天活動期間外安全略過", async () => {
  const result = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/automation-cli.ts",
      "--mode",
      "publish",
      "--date",
      "2099-10-01",
      "--scheduled",
      "--plan",
      "--json",
    ],
    { cwd: path.resolve(".") },
  );
  const output = JSON.parse(result.stdout) as {
    mode: string;
    day: null;
    reason: string;
  };

  assert.deepEqual(output, {
    mode: "schedule-noop",
    day: null,
    reason: "指定日期不在 30 天連載期間內",
  });
});
