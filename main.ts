import { Notice, Plugin, MarkdownView, Modal } from 'obsidian';
import { PinboxSyncerSettings, DEFAULT_SETTINGS } from './src/settings';
import { PinboxAPI } from './src/pinboxApi';
import { SyncService } from './src/syncService';
import { PinboxSettingTab } from './src/settingsTab';
import { PinboxAuthModal } from './src/authModal';

export default class PinboxSyncerPlugin extends Plugin {
	settings: PinboxSyncerSettings;
	api: PinboxAPI;
	syncService: SyncService;
	syncInterval: number | null = null;

	async onload() {
		await this.loadSettings();

		// Check if this is first run and auto-enable Dataview index if plugin is installed
		if (this.settings.firstRun) {
			const dataviewPlugin = (this.app as any).plugins.plugins['dataview'];
			const isDataviewInstalled = !!dataviewPlugin;

			this.settings.enableDataviewIndex = isDataviewInstalled;
			this.settings.firstRun = false;
			await this.saveSettings();

			console.log('[PinboxSyncer] First run detected');
			console.log('[PinboxSyncer] Dataview plugin installed:', isDataviewInstalled);
			console.log('[PinboxSyncer] Dataview index enabled:', this.settings.enableDataviewIndex);
		}

		// Initialize API and sync service
		this.api = new PinboxAPI(this.settings.accessToken);
		this.syncService = new SyncService(
			this.app,
			this.api,
			this.settings.syncFolder
		);

		// Add ribbon icon
		this.addRibbonIcon('sync', '同步 Pinbox', async () => {
			await this.syncBookmarks();
		});

		// Add commands
		this.addCommand({
			id: 'sync-pinbox',
			name: '从 Pinbox 同步书签',
			callback: async () => {
				await this.syncBookmarks();
			}
		});

		this.addCommand({
			id: 'authenticate-pinbox',
			name: '登录 Pinbox',
			callback: () => {
				new PinboxAuthModal(this.app, async (token) => {
					this.settings.accessToken = token;
					await this.saveSettings();
					this.updateAPIToken(token);
					new Notice('登录成功');
				}).open();
			}
		});

		this.addCommand({
			id: 'delete-pinbox-item',
			name: '从 Pinbox 删除当前项目',
			editorCallback: async (editor, view) => {
				await this.deleteCurrentItem(view.file);
			}
		});

		this.addCommand({
			id: 'create-pinbox-index',
			name: '创建/更新 Pinbox 索引',
			callback: async () => {
				await this.createPinboxIndex();
			}
		});

		// Add settings tab
		this.addSettingTab(new PinboxSettingTab(this.app, this));

		// Register event to add delete button when files are opened
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					this.addDeleteButtonToView(file);
				}
			})
		);

		// Start auto sync if enabled
		if (this.settings.autoSync) {
			this.startAutoSync();
		}

		console.log('Pinbox Syncer plugin loaded');
	}

	onunload() {
		this.stopAutoSync();
		console.log('Pinbox Syncer plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateAPIToken(token: string) {
		this.api.setAccessToken(token);
	}

	async syncBookmarks() {
		if (!this.settings.accessToken) {
			new Notice('请先登录 Pinbox 账户');
			return;
		}

		try {
			const count = await this.syncService.sync();
			this.settings.lastSyncTime = Date.now();
			await this.saveSettings();

			// Auto-create index if it doesn't exist
			await this.autoCreateIndexIfNeeded();
		} catch (error) {
			console.error('Sync failed:', error);
			new Notice(`同步失败: ${error.message}`);
		}
	}

	startAutoSync() {
		this.stopAutoSync(); // Clear any existing interval

		const intervalMs = this.settings.syncInterval * 60 * 1000;
		this.syncInterval = window.setInterval(async () => {
			console.log('Auto-syncing Pinbox bookmarks...');
			await this.syncBookmarks();
		}, intervalMs);

		console.log(`Auto-sync started with interval: ${this.settings.syncInterval} minutes`);
	}

	stopAutoSync() {
		if (this.syncInterval !== null) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
			console.log('Auto-sync stopped');
		}
	}

	async addDeleteButtonToView(file: any) {
		// Check if file is in sync folder
		if (!file || !file.path.startsWith(this.settings.syncFolder)) {
			return;
		}

		// Don't add button to index file
		const indexFileName = this.settings.dataviewIndexPath.split('/').pop() || '!Pinbox Index.md';
		if (file.name === indexFileName) {
			return;
		}

		// Wait a bit for the view to be ready
		setTimeout(async () => {
			try {
				// Get the active view
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view || view.file !== file) {
					return;
				}

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
				if (!titleElement) {
					titleElement = view.contentEl.querySelector('.markdown-preview-view h1'); // Reading mode
				}

				if (titleElement) {
					// Create delete button next to title
					const buttonContainer = document.createElement('span');
					buttonContainer.className = 'pinbox-delete-button';
					buttonContainer.style.cssText = 'display: inline-block; margin-left: 12px; vertical-align: middle;';

					const deleteBtn = buttonContainer.createEl('button', {
						text: '🗑️ 删除'
					});
					deleteBtn.style.cssText = 'padding: 4px 10px; background: var(--background-modifier-error); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em; font-weight: 500;';

					deleteBtn.onclick = async (e) => {
						e.preventDefault();
						e.stopPropagation();
						await this.deleteCurrentItem(file);
					};

					// Insert after title
					titleElement.appendChild(buttonContainer);
				}
			} catch (error) {
				console.error('[PinboxSyncer] Error adding delete button:', error);
			}
		}, 200); // Increased timeout to ensure view is ready
	}

	async deleteCurrentItem(file: any) {
		console.log('[PinboxSyncer] deleteCurrentItem called with file:', file);

		if (!file) {
			new Notice('未选择文件');
			return;
		}

		if (!this.settings.accessToken) {
			new Notice('请先登录 Pinbox 账户');
			return;
		}

		try {
			// Check if file still exists
			const fileExists = this.app.vault.getAbstractFileByPath(file.path);
			if (!fileExists) {
				new Notice('文件不存在');
				return;
			}

			// Read the file to get the item ID from frontmatter
			const content = await this.app.vault.read(file);
			const idMatch = content.match(/^id:\s*(\d+)/m);

			if (!idMatch) {
				new Notice('此文件中未找到 Pinbox 项目 ID');
				return;
			}

			const itemId = idMatch[1];

			// Confirm deletion
			const confirmed = await new Promise<boolean>((resolve) => {
				const modal = new Modal(this.app);
				modal.titleEl.setText('⚠️ 确认删除');

				const contentDiv = modal.contentEl.createDiv();
				contentDiv.style.cssText = 'line-height: 1.6;';

				contentDiv.createEl('p', {
					text: `确定要删除此书签吗？`
				}).style.cssText = 'margin-bottom: 10px; font-weight: 500;';

				contentDiv.createEl('p', {
					text: `项目 ID: ${itemId}`
				}).style.cssText = 'margin-bottom: 10px; color: var(--text-muted); font-size: 0.9em;';

				const warningDiv = contentDiv.createDiv();
				warningDiv.style.cssText = 'padding: 10px; background: var(--background-secondary); border-radius: 5px; margin-bottom: 15px;';
				warningDiv.createEl('p', {
					text: '⚠️ 此操作将:'
				}).style.cssText = 'margin: 0 0 5px 0; font-weight: bold;';

				const warningList = warningDiv.createEl('ul');
				warningList.style.cssText = 'margin: 0; padding-left: 20px;';
				warningList.createEl('li', { text: '从 Pinbox 云端删除此书签' });
				warningList.createEl('li', { text: '删除本地 Obsidian 笔记文件' });

				warningDiv.createEl('p', {
					text: '此操作不可恢复！'
				}).style.cssText = 'margin: 10px 0 0 0; color: var(--text-error); font-weight: bold;';

				const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
				buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;';

				const cancelButton = buttonContainer.createEl('button', { text: '取消' });
				cancelButton.style.cssText = 'padding: 8px 16px; border-radius: 4px;';
				cancelButton.addEventListener('click', () => {
					modal.close();
					resolve(false);
				});

				const deleteButton = buttonContainer.createEl('button', {
					text: '确认删除',
					cls: 'mod-warning'
				});
				deleteButton.style.cssText = 'padding: 8px 16px; background: var(--background-modifier-error); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;';
				deleteButton.addEventListener('click', () => {
					modal.close();
					resolve(true);
				});

				modal.open();
			});

			if (!confirmed) {
				return;
			}

			new Notice('正在从 Pinbox 删除项目...');

			const success = await this.api.deleteItem(itemId);

			if (success) {
				new Notice('已从 Pinbox 删除项目');
				// Delete the local file
				await this.app.vault.delete(file);
				new Notice('本地笔记已删除');
			} else {
				new Notice('从 Pinbox 删除项目失败');
			}
		} catch (error) {
			console.error('Delete item error:', error);
			new Notice(`删除项目失败: ${error.message}`);
		}
	}

	async autoCreateIndexIfNeeded() {
		// Check if Dataview index is enabled
		if (!this.settings.enableDataviewIndex) {
			console.log('[PinboxSyncer] Dataview index is disabled, skipping');
			return;
		}

		// Check if Dataview plugin is installed
		const dataviewPlugin = (this.app as any).plugins.plugins['dataview'];
		if (!dataviewPlugin) {
			console.log('[PinboxSyncer] Dataview plugin not installed, skipping index creation');
			return;
		}

		try {
			const indexPath = this.settings.dataviewIndexPath;
			const existingFile = this.app.vault.getAbstractFileByPath(indexPath);

			// Only create if it doesn't exist
			if (!existingFile) {
				console.log('[PinboxSyncer] Creating Pinbox Index automatically');
				await this.createPinboxIndex(false);
			}
		} catch (error) {
			console.error('[PinboxSyncer] Error auto-creating index:', error);
			// Don't show error notice for auto-creation failures
		}
	}

	async createPinboxIndex(openFile: boolean = true) {
		// Check if Dataview plugin is installed
		const dataviewPlugin = (this.app as any).plugins.plugins['dataview'];
		if (!dataviewPlugin) {
			new Notice('请先安装并启用 Dataview 插件');
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

			if (existingFile) {
				await this.app.vault.modify(existingFile as any, indexContent);
				new Notice('Pinbox 索引已更新');
			} else {
				await this.app.vault.create(indexPath, indexContent);
				new Notice('Pinbox 索引已创建');
			}

			// Open the index file only if requested
			if (openFile) {
				const file = this.app.vault.getAbstractFileByPath(indexPath);
				if (file) {
					await (this.app.workspace as any).getLeaf().openFile(file);
				}
			}
		} catch (error) {
			console.error('[PinboxSyncer] Create index error:', error);
			new Notice(`创建索引失败: ${error.message}`);
		}
	}
}
