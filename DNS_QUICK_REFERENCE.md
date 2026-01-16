# DNS Quick Reference for mncoleman.com

## Namecheap DNS Settings

Copy these exact values into Namecheap Advanced DNS:

### A Records (Apex Domain)
```
Type: A Record | Host: @ | Value: 185.199.108.153 | TTL: Automatic
Type: A Record | Host: @ | Value: 185.199.109.153 | TTL: Automatic
Type: A Record | Host: @ | Value: 185.199.110.153 | TTL: Automatic
Type: A Record | Host: @ | Value: 185.199.111.153 | TTL: Automatic
```

### CNAME Record (WWW Subdomain)
```
Type: CNAME Record | Host: www | Value: slider003.github.io. | TTL: Automatic
```

**Important**:
- Delete any existing Namecheap parking page records first
- The dot (`.`) after `slider003.github.io.` may be required depending on Namecheap's interface

## GitHub Settings

1. Go to: https://github.com/slider003/matthew-coleman/settings/pages
2. Under "Custom domain": Enter `mncoleman.com`
3. Click "Save"
4. Wait for DNS check to pass (green checkmark)
5. Enable "Enforce HTTPS" (only after DNS check passes)

## Verification Commands

```bash
# Check if A records are set correctly
dig mncoleman.com +short
# Should return: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153

# Check if CNAME is set correctly
dig www.mncoleman.com +short
# Should return: slider003.github.io. → then GitHub IPs

# Check DNS propagation globally
# Visit: https://dnschecker.org/#A/mncoleman.com
```

## Timeline

1. **Now**: Configure Namecheap DNS + GitHub Settings (5 minutes)
2. **15-60 min**: DNS propagation (usually quick)
3. **5-10 min**: GitHub provisions SSL certificate
4. **After DNS check passes**: Enable "Enforce HTTPS"

## Next Deploy

After DNS is configured, push the changes:

```bash
git add .
git commit -m "Configure custom domain mncoleman.com"
git push origin main
```

The GitHub Actions workflow will automatically deploy with the CNAME file included.
