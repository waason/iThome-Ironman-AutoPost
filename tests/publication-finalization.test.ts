import assert from "node:assert/strict";
import test from "node:test";

import {
  finalizePublishedArticle,
  selectExistingArticleReference,
  type AutomationReceipt,
  type RssVerificationStatus,
} from "../src/ithome-publisher.js";

function createReceipt(rssVerification: RssVerificationStatus): AutomationReceipt {
  return {
    mode: "publish",
    status: "published",
    requestedDate: "2099-09-01",
    seriesKey: "sample-series",
    signupId: 99999902,
    day: 1,
    draftId: 99999903,
    publicUrl: "https://ithelp.ithome.com.tw/articles/99999903",
    rssVerification,
    warnings: [],
    articleSha256: "sha256",
    completedAt: "2099-09-01T00:00:00.000Z",
    githubRunId: "123",
    receiptPath: "receipt.json",
    screenshotPath: "screenshot.png",
  };
}

test("公開頁成功後先寫入回執，RSS 超時只留下警告並回傳成功", async () => {
  const calls: string[] = [];
  const warning = "sample-series 已公開，但 60 秒內未能從系列 RSS 驗證文章";

  const receipt = await finalizePublishedArticle(warning, {
    writeReceipt: async (rssVerification, warnings) => {
      calls.push(`receipt:${rssVerification}:${warnings.length}`);
      return {
        ...createReceipt(rssVerification),
        warnings,
      };
    },
    waitForRss: async () => {
      calls.push("rss");
      return false;
    },
    reportWarning: (message) => {
      calls.push(`warning:${message}`);
    },
  });

  assert.deepEqual(calls, [
    "receipt:pending:0",
    "rss",
    `warning:${warning}`,
    "receipt:pending:1",
  ]);
  assert.equal(receipt.status, "published");
  assert.equal(receipt.rssVerification, "pending");
  assert.deepEqual(receipt.warnings, [warning]);
});

test("RSS 在等待期間出現時會把回執更新為已驗證", async () => {
  const calls: string[] = [];

  const receipt = await finalizePublishedArticle("不應出現", {
    writeReceipt: async (rssVerification, warnings) => {
      calls.push(`receipt:${rssVerification}:${warnings.length}`);
      return {
        ...createReceipt(rssVerification),
        warnings,
      };
    },
    waitForRss: async () => {
      calls.push("rss");
      return true;
    },
    reportWarning: (message) => {
      calls.push(`warning:${message}`);
    },
  });

  assert.deepEqual(calls, [
    "receipt:pending:0",
    "rss",
    "receipt:verified:0",
  ]);
  assert.equal(receipt.rssVerification, "verified");
  assert.deepEqual(receipt.warnings, []);
});

test("RSS 尚未同步時，個人文章列表的公開文章優先於殘留草稿", () => {
  const reference = selectExistingArticleReference(
    [
      "/articles/99999903/draft",
      "/articles/99999903",
    ],
    "sample-series",
  );

  assert.deepEqual(reference, {
    kind: "published",
    url: "https://ithelp.ithome.com.tw/articles/99999903",
  });
});
