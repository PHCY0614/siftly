# Privacy Policy

Last updated: October 10, 2026

Traditional Chinese (Taiwan): [`PRIVACY.zh-TW.md`](PRIVACY.zh-TW.md)

**Siftly** (AI Content Organiser for Notion, "the extension") is developed and maintained by Penny Hsieh. This policy applies to versions distributed through the Chrome Web Store or this project's GitHub repository.

The extension reads the text of articles in your Notion database only when you ask it to, sends it to **the AI provider you chose** for analysis, and writes the results back to **your own** Notion. It has no server of its own, and no analytics or tracking.

## What it reads

Using the Notion Integration Token you provide, the extension accesses the database you selected:

- **The plain text of articles**, for AI analysis.
- Page ID, URL, title and the organisation status (`Processing Status`), to find pending articles and show processing history.
- The database schema, to check required properties and to list the topic options (`AI Topics`) you have already confirmed.
- During topic organising, only three page properties: `Processing Status`, `AI Provisional Topics` and `AI Topics`.
- When you click "Load available databases", the name and ID of each authorised database, to build the picker. The list stays in that page's memory and is not saved.
- "Prepare articles to analyse" reads the start of each unprocessed article to show a preview of up to 300 characters on the settings page. The preview is not saved and is not sent to an AI provider.
- When you open the popup or click "Analyse this page", it reads only the current tab's Notion URL to identify the page. It does not read other tabs or your browsing history.

Images, video, audio, files and PDFs are not analysed and are not sent to the AI provider.

Column names follow the interface language in use when Siftly first created them. A database set up in the Chinese interface uses `整理狀態`, `AI 暫定主題` and `AI 主題` for `Processing Status`, `AI Provisional Topics` and `AI Topics`.

## Where data goes

- **Notion**: your Chrome connects directly to `api.notion.com` to read and write. The token is sent in a header, never in the URL.
- **The AI provider you chose** (Google AI Studio or Vertex AI): for analysis it receives the article text, the built-in analysis instructions, the output format, and any summary instructions and excluded-name list you set. A provider you did not select receives nothing. A connection test sends only the key and a fixed test phrase, not your articles.
- **Topic organising**: only topic names are sent (plus your confirmed topic names for reference), never article text, titles or summaries.
- **Write-back to Notion**: results are written to your database. Existing properties and options are never deleted or renamed, and the original title and body of each article are never changed. Missing properties and status options are added only when you click "Create Siftly fields" on the settings page.
- **Nowhere else**: no intermediary server, analytics, tracking or advertising, and your data is never sold or shared.

### Google AI Studio unpaid service

Under Google's Gemini API Additional Terms of Service, content submitted to the unpaid service may be used by Google to improve its products and machine-learning technology, and may be reviewed by people. **Do not use the unpaid service to analyse sensitive, confidential or personal information.** Paid services may be handled differently; see Google's [current terms](https://ai.google.dev/gemini-api/terms).

## What stays on your computer

This data is kept in Chrome's extension storage on your computer. The developer cannot access it.

- **Keys**: the Notion token and each AI key have a "remember" option. By default they are kept only until Chrome closes; they are stored long-term only if you tick the option. Chrome's local storage is not an encrypted vault, so avoid it on a shared computer.
- **Settings**: your chosen database, AI provider and model, summary instructions, and language and output settings.
- **Progress**: the pending list, batch queue, and recent results and errors.
- **Topic dictionary**: your confirmed topics, aliases, colours, discarded provisional topics, and a record used to undo the last apply. Exporting the dictionary excludes keys and article content.
- **Failure diagnostics**: when AI output fails, only the provider, model, reason and numeric counts are recorded, never the raw AI response.

You can clear your keys from the settings page at any time. Removing the extension makes Chrome delete all of the above.

## Permissions

| Permission | Why it is needed |
|---|---|
| `activeTab` | Reads the current tab's Notion URL to identify the page you are viewing |
| `storage` | Keeps the settings, keys and progress listed above |
| `alarms` | Continues a batch you have already started; it never starts new analysis on its own |
| `api.notion.com` | Reads articles and writes back results |
| `generativelanguage.googleapis.com` | Sends articles to Google AI Studio for analysis |
| `aiplatform.googleapis.com` | Sends articles to Vertex AI for analysis |

## What it does not do

- It does not collect browsing history or run code on any web page.
- It does not put keys in URLs, logs or Notion.
- It does not scan your database on its own: scanning, analysis and topic organising start only when you click.

## User data commitment

The use of information received from Google APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements:

1. Data is used only for the extension's single purpose: analysing your Notion articles, organising topics and writing the results back to your Notion.
2. User data is not sold.
3. User data is not used or transferred for any purpose unrelated to that, including personalised advertising.
4. User data is not used or transferred to determine creditworthiness or for lending.
5. The developer cannot access your data: it never passes through a developer server, and the developer never holds your keys.

## What you can do

- Share only the databases you need with the Notion Integration, and revoke it any time at [Notion Integrations](https://www.notion.so/profile/integrations).
- Manage API keys and quotas in Google Cloud or AI Studio.
- Remove the extension at `chrome://extensions`. Content already written to Notion is yours and stays.

## Contact

For privacy or data-handling questions, use the project's [GitHub Issues](https://github.com/PHCY0614/siftly/issues). Do not post API keys, Notion tokens, article content or other private information in a public issue.
