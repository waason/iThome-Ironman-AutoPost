import assert from "node:assert/strict";
import test from "node:test";

import { findPublishedArticleInRss } from "../src/rss.js";

test("RSS 只從 item 解析普通標題與 CDATA 標題", () => {
  const rss = `<?xml version="1.0"?>
    <rss><channel>
      <title>Day 99｜不能把頻道標題當成文章</title>
      <item>
        <title>Day 1｜第一篇 &amp; 驗證</title>
        <link>https://ithelp.ithome.com.tw/articles/1001?sc=rss.iron</link>
      </item>
      <item>
        <title><![CDATA[Day 2｜第二篇]]></title>
        <link><![CDATA[https://ithelp.ithome.com.tw/articles/1002?sc=rss.iron]]></link>
      </item>
    </channel></rss>`;

  assert.deepEqual(findPublishedArticleInRss(rss, "Day 1｜第一篇 & 驗證"), {
    title: "Day 1｜第一篇 & 驗證",
    url: "https://ithelp.ithome.com.tw/articles/1001",
  });
  assert.deepEqual(findPublishedArticleInRss(rss, "Day 2｜第二篇"), {
    title: "Day 2｜第二篇",
    url: "https://ithelp.ithome.com.tw/articles/1002",
  });
  assert.equal(
    findPublishedArticleInRss(rss, "Day 99｜不能把頻道標題當成文章"),
    undefined,
  );
});

test("同一系列 RSS 已有相同 Day 時，即使標題被修改也視為已發布", () => {
  const rss = `<rss><channel><item>
    <title><![CDATA[Day 02：人工修改過的公開標題]]></title>
    <link>https://ithelp.ithome.com.tw/articles/1002?sc=rss.iron</link>
  </item></channel></rss>`;

  assert.deepEqual(
    findPublishedArticleInRss(rss, "Day 2｜準備自動發布的標題"),
    {
      title: "Day 02：人工修改過的公開標題",
      url: "https://ithelp.ithome.com.tw/articles/1002",
    },
  );
});
