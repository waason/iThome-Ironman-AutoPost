import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

import { parse } from "yaml";

test("Validate workflow 只在程式碼事件與手動觸發時執行唯讀驗證", async () => {
  const workflowPath = path.resolve(
    ".github",
    "workflows",
    "validate.yml",
  );
  const source = await readFile(workflowPath, "utf8");
  const workflow = parse(source) as {
    on: { push: unknown; pull_request: unknown; workflow_dispatch: unknown; schedule?: unknown };
    permissions: { contents: string };
  };

  assert.ok(workflow.on.push);
  assert.ok(workflow.on.pull_request);
  assert.ok("workflow_dispatch" in workflow.on);
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.permissions.contents, "read");
  assert.match(source, /npm run check/u);
  assert.match(source, /npm run validate:all/u);
  assert.doesNotMatch(source, /publish --/u);
});

test("Day 1 預覽 workflow 只能手動執行且不含發布命令", async () => {
  const workflowPath = path.resolve(
    ".github",
    "workflows",
    "preview.yml",
  );
  const source = await readFile(workflowPath, "utf8");
  const workflow = parse(source) as {
    on: { workflow_dispatch: unknown; schedule?: unknown };
    permissions: { contents: string };
    jobs: { preview: { environment: string; if: string } };
  };

  assert.ok(workflow.on.workflow_dispatch);
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.jobs.preview.environment, "ithome-preview");
  assert.equal(workflow.jobs.preview.if, "github.ref == 'refs/heads/main'");
  assert.match(source, /ITHOME_STORAGE_STATE_B64/u);
  assert.match(source, /npm run preflight -- --operation preview/u);
  assert.match(source, /xvfb-run --auto-servernum npm run preview/u);
  assert.match(source, /--storage-state/u);
  assert.match(source, /--headed/u);
  assert.doesNotMatch(source, /npm run publish/u);
  assert.match(source, /vars\.ITHOME_UPLOAD_ARTIFACTS == 'true'/u);
  assert.doesNotMatch(source, /default:\s*["']?\d{4}-\d{2}-\d{2}/u);
  assert.doesNotMatch(source, /type:\s*choice/u);
  assert.ok(
    source.indexOf("--operation preview") < source.indexOf("Install Chromium"),
  );
  assert.ok(
    source.indexOf("--operation preview") < source.indexOf("ITHOME_STORAGE_STATE_B64"),
  );
});

test("儲存草稿 workflow 只能手動執行並要求精準確認字串", async () => {
  const workflowPath = path.resolve(
    ".github",
    "workflows",
    "save-draft.yml",
  );
  const source = await readFile(workflowPath, "utf8");
  const workflow = parse(source) as {
    on: { workflow_dispatch: unknown; schedule?: unknown };
    permissions: { contents: string };
    concurrency: { group: string };
    jobs: { save: { environment: string; if: string } };
  };

  assert.ok(workflow.on.workflow_dispatch);
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.concurrency.group, "ithome-live-write");
  assert.equal(workflow.jobs.save.environment, "ithome-save-draft");
  assert.match(workflow.jobs.save.if, /inputs\.confirm_save == 'SAVE_DRAFT'/u);
  assert.match(source, /npm run preflight -- --operation save-draft/u);
  assert.match(source, /node --import tsx src\/automation-cli\.ts --mode save-draft/u);
  assert.match(source, /--confirm SAVE_DRAFT/u);
  assert.doesNotMatch(source, /npm run publish/u);
  assert.doesNotMatch(source, /npm run save-draft.*tee/u);
  assert.match(source, /vars\.ITHOME_UPLOAD_ARTIFACTS == 'true'/u);
  assert.doesNotMatch(source, /default:\s*["']?\d{4}-\d{2}-\d{2}/u);
  assert.doesNotMatch(source, /type:\s*choice/u);
  assert.ok(
    source.indexOf("--operation save-draft") < source.indexOf("Install Chromium"),
  );
  assert.ok(
    source.indexOf("--operation save-draft") < source.indexOf("ITHOME_STORAGE_STATE_B64"),
  );
});

test("正式發布 workflow 於 06:07 執行並於 06:22 補償，且預設受 repository variable 封鎖", async () => {
  const workflowPath = path.resolve(
    ".github",
    "workflows",
    "publish.yml",
  );
  const source = await readFile(workflowPath, "utf8");
  const workflow = parse(source) as {
    on: {
      workflow_dispatch: unknown;
      schedule: Array<{ cron: string }>;
    };
    permissions: { contents: string };
    concurrency: { group: string };
    jobs: { publish: { environment: string; if: string } };
  };

  assert.ok(workflow.on.workflow_dispatch);
  assert.deepEqual(
    workflow.on.schedule.map((schedule) => schedule.cron),
    ["7 22 * * *", "22 22 * * *"],
  );
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.concurrency.group, "ithome-live-write");
  assert.equal(workflow.jobs.publish.environment, "ithome-publish");
  assert.match(workflow.jobs.publish.if, /inputs\.confirm_publish == 'PUBLISH'/u);
  assert.match(workflow.jobs.publish.if, /vars\.ITHOME_PUBLISH_ENABLED == 'true'/u);
  assert.match(source, /TZ=Asia\/Taipei date \+%F/u);
  assert.match(source, /--scheduled/u);
  assert.match(source, /steps\.campaign\.outputs\.active == 'true'/u);
  assert.match(source, /npm run preflight -- --operation publish/u);
  assert.match(source, /node --import tsx src\/automation-cli\.ts --mode publish/u);
  assert.match(source, /--confirm PUBLISH/u);
  assert.doesNotMatch(source, /npm run publish.*tee/u);
  assert.match(source, /vars\.ITHOME_UPLOAD_ARTIFACTS == 'true'/u);
  assert.doesNotMatch(source, /default:\s*["']?\d{4}-\d{2}-\d{2}/u);
  assert.doesNotMatch(source, /type:\s*choice/u);
  assert.ok(
    source.indexOf("--operation publish") < source.indexOf("Install Chromium"),
  );
  assert.ok(
    source.indexOf("--operation publish") < source.indexOf("ITHOME_STORAGE_STATE_B64"),
  );
});
