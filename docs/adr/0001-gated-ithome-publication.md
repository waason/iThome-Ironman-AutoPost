# ADR-0001：以多層閘門保護 iThome 自動發布

## 狀態

Accepted

## 背景

iThome 沒有由本專案依賴的官方發文 API。自動化必須持有登入 Session，透過網頁表單儲存草稿與發布文章。公開文章難以自動 rollback，而 Session、錯誤系列 ID、重複排程與網站 DOM 改版都可能造成不可逆的外部變更。

單一布林值不足以同時表達「這份公開範本是否已完成設定」、「某個系列是否已準備好」及「本次是否真的授權寫入」。

## 決策

採用彼此獨立的多層閘門：

1. `campaign.templateMode` 是範本總開關。預設為 `true`，會在瀏覽器、Secret 與網路操作前拒絕 Preview、Save draft 與 Publish。
2. 每個系列用 `ready` 控制是否進入當日計畫。
3. Save draft 與 Publish 分別要求精準確認字串 `SAVE_DRAFT`、`PUBLISH`。
4. GitHub 排程 Publish 另要求 Repository Variable `ITHOME_PUBLISH_ENABLED=true`。
5. Preview 封鎖所有可能改變狀態的 HTTP 請求；寫入流程只允許當前系列與草稿所需的精準端點。
6. 正式發布前必須完成儲存後讀回、公開頁驗證與重複發布檢查。
7. workflow 使用唯讀 GitHub 權限、固定 Action SHA，Session 只在 Runner 暫存目錄還原。
8. artifact 預設關閉，避免公開儲存庫洩漏未發布內容。

## 結果

優點：

- 公開範本無法直接寫入 iThome。
- 系列就緒、單次人工授權與排程授權不會互相取代。
- 失敗會在較早且可逆的階段停止。
- 補償排程可用公開證據避免重複發布。

代價：

- 初次設定與 UAT 步驟較多。
- iThome DOM 改版時仍需人工檢查與調整。
- Session 過期需要重新產生 storage state。
- 已公開文章仍需人工處理，無法由自動化安全 rollback。

## 其他方案

- 只靠 GitHub Secret：Secret 只解決憑證保存，無法阻止誤用範例設定。
- 只靠 `ready`：無法區分系列內容就緒與整份範本是否允許外部操作。
- 只跑一次每日排程：降低重複風險，但 GitHub Actions 延遲時缺少補償機制。
- 自動輸入帳號密碼：擴大憑證暴露面，因此不採用。

實際設定與 UAT 步驟以 [README](../../README.md) 為準。
