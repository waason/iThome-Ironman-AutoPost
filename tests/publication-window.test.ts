import assert from "node:assert/strict";
import test from "node:test";

import { assertPublishWindow } from "../src/automation.js";

test("正式發布只允許台灣當天 06:00 之後", () => {
  assert.doesNotThrow(() => assertPublishWindow({
    requestedDate: "2099-09-01",
    publishTime: "06:00",
    timeZone: "Asia/Taipei",
    now: new Date("2099-08-31T22:00:00.000Z"),
  }));

  assert.throws(
    () => assertPublishWindow({
      requestedDate: "2099-09-01",
      publishTime: "06:00",
      timeZone: "Asia/Taipei",
      now: new Date("2099-08-31T21:59:59.000Z"),
    }),
    /尚未到發布時間/u,
  );

  assert.throws(
    () => assertPublishWindow({
      requestedDate: "2099-09-01",
      publishTime: "06:00",
      timeZone: "Asia/Taipei",
      now: new Date("2099-09-01T22:00:00.000Z"),
    }),
    /發布日期必須是台灣當天/u,
  );
});
