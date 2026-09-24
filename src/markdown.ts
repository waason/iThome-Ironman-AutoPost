/**
 * 比對 Markdown 原始內容，僅正規化跨平台換行與檔尾空白。
 */
export function markdownSourcesMatch(actual: string, expected: string): boolean {
  return normalizeMarkdownSource(actual) === normalizeMarkdownSource(expected);
}

function normalizeMarkdownSource(value: string): string {
  return value.replace(/\r\n/gu, "\n").trim();
}
