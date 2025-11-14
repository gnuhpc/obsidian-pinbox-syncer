/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
/* eslint-disable obsidianmd/ui/sentence-case */
import { Notice } from 'obsidian';

// Define minimal Electron types we need
interface ElectronBrowserWindow {
	loadURL(url: string): Promise<void>;
	close(): void;
	show(): void;
	setTitle(title: string): void;
	once(event: string, callback: () => void): void;
	on(event: string, callback: () => void): void;
	webContents: {
		session: {
			webRequest: {
				onSendHeaders(filter: unknown, callback: (details: Record<string, unknown>) => void): void;
				onCompleted(filter: unknown, callback: (details: Record<string, unknown>) => void): void;
			};
		};
	};
}

export class PinboxLoginWindow {
	private window: ElectronBrowserWindow | null;
	private onSuccess: (token: string) => void;
	private hasCalledSuccess: boolean = false;
	private requestListeners: unknown[] = [];

	constructor(onSuccess: (token: string) => void) {
		this.onSuccess = onSuccess;

		try {
			// Access Electron's remote module
			const { remote } = require('electron');
			const { BrowserWindow } = remote;

			console.debug('[PinboxLoginWindow] Creating Electron BrowserWindow');

			// Create a new browser window
			this.window = new BrowserWindow({
				parent: remote.getCurrentWindow(),
				width: 800,
				height: 600,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true
				}
			});

			// Store reference - we know it's not null because we just created it
			const win = this.window!;

			// Show window when ready
			win.once('ready-to-show', () => {
				console.debug('[PinboxLoginWindow] Window ready to show');
				if (this.window) {
					this.window.setTitle('Pinbox 微信登录');
					this.window.show();
				}
			});

			// Get the session
			const session = win.webContents.session;

			// Monitor requests to detect successful login
			// Look for requests that contain the auth token
			const loginFilter = {
				urls: [
					'https://withpinbox.com/api/user/*',
					'https://withpinbox.com/api/*',
					'https://withpinbox.com/*'
				]
			};

			// Listen for request headers to capture the token
			session.webRequest.onSendHeaders(loginFilter, (details: Record<string, any>) => {
				console.debug('[PinboxLoginWindow] Request detected:', details.url);

				// Check Authorization header
				if (details.requestHeaders && details.requestHeaders['Authorization']) {
					const authHeader = details.requestHeaders['Authorization'] as string;
					console.debug('[PinboxLoginWindow] Found Authorization header:', authHeader);

					// Extract token from "Bearer <token>" format
					const match = authHeader.match(/Bearer\s+(.+)/);
					if (match && match[1]) {
						const token = match[1];
						console.debug('[PinboxLoginWindow] Extracted token:', token.substring(0, 20) + '...');
						this.handleLoginSuccess(token);
						return;
					}
				}

				// Check cookies for alpha_info
				if (details.requestHeaders && details.requestHeaders['Cookie']) {
					const cookies = details.requestHeaders['Cookie'] as string;
					console.debug('[PinboxLoginWindow] Checking cookies');

					// Try to extract token from alpha_info cookie
					const alphaInfoMatch = cookies.match(/alpha_info=([^;]+)/);
					if (alphaInfoMatch && alphaInfoMatch[1]) {
						try {
							const alphaInfo = JSON.parse(decodeURIComponent(alphaInfoMatch[1]));
							if (alphaInfo.token) {
								console.debug('[PinboxLoginWindow] Found token in alpha_info cookie');
								this.handleLoginSuccess(alphaInfo.token as string);
								return;
							}
						} catch (error) {
							console.debug('[PinboxLoginWindow] Failed to parse alpha_info:', error);
						}
					}
				}
			});

			// Also monitor completed requests for response data
			session.webRequest.onCompleted(loginFilter, (details: Record<string, any>) => {
				if (details.statusCode === 200) {
					console.debug('[PinboxLoginWindow] Successful request to:', details.url);

					// If we reach user API endpoints successfully, the user is logged in
					// We should be able to get the token from request headers
					if (details.url && (details.url as string).includes('/api/user/')) {
						console.debug('[PinboxLoginWindow] User API accessed, login successful');
					}
				}
			});

			// Handle window close
			win.on('closed', () => {
				console.debug('[PinboxLoginWindow] Window closed');
				this.window = null;
			});

		} catch (error) {
			console.error('[PinboxLoginWindow] Failed to create BrowserWindow:', error);
			throw new Error('无法创建登录窗口。请确保在 Obsidian 桌面版中运行此插件。');
		}
	}

	async doLogin() {
		try {
			console.debug('[PinboxLoginWindow] Loading login URL');

			// Load the WeChat login page
			const loginUrl = 'https://open.weixin.qq.com/connect/qrconnect?appid=wxbb8151269cdcd450&redirect_uri=https%3A%2F%2Fwithpinbox.com%2Flogin%3Fcallback%3Dwxopen&response_type=code&scope=snsapi_login&state=obsidian_plugin#wechat_redirect';

			if (this.window) {
				await this.window.loadURL(loginUrl);
				console.debug('[PinboxLoginWindow] Login page loaded');
			}
		} catch (error) {
			console.error('[PinboxLoginWindow] Failed to load login page:', error);
			new Notice('加载 Pinbox 登录页面失败');
			throw error;
		}
	}

	private handleLoginSuccess(token: string) {
		// Prevent multiple calls
		if (this.hasCalledSuccess) {
			console.debug('[PinboxLoginWindow] Success already called, ignoring');
			return;
		}
		this.hasCalledSuccess = true;

		console.debug('[PinboxLoginWindow] Login successful, token obtained');
		new Notice('登录成功！');

		// Close the window immediately to stop intercepting requests
		this.close();

		// Call the success callback after window is closed
		if (this.onSuccess) {
			// Small delay to ensure window cleanup is complete
			setTimeout(() => {
				this.onSuccess(token);
			}, 100);
		}
	}

	close() {
		if (this.window) {
			console.debug('[PinboxLoginWindow] Closing window and removing listeners');

			// Remove all request listeners
			try {
				const session = this.window.webContents.session;
				if (session && session.webRequest) {
					console.debug('[PinboxLoginWindow] Clearing web request listeners');
					// Clear all listeners by creating new filter that matches nothing
					try {
						session.webRequest.onSendHeaders(null as any, () => {});
						session.webRequest.onCompleted(null as any, () => {});
					} catch (e) {
						console.debug('[PinboxLoginWindow] Error clearing listeners:', e);
					}
				}
			} catch (e) {
				console.debug('[PinboxLoginWindow] Error accessing session:', e);
			}

			this.window.close();
			this.window = null;
		}
	}
}
