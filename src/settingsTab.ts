/* eslint-disable obsidianmd/ui/sentence-case */
import { App, PluginSettingTab, Setting } from 'obsidian';
import PinboxSyncerPlugin from '../main';
import { PinboxAuthModal } from './authModal';

interface AppWithPlugins {
	plugins: {
		plugins: Record<string, unknown>;
	};
}

export class PinboxSettingTab extends PluginSettingTab {
	plugin: PinboxSyncerPlugin;

	constructor(app: App, plugin: PinboxSyncerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Pinbox 同步器设置").setHeading();

		// Authentication section
		new Setting(containerEl).setName("账户认证").setHeading();

		// Check if user is logged in
		const isLoggedIn = this.plugin.settings.accessToken && this.plugin.settings.accessToken.length > 0;

		new Setting(containerEl)
			.setName('登录状态')
			.setDesc(isLoggedIn ? '✅ 已登录' : '❌ 未登录')
			.addButton(button => button
				.setButtonText(isLoggedIn ? '重新登录' : '登录')
				.setCta()
				.onClick(() => {
					new PinboxAuthModal(this.app, (token) => {
						void (async () => {
							this.plugin.settings.accessToken = token;
							await this.plugin.saveSettings();
							this.plugin.updateAPIToken(token);
							this.display(); // Refresh settings display
						})();
					}).open();
				}));

		// Sync settings
		new Setting(containerEl).setName("同步设置").setHeading();

		new Setting(containerEl)
			.setName('同步文件夹')
			.setDesc('Pinbox 书签保存的文件夹位置')
			.addText(text => text
				.setPlaceholder('Pinbox')
				.setValue(this.plugin.settings.syncFolder)
				.onChange(async (value) => {
					this.plugin.settings.syncFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('自动同步')
			.setDesc('定期自动同步书签')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.startAutoSync();
					} else {
						this.plugin.stopAutoSync();
					}
				}));

		new Setting(containerEl)
			.setName('同步间隔')
			.setDesc('自动同步的时间间隔（分钟）')
			.addText(text => text
				.setPlaceholder('60')
				.setValue(String(this.plugin.settings.syncInterval))
				.onChange(async (value) => {
					const interval = parseInt(value);
					if (!isNaN(interval) && interval > 0) {
						this.plugin.settings.syncInterval = interval;
						await this.plugin.saveSettings();
						if (this.plugin.settings.autoSync) {
							this.plugin.stopAutoSync();
							this.plugin.startAutoSync();
						}
					}
				}));

		if (this.plugin.settings.lastSyncTime > 0) {
			const lastSync = new Date(this.plugin.settings.lastSyncTime);
			new Setting(containerEl)
				.setName('上次同步')
				.setDesc(`上次同步时间: ${lastSync.toLocaleString('zh-CN')}`);
		}

		new Setting(containerEl)
			.setName('立即同步')
			.setDesc('手动触发一次同步')
			.addButton(button => button
				.setButtonText('开始同步')
				.setCta()
				.onClick(async () => {
					await this.plugin.syncBookmarks();
				}));

		// Dataview Index settings
		new Setting(containerEl).setName("Dataview 索引设置").setHeading();

		// Check if Dataview plugin is installed
		const dataviewPlugin = (this.app as unknown as AppWithPlugins).plugins.plugins['dataview'];
		const isDataviewInstalled = !!dataviewPlugin;

		if (!isDataviewInstalled) {
			const warningDiv = containerEl.createDiv();
			warningDiv.addClass('pinbox-warning');
			const titleEl = warningDiv.createEl('p', {
				text: '⚠️ 未检测到 Dataview 插件'
			});
			titleEl.addClass('pinbox-warning-title');
			const descEl = warningDiv.createEl('p', {
				text: '请先安装并启用 Dataview 插件才能使用索引功能。'
			});
			descEl.addClass('pinbox-warning-desc');
		}

		new Setting(containerEl)
			.setName('启用 Dataview 索引')
			.setDesc(isDataviewInstalled
				? '自动创建和更新 Dataview 索引文件，用于查看所有书签'
				: '需要先安装 Dataview 插件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDataviewIndex)
				.setDisabled(!isDataviewInstalled)
				.onChange(async (value) => {
					this.plugin.settings.enableDataviewIndex = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide index path setting
				}));

		if (this.plugin.settings.enableDataviewIndex && isDataviewInstalled) {
			new Setting(containerEl)
				.setName('索引文件路径')
				.setDesc('Dataview 索引文件的保存位置（相对于 vault 根目录）')
				.addText(text => text
					.setPlaceholder('Pinbox/!Pinbox Index.md')
					.setValue(this.plugin.settings.dataviewIndexPath)
					.onChange(async (value) => {
						this.plugin.settings.dataviewIndexPath = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('立即创建/更新索引')
				.setDesc('手动创建或更新 Dataview 索引文件')
				.addButton(button => button
					.setButtonText('创建索引')
					.onClick(async () => {
						await this.plugin.createPinboxIndex(true);
					}));
		}
	}
}
