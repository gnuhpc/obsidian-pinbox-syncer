# Deployment Instructions

This package contains everything needed to deploy the Obsidian Pinbox Syncer plugin to GitHub and submit it to the Obsidian community plugins marketplace.

## ⚠️ IMPORTANT: Plugin Already Built

**This package contains pre-built files (main.js).** You do NOT need Node.js or npm to deploy!

The plugin was already compiled on the original machine. You only need to push to GitHub and create releases.

## Prerequisites

Before running the deployment scripts, ensure you have:

1. **Git** configured with SSH key for GitHub
   - Test: `ssh -T git@github.com`
2. **GitHub CLI** (`gh`) installed and authenticated
   - Install: https://cli.github.com/
   - Login: `gh auth login`

**Optional (only if you want to rebuild):**
- Node.js (v16 or higher) and npm

## Quick Start

### Option 1: Full Automated Deployment (Recommended)

Run a single command to push, release, and prepare for Obsidian submission:

```bash
./release.sh
```

This script will:
- ✓ Automatically detect first deployment or update
- ✓ Verify pre-built files exist (main.js, manifest.json, styles.css)
- ✓ Sync with remote repository if exists (preserves history)
- ✓ Push code to GitHub
- ✓ Create a release with tag
- ✓ Upload release files
- ✓ Provide instructions for Obsidian submission

### Option 2: Step by Step

#### Step 1: Build and Deploy to GitHub

```bash
./release.sh
```

#### Step 2: Submit to Obsidian Community Plugins

After the deployment is complete, run:

```bash
./submit-obsidian.sh
```

This will:
- Fork the obsidian-releases repository
- Add your plugin to community-plugins.json
- Create a Pull Request
- Notify you when complete

## What These Scripts Do

### release.sh
- ✓ Automatically detects first deployment or update
- ✓ Verifies pre-built files exist (main.js, manifest.json, styles.css)
- ✓ Initializes git if needed
- ✓ Fetches and preserves remote history (doesn't overwrite new files)
- ✓ Commits new changes (if any)
- ✓ Pushes to GitHub (git@github.com:gnuhpc/obsidian-pinbox-syncer.git)
- ✓ Creates and pushes a version tag
- ✓ Creates a GitHub release with built files
- **NO compilation required** - uses pre-built files from the package

### submit-obsidian.sh
- Forks obsidianmd/obsidian-releases repository
- Clones your fork
- Adds plugin entry to community-plugins.json
- Creates a Pull Request for review
- Provides submission status

## Troubleshooting

### GitHub CLI Authentication

If you encounter authentication issues:

```bash
gh auth login
```

Follow the prompts to authenticate with GitHub.

### SSH Key Issues

If git push fails with SSH errors:

1. Check your SSH key is added to GitHub:
   ```bash
   ssh -T git@github.com
   ```

2. If needed, add your SSH key:
   ```bash
   cat ~/.ssh/id_rsa.pub
   ```
   Then add it to GitHub: Settings → SSH and GPG keys

### Missing Built Files

If release.sh complains about missing main.js:

1. This package should already contain main.js (pre-built)
2. Check if main.js exists:
   ```bash
   ls -lh main.js
   ```

3. If missing, you'll need to rebuild (requires Node.js):
   ```bash
   npm install
   npm run build
   ```

## Manual Steps (If Scripts Fail)

### Manual GitHub Push

```bash
# If not initialized yet
git init
git add .
git commit -m "Release version"
git branch -M main
git remote add origin git@github.com:gnuhpc/obsidian-pinbox-syncer.git

# If already initialized, just push
git fetch origin
git merge origin/main --no-edit  # Merge existing commits
git push -u origin main

# Create and push tag (replace VERSION with your version number)
VERSION=$(node -p "require('./manifest.json').version")
git tag -a $VERSION -m "Release $VERSION"
git push origin $VERSION

# Create release
gh release create $VERSION \
  --title "Pinbox Syncer $VERSION" \
  --notes "Release $VERSION" \
  main.js manifest.json styles.css
```

### Manual Obsidian Submission

1. Fork: https://github.com/obsidianmd/obsidian-releases
2. Clone your fork
3. Edit `community-plugins.json`, add:
   ```json
   {
     "id": "pinbox-syncer",
     "name": "Pinbox Syncer",
     "author": "gnuhpc",
     "description": "Sync your Pinbox bookmarks to Obsidian",
     "repo": "gnuhpc/obsidian-pinbox-syncer"
   }
   ```
4. Commit and push
5. Create PR on GitHub

## Post-Deployment

After successful deployment:

1. **Verify Release**: Check https://github.com/gnuhpc/obsidian-pinbox-syncer/releases
2. **Monitor PR**: Watch for comments on your Obsidian submission PR
3. **Respond to Feedback**: The Obsidian team may request changes
4. **Celebrate**: Once approved, your plugin will be available to all Obsidian users! 🎉

## Support

- Plugin Repository: https://github.com/gnuhpc/obsidian-pinbox-syncer
- GitHub Issues: https://github.com/gnuhpc/obsidian-pinbox-syncer/issues
- Obsidian Forum: https://forum.obsidian.md/

## Notes

- Review typically takes 1-2 weeks
- Ensure your plugin follows [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- Keep your repository public during the review process
