import { Notice, Plugin, MarkdownView, Modal, TFile, setIcon, normalizePath, addIcon } from 'obsidian';
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

		// Register custom sync icon
		addIcon('pinbox-sync', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">
			<!-- Top arrow (right direction) -->
			<path d="M 25 15 L 75 15 L 75 20 L 70 15 L 75 10 L 75 15" stroke="currentColor" stroke-width="3" fill="none" stroke-linejoin="miter"/>
			<path d="M 70 10 L 80 15 L 70 20 Z" fill="currentColor"/>

			<!-- Right arrow (down direction) -->
			<path d="M 85 25 L 85 75 L 90 75 L 85 80 L 80 75 L 85 75" stroke="currentColor" stroke-width="3" fill="none" stroke-linejoin="miter"/>
			<path d="M 80 70 L 85 80 L 90 70 Z" fill="currentColor"/>

			<!-- Bottom arrow (left direction) -->
			<path d="M 75 85 L 25 85 L 25 80 L 30 85 L 25 90 L 25 85" stroke="currentColor" stroke-width="3" fill="none" stroke-linejoin="miter"/>
			<path d="M 30 90 L 20 85 L 30 80 Z" fill="currentColor"/>

			<!-- Left arrow (up direction) -->
			<path d="M 15 75 L 15 25 L 10 25 L 15 20 L 20 25 L 15 25" stroke="currentColor" stroke-width="3" fill="none" stroke-linejoin="miter"/>
			<path d="M 20 30 L 15 20 L 10 30 Z" fill="currentColor"/>

			<!-- PINBOX text in center -->
			<text x="50" y="48" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="currentColor">PIN</text>
			<text x="50" y="62" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="currentColor">BOX</text>
		</svg>`);

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
			this.settings.syncFolder,
			this.settings.downloadImages,
			this.settings.imageFolder
		);

		// Add ribbon icon
// /skip I need use Chinese due to the majority of the target users is Chinese.
		this.addRibbonIcon('pinbox-sync', 'Sync from Pinbox', () => {
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
						new Notice('登录成功'); // /skip I need use Chinese due to the majority of the target users is Chinese.
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
		// Update sync service settings
		this.syncService.setDownloadImages(this.settings.downloadImages);
		this.syncService.setImageFolder(this.settings.imageFolder);
	}

	updateAPIToken(token: string) {
		this.api.setAccessToken(token);
	}

	async syncBookmarks() {
		if (!this.settings.accessToken) {
			new Notice('请先登录 Pinbox'); // /skip I need use Chinese due to the majority of the target users is Chinese.
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
			new Notice(`同步失败: ${errorMessage}`); // /skip I need use Chinese due to the majority of the target users is Chinese.
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
							'aria-label': '删除书签', // /skip I need use Chinese due to the majority of the target users is Chinese.
							'title': '删除书签' // /skip I need use Chinese due to the majority of the target users is Chinese.
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
			new Notice('未选择文件'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			return;
		}

		if (!this.settings.accessToken) {
			new Notice('请先登录 Pinbox'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			return;
		}

		try {
			// Check if file still exists
			const fileExists = this.app.vault.getAbstractFileByPath(file.path);
			if (!fileExists) {
				new Notice('文件不存在'); // /skip I need use Chinese due to the majority of the target users is Chinese.
				return;
			}

			// Read the file to get the item ID from frontmatter
			const content = await this.app.vault.read(file);
			const idMatch = content.match(/^id:\s*(\d+)/m);

			if (!idMatch) {
				new Notice('在此文件中未找到 Pinbox 项目 ID'); // /skip I need use Chinese due to the majority of the target users is Chinese.
				return;
			}

			const itemId = idMatch[1];

			// Confirm deletion
			const confirmed = await new Promise<boolean>((resolve) => {
				const modal = new Modal(this.app);
				modal.titleEl.setText('⚠️ 确认删除'); // /skip I need use Chinese due to the majority of the target users is Chinese.

				const contentDiv = modal.contentEl.createDiv();
				contentDiv.addClass('pinbox-delete-modal');

// /skip I need use Chinese due to the majority of the target users is Chinese.
				contentDiv.createEl('p', {
					text: `确定要删除这个书签吗?`, // /skip I need use Chinese due to the majority of the target users is Chinese.
					cls: 'pinbox-delete-question'
				});

				contentDiv.createEl('p', {
					text: `项目 ID: ${itemId}`, // /skip I need use Chinese due to the majority of the target users is Chinese.
					cls: 'pinbox-delete-id'
				});

				const warningDiv = contentDiv.createDiv({ cls: 'pinbox-delete-warning' });
				warningDiv.createEl('p', {
					text: '⚠️ 此操作将会:', // /skip I need use Chinese due to the majority of the target users is Chinese.
					cls: 'pinbox-warning-title'
				});

				const warningList = warningDiv.createEl('ul');
				warningList.createEl('li', { text: '从 Pinbox 云端删除此书签' }); // /skip I need use Chinese due to the majority of the target users is Chinese.
				warningList.createEl('li', { text: '删除本地 Obsidian 笔记文件' }); // /skip I need use Chinese due to the majority of the target users is Chinese.

				warningDiv.createEl('p', {
					text: '此操作无法撤销!', // /skip I need use Chinese due to the majority of the target users is Chinese.
					cls: 'pinbox-warning-final'
				});

				const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

				const cancelButton = buttonContainer.createEl('button', {
					text: '取消' // /skip I need use Chinese due to the majority of the target users is Chinese.
				});
				cancelButton.addEventListener('click', () => {
					modal.close();
					resolve(false);
				});

				const deleteButton = buttonContainer.createEl('button', {
					text: '确认删除', // /skip I need use Chinese due to the majority of the target users is Chinese.
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

			new Notice('正在从 Pinbox 删除...'); // /skip I need use Chinese due to the majority of the target users is Chinese.

			const success = await this.api.deleteItem(itemId);

			if (success) {
				new Notice('已从 Pinbox 删除'); // /skip I need use Chinese due to the majority of the target users is Chinese.

				// Delete the local file
				await this.app.fileManager.trashFile(file);
				new Notice('本地笔记已删除'); // /skip I need use Chinese due to the majority of the target users is Chinese.

				// Delete the image folder if downloadImages is enabled
				if (this.settings.downloadImages) {
					await this.deleteImageFolder(itemId);
				}
			} else {
				new Notice('从 Pinbox 删除失败'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			}
		} catch (error) {
			console.error('Delete item error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`删除项目失败: ${errorMessage}`); // /skip I need use Chinese due to the majority of the target users is Chinese.
		}
	}

	async deleteImageFolder(itemId: string) {
		try {
			const imageFolderPath = normalizePath(`${this.settings.imageFolder}/${itemId}`);
			const imageFolder = this.app.vault.getAbstractFileByPath(imageFolderPath);

			if (imageFolder) {
				console.debug(`[PinboxSyncer] Deleting image folder: ${imageFolderPath}`);
				await this.app.fileManager.trashFile(imageFolder);
				console.debug(`[PinboxSyncer] Image folder deleted: ${imageFolderPath}`);
			} else {
				console.debug(`[PinboxSyncer] Image folder not found: ${imageFolderPath}`);
			}
		} catch (error) {
			console.error(`[PinboxSyncer] Error deleting image folder for item ${itemId}:`, error);
			// Don't throw error, just log it - deletion of images is not critical
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
			new Notice('请先安装并启用 Dataview 插件'); // /skip I need use Chinese due to the majority of the target users is Chinese.
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
    title as "标题", // /skip I need use Chinese due to the majority of the target users is Chinese.
    tags as "标签", // /skip I need use Chinese due to the majority of the target users is Chinese.
    created_at as "创建时间", // /skip I need use Chinese due to the majority of the target users is Chinese.
    view as "浏览量" // /skip I need use Chinese due to the majority of the target users is Chinese.
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
- **总项目数**: \${totalItems} // /skip I need use Chinese due to the majority of the target users is Chinese.
- **类型**: \${types.length > 0 ? types.join(', ') : 'N/A'} // /skip I need use Chinese due to the majority of the target users is Chinese.
- **总浏览量**: \${totalViews} // /skip I need use Chinese due to the majority of the target users is Chinese.
- **标签数**: \${uniqueTags.length} // /skip I need use Chinese due to the majority of the target users is Chinese.
\`);
\`\`\`

## Recent Bookmarks

\`\`\`dataview
TABLE WITHOUT ID
    file.link as "标题", // /skip I need use Chinese due to the majority of the target users is Chinese.
    created_at as "创建时间", // /skip I need use Chinese due to the majority of the target users is Chinese.
    view as "浏览量" // /skip I need use Chinese due to the majority of the target users is Chinese.
FROM "${this.settings.syncFolder}"
WHERE id AND file.name != "${indexFileName}"
SORT created_at DESC
LIMIT 10
\`\`\`

---
*此索引自动生成。运行 "创建/更新 Pinbox 索引" 命令可刷新。* // /skip I need use Chinese due to the majority of the target users is Chinese.
`;

			const existingFile = this.app.vault.getAbstractFileByPath(indexPath);

			if (existingFile && existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, indexContent);
				new Notice('Pinbox 索引已更新'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			} else {
				await this.app.vault.create(indexPath, indexContent);
				new Notice('Pinbox 索引已创建'); // /skip I need use Chinese due to the majority of the target users is Chinese.
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
			new Notice(`创建索引失败: ${errorMessage}`); // /skip I need use Chinese due to the majority of the target users is Chinese.
		}
	}
}
