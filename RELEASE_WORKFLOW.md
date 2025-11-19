# Release Workflow

This document describes the standard workflow for releasing updates to the Obsidian Pinbox Syncer plugin.

## Overview

The release process is designed to work across two machines:
- **Development Machine**: Where you write code and build the plugin (cannot push to GitHub)
- **Deployment Machine**: Where you push to GitHub and create releases (has git push access)

## Quick Reference

```bash
# On Development Machine
./prepare-release.sh patch   # Increment patch version (1.0.1 -> 1.0.2), build and create package
./prepare-release.sh minor   # Increment minor version (1.0.1 -> 1.1.0), build and create package
./prepare-release.sh major   # Increment major version (1.0.1 -> 2.0.0), build and create package
# OR
./prepare-release.sh         # Build and create package (keep current version)

# Transfer package to Deployment Machine
scp obsidian-pinbox-syncer-release-*.tar.gz user@host:~/

# On Deployment Machine
tar -xzf obsidian-pinbox-syncer-release-*.tar.gz
cd obsidian-pinbox-syncer
./release.sh                 # Push to GitHub and create release
```

## Detailed Steps

### Step 1: Development (On Development Machine)

#### 1.1 Make Your Code Changes
- Edit source files in `src/`
- Update documentation if needed
- Test your changes locally

#### 1.2 Build and Create Release Package

Choose the appropriate command based on your changes:

**For bug fixes and small improvements (patch):**
```bash
./prepare-release.sh patch
```
This increments: 1.0.1 → 1.0.2

**For new features (minor):**
```bash
./prepare-release.sh minor
```
This increments: 1.0.1 → 1.1.0

**For breaking changes (major):**
```bash
./prepare-release.sh major
```
This increments: 1.0.1 → 2.0.0

**To rebuild without changing version:**
```bash
./prepare-release.sh
```

All these commands will:
- ✓ Automatically update both `package.json` and `manifest.json` (if version changes)
- ✓ Run `npm install` to ensure dependencies are up to date
- ✓ Run `npm run build` to compile the plugin
- ✓ Create the release package

**Version Numbering Guidelines (Semantic Versioning):**
- **Patch** (1.0.0 → 1.0.1): Bug fixes, small improvements
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes

**Output:**
- `obsidian-pinbox-syncer-release-{VERSION}.tar.gz` (the release package)
- `obsidian-pinbox-syncer-release-{VERSION}.tar.gz.sha256` (checksum file)

**What's included in the package:**
- Source code (`src/`, `*.ts`, `*.mjs`)
- Built files (`main.js`, `manifest.json`, `styles.css`)
- Deployment scripts (`release.sh`, `submit-obsidian.sh`)
- Documentation (`README.md`, `LICENSE`, etc.)

### Step 2: Transfer Package

Transfer the release package to your deployment machine:

```bash
scp obsidian-pinbox-syncer-release-{VERSION}.tar.gz user@deployment-host:~/
```

Or use any other file transfer method you prefer (USB drive, cloud storage, etc.)

### Step 3: Deploy (On Deployment Machine)

#### 3.1 Extract Package

```bash
tar -xzf obsidian-pinbox-syncer-release-{VERSION}.tar.gz
cd obsidian-pinbox-syncer
```

#### 3.2 Run Release Script

```bash
./release.sh
```

This script will automatically:
- ✓ Verify that pre-built files exist (main.js, manifest.json, styles.css)
- ✓ Initialize git repository (if needed)
- ✓ Configure remote repository
- ✓ Fetch and merge with existing GitHub repository (preserves history)
- ✓ Commit all changes
- ✓ Push code to GitHub
- ✓ Create and push version tag
- ✓ Create GitHub release with built files

**Prerequisites for Deployment Machine:**
- Git installed and configured with SSH key
- GitHub CLI (`gh`) installed and authenticated
- NO Node.js or npm required (plugin is pre-built)

**First-time setup on Deployment Machine:**
```bash
# Set up SSH key for GitHub
ssh -T git@github.com

# Install and authenticate GitHub CLI
gh auth login
```

### Step 4: Submit to Obsidian Community (Optional)

Only needed for:
- First-time submission
- Major updates you want to announce

```bash
./submit-obsidian.sh
```

This will:
- Fork `obsidianmd/obsidian-releases`
- Add your plugin to `community-plugins.json`
- Create a Pull Request
- Provide PR URL for tracking

**Note:** Review typically takes 1-2 weeks. Monitor the PR for feedback from the Obsidian team.

## Important Notes

### ✅ What You DON'T Need to Change

The release scripts are fully automated and read all necessary information from your project files:

- **Version number**: Automatically read from `manifest.json`
- **Plugin info**: ID, name, description, author all read from `manifest.json`
- **Repository URL**: Already configured in the scripts
- **Release notes**: Auto-generated from version and plugin info

You will NEVER need to edit the release scripts themselves!

### 🔄 Version Synchronization

The project has a built-in mechanism to keep versions synchronized:

- `package.json` contains the source version
- `npm run version` syncs it to `manifest.json`
- All scripts read the version from `manifest.json`

Always update `package.json` first, then run `npm run version`.

### 📦 What Gets Pushed to GitHub

When you run `release.sh`, it pushes:
- ✓ All source code (`src/`, `main.ts`, etc.)
- ✓ Compiled files (`main.js`, `styles.css`)
- ✓ Configuration files (`manifest.json`, `package.json`, etc.)
- ✓ Documentation (`README.md`, `LICENSE`)
- ✓ Release scripts (for future use)

The GitHub release specifically includes:
- `main.js` (the compiled plugin)
- `manifest.json` (version and metadata)
- `styles.css` (styling)

These three files are what users download and install.

### 🔍 Verifying Your Release

After running `release.sh`, verify:

1. **Code on GitHub**: Visit https://github.com/gnuhpc/obsidian-pinbox-syncer
   - Check that your latest changes are visible
   - Verify the commit history is preserved

2. **Release Page**: Visit https://github.com/gnuhpc/obsidian-pinbox-syncer/releases
   - Check that the new version tag exists
   - Verify that main.js, manifest.json, and styles.css are attached
   - Confirm the release notes are correct

3. **Test Installation**:
   - Download the release files
   - Install in Obsidian
   - Test the plugin works correctly

## Troubleshooting

### "main.js not found" on Development Machine

This means the build failed. Check:
```bash
npm run build
# Look for error messages
```

Common causes:
- TypeScript compilation errors
- Missing dependencies (run `npm install`)

### "Permission denied" when pushing on Deployment Machine

Check SSH key setup:
```bash
ssh -T git@github.com
# Should show: "Hi {username}! You've successfully authenticated"
```

If not working, add your SSH key to GitHub.

### "gh: command not found" on Deployment Machine

Install GitHub CLI:
- macOS: `brew install gh`
- Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
- Windows: https://github.com/cli/cli/releases

Then authenticate:
```bash
gh auth login
```

### Version Mismatch Between package.json and manifest.json

Run the version sync command:
```bash
npm run version
```

This will copy the version from `package.json` to `manifest.json`.

### Git Merge Conflicts on Deployment

This is rare but can happen if you deploy from multiple sources. The `release.sh` script handles most cases automatically, but if it fails:

```bash
# Abort the current operation
git merge --abort  # or git rebase --abort

# Manually pull and merge
git pull origin main --rebase

# Then try release.sh again
./release.sh
```

## Tips for Smooth Releases

1. **Always test before releasing**: Make sure your changes work locally
2. **Update version for every release**: Use semantic versioning
3. **Keep release notes updated**: Edit `README.md` with what's new
4. **One release at a time**: Don't create multiple releases simultaneously
5. **Verify after deployment**: Always check GitHub to ensure everything uploaded correctly
6. **Backup before major changes**: Git history is preserved, but it's good practice

## Example: Typical Update Workflow

Let's say you fixed a bug and want to release the next patch version:

```bash
# On Development Machine
# 1. Make your bug fix in src/
vim src/syncService.ts

# 2. Create release package with auto-increment patch version
./prepare-release.sh patch

# 3. Transfer to deployment machine
scp obsidian-pinbox-syncer-release-1.0.2.tar.gz deploy-server:~/

# On Deployment Machine
ssh deploy-server
tar -xzf obsidian-pinbox-syncer-release-1.0.2.tar.gz
cd obsidian-pinbox-syncer
./release.sh

# Done! Check GitHub to verify
```

Total time: ~5 minutes

## Summary

The release workflow is designed to be simple and repeatable:

1. **Develop** → Code changes on dev machine
2. **Version** → Update version number (if needed)
3. **Package** → `./prepare-release.sh`
4. **Transfer** → Copy to deployment machine
5. **Deploy** → `./release.sh`

The scripts handle everything else automatically. You never need to edit them!

## Questions or Issues?

If you encounter any problems with the release workflow:
1. Check this document first
2. Review error messages carefully
3. Check GitHub Issues: https://github.com/gnuhpc/obsidian-pinbox-syncer/issues
