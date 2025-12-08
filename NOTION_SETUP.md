# Notion CMS Setup Guide

To use Notion as your CMS, you need to create an integration and a database in Notion, and then provide the credentials to your website.

## Step 1: Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Click **New integration**.
3. Name it (e.g., "Personal Website CMS").
4. Select the workspace where your blog database will live.
5. Click **Submit**.
6. **Copy the "Internal Integration Secret"**. This is your `NOTION_TOKEN`.

## Step 2: Create the Blog Database

1. In your Notion workspace, create a new Page.
2. Type `/table` and select **Table view** (Database).
3. Click **New database**.
4. Set up the following properties (columns):
   - **Name** (Title property): Rename to `Title`.
   - **Slug** (Text): The URL-friendly version of the title (e.g., `my-first-post`).
   - **Date** (Date): The publication date.
   - **Tags** (Multi-select): For categories.
   - **Published** (Checkbox): To control visibility.
   - **Excerpt** (Text): A short summary.
   - **Author** (Text): Your name.
5. **Add a sample post**: Fill in a row with dummy data. Open the page (click "Open" on the row) and add some content in the body.

## Step 3: Connect Integration to Database

1. Go to your new Database page.
2. Click the **...** (three dots) menu in the top-right corner of the page.
3. Scroll down to **Connections** (or "Connect to").
4. Search for and select the integration you created in Step 1 ("Personal Website CMS").
5. Confirm the connection.

## Step 4: Get the Database ID

1. Open your Database as a full page (if it's inline, click the "⤢" expand button).
2. Look at the URL in your browser address bar. It will look like this:
   `https://www.notion.so/myworkspace/a8aec43384f447ed84390e8e42c2e089?v=...`
3. The **Database ID** is the 32-character string between the workspace name (or `/`) and the `?`.
   In the example above, it is `a8aec43384f447ed84390e8e42c2e089`.

## Step 5: Configure Your Website

You need to provide these credentials to your application.

1. Create a file named `.env.local` in the root folder (if it doesn't exist already).
2. Add the following lines:

```bash
NOTION_TOKEN=secret_your_integration_token_here
NOTION_DATABASE_ID=your_database_id_here
```

> [!IMPORTANT]
> **Do not commit `.env.local` to GitHub!** It contains secrets.

## Step 6: GitHub Repository Secrets (For Deployment)

For your GitHub Pages site to build with these credentials:

1. Go to your GitHub repository settings.
2. Navigate to **Secrets and variables** > **Actions**.
3. Click **New repository secret**.
4. Add `NOTION_TOKEN` with your secret value.
5. Add `NOTION_DATABASE_ID` with your database ID.
6. (Optional) Add `NEXT_PUBLIC_GA_ID` if you are using Google Analytics.
