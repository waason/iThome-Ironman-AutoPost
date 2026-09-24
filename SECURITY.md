# Security Policy

## 支援範圍

目前只維護 `main` 分支的最新版本。iThome 網頁或登入流程改版造成的功能失效，通常屬於相容性問題；若失效可能造成越權寫入、Secret 外洩或重複發布，則視為安全問題。

## 私下回報漏洞

請優先使用 GitHub Security Advisories 的 Private vulnerability reporting，不要用公開 Issue 揭露可利用細節、Cookie、storage state、Session、帳號資料或未發布文章。

若儲存庫尚未開啟 Private vulnerability reporting，請先建立一個不含敏感內容與攻擊細節的 Issue，請維護者提供私下聯絡方式。

回報時請包含：

- 受影響的 commit SHA。
- 可重現的最小步驟。
- 可能造成的影響。
- 已移除 Cookie、token、文章全文與個人資料的 log。
- 建議修復方式（若有）。

## Secret 與 Session

`storage-state.json` 與 `ITHOME_STORAGE_STATE_B64` 可代表登入身分，禁止：

- 提交到 Git。
- 貼到 Issue、Pull Request、Discussion 或 CI log。
- 上傳為 artifact。
- 放入 Markdown、截圖或範例設定。

若疑似洩漏，請立即在 iThome 登出所有工作階段、撤銷相關 Session、重新產生 storage state，並檢查 Git 歷史與 Actions log。只刪除目前版本的檔案不足以移除 Git 歷史中的 Secret。

## 安全預設

- 公開範本維持 `templateMode: true`。
- GitHub Actions 權限維持 `contents: read`。
- 第三方 Actions 固定完整 commit SHA。
- 排程發布需另外設定 `ITHOME_PUBLISH_ENABLED=true`。
- artifact 預設不上傳，除非明確設定 `ITHOME_UPLOAD_ARTIFACTS=true`。

安全閘門的設計理由記錄於 [ADR-0001](docs/adr/0001-gated-ithome-publication.md)。
