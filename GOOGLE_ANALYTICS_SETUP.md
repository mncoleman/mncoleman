# Google Analytics 4 Setup Guide

This guide walks you through setting up Google Analytics 4 (GA4) for your personal website.

## Overview

This site uses the official `@next/third-parties/google` package to integrate Google Analytics. The implementation:
- Loads GA4 only in production when configured
- Handles all script injection automatically
- Supports the latest GA4 features

## Step 1: Create a Google Analytics 4 Property

If you don't already have a GA4 property:

1. Go to [Google Analytics](https://analytics.google.com/)
2. Sign in with your Google account
3. Click **Admin** (gear icon in the bottom left)
4. Click **+ Create Property**
5. Enter property details:
   - **Property name**: "Matthew Coleman Blog" (or your preferred name)
   - **Reporting time zone**: Select your timezone
   - **Currency**: Select your currency
6. Click **Next** and complete the business information
7. Click **Create** and accept the terms

## Step 2: Set Up a Web Data Stream

1. After creating the property, select **Web** as your platform
2. Enter your website details:
   - **Website URL**: `https://slider003.github.io/matthew-coleman`
   - **Stream name**: "Production Site"
3. Click **Create stream**

## Step 3: Get Your Measurement ID

1. After creating the stream, you'll see the **Web stream details** page
2. Find the **Measurement ID** at the top - it looks like `G-XXXXXXXXXX`
3. Copy this ID (you'll need it for the next steps)

> **Note**: You do NOT need to copy the full JavaScript snippet. The Next.js package handles that automatically. You only need the Measurement ID.

## Step 4: Configure for Local Development (Optional)

To test analytics locally:

1. Create a `.env.local` file in your project root:
   ```bash
   cp .env.example .env.local
   ```

2. Add your Measurement ID:
   ```
   NEXT_PUBLIC_GA_ID=G-07DE26ZSVK
   ```

3. Restart your development server:
   ```bash
   npm run dev
   ```

> **Note**: Analytics events from localhost may not appear in GA reports. Use the Real-Time report to verify.

## Step 5: Configure for Production (Required)

To enable analytics on your deployed site:

1. Go to your GitHub repository
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add the secret:
   - **Name**: `NEXT_PUBLIC_GA_ID`
   - **Value**: `G-07DE26ZSVK` (your Measurement ID)
6. Click **Add secret**

## Step 6: Trigger a Rebuild

After adding the secret, trigger a new deployment:

1. Go to the **Actions** tab in your repository
2. Click **Deploy to GitHub Pages** workflow
3. Click **Run workflow** → **Run workflow**
4. Wait for the build to complete (2-3 minutes)

## Step 7: Verify Analytics is Working

### Method 1: Google Analytics Real-Time Report

1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property
3. Click **Reports** → **Real-time**
4. Open your website in another tab: `https://slider003.github.io/matthew-coleman`
5. You should see "1" active user in real-time

### Method 2: Browser Developer Tools

1. Open your deployed site
2. Open Developer Tools (F12 or Cmd+Opt+I)
3. Go to the **Network** tab
4. Filter by "google" or "gtag"
5. You should see requests to `googletagmanager.com`

### Method 3: Google Tag Assistant

1. Install the [Google Tag Assistant](https://tagassistant.google.com/) Chrome extension
2. Visit your website
3. The extension will show if GA4 is properly installed

## Troubleshooting

### Analytics not loading

1. **Check the secret is set correctly**:
   - Go to GitHub → Settings → Secrets → Actions
   - Verify `NEXT_PUBLIC_GA_ID` exists and has the correct value

2. **Trigger a fresh build**:
   - Secrets are only applied during build time
   - You must rebuild after adding/changing secrets

3. **Check browser console**:
   - Open Developer Tools → Console
   - Look for any errors related to gtag or analytics

### No data in reports

- **Wait 24-48 hours**: GA4 can take time to process data
- **Check Real-Time report**: This updates within seconds
- **Verify your ad blocker isn't blocking GA**: Many ad blockers block Google Analytics

### Wrong data or duplicate events

- Ensure you only have ONE GA4 implementation (the Next.js package handles everything)
- Don't add manual gtag scripts - the `@next/third-parties/google` package does this automatically

## Understanding the Implementation

The analytics integration is in `app/layout.tsx`:

```tsx
import { GoogleAnalytics } from '@next/third-parties/google';

// ... in the component:
{process.env.NEXT_PUBLIC_GA_ID && (
  <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
)}
```

This:
- Only renders when `NEXT_PUBLIC_GA_ID` environment variable is set
- Automatically injects the Google Analytics scripts
- Handles page view tracking for Next.js App Router

## Privacy Considerations

Google Analytics collects user data. Consider:

1. **Adding a Privacy Policy** page to your site
2. **Cookie consent**: GA4 uses cookies; some regions (EU/GDPR) require consent
3. **IP anonymization**: GA4 anonymizes IP addresses by default

## Quick Reference

| Item | Value |
|------|-------|
| Package | `@next/third-parties/google` |
| Environment Variable | `NEXT_PUBLIC_GA_ID` |
| Measurement ID Format | `G-XXXXXXXXXX` |
| GitHub Secret Name | `NEXT_PUBLIC_GA_ID` |
| Implementation File | `app/layout.tsx` |
