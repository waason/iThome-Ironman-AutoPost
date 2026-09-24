import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { loadPublisherConfig } from "../src/config.js";
import { createDayOnePreviewPlan } from "../src/preview.js";

test("Day 1 預覽使用示範系列的既有草稿", async () => {
  const config = await loadPublisherConfig(
    path.resolve("config", "series.yml"),
  );
  const plan = await createDayOnePreviewPlan(
    config,
    new Date("2099-08-31T22:00:00.000Z"),
  );

  assert.deepEqual(
    plan.targets.map((target) => ({
      seriesKey: target.seriesKey,
      signupId: target.signupId,
      draftId: target.draftId,
      draftUrl: target.draftUrl,
      articleTitle: target.articleTitle,
    })),
    [{
      seriesKey: "sample-series",
      signupId: 99999902,
      draftId: 99999903,
      draftUrl: "https://ithelp.ithome.com.tw/articles/99999903/draft",
      articleTitle: "Day 1｜文章標題",
    }],
  );
  assert.deepEqual(plan.skipped, []);
});
