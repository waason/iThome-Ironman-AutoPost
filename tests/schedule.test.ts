import assert from "node:assert/strict";
import test from "node:test";

import { getCampaignDay } from "../src/schedule.js";

test("台灣時間 2099-09-01 06:00 對應連載 Day 1", () => {
  const day = getCampaignDay({
    instant: new Date("2099-08-31T22:00:00.000Z"),
    startDate: "2099-09-01",
    timeZone: "Asia/Taipei",
    totalDays: 30,
  });

  assert.equal(day, 1);
});

test("台灣時間 2099-09-30 06:00 對應連載 Day 30", () => {
  const day = getCampaignDay({
    instant: new Date("2099-09-29T22:00:00.000Z"),
    startDate: "2099-09-01",
    timeZone: "Asia/Taipei",
    totalDays: 30,
  });

  assert.equal(day, 30);
});

test("Day 30 後不再產生連載日", () => {
  const day = getCampaignDay({
    instant: new Date("2099-09-30T22:00:00.000Z"),
    startDate: "2099-09-01",
    timeZone: "Asia/Taipei",
    totalDays: 30,
  });

  assert.equal(day, null);
});
