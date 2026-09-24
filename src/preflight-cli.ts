import path from "node:path";

import { loadPublisherConfig } from "./config.js";
import {
  assertLiveOperationAllowed,
  type LiveOperation,
} from "./template-mode.js";

const arguments_ = parseArguments(process.argv.slice(2));
const config = await loadPublisherConfig(arguments_.configPath);

assertLiveOperationAllowed(config.campaign.templateMode, arguments_.operation);
console.log(`preflight 通過：${arguments_.operation}`);

interface PreflightArguments {
  configPath: string;
  operation: LiveOperation;
}

function parseArguments(values: string[]): PreflightArguments {
  let configPath = path.resolve("config", "series.yml");
  let operation: LiveOperation | undefined;

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    switch (argument) {
      case "--config":
        configPath = path.resolve(requireValue(values, ++index, argument));
        break;
      case "--operation": {
        const value = requireValue(values, ++index, argument);
        if (value !== "preview" && value !== "save-draft" && value !== "publish") {
          throw new Error("--operation 必須是 preview、save-draft 或 publish");
        }
        operation = value;
        break;
      }
      default:
        throw new Error(`不支援的參數：${argument}`);
    }
  }

  if (operation === undefined) {
    throw new Error("必須提供 --operation");
  }

  return { configPath, operation };
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
