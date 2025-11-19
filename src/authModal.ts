import { App, Modal, Notice, Setting } from 'obsidian';
import { OAuthServer } from './oauthServer';
import { PinboxLoginWindow } from './pinboxLoginWindow';

export class PinboxAuthModal extends Modal {
	private onSubmit: (token: string) => void;
	private iframe: HTMLIFrameElement | null = null;
	private checkInterval: number | null = null;
	private loginWindow: Window | null = null;
	private electronLoginWindow: PinboxLoginWindow | null = null;
	private oauthServer: OAuthServer;
	private sessionId: string;
	private isPolling: boolean = false;

	constructor(app: App, onSubmit: (token: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
		this.oauthServer = new OAuthServer();
		this.sessionId = this.generateSessionId();
	}

	private generateSessionId(): string {
		return Math.random().toString(36).substring(2, 15) +
		       Math.random().toString(36).substring(2, 15);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('pinbox-auth-modal');

		console.debug('[PinboxAuthModal] Opening auth modal');

		contentEl.createEl('h2', { text: 'Pinbox 微信登录' }); // /skip I need use Chinese due to the majority of the target users is Chinese.

		// Electron login section
		const electronLoginSection = contentEl.createEl('div', {
			cls: 'pinbox-electron-login'
		});

		// Title and button in one row
		const headerRow = electronLoginSection.createEl('div', {
			cls: 'pinbox-electron-login-header'
		});

		headerRow.createEl('h3', {
			text: '✨ 使用独立窗口登录' // /skip I need use Chinese due to the majority of the target users is Chinese.
		});

		const loginBtn = headerRow.createEl('button', {
			text: '在独立窗口中登录', // /skip I need use Chinese due to the majority of the target users is Chinese.
			cls: 'pinbox-electron-login-btn'
		});
		loginBtn.onclick = () => {
			this.openElectronLoginWindow();
		};

		electronLoginSection.createEl('p', {
			text: '扫码后自动获取令牌，无需手动操作。', // /skip I need use Chinese due to the majority of the target users is Chinese.
			cls: 'pinbox-electron-login-desc'
		});

		// Manual token input option
		contentEl.createEl('p', {
			text: '如果独立窗口登录失败,可以手动输入令牌:', // /skip I need use Chinese due to the majority of the target users is Chinese.
			cls: 'pinbox-alternative'
		});

		// Manual token input
		const manualInput = contentEl.createEl('div', {
			cls: 'pinbox-manual-input'
		});

		let manualToken = '';

		new Setting(manualInput)
			.setName('手动输入令牌') // /skip I need use Chinese due to the majority of the target users is Chinese.
			.setDesc('如果自动获取失败，请手动粘贴令牌') // /skip I need use Chinese due to the majority of the target users is Chinese.
			.addText(text => text
				.setPlaceholder('粘贴您的访问令牌') // /skip I need use Chinese due to the majority of the target users is Chinese.
				.setValue(manualToken)
				.onChange(value => {
					manualToken = value;
				}))
			.addButton(btn => btn
				.setButtonText('提交令牌') // /skip I need use Chinese due to the majority of the target users is Chinese.
				.setCta()
				.onClick(() => {
					if (!manualToken) {
						new Notice('请输入访问令牌'); // /skip I need use Chinese due to the majority of the target users is Chinese.
						return;
					}
					console.debug('[PinboxAuthModal] Manual token submitted');
					this.onSubmit(manualToken);
					this.close();
				}));

		// Add instruction to explain how to get token manually
		const limitationNote = contentEl.createEl('div', {
			cls: 'pinbox-limitation-note'
		});
		limitationNote.addClass('pinbox-limitation-note');

		const noteTitle = limitationNote.createEl('p', {
			text: '💡 手动获取令牌的步骤' // /skip I need use Chinese due to the majority of the target users is Chinese.
		});
		noteTitle.addClass('pinbox-note-title');

		const steps = limitationNote.createEl('ol');
		steps.addClass('pinbox-steps-list');

		steps.createEl('li', { text: '点击下方"在浏览器中打开登录页"按钮' }); // /skip I need use Chinese due to the majority of the target users is Chinese.
		steps.createEl('li', { text: '在浏览器中使用微信扫码登录 Pinbox' }); // /skip I need use Chinese due to the majority of the target users is Chinese.
		steps.createEl('li', { text: '登录后按 F12 打开开发者工具' }); // /skip I need use Chinese due to the majority of the target users is Chinese.

		const step4 = steps.createEl('li');
		step4.createSpan({ text: '切换到 ' }); // /skip I need use Chinese due to the majority of the target users is Chinese.
		step4.createEl('strong', { text: 'Console' });
		step4.appendText(' 标签，复制并粘贴以下代码后回车：'); // /skip I need use Chinese due to the majority of the target users is Chinese.

		// Add code block for easy copying
		const codeBlock = limitationNote.createEl('div');
		codeBlock.addClass('pinbox-code-block');

		const codeText = codeBlock.createEl('code');
		codeText.addClass('pinbox-code-text');
		codeText.textContent = 'JSON.parse(localStorage.getItem(\'alpha_info\')).token';

		// Add copy button
		const copyBtn = codeBlock.createEl('button', { text: '📋' });
		copyBtn.addClass('pinbox-copy-btn');
		copyBtn.onclick = () => {
			void navigator.clipboard.writeText('JSON.parse(localStorage.getItem(\'alpha_info\')).token');
			copyBtn.textContent = '✓';
			setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
		};

		steps.createEl('li', { text: '复制显示的 token（不含引号），粘贴到上方输入框并提交' }); // /skip I need use Chinese due to the majority of the target users is Chinese.

		// Add open in browser button
// /skip I need use Chinese due to the majority of the target users is Chinese.
		new Setting(contentEl)
			.setName('在浏览器中打开') // /skip I need use Chinese due to the majority of the target users is Chinese.
			.setDesc('打开Pinbox网站进行登录') // /skip I need use Chinese due to the majority of the target users is Chinese.
			.addButton(btn => btn
				.setButtonText('在浏览器中打开登录页') // /skip I need use Chinese due to the majority of the target users is Chinese.
				.onClick(() => {
					const loginUrl = `https://withpinbox.com/login`;
					window.open(loginUrl, '_blank');
					new Notice('请在浏览器中完成登录，然后按上述步骤获取令牌'); // /skip I need use Chinese due to the majority of the target users is Chinese.
				}));

		console.debug('[PinboxAuthModal] Auth modal setup complete');
	}

	private openElectronLoginWindow() {
		console.debug('[PinboxAuthModal] Opening Electron login window');

		try {
			// Create login window
			this.electronLoginWindow = new PinboxLoginWindow((token: string) => {
				console.debug('[PinboxAuthModal] Token received from Electron window');
				this.onSubmit(token);
				new Notice('登录成功！令牌已保存'); // /skip I need use Chinese due to the majority of the target users is Chinese.
				this.close();
			});

			// Start login process
			void this.electronLoginWindow.doLogin();

			// Show notice
			new Notice('登录窗口已打开，请扫描二维码'); // /skip I need use Chinese due to the majority of the target users is Chinese.

		} catch (error) {
			console.error('[PinboxAuthModal] Failed to open Electron login window:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice('无法打开登录窗口：' + errorMessage + '\n请使用下方的内嵌二维码或手动输入令牌'); // /skip I need use Chinese due to the majority of the target users is Chinese.
		}
	}

	onClose() {
		const { contentEl } = this;

		console.debug('[PinboxAuthModal] Closing auth modal');

		// Clean up interval
		if (this.checkInterval !== null) {
			window.clearInterval(this.checkInterval);
			this.checkInterval = null;
		}

		// Stop polling
		this.isPolling = false;

		// Clean up OAuth server
		this.oauthServer.stop();

		// Clean up Electron login window
		if (this.electronLoginWindow) {
			console.debug('[PinboxAuthModal] Closing Electron login window');
			this.electronLoginWindow.close();
			this.electronLoginWindow = null;
		}

		// Clean up iframe
		if (this.iframe) {
			this.iframe.remove();
			this.iframe = null;
		}

		contentEl.empty();
	}
}
