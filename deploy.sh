#!/bin/bash

# Obsidian Pinbox Syncer - Automated Deployment Script
# This script will:
# 1. Initialize and push to GitHub
# 2. Create a release with built files
# 3. Help you submit to Obsidian plugin marketplace

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="git@github.com:gnuhpc/obsidian-pinbox-syncer.git"
VERSION=$(node -p "require('./manifest.json').version")
PLUGIN_ID=$(node -p "require('./manifest.json').id")
PLUGIN_NAME=$(node -p "require('./manifest.json').name")
PLUGIN_DESCRIPTION=$(node -p "require('./manifest.json').description")
AUTHOR=$(node -p "require('./manifest.json').author")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Obsidian Pinbox Syncer - Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Version: ${GREEN}${VERSION}${NC}"
echo -e "Plugin ID: ${GREEN}${PLUGIN_ID}${NC}"
echo ""

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

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    print_error "manifest.json not found. Please run this script from the plugin root directory."
    exit 1
fi

# Step 1: Verify built files exist
print_step "Step 1: Verifying built files"

if [ ! -f "main.js" ]; then
    print_error "main.js not found. Please ensure the plugin was built before packaging."
    print_error "This should not happen if you used prepare-release.sh correctly."
    exit 1
fi

if [ ! -f "manifest.json" ]; then
    print_error "manifest.json not found"
    exit 1
fi

if [ ! -f "styles.css" ]; then
    print_error "styles.css not found"
    exit 1
fi

MAIN_JS_SIZE=$(du -h main.js | cut -f1)
echo "✓ main.js found (${MAIN_JS_SIZE})"
echo "✓ manifest.json found"
echo "✓ styles.css found"

print_success "All required files are present"

# Step 2: Initialize git repository if not already initialized
print_step "Step 2: Initializing Git repository"

if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
    print_success "Git repository initialized"
else
    print_success "Git repository already initialized"
fi

# Step 3: Add remote if not exists
print_step "Step 3: Setting up remote repository"

if git remote | grep -q "origin"; then
    echo "Remote 'origin' already exists"
    CURRENT_URL=$(git remote get-url origin)
    if [ "$CURRENT_URL" != "$REPO_URL" ]; then
        echo "Updating remote URL..."
        git remote set-url origin "$REPO_URL"
        print_success "Remote URL updated to: $REPO_URL"
    else
        print_success "Remote URL is correct"
    fi
else
    echo "Adding remote 'origin'..."
    git remote add origin "$REPO_URL"
    print_success "Remote added: $REPO_URL"
fi

# Step 4: Commit and push
print_step "Step 4: Committing and pushing to GitHub"

# Add all files
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    print_success "No changes to commit"
else
    echo "Committing changes..."
    git commit -m "Release version ${VERSION}

- Initial release of Pinbox Syncer
- Sync Pinbox bookmarks to Obsidian
- Automatic web content fetching
- WeChat QR code login support
- Dataview index generation
- Bookmark deletion support"
    print_success "Changes committed"

    # Rename branch to main after first commit (for older Git versions)
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        echo "Renaming branch from '$CURRENT_BRANCH' to 'main'..."
        git branch -M main
        print_success "Branch renamed to 'main'"
    fi
fi

# Push to GitHub
echo "Pushing to GitHub..."
git push -u origin main --force

print_success "Code pushed to GitHub"

# Step 5: Clean up existing release and tag
print_step "Step 5: Cleaning up existing release and tag"

# Check if gh CLI is available for release deletion
if command -v gh &> /dev/null; then
    # Delete existing release if it exists
    if gh release view "${VERSION}" &> /dev/null 2>&1; then
        echo "Deleting existing release ${VERSION}..."
        gh release delete "${VERSION}" -y 2>/dev/null || true
        print_success "Existing release deleted"
    else
        echo "No existing release found"
    fi
fi

# Delete tag from remote first
if git ls-remote --tags origin | grep -q "refs/tags/${VERSION}"; then
    echo "Deleting remote tag ${VERSION}..."
    git push origin ":refs/tags/${VERSION}" 2>/dev/null || true
    print_success "Remote tag deleted"
fi

# Delete local tag
if git tag | grep -q "^${VERSION}$"; then
    echo "Deleting local tag ${VERSION}..."
    git tag -d "${VERSION}" 2>/dev/null || true
    print_success "Local tag deleted"
fi

# Step 6: Create and push tag
print_step "Step 6: Creating release tag"

echo "Creating tag ${VERSION}..."
git tag -a "${VERSION}" -m "Release ${VERSION}

Initial release of Pinbox Syncer for Obsidian

Features:
- 🔄 Automatic bookmark synchronization from Pinbox
- 📝 Web content fetching and conversion to Markdown
- 🔐 WeChat QR code login support
- 📊 Dataview index generation
- 🗑️ Cloud and local bookmark deletion
- 🌐 Support for WeChat public account articles
- ⚙️ Customizable sync settings"

echo "Pushing tag to GitHub..."
git push origin "${VERSION}"

print_success "Tag ${VERSION} created and pushed"

# Step 7: Create GitHub Release
print_step "Step 7: Creating GitHub Release"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    echo -e "${YELLOW}Please install it from: https://cli.github.com/${NC}"
    echo -e "${YELLOW}Or manually create a release on GitHub with these files:${NC}"
    echo "  - main.js"
    echo "  - manifest.json"
    echo "  - styles.css"
else
    # Check if user is logged in
    if ! gh auth status &> /dev/null; then
        echo "You need to login to GitHub CLI first..."
        gh auth login
    fi

    echo "Creating GitHub release..."

    # Create new release
    gh release create "${VERSION}" \
        --title "Pinbox Syncer ${VERSION}" \
        --notes "## Pinbox Syncer for Obsidian

### 🎉 Initial Release

A plugin to sync your Pinbox bookmarks to Obsidian with automatic web content fetching.

### ✨ Features

- **🔄 Automatic Synchronization**: Scheduled sync of Pinbox bookmarks
- **📝 Web Content Fetching**: Automatically fetch and convert web pages to Markdown
- **🔐 Secure Login**: WeChat QR code login support
- **📊 Dataview Integration**: Auto-generated index for easy browsing
- **🗑️ Bookmark Management**: Delete bookmarks from both cloud and local
- **🌐 WeChat Support**: Optimized for WeChat public account articles
- **⚙️ Customizable**: Flexible sync settings and folder structure

### 📦 Installation

1. Download \`main.js\`, \`manifest.json\`, and \`styles.css\`
2. Create folder \`<vault>/.obsidian/plugins/pinbox-syncer/\`
3. Copy the downloaded files to the folder
4. Reload Obsidian and enable the plugin

### 📖 Documentation

For detailed usage instructions, please see [README.md](https://github.com/gnuhpc/obsidian-pinbox-syncer/blob/main/README.md)

### 🐛 Bug Reports

If you encounter any issues, please report them on [GitHub Issues](https://github.com/gnuhpc/obsidian-pinbox-syncer/issues)" \
        main.js manifest.json styles.css

    print_success "GitHub release created successfully"
fi

# Step 8: Instructions for Obsidian submission
print_step "Step 8: Submitting to Obsidian Community Plugins"

echo -e "${YELLOW}Now you need to submit your plugin to Obsidian's community plugin list.${NC}"
echo ""
echo -e "${BLUE}Automatic submission (recommended):${NC}"
echo ""
echo "Run the following command to automatically create the PR:"
echo ""
echo -e "${GREEN}./submit-obsidian.sh${NC}"
echo ""
echo -e "${BLUE}Manual submission:${NC}"
echo ""
echo "1. Fork the repository: https://github.com/obsidianmd/obsidian-releases"
echo "2. Add your plugin to 'community-plugins.json':"
echo ""
echo -e "${GREEN}{"
echo "  \"id\": \"${PLUGIN_ID}\","
echo "  \"name\": \"${PLUGIN_NAME}\","
echo "  \"author\": \"${AUTHOR}\","
echo "  \"description\": \"${PLUGIN_DESCRIPTION}\","
echo "  \"repo\": \"gnuhpc/obsidian-pinbox-syncer\""
echo -e "}${NC}"
echo ""
echo "3. Create a Pull Request"
echo "4. Wait for review (typically 1-2 weeks)"
echo ""

print_success "Deployment completed successfully!"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Summary:${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "✓ Plugin built successfully"
echo -e "✓ Code pushed to GitHub"
echo -e "✓ Release ${VERSION} created"
echo -e "✓ Release files uploaded"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Run ./submit-obsidian.sh to submit to Obsidian"
echo -e "2. Monitor your GitHub repository for the release"
echo -e "3. Wait for Obsidian team review"
echo ""
echo -e "${BLUE}GitHub Repository:${NC} https://github.com/gnuhpc/obsidian-pinbox-syncer"
echo -e "${BLUE}Release URL:${NC} https://github.com/gnuhpc/obsidian-pinbox-syncer/releases/tag/${VERSION}"
echo ""
