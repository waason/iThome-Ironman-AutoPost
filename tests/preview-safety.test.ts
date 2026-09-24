import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

import {
  assertPreviewRequestIsReadOnly,
  isDraftMutationRequest,
  markdownSourcesMatch,
} from "../src/ithome-preview.js";

test("預覽模式只允許唯讀 HTTP 方法", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.doesNotThrow(() => assertPreviewRequestIsReadOnly(method));
  }

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.throws(
      () => assertPreviewRequestIsReadOnly(method),
      new RegExp(`預覽模式封鎖 ${method} 請求`, "u"),
    );
  }
});

test("預覽實作不會點擊儲存或發表按鈕", async () => {
  const source = await readFile(
    path.resolve("src", "ithome-preview.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /saveButton\.click\s*\(/u);
  assert.doesNotMatch(source, /publishButton\.click\s*\(/u);
  assert.doesNotMatch(source, /request\.(?:post|put|patch|delete)\s*\(/u);
});

test("Markdown 讀回比較允許跨平台換行與檔尾換行", () => {
  assert.equal(markdownSourcesMatch("第一行\r\n第二行\n", "第一行\n第二行"), true);
  assert.equal(markdownSourcesMatch("第一行  \n第二行", "第一行\n第二行"), false);
});

test("只有既有草稿網址的非唯讀請求視為草稿寫入嘗試", () => {
  assert.equal(
    isDraftMutationRequest(
      "POST",
      "https://ithelp.ithome.com.tw/articles/99999903/draft",
      99999903,
    ),
    true,
  );
  assert.equal(
    isDraftMutationRequest(
      "POST",
      "https://ithelp.ithome.com.tw/cdn-cgi/challenge-platform/check",
      99999903,
    ),
    false,
  );
  assert.equal(
    isDraftMutationRequest(
      "POST",
      "https://www.google-analytics.com/g/collect",
      99999903,
    ),
    false,
  );
  assert.equal(
    isDraftMutationRequest(
      "GET",
      "https://ithelp.ithome.com.tw/articles/99999903/draft",
      99999903,
    ),
    false,
  );
});
