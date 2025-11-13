import { Notice } from 'obsidian';

export class PinboxLoginWindow {
	private window: any;
	private onSuccess: (token: string) => void;
	private hasCalledSuccess: boolean = false;
	private requestListeners: any[] = [];

	constructor(onSuccess: (token: string) => void) {
		this.onSuccess = onSuccess;

		try {
			// Access Electron's remote module
			const { remote } = require('electron');
			const { BrowserWindow } = remote;

			console.log('[PinboxLoginWindow] Creating Electron BrowserWindow');

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

			// Show window when ready
			this.window.once('ready-to-show', () => {
				console.log('[PinboxLoginWindow] Window ready to show');
				this.window.setTitle('Pinbox 微信登录');
				this.window.show();
			});

			// Get the session
			const session = this.window.webContents.session;

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
			session.webRequest.onSendHeaders(loginFilter, (details: any) => {
				console.log('[PinboxLoginWindow] Request detected:', details.url);

				// Check Authorization header
				if (details.requestHeaders['Authorization']) {
					const authHeader = details.requestHeaders['Authorization'];
					console.log('[PinboxLoginWindow] Found Authorization header:', authHeader);

					// Extract token from "Bearer <token>" format
					const match = authHeader.match(/Bearer\s+(.+)/);
					if (match && match[1]) {
						const token = match[1];
						console.log('[PinboxLoginWindow] Extracted token:', token.substring(0, 20) + '...');
						this.handleLoginSuccess(token);
						return;
					}
				}

				// Check cookies for alpha_info
				if (details.requestHeaders['Cookie']) {
					const cookies = details.requestHeaders['Cookie'];
					console.log('[PinboxLoginWindow] Checking cookies');

					// Try to extract token from alpha_info cookie
					const alphaInfoMatch = cookies.match(/alpha_info=([^;]+)/);
					if (alphaInfoMatch && alphaInfoMatch[1]) {
						try {
							const alphaInfo = JSON.parse(decodeURIComponent(alphaInfoMatch[1]));
							if (alphaInfo.token) {
								console.log('[PinboxLoginWindow] Found token in alpha_info cookie');
								this.handleLoginSuccess(alphaInfo.token);
								return;
							}
						} catch (error) {
							console.log('[PinboxLoginWindow] Failed to parse alpha_info:', error);
						}
					}
				}
			});

			// Also monitor completed requests for response data
			session.webRequest.onCompleted(loginFilter, (details: any) => {
				if (details.statusCode === 200) {
					console.log('[PinboxLoginWindow] Successful request to:', details.url);

					// If we reach user API endpoints successfully, the user is logged in
					// We should be able to get the token from request headers
					if (details.url.includes('/api/user/')) {
						console.log('[PinboxLoginWindow] User API accessed, login successful');
					}
				}
			});

			// Handle window close
			this.window.on('closed', () => {
				console.log('[PinboxLoginWindow] Window closed');
				this.window = null;
			});

		} catch (error) {
			console.error('[PinboxLoginWindow] Failed to create BrowserWindow:', error);
			throw new Error('无法创建登录窗口。请确保在 Obsidian 桌面版中运行此插件。');
		}
	}

	async doLogin() {
		try {
			console.log('[PinboxLoginWindow] Loading login URL');

			// Load the WeChat login page
			const loginUrl = 'https://open.weixin.qq.com/connect/qrconnect?appid=wxbb8151269cdcd450&redirect_uri=https%3A%2F%2Fwithpinbox.com%2Flogin%3Fcallback%3Dwxopen&response_type=code&scope=snsapi_login&state=obsidian_plugin#wechat_redirect';

			await this.window.loadURL(loginUrl);
			console.log('[PinboxLoginWindow] Login page loaded');
		} catch (error) {
			console.error('[PinboxLoginWindow] Failed to load login page:', error);
			new Notice('加载 Pinbox 登录页面失败');
			throw error;
		}
	}

	private handleLoginSuccess(token: string) {
		// Prevent multiple calls
		if (this.hasCalledSuccess) {
			console.log('[PinboxLoginWindow] Success already called, ignoring');
			return;
		}
		this.hasCalledSuccess = true;

		console.log('[PinboxLoginWindow] Login successful, token obtained');
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
			console.log('[PinboxLoginWindow] Closing window and removing listeners');

			// Remove all request listeners
			const session = this.window.webContents.session;
			if (session && session.webRequest) {
				console.log('[PinboxLoginWindow] Clearing web request listeners');
				// Clear all listeners by creating new filter that matches nothing
				try {
					session.webRequest.onSendHeaders(null);
					session.webRequest.onCompleted(null);
				} catch (e) {
					console.log('[PinboxLoginWindow] Error clearing listeners:', e);
				}
			}

			this.window.close();
			this.window = null;
		}
	}
}
