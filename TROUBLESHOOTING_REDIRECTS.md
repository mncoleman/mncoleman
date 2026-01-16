# Troubleshooting ERR_TOO_MANY_REDIRECTS

## Common Causes & Fixes

### 1. Namecheap Domain Forwarding/Redirect Rules

**This is the most common cause!**

Namecheap often has default forwarding rules that conflict with GitHub Pages.

**Fix:**
1. Log into Namecheap
2. Go to Domain List → Manage `mncoleman.com`
3. Click **Advanced DNS** tab
4. Scroll down to **Domain** section (or **URL Redirect Record** section)
5. **DELETE** any redirect/forwarding rules for:
   - `@` (apex domain)
   - `www`
   - Any URL forwarding rules
6. Save changes

**What to look for:**
- URL Redirect Record entries
- Forwarding to www
- HTTPS redirects
- Any 301/302 redirect rules

### 2. DNS Records Not Propagated Yet

If you just configured DNS, wait 15-30 minutes.

**Check DNS status:**
```bash
# Check if DNS has propagated
dig mncoleman.com +short

# Should show:
# 185.199.108.153
# 185.199.109.153
# 185.199.110.153
# 185.199.111.153

# Check www subdomain
dig www.mncoleman.com +short

# Should show:
# slider003.github.io.
# (then GitHub IPs)
```

**Online checker:**
- https://dnschecker.org/#A/mncoleman.com
- Should show green checkmarks globally

### 3. GitHub Pages Configuration Issue

**Verify GitHub Settings:**
1. Go to: https://github.com/slider003/matthew-coleman/settings/pages
2. Under "Custom domain" should show: `mncoleman.com` (no www, no https://)
3. Should show green checkmark: "DNS check successful"
4. **IMPORTANT**: "Enforce HTTPS" should be **UNCHECKED** until DNS check passes

**If DNS check fails:**
- Remove the custom domain
- Wait 5 minutes
- Re-add it
- Wait for DNS check to pass

### 4. Wrong CNAME Record in Namecheap

**Verify your CNAME record:**

In Namecheap Advanced DNS, the www CNAME should be:
```
Type: CNAME Record
Host: www
Value: slider003.github.io.
TTL: Automatic
```

**Common mistakes:**
- ❌ Value: `mncoleman.com` (wrong - creates loop!)
- ❌ Value: `https://slider003.github.io` (wrong - no protocol)
- ✅ Value: `slider003.github.io.` (correct)

### 5. Multiple Deployments or Caches

**Clear all caches:**
```bash
# macOS
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Windows
ipconfig /flushdns

# Linux
sudo systemd-resolve --flush-caches
```

**Clear browser cache:**
- Chrome: Ctrl+Shift+Delete → Clear cached images and files
- Or try incognito/private mode
- Or try a different browser

### 6. GitHub Actions Deployment

Make sure the latest deployment includes the CNAME file.

**Check:**
1. Go to: https://github.com/slider003/matthew-coleman/actions
2. Check latest workflow run completed successfully
3. Download the artifact and verify `CNAME` file exists in the root

**Redeploy if needed:**
```bash
git add .
git commit -m "Fix custom domain configuration" --allow-empty
git push origin main
```

## Step-by-Step Diagnostic Process

Run these checks in order:

### Step 1: Check Namecheap for Redirects
- [ ] No URL Redirect Records exist
- [ ] No Domain Forwarding configured
- [ ] Only A records and CNAME exist

### Step 2: Verify DNS Records
```bash
dig mncoleman.com +short
# Should return GitHub IPs

dig www.mncoleman.com +short
# Should return slider003.github.io → GitHub IPs
```

### Step 3: Check GitHub Pages
- [ ] Custom domain is `mncoleman.com` (no www)
- [ ] DNS check shows green checkmark
- [ ] "Enforce HTTPS" is OFF (until DNS works)

### Step 4: Clear All Caches
- [ ] DNS cache flushed
- [ ] Browser cache cleared
- [ ] Tested in incognito mode

### Step 5: Wait for Propagation
- [ ] Check https://dnschecker.org
- [ ] Green checkmarks globally

### Step 6: Test URLs
```bash
# These should all work without redirects:
curl -I http://mncoleman.com
curl -I https://mncoleman.com
curl -I http://www.mncoleman.com
curl -I https://www.mncoleman.com
```

Look for `HTTP/1.1 200 OK` or `301 Moved Permanently` (single redirect is OK)
If you see multiple `301` or `302` responses, that's the loop.

## Quick Fix Checklist

1. **Delete Namecheap forwarding rules** ← START HERE
2. Verify DNS records are correct (4 A records + 1 CNAME)
3. Remove custom domain from GitHub, wait 5 min, re-add it
4. Clear DNS cache and browser cache
5. Wait 30 minutes for DNS propagation
6. Try in incognito mode

## Still Not Working?

**Temporary workaround:**

Use the GitHub Pages URL while DNS settles:
- https://slider003.github.io/matthew-coleman/

**Check deployment:**
```bash
# See what's actually deployed
curl -I https://slider003.github.io/matthew-coleman/
```

If the GitHub Pages URL works but custom domain doesn't, it's 100% a DNS/redirect configuration issue in Namecheap.

## Need More Help?

Share these outputs:
```bash
dig mncoleman.com +short
dig www.mncoleman.com +short
curl -I http://mncoleman.com 2>&1 | head -20
```

And screenshots of:
- Namecheap Advanced DNS page
- GitHub Settings → Pages custom domain section
