import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import path from "node:path";

const execFileAsync = promisify(execFile);

test("preview CLI 可先列出單一系列的 Day 1 草稿計畫", async () => {
  const result = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/preview-cli.ts",
      "--date",
      "2099-09-01",
      "--series",
      "sample-series",
      "--plan",
      "--json",
    ],
    { cwd: path.resolve(".") },
  );
  const output = JSON.parse(result.stdout) as {
    mode: string;
    targets: Array<{
      seriesKey: string;
      draftId: number;
      draftUrl: string;
    }>;
  };

  assert.equal(output.mode, "plan-only");
  assert.deepEqual(output.targets, [
    {
      seriesKey: "sample-series",
      signupId: 99999902,
      draftId: 99999903,
      draftUrl: "https://ithelp.ithome.com.tw/articles/99999903/draft",
      articleTitle: "Day 1｜文章標題",
      screenshotPath: path.join(
        "output",
        "playwright",
        "2099-09-01-sample-series-day-01-preview.png",
      ),
    },
  ]);
});

test("preview CLI 的真實操作在公開範本模式先被封鎖", async () => {
  await assert.rejects(
    () => execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/preview-cli.ts",
        "--date",
        "2099-09-01",
      ],
      { cwd: path.resolve(".") },
    ),
    /templateMode: true/u,
  );
});
