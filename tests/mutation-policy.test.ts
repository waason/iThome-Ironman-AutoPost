import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAutomationRequestAllowed,
  isProtectedIthomeMutation,
  type AutomationRequestPolicy,
} from "../src/ithome-publisher.js";

const basePolicy: AutomationRequestPolicy = {
  mode: "save-draft",
  action: "idle",
  createUrl: "https://ithelp.ithome.com.tw/2099ironman/create/99999902",
  draftId: 99999903,
};

test("閒置期間只允許一般唯讀請求，建立草稿 GET 也會封鎖", () => {
  assert.doesNotThrow(() => assertAutomationRequestAllowed({
    ...basePolicy,
    method: "GET",
    requestUrl: "https://ithelp.ithome.com.tw/articles/99999903/draft",
  }));

  assert.throws(
    () => assertAutomationRequestAllowed({
      ...basePolicy,
      method: "GET",
      requestUrl: basePolicy.createUrl,
    }),
    /尚未授權建立草稿/u,
  );
});

test("建立草稿只允許目前系列的精準 GET 入口", () => {
  assert.doesNotThrow(() => assertAutomationRequestAllowed({
    ...basePolicy,
    action: "create-draft",
    method: "GET",
    requestUrl: basePolicy.createUrl,
  }));

  assert.throws(
    () => assertAutomationRequestAllowed({
      ...basePolicy,
      action: "create-draft",
      method: "GET",
      requestUrl: "https://ithelp.ithome.com.tw/2099ironman/create/99999904",
    }),
    /建立草稿網址不在白名單/u,
  );
});

test("儲存與發布只放行目前草稿的對應 POST", () => {
  assert.doesNotThrow(() => assertAutomationRequestAllowed({
    ...basePolicy,
    action: "save-draft",
    method: "POST",
    requestUrl: "https://ithelp.ithome.com.tw/articles/99999903/draft",
  }));

  assert.throws(
    () => assertAutomationRequestAllowed({
      ...basePolicy,
      action: "save-draft",
      method: "POST",
      requestUrl: "https://ithelp.ithome.com.tw/articles/99999903/publish",
    }),
    /寫入請求不在目前動作白名單/u,
  );

  assert.doesNotThrow(() => assertAutomationRequestAllowed({
    ...basePolicy,
    mode: "publish",
    action: "publish",
    method: "POST",
    requestUrl: "https://ithelp.ithome.com.tw/articles/99999903/publish",
  }));
});

test("外部分析請求可封鎖但不視為 iThome 文章異動", () => {
  assert.equal(
    isProtectedIthomeMutation("POST", "https://www.google-analytics.com/g/collect"),
    false,
  );
  assert.equal(
    isProtectedIthomeMutation(
      "POST",
      "https://ithelp.ithome.com.tw/articles/99999903/publish",
    ),
    true,
  );
});
