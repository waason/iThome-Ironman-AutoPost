# 我把 iThome 鐵人賽發文流程做成開源範本了

連續寫三十天的文章，真正容易出錯的地方不一定是內容，而是每天都要記得在正確時間，把正確系列、正確 Day、正確標題與完整 Markdown 放到正確的草稿裡。

我曾經因為漏掉發文而中斷連載，所以這次把自己的流程整理成一個開源專案：[iThome Ironman AutoPost](https://github.com/eric861129/iThome-Ironman-AutoPost)。

它使用 TypeScript、Playwright 與 GitHub Actions，負責四件事：

1. 先檢查三十天的 Markdown 是否齊全，檔名 Day、H1 Day、標題與正文是否一致。
2. 在不開瀏覽器的情況下產生當日計畫，讓我先確認系列、Day、文章與草稿入口。
3. 提供「只填入、不儲存、不發表」的 Day 1 預覽。
4. 通過人工 UAT 後，才開放儲存草稿與正式發布。

我沒有把它做成下載後就會立刻發文的工具。公開版本預設開啟 `templateMode`，會在讀取登入 Session 或啟動瀏覽器前擋住所有真實操作。使用者必須替換虛構 ID、系列題目、活動日期與文章資料夾，完成驗證和計畫確認後，才能主動解除這層保護。

正式發布也不是只按一次按鈕。程式會先儲存草稿、重新讀回標題與 Markdown，再驗證公開頁；補償排程則用系列 RSS 和個人文章列表確認文章是否已經存在，降低排程重跑造成重複發文的風險。

## 圖片怎麼處理？

Markdown 內的本機相對路徑無法直接讓 iThome 讀取，所以專案會要求圖片使用公開的 HTTPS 網址。

圖片部分可以搭配 [Cloud-Assets-Template](https://github.com/eric861129/Cloud-Assets-Template)，把圖片轉成 WebP 並取得 jsDelivr CDN 網址。撰寫與預覽期間可以先用 `@main`，文章正式發布前再改成固定 Git tag 或 commit SHA，避免未來更新圖片時，舊文章內容也跟著改變。

## 自動化不是把責任交出去

這套工具能降低忘記發文、貼錯系列與重複發布的機率，但它仍然依賴 iThome 網頁介面，不是官方 API。網站改版、Session 過期、GitHub Actions 排程延遲，都可能需要人工介入。

所以我保留了幾個原則：

- 先驗證，再預覽。
- 先儲存並讀回，再發布。
- 先手動測一個系列，再開啟每日排程。
- 公開文章無法可靠 rollback，出現疑問就停止。

如果你也想把鐵人賽文章事先準備好，再用一套可檢查、可停止、可追蹤的方式降低每天重複操作的負擔，可以從這個範本開始。不過請先讀完 README 的安全設定與 UAT，再關掉 `templateMode`。

專案採用 MIT License，歡迎提出 Issue 或 Pull Request。
