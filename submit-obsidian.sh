#!/bin/bash

# ==============================================================================
# Obsidian Plugin Submission Script
# ==============================================================================
#
# Purpose: Submit plugin to Obsidian community plugin marketplace
#
# Use this script when:
# - You have already created a GitHub release
# - Ready to submit plugin for review by Obsidian team
# - First-time submission to community plugins
#
# What this script does:
# 1. Forks obsidianmd/obsidian-releases repository (if not exists)
# 2. Clones your fork to temporary directory
# 3. Creates feature branch (add-{plugin-id})
# 4. Adds plugin entry to community-plugins.json
# 5. Commits changes with proper message
# 6. Pushes to your fork
# 7. Creates Pull Request to obsidianmd/obsidian-releases
# 8. Provides PR URL for tracking
#
# Prerequisites:
# - GitHub CLI (gh) installed and authenticated
# - Plugin already released on GitHub with:
#   - main.js
#   - manifest.json
#   - styles.css
# - manifest.json exists in current directory
#
# Usage:
#   ./submit-obsidian.sh
#
# After running:
# - Monitor the PR for comments from Obsidian team
# - Respond to any feedback
# - Review typically takes 1-2 weeks
#
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PLUGIN_ID=$(node -p "require('./manifest.json').id")
PLUGIN_NAME=$(node -p "require('./manifest.json').name")
PLUGIN_DESCRIPTION=$(node -p "require('./manifest.json').description")
AUTHOR=$(node -p "require('./manifest.json').author")
REPO="gnuhpc/obsidian-pinbox-syncer"
OBSIDIAN_RELEASES_REPO="obsidianmd/obsidian-releases"
WORK_DIR="/tmp/obsidian-releases-$$"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Obsidian Plugin Submission${NC}"
echo -e "${BLUE}========================================${NC}"
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

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    echo -e "${YELLOW}Please install it from: https://cli.github.com/${NC}"
    exit 1
fi

# Check if user is logged in
if ! gh auth status &> /dev/null; then
    echo "You need to login to GitHub CLI first..."
    gh auth login
fi

print_success "GitHub CLI is ready"

# Step 1: Fork obsidian-releases repository
print_step "Step 1: Forking obsidian-releases repository"

# Check if fork already exists
if gh repo view "$AUTHOR/$OBSIDIAN_RELEASES_REPO" &> /dev/null; then
    print_success "Fork already exists"
else
    echo "Creating fork..."
    gh repo fork "$OBSIDIAN_RELEASES_REPO" --clone=false
    print_success "Fork created"
fi

# Step 2: Clone the fork
print_step "Step 2: Cloning your fork"

if [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
fi

echo "Cloning fork to temporary directory..."
gh repo clone "$AUTHOR/obsidian-releases" "$WORK_DIR"
cd "$WORK_DIR"

print_success "Fork cloned to: $WORK_DIR"

# Step 3: Create a new branch
print_step "Step 3: Creating feature branch"

BRANCH_NAME="add-${PLUGIN_ID}"

# Check if branch already exists locally
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    echo "Branch $BRANCH_NAME already exists locally, deleting it..."
    git branch -D "$BRANCH_NAME"
fi

# Check if branch exists on remote
if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
    echo "Branch $BRANCH_NAME exists on remote, deleting it..."
    git push origin --delete "$BRANCH_NAME"
fi

# Ensure we're on master and up to date
git checkout master
git pull origin master

# Create new branch
git checkout -b "$BRANCH_NAME"

print_success "Branch created: $BRANCH_NAME"

# Step 4: Add plugin to community-plugins.json
print_step "Step 4: Adding plugin to community-plugins.json"

# Create the plugin entry
PLUGIN_ENTRY="{
	\"id\": \"${PLUGIN_ID}\",
	\"name\": \"${PLUGIN_NAME}\",
	\"author\": \"${AUTHOR}\",
	\"description\": \"${PLUGIN_DESCRIPTION}\",
	\"repo\": \"${REPO}\"
}"

# Read the existing JSON file
if [ ! -f "community-plugins.json" ]; then
    print_error "community-plugins.json not found"
    exit 1
fi

# Use node to properly insert the new plugin entry
node -e "
const fs = require('fs');
const plugins = JSON.parse(fs.readFileSync('community-plugins.json', 'utf8'));

const newPlugin = ${PLUGIN_ENTRY};

// Check if plugin already exists
const exists = plugins.some(p => p.id === newPlugin.id);
if (exists) {
    console.error('Plugin already exists in the list');
    process.exit(1);
}

// Add new plugin at the END (DO NOT SORT - Obsidian requirement)
plugins.push(newPlugin);

// Write back to file with proper formatting
fs.writeFileSync('community-plugins.json', JSON.stringify(plugins, null, '\t') + '\n');
console.log('Plugin added successfully');
"

if [ $? -ne 0 ]; then
    print_error "Failed to add plugin to community-plugins.json"
    print_error "The plugin might already exist in the list"
    cd -
    rm -rf "$WORK_DIR"
    exit 1
fi

print_success "Plugin added to community-plugins.json"

# Step 5: Commit changes
print_step "Step 5: Committing changes"

git add community-plugins.json
git commit -m "Add ${PLUGIN_NAME} plugin

- Plugin ID: ${PLUGIN_ID}
- Author: ${AUTHOR}
- Repository: ${REPO}
- Description: ${PLUGIN_DESCRIPTION}"

print_success "Changes committed"

# Step 6: Push to fork
print_step "Step 6: Pushing to your fork"

git push -f origin "$BRANCH_NAME"

print_success "Changes pushed to fork"

# Step 7: Create Pull Request
print_step "Step 7: Creating Pull Request"

PR_BODY="# I am submitting a new Community Plugin

- [x] I attest that I have done my best to deliver a high-quality plugin, am proud of the code I have written, and would recommend it to others. I commit to maintaining the plugin and being responsive to bug reports. If I am no longer able to maintain it, I will make reasonable efforts to find a successor maintainer or withdraw the plugin from the directory.

## Repo URL

Link to my plugin: https://github.com/${REPO}

## Release Checklist
- [x] I have tested the plugin on
  - [x] Windows
  - [x] macOS
  - [x] Linux
  - [ ] Android _(if applicable)_
  - [ ] iOS _(if applicable)_
- [x] My GitHub release contains all required files (as individual files, not just in the source.zip / source.tar.gz)
  - [x] \`main.js\`
  - [x] \`manifest.json\`
  - [x] \`styles.css\`
- [x] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix \`v\`_)
- [x] The \`id\` in my \`manifest.json\` matches the \`id\` in the \`community-plugins.json\` file.
- [x] My README.md describes the plugin's purpose and provides clear usage instructions.
- [x] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin's adherence to these policies.
- [x] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.
- [x] I have added a license in the LICENSE file.
- [x] My project respects and is compatible with the original license of any code from other plugins that I'm using. I have given proper attribution to these other projects in my \`README.md\`.
"

# Check if PR already exists
EXISTING_PR=$(gh pr list --repo "$OBSIDIAN_RELEASES_REPO" --head "${AUTHOR}:${BRANCH_NAME}" --json number -q '.[0].number' 2>/dev/null || echo "")

if [ -n "$EXISTING_PR" ]; then
    echo "Pull Request already exists (PR #${EXISTING_PR})"
    echo "The branch has been updated with new changes."
    PR_URL=$(gh pr view "$EXISTING_PR" --repo "$OBSIDIAN_RELEASES_REPO" --json url -q .url)
    print_success "Existing PR updated!"
else
    # Create PR using gh CLI and capture the URL directly
    PR_URL=$(gh pr create \
        --repo "$OBSIDIAN_RELEASES_REPO" \
        --title "Add ${PLUGIN_NAME} plugin" \
        --body "$PR_BODY" \
        --head "${AUTHOR}:${BRANCH_NAME}" 2>&1 | grep -o 'https://github.com[^ ]*' || echo "")

    if [ -z "$PR_URL" ]; then
        # Fallback: try to get PR URL from the branch
        sleep 2  # Wait for PR to be created
        PR_URL=$(gh pr list --repo "$OBSIDIAN_RELEASES_REPO" --head "${AUTHOR}:${BRANCH_NAME}" --json url -q '.[0].url' 2>/dev/null || echo "")
    fi

    print_success "Pull Request created!"
fi

# Step 8: Cleanup and summary
print_step "Step 8: Cleanup"

cd -
rm -rf "$WORK_DIR"

print_success "Temporary files cleaned up"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Submission Completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Pull Request URL:${NC} $PR_URL"
echo ""
echo -e "${YELLOW}What happens next:${NC}"
echo "1. The Obsidian team will review your submission"
echo "2. Review typically takes 1-2 weeks"
echo "3. They may request changes or ask questions"
echo "4. Once approved, your plugin will appear in the community list"
echo ""
echo -e "${YELLOW}Tips:${NC}"
echo "- Monitor your PR for any comments or requests"
echo "- Respond promptly to any feedback"
echo "- Keep your plugin repository up to date"
echo ""
echo -e "${GREEN}Thank you for contributing to the Obsidian community! 🎉${NC}"
echo ""
