import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { loadPublisherConfig } from "../src/config.js";

test("公開範本預設啟用 templateMode 並只提供一個示範系列", async () => {
  const config = await loadPublisherConfig(
    path.resolve("config", "series.yml"),
  );

  assert.equal(config.campaign.timeZone, "Asia/Taipei");
  assert.equal(config.campaign.templateMode, true);
  assert.equal(config.campaign.authorId, 99999901);
  assert.equal(config.campaign.publishTime, "06:00");
  assert.equal(config.campaign.totalDays, 30);
  assert.equal(config.campaign.cron, "7 22 * * *");
  assert.equal(
    config.campaign.createUrlTemplate,
    "https://ithelp.ithome.com.tw/2099ironman/create/{signupId}",
  );
  assert.deepEqual(config.blockedSignupIds, []);
  assert.deepEqual(
    config.series.map((series) => [
      series.key,
      series.signupId,
      series.ready,
      series.totalDays,
      series.day1DraftId,
    ]),
    [["sample-series", 99999902, true, 30, 99999903]],
  );
});
