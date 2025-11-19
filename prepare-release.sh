#!/bin/bash

# ==============================================================================
# Prepare Release Package Script
# ==============================================================================
#
# Purpose: Build plugin and create a transfer package for another machine
#
# Use this script when:
# - You want to build on one machine and deploy on another
# - You want to create a complete package with source and built files
# - Initial release preparation
#
# What this script does:
# 1. Builds the plugin (npm install && npm run build)
# 2. Creates a compressed package (.tar.gz) containing:
#    - Built files (main.js, manifest.json, styles.css)
#    - Source code
#    - Deployment scripts (deploy.sh, submit-obsidian.sh, etc.)
#    - Documentation (README, LICENSE, DEPLOY_INSTRUCTIONS)
# 3. Creates SHA256 checksum for verification
# 4. Makes scripts executable
#
# Prerequisites:
# - Node.js and npm installed
# - manifest.json exists
# - Source code complete
#
# Usage:
#   ./prepare-release.sh           # Use current version
#   ./prepare-release.sh patch     # Auto-increment patch version (e.g., 1.0.1 -> 1.0.2)
#   ./prepare-release.sh minor     # Auto-increment minor version (e.g., 1.0.1 -> 1.1.0)
#   ./prepare-release.sh major     # Auto-increment major version (e.g., 1.0.1 -> 2.0.0)
#
# Output:
#   obsidian-pinbox-syncer-release-{VERSION}.tar.gz
#
# Next steps after running:
#   1. Transfer the .tar.gz file to deployment machine
#   2. Extract: tar -xzf obsidian-pinbox-syncer-release-{VERSION}.tar.gz
#   3. Run: ./deploy.sh (on deployment machine)
#
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print step
print_step() {
    echo -e "\n${YELLOW}>>> $1${NC}\n"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    print_error "manifest.json not found. Please run this script from the plugin root directory."
    exit 1
fi

if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the plugin root directory."
    exit 1
fi

# Check if version bump parameter is passed
VERSION_BUMP=""
if [ "$1" = "patch" ] || [ "$1" = "minor" ] || [ "$1" = "major" ]; then
    VERSION_BUMP="$1"
fi

if [ -n "$VERSION_BUMP" ]; then
    print_step "Step 0: Auto-incrementing version (${VERSION_BUMP})"

    # Get current version from package.json
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    print_info "Current version: ${CURRENT_VERSION}"

    # Increment version based on type
    NEW_VERSION=$(node -e "
        const version = '${CURRENT_VERSION}'.split('.').map(Number);
        const bump = '${VERSION_BUMP}';

        if (bump === 'major') {
            version[0] += 1;
            version[1] = 0;
            version[2] = 0;
        } else if (bump === 'minor') {
            version[1] += 1;
            version[2] = 0;
        } else if (bump === 'patch') {
            version[2] += 1;
        }

        console.log(version.join('.'));
    ")

    print_info "New version: ${NEW_VERSION}"

    # Update package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '${NEW_VERSION}';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "

    # Update manifest.json
    node -e "
        const fs = require('fs');
        const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
        manifest.version = '${NEW_VERSION}';
        fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
    "

    print_success "Version updated: ${CURRENT_VERSION} → ${NEW_VERSION}"
fi

# Get the version (possibly updated)
VERSION=$(node -p "require('./manifest.json').version")
PACKAGE_NAME="obsidian-pinbox-syncer-release-${VERSION}.tar.gz"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Preparing Release Package${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}Version:${NC} ${GREEN}${VERSION}${NC}"
echo ""

print_step "Step 1: Building the plugin locally"

# Build the plugin
echo "Running npm install..."
npm install

echo "Running production build..."
npm run build

if [ ! -f "main.js" ]; then
    print_error "Build failed: main.js not found"
    exit 1
fi

print_success "Build completed successfully"

# Check file sizes
MAIN_JS_SIZE=$(du -h main.js | cut -f1)
echo "Built main.js size: $MAIN_JS_SIZE"

print_step "Step 2: Creating release package"

# Create a temporary directory for packaging
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="$TEMP_DIR/obsidian-pinbox-syncer"

echo "Creating package structure..."
mkdir -p "$PACKAGE_DIR"

# Copy all necessary files
echo "Copying project files..."

# Copy built files (MOST IMPORTANT - ready for release)
cp main.js "$PACKAGE_DIR/"
cp manifest.json "$PACKAGE_DIR/"
cp styles.css "$PACKAGE_DIR/"

# Copy source files (for reference and future builds)
cp -r src "$PACKAGE_DIR/"
cp main.ts "$PACKAGE_DIR/"
cp package.json "$PACKAGE_DIR/"
cp package-lock.json "$PACKAGE_DIR/"
cp tsconfig.json "$PACKAGE_DIR/"
cp esbuild.config.mjs "$PACKAGE_DIR/"
cp build-styles.mjs "$PACKAGE_DIR/"
cp version-bump.mjs "$PACKAGE_DIR/"
cp eslint.config.mjs "$PACKAGE_DIR/"

# Copy documentation
cp README.md "$PACKAGE_DIR/"
cp LICENSE "$PACKAGE_DIR/"

# Copy git ignore
cp .gitignore "$PACKAGE_DIR/"

# Copy deployment scripts
cp release.sh "$PACKAGE_DIR/"
cp submit-obsidian.sh "$PACKAGE_DIR/"
cp prepare-release.sh "$PACKAGE_DIR/"

# Copy guides (if they exist)
[ -f "SCRIPTS_GUIDE.md" ] && cp SCRIPTS_GUIDE.md "$PACKAGE_DIR/"
[ -f "DEPLOYMENT_README.md" ] && cp DEPLOYMENT_README.md "$PACKAGE_DIR/"

# Copy GitHub workflows (if they exist)
if [ -d ".github/workflows" ]; then
    mkdir -p "$PACKAGE_DIR/.github/workflows"
    cp -r .github/workflows/* "$PACKAGE_DIR/.github/workflows/"
fi

# Make scripts executable
chmod +x "$PACKAGE_DIR/release.sh"
chmod +x "$PACKAGE_DIR/submit-obsidian.sh"
chmod +x "$PACKAGE_DIR/prepare-release.sh"

print_success "Files copied"

print_step "Step 3: Creating README for deployment"

# Create deployment instructions
cat > "$PACKAGE_DIR/DEPLOY_INSTRUCTIONS.md" << 'EOF'
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
- **⚠️ IMPORTANT: NO compilation on deployment server** - only uses pre-built files from package
- **All builds MUST be done on development machine before creating package**

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
EOF

print_success "Deployment instructions created"

print_step "Step 4: Compressing package"

# Create compressed archive
cd "$TEMP_DIR"
tar -czf "$PACKAGE_NAME" obsidian-pinbox-syncer

# Move to original directory
mv "$PACKAGE_NAME" "$OLDPWD/"

# Cleanup
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

print_success "Package created: $PACKAGE_NAME"

print_step "Step 5: Creating checksum"

# Create SHA256 checksum
if command -v shasum &> /dev/null; then
    CHECKSUM=$(shasum -a 256 "$PACKAGE_NAME" | awk '{print $1}')
elif command -v sha256sum &> /dev/null; then
    CHECKSUM=$(sha256sum "$PACKAGE_NAME" | awk '{print $1}')
else
    print_error "Neither shasum nor sha256sum found, skipping checksum"
    CHECKSUM="N/A"
fi

if [ "$CHECKSUM" != "N/A" ]; then
    echo "$CHECKSUM  $PACKAGE_NAME" > "${PACKAGE_NAME}.sha256"
    print_success "Checksum created: ${PACKAGE_NAME}.sha256"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Package Ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Package file:${NC} $PACKAGE_NAME"
echo -e "${BLUE}Package size:${NC} $(du -h "$PACKAGE_NAME" | cut -f1)"
echo -e "${BLUE}Built main.js:${NC} $MAIN_JS_SIZE (included in package)"
if [ "$CHECKSUM" != "N/A" ]; then
    echo -e "${BLUE}SHA256:${NC} $CHECKSUM"
fi
echo ""
echo -e "${GREEN}✓ Plugin compiled and ready for deployment${NC}"
echo -e "${GREEN}✓ No Node.js/npm needed on deployment machine${NC}"
echo -e "${GREEN}✓ Only Git and GitHub CLI required${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Transfer this package to your deployment machine:"
echo -e "   ${GREEN}scp $PACKAGE_NAME user@host:~/${NC}"
echo ""
echo "2. On the deployment machine, extract and run:"
echo -e "   ${GREEN}tar -xzf $PACKAGE_NAME${NC}"
echo -e "   ${GREEN}cd obsidian-pinbox-syncer${NC}"
echo -e "   ${GREEN}./release.sh${NC}"
echo ""
echo "3. After deployment, submit to Obsidian:"
echo -e "   ${GREEN}./submit-obsidian.sh${NC}"
echo ""
echo -e "${BLUE}📖 See DEPLOY_INSTRUCTIONS.md in the package for detailed instructions.${NC}"
echo ""

print_success "Release package preparation completed!"
