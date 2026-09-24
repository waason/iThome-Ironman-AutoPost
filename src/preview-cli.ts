import { access } from "node:fs/promises";
import path from "node:path";

import { loadPublisherConfig } from "./config.js";
import { runPreviewWithPlaywright } from "./ithome-preview.js";
import { createDayOnePreviewPlan } from "./preview.js";
import { assertLiveOperationAllowed } from "./template-mode.js";

interface PreviewArguments {
  configPath: string;
  date: string;
  selectedSeriesKeys?: string[];
  planOnly: boolean;
  json: boolean;
  headless: boolean;
  storageStatePath: string | undefined;
}

const arguments_ = parseArguments(process.argv.slice(2));
const config = await loadPublisherConfig(arguments_.configPath);

if (config.campaign.timeZone !== "Asia/Taipei") {
  throw new Error(
    `Day 1 預覽目前只支援 Asia/Taipei，實際為 ${config.campaign.timeZone}`,
  );
}

const instant = new Date(
  `${arguments_.date}T${config.campaign.publishTime}:00+08:00`,
);
if (Number.isNaN(instant.getTime())) {
  throw new Error(`無效日期：${arguments_.date}`);
}

const plan = await createDayOnePreviewPlan(
  config,
  instant,
  arguments_.selectedSeriesKeys,
);

if (arguments_.planOnly) {
  printResult(
    {
      mode: "plan-only",
      day: plan.day,
      targets: plan.targets.map((target) => ({
        seriesKey: target.seriesKey,
        signupId: target.signupId,
        draftId: target.draftId,
        draftUrl: target.draftUrl,
        articleTitle: target.articleTitle,
        screenshotPath: target.screenshotPath,
      })),
      skipped: plan.skipped,
    },
    arguments_.json,
  );
  process.exitCode = 0;
} else {
  assertLiveOperationAllowed(config.campaign.templateMode, "preview");

  const storageStatePath = arguments_.storageStatePath;
  if (storageStatePath === undefined) {
    throw new Error(
      "實際預覽需要 --storage-state 或 ITHOME_STORAGE_STATE_PATH；登入狀態不會存入儲存庫",
    );
  }

  await access(storageStatePath);
  const artifacts = await runPreviewWithPlaywright(plan.targets, {
    storageStatePath,
    headless: arguments_.headless,
  });

  printResult(
    {
      mode: "fill-only",
      day: plan.day,
      artifacts,
      skipped: plan.skipped,
    },
    arguments_.json,
  );
}

function parseArguments(values: string[]): PreviewArguments {
  const options: PreviewArguments = {
    configPath: path.resolve("config", "series.yml"),
    date: "",
    planOnly: false,
    json: false,
    headless: true,
    storageStatePath: process.env.ITHOME_STORAGE_STATE_PATH,
  };
  const selectedSeriesKeys: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];

    switch (argument) {
      case "--date":
        options.date = requireValue(values, ++index, argument);
        break;
      case "--series":
        selectedSeriesKeys.push(
          ...requireValue(values, ++index, argument)
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        );
        break;
      case "--config":
        options.configPath = path.resolve(
          requireValue(values, ++index, argument),
        );
        break;
      case "--storage-state":
        options.storageStatePath = path.resolve(
          requireValue(values, ++index, argument),
        );
        break;
      case "--plan":
        options.planOnly = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--headed":
        options.headless = false;
        break;
      default:
        throw new Error(`不支援的參數：${argument}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.date)) {
    throw new Error("--date 必須使用 YYYY-MM-DD");
  }

  if (selectedSeriesKeys.length > 0) {
    options.selectedSeriesKeys = [...new Set(selectedSeriesKeys)];
  }

  return options;
}

function requireValue(
  values: string[],
  index: number,
  argument: string,
): string {
  const value = values[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${argument} 缺少值`);
  }

  return value;
}

function printResult(result: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, undefined, 2));
    return;
  }

  console.log(result);
}
