export type LiveOperation = "preview" | "save-draft" | "publish";

const operationLabels: Record<LiveOperation, string> = {
  preview: "填入預覽",
  "save-draft": "儲存草稿",
  publish: "正式發布",
};

/**
 * 公開範本預設不允許接觸 iThome。使用者必須先完成設定替換與驗證，
 * 再明確關閉 templateMode，才能進入瀏覽器或寫入流程。
 */
export function assertLiveOperationAllowed(
  templateMode: boolean,
  operation: LiveOperation,
): void {
  if (templateMode) {
    throw new Error(
      `campaign.templateMode: true 已封鎖${operationLabels[operation]}；` +
        "請先替換 config/series.yml 的範例資料、完成唯讀驗證，再將 templateMode 設為 false。",
    );
  }
}
