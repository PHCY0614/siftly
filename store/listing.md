# Chrome 線上應用程式商店上架文案

貼到商店後台的文字，內容以此為準。簡短說明需 132 字元以內，`manifest.json` 的 `description` 是英文副標，與此處的簡短說明各自獨立。

## English

**Summary**

AI drafts a title, summary, keywords and topics for each Notion article. You confirm the final categories.

**Description**

Saved plenty, organised little.

Articles keep piling up in Notion, but they rarely get organised. Over time the database becomes a long list nobody scrolls through, and finding one piece depends on remembering it.

Siftly reads the articles in your Notion database, writes a title, summary and keywords for each, then groups similar topics into categories for you to confirm. The AI only does the first pass; how things get sorted is up to you.

What it does

Writes a title, summary and keywords for each article
Analyse the current page, or a whole batch of pending articles at once
Merges similar or duplicate topics into categories you confirm, edit or discard
Interface and AI output in English or Traditional Chinese, set independently; switching languages doesn't translate existing content

About Chinese output: it is requested in Traditional characters, with Taiwan wording as the target. This is an instruction to the AI and can't guarantee every output follows it. Wording is currently tuned for Taiwan only. Names, quotations and people's own words in the source are kept as written. You can edit any result in Notion.

Made for people who save a lot

Filter and search your saved articles by topic instead of scrolling
Nothing is filed for you without your confirmation
Your Notion content is never deleted or renamed

Bring your own AI

Works with your own Google AI Studio or Vertex AI key
Choose the model, adjust lengths and customise how summaries are written

Your data stays yours

Works only when you click
Article text goes straight from your browser to the AI provider you chose, and results go back to your own Notion
Images, video and files are not analysed
No server in between, no tracking
Requires a Notion account and an AI API key; the settings page walks you through setup once

Siftly is an independent open-source tool, not affiliated with or endorsed by Notion or Google. All trademarks belong to their respective owners.

## 正體中文

**簡短說明**

讓 Notion 裡的文章不再只是一長串清單：AI 先整理出標題、摘要與主題，分類由你決定。

**完整說明**

存了很多，整理很少。

存了一堆資料進 Notion，時間一長，資料庫變成一大串看不完的清單，連找資訊都只能靠印象。

Siftly 會讀取 Notion 資料庫裡的文章，替每篇寫好標題、摘要與關鍵字，再把相近的主題收成分類，交給你確認。考慮到每人的分類偏好不同，AI 只做初步整理，最後怎麼分類交由使用者決定。

可以做什麼

為每篇文章寫標題、摘要與關鍵字
分析目前的頁面，或一次批次處理所有待分析的文章
把相近或重複的主題合併成分類，由你確認、修改或捨棄
介面與 AI 輸出可各自選擇正體中文或英文；切換語言不會翻譯既有內容

關於中文輸出的用語：會請 AI 使用正體字，並以臺灣慣用語為目標，這是對 AI 的要求，無法保證每次輸出都符合。正體中文在各地用詞有差異，目前僅針對臺灣用語調整提示詞。原文中的專有名詞、引文與人物原話會盡量保留原貌。所有結果都可以在 Notion 中自行修改。

為存很多的人設計

用主題篩選與搜尋，不必一直往下滑
沒有你的確認，不會擅自歸類
已經有初步分類構想時，可以手動加入，讓 AI 優先按照你的分類去做
不會刪除或改名你 Notion 裡既有的內容

用自己的 AI

使用你自己的 Google AI Studio 或 Vertex AI 金鑰
可選模型、調整字數、自訂摘要的寫法

資料只屬於你

只在你按下按鈕時運作
文章文字由你的瀏覽器直接送到你選的 AI 服務，結果寫回你自己的 Notion
圖片、影片與檔案不會被分析
沒有中間伺服器，也沒有追蹤
需要 Notion 帳號與 AI API 金鑰；第一次使用時，設定頁會帶你完成設定

Siftly 是獨立的開源工具，與 Notion、Google 沒有關聯，各名稱與商標屬於其所有人。

## Developer Dashboard 欄位（英文，貼到後台）

以下欄位只給審核人員看，不會公開顯示。權限理由與 `PRIVACY.md` 的 Permissions 表保持一致。

### Category

Productivity › Workflow & Planning

### Single purpose

Analyses the articles in the user's Notion database with the user's own AI provider, and writes the resulting title, summary, keywords and topics back to Notion.

### Permission justification

- `activeTab`: Reads the current tab's Notion URL when the user opens the popup or presses Analyse this page, to identify which page it is.
- `storage`: Keeps the user's settings, API keys (only until Chrome closes unless the user chooses to remember them), and processing progress.
- `alarms`: Continues a batch the user has already started. It never starts new analysis on its own.
- Host permission `https://api.notion.com/*`: Reads articles and writes results directly to the user's Notion workspace.
- Host permission `https://generativelanguage.googleapis.com/*`: Sends article text to Google AI Studio, if the user selected it, for analysis.
- Host permission `https://aiplatform.googleapis.com/*`: Sends article text to Vertex AI, if the user selected it, for analysis.

### Remote code

No. All code is bundled in the package; no remote scripts are loaded or evaluated.

### Data usage (privacy practices tab)

Check:
- Authentication information: the Notion token and AI API key, kept in the browser's extension storage on the user's computer and sent only to api.notion.com and the selected AI provider.
- Website content: the text of the user's Notion articles, sent to the AI provider the user selected.

Certify all three: data is not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

Privacy policy URL: https://github.com/PHCY0614/siftly/blob/main/PRIVACY.md

### Instructions for the reviewer

Provide a Notion Integration Token, a Google AI Studio API key, and a test database containing a few articles (shared with the Integration).

1. Right-click the icon > Options.
2. Paste the Notion token, load available databases, select the test database, Connect database.
3. Choose Google AI Studio, paste the API key, Save and test AI connection.
4. Click Create Siftly fields.
5. Open an article page in the test database in Notion, open the extension and press Analyse this page.
6. Check the page in Notion for the new title, summary, keywords and provisional topics.

<!-- 後台限 500 字元。Token 與金鑰填在後台「測試帳號」欄位，不寫在這段文字裡，也不要提交到 repo。 -->

## 截圖

目前沒有商店用截圖；需要 1280x800 或 640x400，至少 1 張。
