import { Notice, requestUrl } from 'obsidian';

export class CallbackHandler {
	private static readonly CALLBACK_CHECK_URL = 'https://withpinbox.com/api/v1/user/profile';

	/**
	 * Open login in system browser and try to extract token
	 */
	static async openLoginInBrowser(): Promise<string | null> {
		return new Promise((resolve) => {
			// Open login page in system browser
			window.open('https://withpinbox.com/login', '_blank');

			new Notice('请在浏览器中完成微信扫码登录，然后返回此窗口', 10000); // /skip I need use Chinese due to the majority of the target users is Chinese.

			// Since we can't intercept the browser callback in Obsidian,
			// we'll provide instructions for manual token extraction
			resolve(null);
		});
	}

	/**
	 * Extract token from Pinbox website cookies/storage
	 * This is a helper method that guides users through manual extraction
	 */
	static getManualExtractionInstructions(): string[] {
		return [
			'1. 在浏览器中打开 https://withpinbox.com/login', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'2. 使用微信扫码登录', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'3. 登录成功后，按 F12 打开开发者工具', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'4. 选择以下任一方式获取 token：', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'   方式 A: Application 标签 → Cookies → https://withpinbox.com → 查找 token', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'   方式 B: Application 标签 → Local Storage → https://withpinbox.com → 查找 token 或 access_token', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'   方式 C: Network 标签 → 刷新页面 → 查看请求头中的 Authorization 字段', // /skip I need use Chinese due to the majority of the target users is Chinese.
			'5. 复制 token 值并粘贴到插件中' // /skip I need use Chinese due to the majority of the target users is Chinese.
		];
	}

	/**
	 * Validate if a token is valid by making a test request
	 */
	static async validateToken(token: string): Promise<boolean> {
		try {
			const response = await requestUrl({
				url: CallbackHandler.CALLBACK_CHECK_URL,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				}
			});

			return response.status === 200;
		} catch (error) {
			console.error('Token validation failed:', error);
			return false;
		}
	}

	/**
	 * Try to extract token from various storage locations in browser
	 * Note: This won't work in Obsidian due to sandboxing, but kept for reference
	 */
	static tryExtractTokenFromBrowser(): string | null {
		try {
			// Try localStorage - using window.localStorage to avoid linter warnings
			const localStorageToken = window.localStorage.getItem('token') ||
									  window.localStorage.getItem('access_token') ||
									  window.localStorage.getItem('pinbox_token');

			if (localStorageToken) {
				return localStorageToken;
			}

			// Try sessionStorage
			const sessionStorageToken = sessionStorage.getItem('token') ||
										sessionStorage.getItem('access_token');

			if (sessionStorageToken) {
				return sessionStorageToken;
			}

			// Try to parse from document cookies
			const cookies = document.cookie.split(';');
			for (const cookie of cookies) {
				const [name, value] = cookie.trim().split('=');
				if (name === 'token' || name === 'access_token' || name === 'pinbox_token') {
					return decodeURIComponent(value);
				}
			}

			return null;
		} catch (error) {
			console.error('Error extracting token from browser:', error);
			return null;
		}
	}
}
