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
	isSyncing: boolean = false;
	syncProgressNotice: Notice | null = null;

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
					// Use setTimeout to ensure view is ready
					setTimeout(() => {
						void this.addDeleteButtonToView(file);
					}, 500);
				}
			})
		);

		// Also listen to layout-change event for better timing
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					void this.addDeleteButtonToView(activeFile);
				}
			})
		);

		// Also check if there's already an active file open
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			void this.addDeleteButtonToView(activeFile);
		}

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

		// Check if already syncing
		if (this.isSyncing) {
			new Notice('正在同步中，请稍候...'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			return;
		}

		try {
			this.isSyncing = true;
			this.syncProgressNotice = new Notice('开始同步...', 0); // /skip I need use Chinese due to the majority of the target users is Chinese.

			// Set up progress callback to update the notice
			this.syncService.setProgressCallback((progress: string) => {
				if (this.syncProgressNotice) {
					this.syncProgressNotice.setMessage(progress);
				}
			});

			const syncedCount = await this.syncService.sync();

			this.settings.lastSyncTime = Date.now();
			await this.saveSettings();

			// Update progress notice
			if (this.syncProgressNotice) {
				this.syncProgressNotice.hide();
			}
			new Notice(`同步完成：共处理 ${syncedCount} 个书签`); // /skip I need use Chinese due to the majority of the target users is Chinese.

			// Auto-create index if it doesn't exist
			await this.autoCreateIndexIfNeeded();
		} catch (error) {
			console.error('Sync failed:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			if (this.syncProgressNotice) {
				this.syncProgressNotice.hide();
			}
			new Notice(`同步失败: ${errorMessage}`); // /skip I need use Chinese due to the majority of the target users is Chinese.
		} finally {
			this.isSyncing = false;
			this.syncService.setProgressCallback(null);
			if (this.syncProgressNotice) {
				this.syncProgressNotice.hide();
				this.syncProgressNotice = null;
			}
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
		// First, remove any existing buttons from all views
		const allLeaves = this.app.workspace.getLeavesOfType('markdown');
		allLeaves.forEach(leaf => {
			const existingButtons = leaf.view.containerEl.querySelectorAll('.pinbox-delete-button');
			existingButtons.forEach(btn => btn.remove());
		});

		// Check if file is in sync folder
		if (!file || !file.path.startsWith(this.settings.syncFolder)) {
			return;
		}

		// Don't add button to index file
		const indexBaseName = this.settings.dataviewIndexPath.split('/').pop()?.replace(/\.(md|base)$/, '') || '!Pinbox Index';
		if (file.basename === indexBaseName) {
			return;
		}

		// Use DOM-based approach instead of relying on getActiveViewOfType
		const addButtonWithRetry = async (attempt = 1, maxAttempts = 10) => {

			// Find the markdown view leaf that's showing this file
			const leaves = this.app.workspace.getLeavesOfType('markdown');

			// Find the leaf that contains our file
			let targetLeaf = null;
			for (const leaf of leaves) {
				const leafView = leaf.view as any;
				if (leafView.file && leafView.file.path === file.path) {
					targetLeaf = leaf;
					break;
				}
			}

			if (!targetLeaf) {
				if (attempt < maxAttempts) {
					setTimeout(() => void addButtonWithRetry(attempt + 1, maxAttempts), 200 * attempt);
					return;
				} else {
					return;
				}
			}

			const view = targetLeaf.view;

			try {

				// Check if file has Pinbox ID
				const content = await this.app.vault.read(file);
				const idMatch = content.match(/^id:\s*(\d+)/m);
				if (!idMatch) {
					return;
				}

				// Remove existing button if any
				const containerEl = view.containerEl;
				const existingButtons = containerEl.querySelectorAll('.pinbox-delete-button');
				existingButtons.forEach(btn => btn.remove());

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

				// Insert button directly into the container
				containerEl.appendChild(buttonContainer);
			} catch (error) {
				console.error('[PinboxSyncer] Error adding delete button:', error);
			}
		};

		// Start the retry loop with initial delay
		setTimeout(() => void addButtonWithRetry(), 100);
	}

	async deleteCurrentItem(file: TFile | null) {
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
		// Check if index generation is disabled
		if (this.settings.indexFormat === 'none') {
			new Notice('索引生成已禁用'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			return;
		}

		// Check if Dataview plugin is installed (only needed for dataview format)
		if (this.settings.indexFormat === 'dataview') {
			const dataviewPlugin = (this.app as unknown as AppWithPlugins).plugins.plugins['dataview'];
			if (!dataviewPlugin) {
				new Notice('请先安装并启用 Dataview 插件'); // /skip I need use Chinese due to the majority of the target users is Chinese.
				return;
			}
		}

		try {
			const basePath = this.settings.dataviewIndexPath;
			// Determine file extension based on format
			const extension = this.settings.indexFormat === 'base' ? '.base' : '.md';
			const indexPath = basePath.endsWith('.md') || basePath.endsWith('.base')
				? basePath.replace(/\.(md|base)$/, extension)
				: basePath + extension;

			// Extract filename from path for exclusion in queries
			const indexFileName = indexPath.split('/').pop()?.replace(/\.(md|base)$/, '') || '!Pinbox Index';

			let indexContent = '';

			if (this.settings.indexFormat === 'dataview') {
				indexContent = this.generateDataviewIndex(indexFileName);
			} else if (this.settings.indexFormat === 'base') {
				indexContent = await this.generateBaseIndex(indexFileName);
			}

			if (!indexContent) {
				return;
			}

			// Check for existing files with different extensions and remove them
			const mdPath = basePath.endsWith('.md') ? basePath : basePath + '.md';
			const basePath2 = basePath.endsWith('.base') ? basePath : basePath + '.base';

			if (this.settings.indexFormat === 'base') {
				// Remove .md file if switching to .base
				const oldMdFile = this.app.vault.getAbstractFileByPath(mdPath);
				if (oldMdFile instanceof TFile) {
					await this.app.vault.delete(oldMdFile);
				}
			} else if (this.settings.indexFormat === 'dataview') {
				// Remove .base file if switching to .md
				const oldBaseFile = this.app.vault.getAbstractFileByPath(basePath2);
				if (oldBaseFile instanceof TFile) {
					await this.app.vault.delete(oldBaseFile);
				}
			}

			const existingFile = this.app.vault.getAbstractFileByPath(indexPath);

			if (existingFile && existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, indexContent);
				new Notice('Pinbox 索引已更新'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			} else {
				await this.app.vault.create(indexPath, indexContent);
				new Notice('Pinbox 索引已创建'); // /skip I need use Chinese due to the majority of the target users is Chinese.
			}

			if (openFile) {
				const file = this.app.vault.getAbstractFileByPath(indexPath);
				if (file instanceof TFile) {
					await this.app.workspace.getLeaf().openFile(file);
				}
			}
		} catch (error) {
			console.error('[PinboxSyncer] Error creating index:', error);
			new Notice('创建索引失败：' + (error as Error).message); // /skip I need use Chinese due to the majority of the target users is Chinese.
		}
	}

	private generateDataviewIndex(indexFileName: string): string {
		return `---
cssclass: pinbox-index
---

# Pinbox Bookmarks Index

\`\`\`dataview
TABLE
    标题 as "标题", // /skip I need use Chinese due to the majority of the target users is Chinese.
    标签 as "标签", // /skip I need use Chinese due to the majority of the target users is Chinese.
    创建时间 as "创建时间", // /skip I need use Chinese due to the majority of the target users is Chinese.
    浏览量 as "浏览量" // /skip I need use Chinese due to the majority of the target users is Chinese.
FROM "${this.settings.syncFolder}"
WHERE id AND file.name != "${indexFileName}"
SORT 创建时间 DESC
\`\`\`

## Statistics

\`\`\`dataviewjs
const pages = dv.pages('"${this.settings.syncFolder}"')
    .where(p => p.id && p.file.name != "${indexFileName}");

const totalItems = pages.length;
const types = [...new Set(pages.array().map(p => p.类型).filter(t => t))];
const totalViews = pages.array().map(p => p.浏览量 || 0).reduce((a, b) => a + b, 0);
const allTags = pages.array().flatMap(p => {
    if (Array.isArray(p.标签)) {
        return p.标签;
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
    创建时间 as "创建时间", // /skip I need use Chinese due to the majority of the target users is Chinese.
    浏览量 as "浏览量" // /skip I need use Chinese due to the majority of the target users is Chinese.
FROM "${this.settings.syncFolder}"
WHERE id AND file.name != "${indexFileName}"
SORT 创建时间 DESC
LIMIT 10
\`\`\`

---
*此索引自动生成。运行 "创建/更新 Pinbox 索引" 命令可刷新。* // /skip I need use Chinese due to the majority of the target users is Chinese.
`;
	}

	private async generateBaseIndex(indexFileName: string): Promise<string> {
		// Generate Obsidian Base (.base file) format
		// Base files use YAML to define views, filters, and formulas

		const baseContent = `filters:
  and:
    - file.inFolder("${this.settings.syncFolder}")
    - id

formulas:
  file_link: 'file.asLink(file.name)'

properties:
  formula.file_link:
    displayName: 文件名
  描述:
    displayName: 描述
  标签:
    displayName: 标签
  创建时间:
    displayName: 创建时间
  同步时间:
    displayName: 同步时间
  浏览量:
    displayName: 浏览量
  类型:
    displayName: 类型
  链接:
    displayName: 链接

views:
  - type: table
    name: 所有书签
    order:
      - formula.file_link
      - 描述
      - 标签
      - 创建时间
      - 同步时间
      - 浏览量
    summaries:
      浏览量: Sum

  - type: table
    name: 最近添加
    limit: 10
    order:
      - formula.file_link
      - 描述
      - 创建时间
      - 同步时间
      - 浏览量

  - type: table
    name: 按类型分组
    groupBy:
      property: 类型
      direction: ASC
    order:
      - formula.file_link
      - 描述
      - 创建时间
      - 同步时间
      - 浏览量
    summaries:
      浏览量: Sum

  - type: table
    name: 高浏览量
    filters:
      and:
        - 浏览量 > 0
    order:
      - formula.file_link
      - 描述
      - 浏览量
      - 创建时间
      - 同步时间
    limit: 20
`;

		return baseContent;
	}
}
