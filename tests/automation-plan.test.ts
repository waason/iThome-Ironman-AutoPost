import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { createAutomationPlan } from "../src/automation.js";
import { loadPublisherConfig } from "../src/config.js";

test("Day 1 自動化計畫使用已登記的既有草稿", async () => {
  const config = await loadPublisherConfig(path.resolve("config", "series.yml"));
  const plan = await createAutomationPlan(
    config,
    new Date("2099-08-31T22:00:00.000Z"),
    ["sample-series"],
  );

  assert.equal(plan.day, 1);
  assert.deepEqual(plan.targets.map((target) => ({
    seriesKey: target.seriesKey,
    knownDraftId: target.knownDraftId,
    entryUrl: target.entryUrl,
    rssUrl: target.rssUrl,
  })), [
    {
      seriesKey: "sample-series",
      knownDraftId: 99999903,
      entryUrl: "https://ithelp.ithome.com.tw/articles/99999903/draft",
      rssUrl: "https://ithelp.ithome.com.tw/rss/series/99999902",
    },
  ]);
});

test("Day 2 起只使用正式 signupId 的建立入口", async () => {
  const config = await loadPublisherConfig(path.resolve("config", "series.yml"));
  const plan = await createAutomationPlan(
    config,
    new Date("2099-09-01T22:00:00.000Z"),
    ["sample-series"],
  );

  assert.equal(plan.day, 2);
  assert.deepEqual(plan.targets.map((target) => ({
    seriesKey: target.seriesKey,
    knownDraftId: target.knownDraftId,
    entryUrl: target.entryUrl,
    createUrl: target.createUrl,
  })), [
    {
      seriesKey: "sample-series",
      knownDraftId: undefined,
      entryUrl: "https://ithelp.ithome.com.tw/2099ironman/create/99999902",
      createUrl: "https://ithelp.ithome.com.tw/2099ironman/create/99999902",
    },
  ]);
});

test("自動化計畫拒絕未設定的系列", async () => {
  const config = await loadPublisherConfig(path.resolve("config", "series.yml"));

  await assert.rejects(
    () => createAutomationPlan(
      config,
      new Date("2099-08-31T22:00:00.000Z"),
      ["unknown-series"],
    ),
    /找不到指定系列：unknown-series/u,
  );
});
