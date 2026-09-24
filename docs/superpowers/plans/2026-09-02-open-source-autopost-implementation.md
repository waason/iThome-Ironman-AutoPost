# iThome Ironman AutoPost 開源版實作計畫

## 依據

本計畫只實作 [`2026-09-02-open-source-autopost-design.md`](../specs/2026-09-02-open-source-autopost-design.md) 已核准的範圍。設計規格是需求與邊界的唯一來源；本文件只管理實作順序與驗證。

## 完成契約

- 新 Repo 只包含通用發布器、Day01～Day30 最小文章資料及公開文件。
- `templateMode: true` 在任何瀏覽器啟動與 iThome 網路操作前阻擋 preview、save-draft、publish。
- GitHub Actions 沒有個人日期、固定系列 key 或真實識別值。
- README、通用 ADR、獨立專案介紹文章、SECURITY 與 MIT License 完整且互不重複。
- 本機測試、typecheck、文章與設定驗證、敏感資料掃描及完整 repository security scan 通過。
- 變更以可審查的 Conventional Commits 推送到公開 Repo，遠端 CI 通過。

## 實作順序

### 1. 建立可執行基線

移植下列通用檔案，不複製三個個人文章資料夾或任何 output：

- `src/`
- `tests/`
- `.editorconfig`
- `.gitattributes`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `tsconfig.json`

先調整 package 名稱為 `ithome-ironman-autopost`，保留 `private: true`。執行 `npm ci`、unit tests 與 typecheck，確認來源基線可在新 Repo 執行。

### 2. 以 TDD 加入 templateMode

依序完成垂直切片：

1. 在 config 公開型別與 loader 測試中要求 `campaign.templateMode` 必須是 boolean，先取得 red。
2. 實作設定解析，取得 green。
3. 在 preview 的 CLI／計畫 seam 加入測試，證明 `templateMode: true` 在 Playwright callback 前失敗。
4. 在 save-draft 與 publish 的 CLI／自動化 seam 加入測試，證明兩者在 Playwright callback 前失敗。
5. 實作一個共用、可直接測試的 template mode guard，避免三個入口各自出現不同規則。
6. 跑相關測試與完整 `npm run check`。

### 3. 建立安全範例設定與最小文章

- 建立 `config/series.yml`，包含一個 `sample-series`、30 天、`ready: true`、`templateMode: true`、2099-09-01 與清楚標示的虛構正整數識別值。
- 建立 `articles/sample-series/Day01.md` 到 `Day30.md`。
- 每篇只有 `# Day N｜文章標題` 與 `Day N 文章`。
- 更新 config、article、publication plan 測試，移除個人系列數量、名稱、ID 與日期假設。
- 執行 `npm run validate:all` 與 plan-only 命令，確認 30 天資料可用且不啟動瀏覽器。

### 4. 通用化 GitHub Actions

移植並改寫四個 workflow：

- `validate.yml`
- `preview.yml`
- `save-draft.yml`
- `publish.yml`

調整內容：

- 移除個人系列 choice 與個人日期 default。
- `series` 改成文字輸入，預設 `all`。
- 在安裝 Chromium與還原 Secret 前執行 plan／template mode preflight。
- 保留 `SAVE_DRAFT`、`PUBLISH`、Environment、`ITHOME_PUBLISH_ENABLED`、concurrency、06:07 與 06:22 排程。
- 保留第三方 Actions 的完整 commit SHA 與 `contents: read`。
- 更新 workflow 測試，證明通用輸入、安全順序、排程與閘門都存在。

### 5. 建立公開文件

- 以新讀者為中心重寫 `README.md`，涵蓋功能、限制、快速開始、設定、plan、preview、save-draft、publish、GitHub Environments、圖片網址、排程、停用與故障處理。
- 通用化 `docs/adr/0001-gated-ithome-publication.md`，只保留安全閘門與防重複決策。
- 建立 `docs/project-introduction-article.md`，作為獨立文章，不重複 README 的完整操作手冊。
- 建立 `SECURITY.md`，說明漏洞回報與 Session 洩漏處理。
- 建立 MIT `LICENSE`，著作權標示為 `Copyright (c) 2026 eric861129`。
- README 介紹 [Cloud-Assets-Template](https://github.com/eric861129/Cloud-Assets-Template)，開發預覽可用 branch URL，正式文章建議使用 Git tag 或 commit SHA。

### 6. 清除個人耦合與執行產物

掃描所有追蹤檔案，拒絕下列內容：

- 原始三個文章資料夾與文章標題。
- 真實作者、系列及草稿識別值。
- 個人活動日期。
- storage state、Cookie、token、Secret 值、receipt、screenshot、log 與 output。
- workflows 中的個人系列固定選項。

確認 `.gitignore` 能排除所有本機與 CI 執行產物。

### 7. 完整驗證與安全掃描

依序執行：

1. `npm ci`
2. `npm run check`
3. `npm run validate:all`
4. plan-only smoke test
5. `git diff --check`
6. 追蹤檔案敏感資料與個人耦合掃描
7. 標準 repository security scan

任何高風險或重大安全發現先修正並重新驗證。此階段不使用真實 Session，也不執行 preview、save-draft 或 publish。

### 8. 提交、推送與遠端驗證

預計提交邊界：

1. `feat: add safe open-source autopost template`
2. `docs: add public setup and security guidance`

每次提交前檢查 staged diff、敏感內容與測試證據。推送 `main` 到 `eric861129/iThome-Ironman-AutoPost` 後等待遠端 Validate workflow，核對遠端 SHA、CI 結果與公開 Repo 檔案清單。

## 停止條件

當完成契約全部成立、公開 Repo 的 `main` 與本機 SHA 相同、遠端 CI 通過，立即停止。npm 發布、初始化精靈、更多文章內容、額外文件與正式 iThome UAT 不納入本次範圍。
