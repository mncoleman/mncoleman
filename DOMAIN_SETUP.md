# Custom Domain Setup Guide

This guide walks through setting up `mncoleman.com` with GitHub Pages and Namecheap.

## Overview

- **Domain**: mncoleman.com
- **Hosting**: GitHub Pages
- **DNS Provider**: Namecheap
- **Repository**: slider003/matthew-coleman

## Part 1: GitHub Repository Configuration

### 1. CNAME File

✅ **Already completed** - `public/CNAME` file created with `mncoleman.com`

This file tells GitHub Pages which custom domain to use.

### 2. GitHub Repository Settings

1. Go to your repository: https://github.com/slider003/matthew-coleman
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under **Custom domain**, enter: `mncoleman.com`
4. Click **Save**
5. Wait for DNS check to complete (may take a few minutes)
6. Once verified, check **Enforce HTTPS** (requires DNS to be configured first)

## Part 2: Namecheap DNS Configuration

### DNS Records to Add

Log into Namecheap and configure the following DNS records for `mncoleman.com`:

#### A Records (for apex domain)

Add **4 A records** pointing to GitHub Pages IP addresses:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | @ | 185.199.108.153 | Automatic |
| A Record | @ | 185.199.109.153 | Automatic |
| A Record | @ | 185.199.110.153 | Automatic |
| A Record | @ | 185.199.111.153 | Automatic |

#### CNAME Record (for www subdomain)

| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME Record | www | slider003.github.io. | Automatic |

**Note**: The trailing dot (`.`) after `slider003.github.io.` is important in some DNS systems.

### How to Configure in Namecheap

1. Log into Namecheap: https://www.namecheap.com/myaccount/login/
2. Go to **Domain List**
3. Click **Manage** next to `mncoleman.com`
4. Go to **Advanced DNS** tab
5. Remove any existing A records or CNAME records for `@` and `www`
6. Add the records listed above using **Add New Record** button
7. Save all changes

### DNS Propagation

- DNS changes can take **up to 48 hours** to propagate globally
- Usually happens within **15 minutes to 2 hours**
- Check propagation status: https://dnschecker.org/#A/mncoleman.com

## Part 3: Verification & Testing

### 1. Check DNS Records

After configuring Namecheap, verify your DNS records are correct:

```bash
# Check A records (should show GitHub's IPs)
dig mncoleman.com +short

# Check CNAME record for www
dig www.mncoleman.com +short
```

Expected results:
- `mncoleman.com` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- `www.mncoleman.com` → slider003.github.io → GitHub IPs

### 2. Test in Browser

Once DNS propagates:
- http://mncoleman.com (should redirect to https://mncoleman.com)
- https://mncoleman.com (should load your site)
- http://www.mncoleman.com (should redirect to https://mncoleman.com)
- https://www.mncoleman.com (should redirect to https://mncoleman.com)

### 3. Enable HTTPS

After DNS is verified:
1. Return to GitHub **Settings** → **Pages**
2. Check **Enforce HTTPS**
3. GitHub will automatically provision an SSL certificate via Let's Encrypt

## Part 4: Update Next.js Configuration

### Update Base Path (Important!)

Since you're moving from `/matthew-coleman` subpath to root domain, update `next.config.ts`:

```typescript
const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '', // Remove the /matthew-coleman base path
  assetPrefix: '', // Remove the asset prefix
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};
```

### Update Environment Variables

If using absolute URLs anywhere, update them to use the new domain:
- Old: `https://slider003.github.io/matthew-coleman/`
- New: `https://mncoleman.com/`

### Rebuild and Deploy

After updating the config:

```bash
npm run build
git add .
git commit -m "Configure custom domain mncoleman.com"
git push origin main
```

## Troubleshooting

### "Domain's DNS record could not be retrieved" in GitHub

- Wait 15-30 minutes after configuring Namecheap DNS
- Verify DNS records using `dig` commands above
- Clear your browser cache

### Site shows 404

- Ensure `public/CNAME` file exists and contains `mncoleman.com`
- Verify GitHub Actions build completed successfully
- Check that `gh-pages` branch has the CNAME file

### Mixed content warnings

- Ensure all resources use HTTPS or relative URLs
- Enable "Enforce HTTPS" in GitHub Pages settings

### DNS not propagating

- Use https://dnschecker.org to check propagation status
- Try different DNS servers: `dig @8.8.8.8 mncoleman.com`
- Flush your local DNS cache:
  - macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
  - Windows: `ipconfig /flushdns`
  - Linux: `sudo systemd-resolve --flush-caches`

## Summary Checklist

- [ ] CNAME file added to repository (`public/CNAME`)
- [ ] Custom domain configured in GitHub Settings → Pages
- [ ] 4 A records added in Namecheap DNS for apex domain
- [ ] 1 CNAME record added in Namecheap DNS for www subdomain
- [ ] DNS propagation complete (check with dnschecker.org)
- [ ] GitHub Pages DNS check passes
- [ ] HTTPS enforced in GitHub Pages settings
- [ ] Next.js `basePath` removed from config
- [ ] Site rebuilt and deployed
- [ ] Both `mncoleman.com` and `www.mncoleman.com` work
- [ ] HTTPS works on both domains

## Timeline

- **Immediate**: Configure GitHub + Namecheap
- **15 min - 2 hours**: DNS propagation (usually)
- **5-10 minutes**: GitHub SSL certificate provisioning
- **Total**: ~30 minutes to 3 hours for full setup

## Additional Resources

- [GitHub Pages Custom Domain Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [Namecheap DNS Setup Guide](https://www.namecheap.com/support/knowledgebase/article.aspx/319/2237/how-can-i-set-up-an-a-address-record-for-my-domain/)
- [DNS Checker Tool](https://dnschecker.org)
