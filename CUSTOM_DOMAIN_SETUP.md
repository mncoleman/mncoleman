# Custom Domain Setup Guide for GitHub Pages

A complete guide for configuring a custom domain with your GitHub Pages site, including DNS setup and troubleshooting.

## Overview

This guide helps you connect a custom domain (like `yourdomain.com`) to your GitHub Pages site using any DNS provider.

**What You'll Need:**
- A custom domain registered with a domain registrar (Namecheap, GoDaddy, Cloudflare, etc.)
- A GitHub Pages repository
- Access to your domain's DNS settings

## Quick Setup Checklist

- [ ] Create CNAME file in your repository
- [ ] Configure custom domain in GitHub Pages settings
- [ ] Add DNS records at your domain registrar
- [ ] Wait for DNS propagation (15 min - 48 hours)
- [ ] Verify DNS records are correct
- [ ] Enable HTTPS in GitHub Pages
- [ ] Update Next.js config (if applicable)
- [ ] Test all domain variants

---

## Part 1: GitHub Repository Configuration

### Step 1: Create CNAME File

Create a file named `CNAME` in your `public/` directory (for Next.js) or root directory (for standard GitHub Pages):

```
yourdomain.com
```

**Important:**
- The file should contain ONLY your domain name (no `http://` or `https://`)
- Use your apex domain (`yourdomain.com`) OR subdomain (`www.yourdomain.com`), not both
- No trailing slash

### Step 2: Configure GitHub Pages Settings

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **Custom domain**, enter: `yourdomain.com`
4. Click **Save**
5. Wait for the DNS check to complete (shows green checkmark when ready)
6. ⚠️ **Do NOT enable "Enforce HTTPS" yet** - wait until DNS is fully configured

---

## Part 2: DNS Configuration

### DNS Records Overview

You need to configure DNS records at your domain registrar to point your domain to GitHub Pages.

#### For Apex Domain (yourdomain.com)

Add **4 A records** pointing to GitHub Pages servers:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | @ | 185.199.108.153 | Automatic |
| A Record | @ | 185.199.109.153 | Automatic |
| A Record | @ | 185.199.110.153 | Automatic |
| A Record | @ | 185.199.111.153 | Automatic |

#### For WWW Subdomain (www.yourdomain.com)

Add **1 CNAME record**:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME Record | www | yourusername.github.io. | Automatic |

**Replace `yourusername` with your actual GitHub username**

**Note:** Some DNS providers require a trailing dot (`.`) after `github.io.` - check your provider's documentation.

### Provider-Specific Instructions

#### Namecheap
1. Log in to [Namecheap](https://www.namecheap.com/myaccount/login/)
2. Go to **Domain List** → Click **Manage** next to your domain
3. Go to **Advanced DNS** tab
4. Delete any existing parking page records
5. Add the DNS records using **Add New Record**

#### GoDaddy
1. Log in to [GoDaddy](https://account.godaddy.com/)
2. Go to **My Products** → **DNS** next to your domain
3. Add the DNS records above
4. Delete any conflicting records (like forwarding)

#### Cloudflare
1. Log in to [Cloudflare](https://dash.cloudflare.com/)
2. Select your domain
3. Go to **DNS** tab
4. Add the DNS records
5. Set proxy status to "DNS only" (gray cloud) for A records

#### Other Providers
Look for "DNS Management," "DNS Settings," or "Advanced DNS" in your domain control panel.

---

## Part 3: Verification & Testing

### DNS Propagation Time

- **Minimum**: 15 minutes
- **Typical**: 1-2 hours
- **Maximum**: 48 hours

Check propagation status: [https://dnschecker.org](https://dnschecker.org)

### Verify DNS Records (Command Line)

```bash
# Check A records for apex domain
dig yourdomain.com +short
# Expected: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153

# Check CNAME record for www subdomain
dig www.yourdomain.com +short
# Expected: yourusername.github.io → then GitHub IPs

# Check from Google's DNS (alternative method)
dig @8.8.8.8 yourdomain.com +short
```

### Test in Browser

Once DNS propagates, test all variants:

- ✅ `http://yourdomain.com` (should work)
- ✅ `https://yourdomain.com` (should work after enabling HTTPS)
- ✅ `http://www.yourdomain.com` (should redirect to apex)
- ✅ `https://www.yourdomain.com` (should redirect to apex)

---

## Part 4: Enable HTTPS

**⚠️ Only after DNS check passes in GitHub Pages settings:**

1. Return to **Settings** → **Pages** in your repository
2. Check **Enforce HTTPS**
3. GitHub will automatically provision an SSL certificate via Let's Encrypt
4. Wait 5-10 minutes for certificate provisioning
5. Your site should now work with `https://`

---

## Part 5: Update Next.js Configuration (If Applicable)

If you're using Next.js and previously had a `basePath` set (for `/username` subpath deployment), update your `next.config.ts` or `next.config.js`:

### Before (Subpath Deployment)
```typescript
const nextConfig = {
  output: 'export',
  basePath: '/repository-name',
  assetPrefix: '/repository-name',
  images: { unoptimized: true },
  trailingSlash: true,
};
```

### After (Custom Domain)
```typescript
const nextConfig = {
  output: 'export',
  basePath: '',           // Remove basePath
  assetPrefix: '',        // Remove assetPrefix
  images: { unoptimized: true },
  trailingSlash: true,
};
```

### Rebuild and Deploy

```bash
npm run build
git add .
git commit -m "Configure custom domain"
git push origin main
```

---

## Troubleshooting

### "Domain's DNS record could not be retrieved" in GitHub

**Solutions:**
- Wait 15-60 minutes after configuring DNS
- Verify DNS records using `dig` command
- Check [dnschecker.org](https://dnschecker.org) for propagation status
- Ensure you removed any conflicting DNS records

### Site Shows 404 Error

**Solutions:**
- Verify `CNAME` file exists in your repository
- Check GitHub Actions build completed successfully
- Ensure the `gh-pages` branch (or main branch) contains the CNAME file
- Wait for DNS propagation to complete

### "Enforce HTTPS" is Grayed Out

**Solutions:**
- Wait for DNS check to pass (green checkmark) in GitHub Pages settings
- Ensure DNS records are correctly configured
- Try removing and re-adding the custom domain in GitHub settings

### Mixed Content Warnings (HTTP/HTTPS)

**Solutions:**
- Update all absolute URLs to use HTTPS
- Use relative URLs instead of absolute URLs
- Enable "Enforce HTTPS" in GitHub Pages settings

### DNS Not Propagating

**Solutions:**
- Check [dnschecker.org](https://dnschecker.org) for global propagation status
- Try different DNS servers: `dig @8.8.8.8 yourdomain.com`
- Flush your local DNS cache:
  - **macOS**: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
  - **Windows**: `ipconfig /flushdns`
  - **Linux**: `sudo systemd-resolve --flush-caches`

### WWW Subdomain Not Working

**Solutions:**
- Ensure CNAME record points to `yourusername.github.io` (not `yourdomain.com`)
- Check if trailing dot is required by your DNS provider
- Wait for DNS propagation

---

## DNS Quick Reference

Copy these values into your DNS provider (replace placeholders):

### A Records (Apex Domain)
```
Type: A Record | Host: @   | Value: 185.199.108.153 | TTL: Automatic
Type: A Record | Host: @   | Value: 185.199.109.153 | TTL: Automatic
Type: A Record | Host: @   | Value: 185.199.110.153 | TTL: Automatic
Type: A Record | Host: @   | Value: 185.199.111.153 | TTL: Automatic
```

### CNAME Record (WWW Subdomain)
```
Type: CNAME Record | Host: www | Value: yourusername.github.io. | TTL: Automatic
```

**Important:**
- Replace `yourusername` with your GitHub username
- Delete any existing parking page or forwarding records
- The trailing dot (`.`) after `github.io.` may be required depending on your DNS provider

---

## Timeline Expectations

| Phase | Duration | Status |
|-------|----------|--------|
| Configure GitHub + DNS | 5-10 minutes | ⚡ Immediate |
| DNS Propagation | 15 min - 48 hours | ⏳ Wait |
| GitHub DNS Verification | 1-5 minutes | ⚡ Automatic |
| SSL Certificate Provisioning | 5-10 minutes | ⚡ Automatic |
| **Total Setup Time** | **30 min - 48 hours** | 🎯 Usually < 2 hours |

---

## Additional Resources

- **GitHub Docs**: [Configuring a custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- **DNS Checker**: [dnschecker.org](https://dnschecker.org)
- **SSL Checker**: [SSL Labs](https://www.ssllabs.com/ssltest/)
- **Namecheap Guide**: [How to set up DNS for GitHub Pages](https://www.namecheap.com/support/knowledgebase/article.aspx/319/2237/how-can-i-set-up-an-a-address-record-for-my-domain/)

---

## Common DNS Provider Notes

### Namecheap
- Use **Advanced DNS** tab
- Host `@` means apex domain
- Usually requires trailing dot for CNAME values

### GoDaddy
- Use **DNS Management**
- Host `@` means apex domain
- Disable domain forwarding before adding records

### Cloudflare
- Set A records to "DNS only" (gray cloud icon)
- CNAME flattening may affect setup
- Use "DNS only" mode for GitHub Pages

### Google Domains
- Use **Custom resource records**
- Symbol `@` means apex domain
- Supports multiple A records easily

---

**Need Help?** Check GitHub Pages status at [www.githubstatus.com](https://www.githubstatus.com/) or consult your DNS provider's support documentation.
