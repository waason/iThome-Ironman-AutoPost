import path from "node:path";

import { loadPublisherConfig } from "./config.js";
import {
  createPublicationPlan,
  validateReadyArchives,
} from "./publication-plan.js";

interface CliOptions {
  command: "validate";
  configPath: string;
  date?: string;
  json: boolean;
  all: boolean;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const config = await loadPublisherConfig(options.configPath);

  if (options.all) {
    const result = await validateReadyArchives(config);
    const output = {
      campaignId: config.campaign.id,
      validated: result.validated,
      skipped: result.skipped,
      errors: result.errors,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else {
      printArchiveValidation(output);
    }

    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const instant = options.date
    ? toTaipeiPublishInstant(
        options.date,
        config.campaign.publishTime,
        config.campaign.timeZone,
      )
    : new Date();
  const plan = await createPublicationPlan(config, instant);
  const output = {
    campaignId: config.campaign.id,
    day: plan.day,
    ready: plan.ready.map((item) => ({
      seriesKey: item.series.key,
      signupId: item.series.signupId,
    })),
    skipped: plan.skipped,
    errors: plan.errors,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    printHumanReadable(output);
  }

  if (plan.errors.length > 0) {
    process.exitCode = 1;
  }
}

function parseArguments(args: string[]): CliOptions {
  const [command, ...rest] = args;
  if (command !== "validate") {
    throw new Error("目前只支援 validate 指令");
  }

  const options: CliOptions = {
    command,
    configPath: path.resolve("config", "series.yml"),
    json: false,
    all: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];

    if (argument === "--json") {
      options.json = true;
      continue;
    }

    if (argument === "--all") {
      options.all = true;
      continue;
    }

    if (argument === "--date" || argument === "--config") {
      const value = rest[index + 1];
      if (value === undefined) {
        throw new Error(`${argument} 缺少值`);
      }

      if (argument === "--date") {
        options.date = value;
      } else {
        options.configPath = path.resolve(value);
      }
      index += 1;
      continue;
    }

    throw new Error(`不支援的參數：${argument}`);
  }

  if (options.all && options.date !== undefined) {
    throw new Error("--all 與 --date 不可同時使用");
  }

  return options;
}

function toTaipeiPublishInstant(
  date: string,
  publishTime: string,
  timeZone: string,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`--date 必須是 YYYY-MM-DD：${date}`);
  }

  if (timeZone !== "Asia/Taipei") {
    throw new Error(`目前只支援 Asia/Taipei，設定值為：${timeZone}`);
  }

  const instant = new Date(`${date}T${publishTime}:00+08:00`);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`日期不存在：${date}`);
  }

  return instant;
}

function printHumanReadable(output: {
  campaignId: string;
  day: number | null;
  ready: Array<{ seriesKey: string; signupId: number }>;
  skipped: Array<{ seriesKey: string; reason: string }>;
  errors: Array<{ seriesKey: string; messages: string[] }>;
}): void {
  if (output.day === null) {
    process.stdout.write("目前不在連載期間，不執行發布。\n");
    return;
  }

  process.stdout.write(`活動 ${output.campaignId}，Day ${output.day}\n`);
  for (const item of output.ready) {
    process.stdout.write(`READY ${item.seriesKey} #${item.signupId}\n`);
  }
  for (const item of output.skipped) {
    process.stdout.write(`SKIP ${item.seriesKey}：${item.reason}\n`);
  }
  for (const item of output.errors) {
    process.stdout.write(`ERROR ${item.seriesKey}：${item.messages.join("；")}\n`);
  }
}

function printArchiveValidation(output: {
  campaignId: string;
  validated: Array<{ seriesKey: string; articleCount: number }>;
  skipped: Array<{ seriesKey: string; reason: string }>;
  errors: Array<{ seriesKey: string; messages: string[] }>;
}): void {
  process.stdout.write(`活動 ${output.campaignId}，完整文章驗證\n`);
  for (const item of output.validated) {
    process.stdout.write(
      `PASS ${item.seriesKey}：${item.articleCount} 篇文章\n`,
    );
  }
  for (const item of output.skipped) {
    process.stdout.write(`SKIP ${item.seriesKey}：${item.reason}\n`);
  }
  for (const item of output.errors) {
    process.stdout.write(`ERROR ${item.seriesKey}：${item.messages.join("；")}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
