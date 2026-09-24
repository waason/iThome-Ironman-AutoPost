import { access } from "node:fs/promises";
import path from "node:path";

import {
  assertPublishWindow,
  createAutomationPlan,
  type AutomationMode,
} from "./automation.js";
import { loadPublisherConfig } from "./config.js";
import { runAutomationWithPlaywright } from "./ithome-publisher.js";
import { getCampaignDay } from "./schedule.js";
import { assertLiveOperationAllowed } from "./template-mode.js";

interface AutomationArguments {
  mode: AutomationMode | undefined;
  configPath: string;
  date: string;
  selectedSeriesKeys?: string[];
  planOnly: boolean;
  scheduled: boolean;
  json: boolean;
  headless: boolean;
  confirm: string | undefined;
  storageStatePath: string | undefined;
}

const arguments_ = parseArguments(process.argv.slice(2));
const mode = arguments_.mode;
if (mode === undefined) {
  throw new Error("必須提供 --mode save-draft 或 --mode publish");
}

const config = await loadPublisherConfig(arguments_.configPath);
if (config.campaign.timeZone !== "Asia/Taipei") {
  throw new Error(`自動化目前只支援 Asia/Taipei，實際為 ${config.campaign.timeZone}`);
}

const instant = new Date(
  `${arguments_.date}T${config.campaign.publishTime}:00+08:00`,
);
if (Number.isNaN(instant.getTime())) {
  throw new Error(`無效日期：${arguments_.date}`);
}

const campaignDay = getCampaignDay({
  instant,
  startDate: config.campaign.startDate,
  timeZone: config.campaign.timeZone,
  totalDays: config.campaign.totalDays,
});

if (arguments_.scheduled && campaignDay === null) {
  printResult({
    mode: "schedule-noop",
    day: null,
    reason: `指定日期不在 ${config.campaign.totalDays} 天連載期間內`,
  }, arguments_.json);
} else {
  const plan = await createAutomationPlan(
    config,
    instant,
    arguments_.selectedSeriesKeys,
  );

  if (arguments_.planOnly) {
    printResult({
      mode: `plan-only:${mode}`,
      day: plan.day,
      targets: plan.targets.map((target) => ({
        seriesKey: target.seriesKey,
        signupId: target.signupId,
        entryUrl: target.entryUrl,
        articleTitle: target.articleTitle,
        receiptPath: target.receiptPath,
      })),
      skipped: plan.skipped,
    }, arguments_.json);
  } else {
    assertLiveOperationAllowed(config.campaign.templateMode, mode);
    assertConfirmation(mode, arguments_.confirm);

    if (mode === "publish") {
      assertPublishWindow({
        requestedDate: arguments_.date,
        publishTime: config.campaign.publishTime,
        timeZone: config.campaign.timeZone,
        now: new Date(),
      });
    }

    const storageStatePath = arguments_.storageStatePath;
    if (storageStatePath === undefined) {
      throw new Error(
        "真實自動化需要 --storage-state 或 ITHOME_STORAGE_STATE_PATH；登入狀態不會存入儲存庫",
      );
    }
    await access(storageStatePath);

    const receipts = await runAutomationWithPlaywright(plan.targets, {
      mode,
      requestedDate: arguments_.date,
      storageStatePath,
      headless: arguments_.headless,
    });
    printResult({
      mode,
      day: plan.day,
      receipts,
      skipped: plan.skipped,
    }, arguments_.json);
  }
}

function parseArguments(values: string[]): AutomationArguments {
  const options: AutomationArguments = {
    mode: undefined,
    configPath: path.resolve("config", "series.yml"),
    date: "",
    planOnly: false,
    scheduled: false,
    json: false,
    headless: true,
    confirm: undefined,
    storageStatePath: process.env.ITHOME_STORAGE_STATE_PATH,
  };
  const selectedSeriesKeys: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    switch (argument) {
      case "--mode": {
        const mode = requireValue(values, ++index, argument);
        if (mode !== "save-draft" && mode !== "publish") {
          throw new Error("--mode 只接受 save-draft 或 publish");
        }
        options.mode = mode;
        break;
      }
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
        options.configPath = path.resolve(requireValue(values, ++index, argument));
        break;
      case "--storage-state":
        options.storageStatePath = path.resolve(
          requireValue(values, ++index, argument),
        );
        break;
      case "--confirm":
        options.confirm = requireValue(values, ++index, argument);
        break;
      case "--plan":
        options.planOnly = true;
        break;
      case "--scheduled":
        options.scheduled = true;
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

function assertConfirmation(mode: AutomationMode, confirmation: string | undefined): void {
  const required = mode === "save-draft" ? "SAVE_DRAFT" : "PUBLISH";
  if (confirmation !== required) {
    const label = mode === "save-draft" ? "真實儲存" : "正式發布";
    throw new Error(`${label}需要 --confirm ${required}`);
  }
}

function requireValue(values: string[], index: number, argument: string): string {
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
