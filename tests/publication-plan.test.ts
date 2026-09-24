import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { loadPublisherConfig } from "../src/config.js";
import {
  createPublicationPlan,
  validateReadyArchives,
} from "../src/publication-plan.js";

test("活動第一天安排示範系列", async () => {
  const config = await loadPublisherConfig(
    path.resolve("config", "series.yml"),
  );
  const plan = await createPublicationPlan(
    config,
    new Date("2099-08-31T22:00:00.000Z"),
  );

  assert.equal(plan.day, 1);
  assert.deepEqual(
    plan.ready.map((item) => [item.series.key, item.series.signupId]),
    [["sample-series", 99999902]],
  );
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.errors, []);
});

test("示範系列的 30 篇文章通過完整驗證", async () => {
  const config = await loadPublisherConfig(
    path.resolve("config", "series.yml"),
  );
  const result = await validateReadyArchives(config);

  assert.deepEqual(result.validated, [
    { seriesKey: "sample-series", articleCount: 30 },
  ]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.errors, []);
});

test("Day 30 後不再安排示範系列", async () => {
  const config = await loadPublisherConfig(
    path.resolve("config", "series.yml"),
  );
  const plan = await createPublicationPlan(
    config,
    new Date("2099-09-30T22:00:00.000Z"),
  );

  assert.equal(plan.day, null);
  assert.deepEqual(plan.ready, []);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.errors, []);
});
