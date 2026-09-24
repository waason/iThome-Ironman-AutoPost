import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import path from "node:path";

import { assertLiveOperationAllowed } from "../src/template-mode.js";

const execFileAsync = promisify(execFile);

test("templateMode 會封鎖所有會接觸 iThome 的操作", () => {
  for (const operation of ["preview", "save-draft", "publish"] as const) {
    assert.throws(
      () => assertLiveOperationAllowed(true, operation),
      /templateMode: true/u,
    );
  }
});

test("templateMode 關閉後允許進入真實操作流程", () => {
  assert.doesNotThrow(() => assertLiveOperationAllowed(false, "preview"));
  assert.doesNotThrow(() => assertLiveOperationAllowed(false, "save-draft"));
  assert.doesNotThrow(() => assertLiveOperationAllowed(false, "publish"));
});

test("preflight CLI 會在公開範本模式阻擋正式發布", async () => {
  await assert.rejects(
    () =>
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/preflight-cli.ts",
          "--operation",
          "publish",
        ],
        { cwd: path.resolve(".") },
      ),
    /templateMode: true/u,
  );
});
