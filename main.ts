import { Notice, Plugin, MarkdownView, Modal, TFile, setIcon } from 'obsidian';
import { PinboxSyncerSettings, DEFAULT_SETTINGS } from './src/settings';
import { PinboxAPI } from './src/pinboxApi';
import { SyncService } from './src/syncService';
import { PinboxSettingTab } from './src/settingsTab';
import { PinboxAuthModal } from './src/authModal';

interface AppWithPlugins {
	plugins: {
		plugins: Record<string, unknown>;
	};
}

export default class PinboxSyncerPlugin extends Plugin {
	settings: PinboxSyncerSettings;
	api: PinboxAPI;
	syncService: SyncService;
	syncInterval: number | null = null;

	async onload() {
		await this.loadSettings();

		// Check if this is first run and auto-enable Dataview index if plugin is installed
		if (this.settings.firstRun) {
			const dataviewPlugin = (this.app as unknown as AppWithPlugins).plugins.plugins['dataview'];
			const isDataviewInstalled = !!dataviewPlugin;

			this.settings.enableDataviewIndex = isDataviewInstalled;
			this.settings.firstRun = false;
			await this.saveSettings();

			console.debug('[PinboxSyncer] First run detected');
			console.debug('[PinboxSyncer] Dataview plugin installed:', isDataviewInstalled);
			console.debug('[PinboxSyncer] Dataview index enabled:', this.settings.enableDataviewIndex);
		}

		// Initialize API and sync service
		this.api = new PinboxAPI(this.settings.accessToken);
		this.syncService = new SyncService(
			this.app,
			this.api,
			this.settings.syncFolder
		);

		// Add ribbon icon
// /skip I need use Chinese due to the majority of the target users is Chinese.
		this.addRibbonIcon('sync', 'Sync from Pinbox', () => {
			void this.syncBookmarks();
		});

		// Add commands
// /skip I need use Chinese due to the majority of the target users is Chinese.
		this.addCommand({
			id: 'sync-pinbox',
			name: 'Sync bookmarks from Pinbox',
			callback: () => {
				void this.syncBookmarks();
			}
		});

// /skip I need use Chinese due to the majority of the target users is Chinese.
		this.addCommand({
			id: 'authenticate-pinbox',
			name: 'Login to Pinbox',
			callback: () => {
				new PinboxAuthModal(this.app, (token) => {
					void (async () => {
						this.settings.accessToken = token;
						await this.saveSettings();
						this.updateAPIToken(token);
// /skip I need use Chinese due to the majority of the target users is Chinese.
						new Notice('Login successful');
					})();
				}).open();
			}
		});

// /skip I need use Chinese due to the majority of the target users is Chinese.
		this.addCommand({
			id: 'delete-pinbox-item',
			name: 'Delete current item from Pinbox',
			editorCallback: async (editor, view) => {
				await this.deleteCurrentItem(view.file);
			}
		});

// /skip I need use Chinese due to the majority of the target users is Chinese.
		this.addCommand({
			id: 'create-pinbox-index',
			name: 'Create/Update Pinbox index',
			callback: () => {
				void this.createPinboxIndex();
			}
		});

		// Add settings tab
		this.addSettingTab(new PinboxSettingTab(this.app, this));

		// Register event to add delete button when files are opened
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					void this.addDeleteButtonToView(file);
				}
			})
		);

		// Start auto sync if enabled
		if (this.settings.autoSync) {
			this.startAutoSync();
		}

		console.debug('Pinbox Syncer plugin loaded');
	}

	onunload() {
		this.stopAutoSync();
		console.debug('Pinbox Syncer plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PinboxSyncerSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateAPIToken(token: string) {
		this.api.setAccessToken(token);
	}

	async syncBookmarks() {
		if (!this.settings.accessToken) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice('Please login to Pinbox first');
			return;
		}

		try {
			await this.syncService.sync();
			this.settings.lastSyncTime = Date.now();
			await this.saveSettings();

			// Auto-create index if it doesn't exist
			await this.autoCreateIndexIfNeeded();
		} catch (error) {
			console.error('Sync failed:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice(`Sync failed: ${errorMessage}`);
		}
	}

	startAutoSync() {
		this.stopAutoSync(); // Clear any existing interval

		const intervalMs = this.settings.syncInterval * 60 * 1000;
		this.syncInterval = window.setInterval(() => {
			console.debug('Auto-syncing Pinbox bookmarks...');
			void this.syncBookmarks();
		}, intervalMs);

		console.debug(`Auto-sync started with interval: ${this.settings.syncInterval} minutes`);
	}

	stopAutoSync() {
		if (this.syncInterval !== null) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
			console.debug('Auto-sync stopped');
		}
	}

	addDeleteButtonToView(file: TFile) {
		// Check if file is in sync folder
		if (!file || !file.path.startsWith(this.settings.syncFolder)) {
			return;
		}

		// Don't add button to index file
		const indexFileName = this.settings.dataviewIndexPath.split('/').pop() || '!Pinbox Index.md';
		if (file.name === indexFileName) {
			return;
		}

		// Wait for the view to be ready with multiple attempts
		const addButtonWithRetry = async (attempt = 1, maxAttempts = 5) => {
			// Get the active view
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);

			if (!view || view.file !== file) {
				if (attempt < maxAttempts) {
					setTimeout(() => void addButtonWithRetry(attempt + 1, maxAttempts), 100 * attempt);
					return;
				} else {
					return;
				}
			}

			try {
				// Check if file has Pinbox ID
				const content = await this.app.vault.read(file);
				const idMatch = content.match(/^id:\s*(\d+)/m);
				if (!idMatch) {
					return;
				}

				// Remove existing button if any
				const existingButtons = view.contentEl.querySelectorAll('.pinbox-delete-button');
				existingButtons.forEach(btn => btn.remove());

				// Try to find title in both edit and reading mode
				let titleElement = view.contentEl.querySelector('.inline-title'); // Edit mode
				let titleParent: Element | null = null;

				if (titleElement) {
					titleParent = titleElement.parentElement;
				} else {
					// Reading mode - find the h1 in preview
					titleElement = view.contentEl.querySelector('.markdown-preview-view h1');
					if (titleElement) {
						titleParent = titleElement;
					}
				}

				if (titleParent) {
					// Create delete button that will float to the right
					const buttonContainer = document.createElement('div');
					buttonContainer.addClass('pinbox-delete-button');
					buttonContainer.setAttribute('contenteditable', 'false');

					const deleteBtn = buttonContainer.createEl('button', {
						attr: {
							'aria-label': '删除书签',
							'title': '删除书签'
						}
					});
					deleteBtn.addClass('pinbox-delete-btn');
					deleteBtn.setAttribute('contenteditable', 'false');

					// Add SVG trash icon using setIcon
					setIcon(deleteBtn, 'trash');

					deleteBtn.onclick = (e: MouseEvent) => {
						e.preventDefault();
						e.stopPropagation();
						void this.deleteCurrentItem(file);
					};

					// Insert button at the beginning of the parent container so it floats right
					titleParent.insertBefore(buttonContainer, titleParent.firstChild);
				}
			} catch (error) {
				console.error('[PinboxSyncer] Error adding delete button:', error);
			}
		};

		// Start the retry loop with initial delay
		setTimeout(() => void addButtonWithRetry(), 100);
	}

	async deleteCurrentItem(file: TFile | null) {
		console.debug('[PinboxSyncer] deleteCurrentItem called with file:', file);

		if (!file) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice('No file selected');
			return;
		}

		if (!this.settings.accessToken) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice('Please login to Pinbox first');
			return;
		}

		try {
			// Check if file still exists
			const fileExists = this.app.vault.getAbstractFileByPath(file.path);
			if (!fileExists) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('File does not exist');
				return;
			}

			// Read the file to get the item ID from frontmatter
			const content = await this.app.vault.read(file);
			const idMatch = content.match(/^id:\s*(\d+)/m);

			if (!idMatch) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('Pinbox item ID not found in this file');
				return;
			}

			const itemId = idMatch[1];

			// Confirm deletion
			const confirmed = await new Promise<boolean>((resolve) => {
				const modal = new Modal(this.app);
// /skip I need use Chinese due to the majority of the target users is Chinese.
				modal.titleEl.setText('⚠️ 确认删除');

				const contentDiv = modal.contentEl.createDiv();
				contentDiv.addClass('pinbox-delete-modal');

// /skip I need use Chinese due to the majority of the target users is Chinese.
				contentDiv.createEl('p', {
					text: `确定要删除这个书签吗?`,
					cls: 'pinbox-delete-question'
				});

				contentDiv.createEl('p', {
					text: `项目 ID: ${itemId}`,
					cls: 'pinbox-delete-id'
				});

				const warningDiv = contentDiv.createDiv({ cls: 'pinbox-delete-warning' });
				warningDiv.createEl('p', {
					text: '⚠️ 此操作将会:',
					cls: 'pinbox-warning-title'
				});

				const warningList = warningDiv.createEl('ul');
				warningList.createEl('li', { text: '从 Pinbox 云端删除此书签' });
				warningList.createEl('li', { text: '删除本地 Obsidian 笔记文件' });

				warningDiv.createEl('p', {
					text: '此操作无法撤销!',
					cls: 'pinbox-warning-final'
				});

				const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

				const cancelButton = buttonContainer.createEl('button', {
					text: '取消'
				});
				cancelButton.addEventListener('click', () => {
					modal.close();
					resolve(false);
				});

				const deleteButton = buttonContainer.createEl('button', {
					text: '确认删除',
					cls: 'mod-warning'
				});
				deleteButton.addEventListener('click', () => {
					modal.close();
					resolve(true);
				});

				modal.open();
			});

			if (!confirmed) {
				// User cancelled - restore the delete button
				this.addDeleteButtonToView(file);
				return;
			}

// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice('正在从 Pinbox 删除...');

			const success = await this.api.deleteItem(itemId);

			if (success) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('已从 Pinbox 删除');
				// Delete the local file
				await this.app.fileManager.trashFile(file);
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('本地笔记已删除');
			} else {
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('从 Pinbox 删除失败');
			}
		} catch (error) {
			console.error('Delete item error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice(`Failed to delete item: ${errorMessage}`);
		}
	}

	async autoCreateIndexIfNeeded() {
		// Check if Dataview index is enabled
		if (!this.settings.enableDataviewIndex) {
			console.debug('[PinboxSyncer] Dataview index is disabled, skipping');
			return;
		}

		// Check if Dataview plugin is installed
		const dataviewPlugin = (this.app as unknown as AppWithPlugins).plugins.plugins['dataview'];
		if (!dataviewPlugin) {
			console.debug('[PinboxSyncer] Dataview plugin not installed, skipping index creation');
			return;
		}

		try {
			const indexPath = this.settings.dataviewIndexPath;
			const existingFile = this.app.vault.getAbstractFileByPath(indexPath);

			// Only create if it doesn't exist
			if (!existingFile) {
				console.debug('[PinboxSyncer] Creating Pinbox Index automatically');
				await this.createPinboxIndex(false);
			}
		} catch (error) {
			console.error('[PinboxSyncer] Error auto-creating index:', error);
			// Don't show error notice for auto-creation failures
		}
	}

	async createPinboxIndex(openFile: boolean = true) {
		// Check if Dataview plugin is installed
		const dataviewPlugin = (this.app as unknown as AppWithPlugins).plugins.plugins['dataview'];
		if (!dataviewPlugin) {
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice('Please install and enable the Dataview plugin first');
			return;
		}

		try {
			const indexPath = this.settings.dataviewIndexPath;
			// Extract filename from path for exclusion in queries
			const indexFileName = indexPath.split('/').pop()?.replace('.md', '') || '!Pinbox Index';

			const indexContent = `---
cssclass: pinbox-index
---

# Pinbox Bookmarks Index

\`\`\`dataview
TABLE
    title as "标题",
    tags as "标签",
    created_at as "创建时间",
    view as "浏览量"
FROM "${this.settings.syncFolder}"
WHERE id AND file.name != "${indexFileName}"
SORT created_at DESC
\`\`\`

## Statistics

\`\`\`dataviewjs
const pages = dv.pages('"${this.settings.syncFolder}"')
    .where(p => p.id && p.file.name != "${indexFileName}");

const totalItems = pages.length;
const types = [...new Set(pages.array().map(p => p.item_type).filter(t => t))];
const totalViews = pages.array().map(p => p.view || 0).reduce((a, b) => a + b, 0);
const allTags = pages.array().flatMap(p => {
    if (Array.isArray(p.tags)) {
        return p.tags;
    }
    return [];
}).filter(t => t);
const uniqueTags = [...new Set(allTags)];

dv.paragraph(\`
- **总项目数**: \${totalItems}
- **类型**: \${types.length > 0 ? types.join(', ') : 'N/A'}
- **总浏览量**: \${totalViews}
- **标签数**: \${uniqueTags.length}
\`);
\`\`\`

## Recent Bookmarks

\`\`\`dataview
TABLE WITHOUT ID
    file.link as "标题",
    created_at as "创建时间",
    view as "浏览量"
FROM "${this.settings.syncFolder}"
WHERE id AND file.name != "${indexFileName}"
SORT created_at DESC
LIMIT 10
\`\`\`

---
*此索引自动生成。运行 "创建/更新 Pinbox 索引" 命令可刷新。*
`;

			const existingFile = this.app.vault.getAbstractFileByPath(indexPath);

			if (existingFile && existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, indexContent);
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('Pinbox index updated');
			} else {
				await this.app.vault.create(indexPath, indexContent);
// /skip I need use Chinese due to the majority of the target users is Chinese.
				new Notice('Pinbox index created');
			}

			// Open the index file only if requested
			if (openFile) {
				const file = this.app.vault.getAbstractFileByPath(indexPath);
				if (file instanceof TFile) {
					const leaf = this.app.workspace.getLeaf(false);
					await leaf.openFile(file);
				}
			}
		} catch (error) {
			console.error('[PinboxSyncer] Create index error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice(`Failed to create index: ${errorMessage}`);
		}
	}
}
