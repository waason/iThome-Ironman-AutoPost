import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  resolveArticleForDay,
  validateArticle,
} from "../src/article.js";

test("可從公開示範資料夾取得 Day 1", async () => {
  const article = await resolveArticleForDay(
    path.resolve("articles", "sample-series"),
    1,
  );

  assert.equal(article.day, 1);
  assert.equal(article.title, "Day 1｜文章標題");
  assert.equal(article.body, "Day 1 文章\n");
});

test("相對圖片路徑會阻擋文章發布", () => {
  const issues = validateArticle({
    day: 1,
    title: "Day 1｜測試文章",
    body: "![書籍封面](../assets/book/cover.jpg)",
    filePath: "Day 01｜測試文章.md",
  });

  assert.deepEqual(issues, [
    {
      code: "relative-image",
      message: "圖片必須使用可公開存取的 https:// 網址：../assets/book/cover.jpg",
    },
  ]);
});
