# Siftly

**AI Content Organiser for Notion**

[正體中文（臺灣）](README.md)

Let AI handle the first pass while you keep the final say over how your knowledge base is organised.

Siftly is a Chrome extension that helps you organise articles in Notion. It analyses page text, generates a title, summary, keywords and provisional topics in your selected language, and writes the results back to Notion. It is suitable for saved articles, reading notes, research material and social posts.

The interface uses Traditional Chinese (Taiwan). AI output supports Traditional Chinese and English, with Traditional Chinese as the default.

## Main features

- Analyse the current Notion page or process articles marked `待分析` (Pending Analysis) in batches.
- Generate AI titles, summaries, keywords and provisional topics for easier browsing, searching and filtering.
- Consolidate similar or duplicate provisional topics, with suggestions you can confirm, edit or discard.
- Use Google AI Studio or Vertex AI, choose a model, adjust content length and customise summary instructions.

`AI 暫定主題` contains provisional classification suggestions; `AI 主題` contains the final topics you have confirmed.

To use English, select it under `進階分析設定 → 輸出語言` (Advanced analysis settings → Output language) and click `儲存設定` (Save settings). Subsequent article analysis and topic organisation will use English. Each language has separate settings for output length and counts; English title and summary lengths are measured in words. Switching languages does not automatically translate existing content or confirmed topic names.

![AI-generated results in a Notion database](docs/images/notion-analysis-results.png)

## Requirements

- Google Chrome and the Notion web app.
- A Notion database containing your articles, and a Notion Integration Token with access to it.
- An API key for Google AI Studio or Vertex AI.

The extension works with one configured database at a time. Use it with the Notion web app in Chrome.

## Installation and setup

### Install

1. Download a version from GitHub **Releases**, or use **Code → Download ZIP**.
2. Extract the complete ZIP to a permanent folder.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.

Manually installed versions do not update automatically. After downloading a new version and replacing the files, return to that page and click **Reload**.

### Connect Notion and AI

1. Create a Notion Internal Integration and share the target database with it through `Add connections`.
2. Open the extension settings, enter the Notion Integration Token, click `載入可用資料庫` (Load available databases) and select the target database.
3. Choose an AI provider and model, enter its API key, then click `儲存設定` (Save settings).
4. Click `測試連線並準備欄位` (Test connections and prepare properties). The extension adds required properties. If `整理狀態` or its `待分析` option is missing, it asks first and creates or completes them only after you choose `新增並繼續` (Add and continue).

If the target database is missing from the list, check that it is shared with the Integration. You can also enter its URL or Data Source ID manually in advanced settings.

## Getting started

1. Use `準備待分析文章` (Prepare articles for analysis) in settings, select articles and click `加入待分析` (Add to pending analysis). Alternatively, mark articles as `待分析` in Notion.
2. Open the extension to analyse the current page, or scan the database and start a batch. You can stop, resume or retry failed items.
3. Use topic organisation to review the accumulated provisional topics and suggestions.
4. Confirm or edit suggestions before applying them to complete the final classification. Unwanted candidates can be discarded or skipped for later.

Preparing articles only changes the selected articles' organisation status and does not call AI. **Reanalysing a single page overwrites its existing AI analysis results and clears confirmed `AI 主題` topics.** You will need to confirm its classification again.

![AI-generated topic organisation suggestions](docs/images/topic-suggestions.png)

## Privacy

Article text and applied summary instructions are sent directly to your selected AI provider, and results are written back to Notion. Images, video, audio, files and PDFs are not used as analysis input. Siftly has no developer-operated intermediary server, analytics or telemetry.

AI providers handle data according to their plans and terms. Before using Google AI Studio's unpaid service, read the [privacy and data flow policy](PRIVACY.md).

## Development and licence

Conceived and maintained by Penny Hsieh, with implementation and documentation developed primarily with assistance from OpenAI Codex. Licensed under the [MIT License](LICENSE).
