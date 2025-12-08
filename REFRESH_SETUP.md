# Setup: Manual Refresh Button for Notion Posts

To enable the "Refresh Posts" button in your Admin Dashboard, you need to create a GitHub Personal Access Token.

## Steps:

### 1. Create GitHub Personal Access Token

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Name it: `matthew-coleman-rebuild-trigger`
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click **Generate token**
6. **COPY THE TOKEN** immediately (you won't see it again!)

### 2. Add Token to GitHub Secrets

1. Go to your repository: `https://github.com/slider003/matthew-coleman`
2. Settings → Secrets and variables → Actions
3. Click **New repository secret**
4. Name: `GITHUB_TOKEN`
5. Value: Paste your token
6. Click **Add secret**

### 3. Update Serverless Configuration

Since GitHub Pages doesn't support API routes, the refresh button will only work when:
- Running locally (`npm run dev`)
- Deployed to a platform with serverless support (Vercel, Netlify)

**For GitHub Pages**, you can still use:
- ✅ **Automatic daily rebuilds** (already configured)
- ✅ **Manual trigger in GitHub Actions tab**:
  1. Go to Actions tab
  2. Click "Deploy to GitHub Pages"
  3. Click "Run workflow"

The button is ready in the code - it will work if you ever move to Vercel/Netlify in the future!
