import { App, Modal, Notice, Setting, requestUrl } from 'obsidian';
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

		console.log('[PinboxAuthModal] Opening auth modal');

		contentEl.createEl('h2', { text: 'Pinbox 微信登录' });

		// Electron login section
		const electronLoginSection = contentEl.createEl('div', {
			cls: 'pinbox-electron-login'
		});
		electronLoginSection.style.marginBottom = '20px';
		electronLoginSection.style.padding = '15px';
		electronLoginSection.style.backgroundColor = 'var(--background-secondary)';
		electronLoginSection.style.borderRadius = '8px';

		// Title and button in one row
		const headerRow = electronLoginSection.createEl('div');
		headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';

		headerRow.createEl('h3', {
			text: '✨ 使用独立窗口登录'
		}).style.cssText = 'margin: 0; font-size: 1.1em;';

		const loginBtn = headerRow.createEl('button', {
			text: '在独立窗口中登录'
		});
		loginBtn.style.cssText = 'padding: 6px 16px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer; font-weight: 500;';
		loginBtn.onclick = () => {
			this.openElectronLoginWindow();
		};

		electronLoginSection.createEl('p', {
			text: '扫码后自动获取令牌，无需手动操作。'
		}).style.cssText = 'font-size: 0.9em; margin: 0; color: var(--text-muted);';

		// Manual token input option
		contentEl.createEl('p', {
			text: '如果独立窗口登录失败,可以手动输入令牌:',
			cls: 'pinbox-alternative'
		}).style.marginTop = '20px';

		// Manual token input
		const manualInput = contentEl.createEl('div', {
			cls: 'pinbox-manual-input'
		});

		manualInput.style.marginTop = '15px';

		let manualToken = '';

		new Setting(manualInput)
			.setName('手动输入令牌')
			.setDesc('如果自动获取失败，请手动粘贴令牌')
			.addText(text => text
				.setPlaceholder('粘贴您的访问令牌')
				.setValue(manualToken)
				.onChange(value => {
					manualToken = value;
				}))
			.addButton(btn => btn
				.setButtonText('提交令牌')
				.setCta()
				.onClick(() => {
					if (!manualToken) {
						new Notice('请输入访问令牌');
						return;
					}
					console.log('[PinboxAuthModal] Manual token submitted');
					this.onSubmit(manualToken);
					this.close();
				}));

		// Add instruction to explain how to get token manually
		const limitationNote = contentEl.createEl('div', {
			cls: 'pinbox-limitation-note'
		});
		limitationNote.style.marginTop = '15px';
		limitationNote.style.padding = '15px';
		limitationNote.style.backgroundColor = 'var(--background-secondary)';
		limitationNote.style.borderRadius = '8px';
		limitationNote.style.fontSize = '0.9em';
		limitationNote.style.color = 'var(--text-normal)';

		limitationNote.createEl('p', {
			text: '💡 手动获取令牌的步骤'
		}).style.cssText = 'margin: 0 0 10px 0; font-weight: bold; font-size: 1.05em;';

		const steps = limitationNote.createEl('ol');
		steps.style.cssText = 'margin: 0; padding-left: 20px; line-height: 1.8;';

		steps.createEl('li', { text: '点击下方"在浏览器中打开登录页"按钮' });
		steps.createEl('li', { text: '在浏览器中使用微信扫码登录 Pinbox' });
		steps.createEl('li', { text: '登录后按 F12 打开开发者工具' });

		const step4 = steps.createEl('li');
		step4.innerHTML = '切换到 <strong>Console</strong> 标签，复制并粘贴以下代码后回车：';

		// Add code block for easy copying
		const codeBlock = limitationNote.createEl('div');
		codeBlock.style.cssText = 'margin: 10px 0; padding: 12px; background-color: var(--background-primary); border-radius: 5px; font-family: monospace; position: relative; border: 1px solid var(--background-modifier-border);';

		const codeText = codeBlock.createEl('code');
		codeText.style.cssText = 'user-select: all; display: block; word-break: break-all; color: var(--text-accent);';
		codeText.textContent = 'JSON.parse(localStorage.getItem(\'alpha_info\')).token';

		// Add copy button
		const copyBtn = codeBlock.createEl('button', { text: '📋' });
		copyBtn.style.cssText = 'position: absolute; top: 8px; right: 8px; padding: 6px 10px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer; font-size: 1em;';
		copyBtn.onclick = () => {
			navigator.clipboard.writeText('JSON.parse(localStorage.getItem(\'alpha_info\')).token');
			copyBtn.textContent = '✓';
			setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
		};

		steps.createEl('li', { text: '复制显示的 token（不含引号），粘贴到上方输入框并提交' });

		// Add open in browser button
		new Setting(contentEl)
			.setName('在浏览器中打开')
			.setDesc('打开Pinbox网站进行登录')
			.addButton(btn => btn
				.setButtonText('在浏览器中打开登录页')
				.onClick(() => {
					const loginUrl = `https://withpinbox.com/login`;
					window.open(loginUrl, '_blank');
					new Notice('请在浏览器中完成登录，然后按上述步骤获取令牌');
				}));

		console.log('[PinboxAuthModal] Auth modal setup complete');
	}

	private openElectronLoginWindow() {
		console.log('[PinboxAuthModal] Opening Electron login window');

		try {
			// Create login window
			this.electronLoginWindow = new PinboxLoginWindow((token: string) => {
				console.log('[PinboxAuthModal] Token received from Electron window');
				this.onSubmit(token);
				new Notice('登录成功！令牌已保存');
				this.close();
			});

			// Start login process
			this.electronLoginWindow.doLogin();

			// Show notice
			new Notice('登录窗口已打开，请扫描二维码');

		} catch (error) {
			console.error('[PinboxAuthModal] Failed to open Electron login window:', error);
			new Notice('无法打开登录窗口：' + error.message + '\n请使用下方的内嵌二维码或手动输入令牌');
		}
	}

	onClose() {
		const { contentEl } = this;

		console.log('[PinboxAuthModal] Closing auth modal');

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
			console.log('[PinboxAuthModal] Closing Electron login window');
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
