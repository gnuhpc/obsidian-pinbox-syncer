import { App, Notice, TFile, normalizePath, requestUrl } from 'obsidian';
import { PinboxAPI, PinboxBookmark } from './pinboxApi';
import TurndownService from 'turndown';

export class SyncService {
	private app: App;
	private api: PinboxAPI;
	private syncFolder: string;
	private downloadImages: boolean;
	private imageFolder: string;

	constructor(app: App, api: PinboxAPI, syncFolder: string, downloadImages: boolean = false, imageFolder: string = 'pics') {
		this.app = app;
		this.api = api;
		this.syncFolder = syncFolder;
		this.downloadImages = downloadImages;
		this.imageFolder = imageFolder;
	}

	setSyncFolder(folder: string) {
		this.syncFolder = folder;
	}

	setDownloadImages(downloadImages: boolean) {
		this.downloadImages = downloadImages;
	}

	setImageFolder(imageFolder: string) {
		this.imageFolder = imageFolder;
	}

	async sync(): Promise<number> {
		console.debug('[SyncService] Starting sync process...');
		try {
// /skip I need use Chinese due to the majority of the target users is Chinese.
			new Notice('开始同步 Pinbox 书签...');

			// Ensure sync folder exists
			console.debug('[SyncService] Ensuring sync folder exists:', this.syncFolder);
			await this.ensureFolderExists(this.syncFolder);

			// Fetch all bookmarks
			console.debug('[SyncService] Fetching all bookmarks...');
			const bookmarks = await this.api.getAllBookmarks();
			console.debug('[SyncService] Fetched', bookmarks.length, 'bookmarks');

			if (bookmarks.length === 0) {
				console.debug('[SyncService] No bookmarks found');
				new Notice('未找到任何书签');
				return 0;
			}

			// Create or update markdown files for each bookmark
			let syncedCount = 0;
			let newCount = 0;
			let skippedCount = 0;
			console.debug('[SyncService] Starting to create/update bookmark files...');
			for (const bookmark of bookmarks) {
				console.debug(`[SyncService] Processing bookmark ${syncedCount + 1}/${bookmarks.length}: ${bookmark.title} (id=${bookmark.id})`);
				const result = await this.createOrUpdateBookmark(bookmark);
				syncedCount++;
				if (result === 'created') {
					newCount++;
				} else if (result === 'skipped') {
					skippedCount++;
				}
			}

			console.debug('[SyncService] Sync completed successfully. Total synced:', syncedCount);
			new Notice(`同步完成：共 ${syncedCount} 个书签，新增 ${newCount} 个，跳过 ${skippedCount} 个`);
			return syncedCount;
		} catch (error) {
			console.error('[SyncService] Sync error:', error);
			const errorMessage = error instanceof Error ? error.message : '未知错误';
			new Notice(`同步失败：${errorMessage}`);
			throw error;
		}
	}

	private async ensureFolderExists(folderPath: string) {
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!folder) {
			try {
				await this.app.vault.createFolder(normalizedPath);
			} catch (error) {
				// Ignore "Folder already exists" error
				// This can happen when multiple operations try to create the same folder simultaneously
				if (error instanceof Error && !error.message.includes('Folder already exists')) {
					throw error;
				}
			}
		}
	}

	private async createOrUpdateBookmark(bookmark: PinboxBookmark): Promise<'created' | 'skipped'> {
		const fileName = this.sanitizeFileName(bookmark.title || String(bookmark.id));
		const filePath = normalizePath(`${this.syncFolder}/${fileName}.md`);
		console.debug(`[SyncService] Processing file: ${filePath}`);

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);

		if (existingFile instanceof TFile) {
			// Skip existing file (don't update)
			console.debug(`[SyncService] Skipping existing file: ${filePath}`);
			return 'skipped';
		} else {
			// Fetch web content if URL exists
			let webContent: string | null = null;
			if (bookmark.url) {
				webContent = await this.fetchWebContent(bookmark.url);
			}

			// Generate markdown content with web content
			let content = this.generateMarkdownContent(bookmark, webContent);

			// Download images if enabled
			if (this.downloadImages) {
				content = await this.downloadImagesInContent(content, bookmark.id, filePath);
			}

			// Create new file
			console.debug(`[SyncService] Creating new file: ${filePath}`);
			await this.app.vault.create(filePath, content);
			return 'created';
		}
	}

	private sanitizeFileName(name: string): string {
		// Remove or replace invalid characters for file names
		return name
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/\s+/g, ' ')
			.trim()
			.substring(0, 200); // Limit length
	}

	private async downloadImage(imageUrl: string, bookmarkId: number): Promise<string | null> {
		try {
			console.debug(`[SyncService] Downloading image: ${imageUrl}`);

			// Create subfolder for this bookmark's images (relative to vault root)
			const bookmarkImageFolder = normalizePath(`${this.imageFolder}/${bookmarkId}`);
			await this.ensureFolderExists(bookmarkImageFolder);

			// Extract file extension from URL
			let extension = 'jpg'; // default extension

			// Try to get extension from query parameters (e.g., wx_fmt=png)
			try {
				const url = new URL(imageUrl);
				const wxFmt = url.searchParams.get('wx_fmt');
				const fmt = url.searchParams.get('fmt');
				const format = url.searchParams.get('format');
				const tp = url.searchParams.get('tp'); // WeChat also uses tp parameter

				// Check various format parameters, but skip invalid values like 'other'
				if (wxFmt && wxFmt !== 'other' && /^(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(wxFmt)) {
					extension = wxFmt.toLowerCase();
				} else if (tp && /^(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(tp)) {
					// tp parameter often contains the real format when wx_fmt=other
					extension = tp.toLowerCase();
				} else if (fmt && /^(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(fmt)) {
					extension = fmt.toLowerCase();
				} else if (format && /^(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(format)) {
					extension = format.toLowerCase();
				} else {
					// Try to get extension from filename in path
					const pathname = url.pathname;
					const pathParts = pathname.split('/');
					const fileName = pathParts[pathParts.length - 1];

					// Only extract extension if filename contains a dot
					if (fileName.includes('.')) {
						const fileExtension = fileName.split('.').pop();

						// Validate extension (common image formats)
						if (fileExtension && /^(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(fileExtension)) {
							extension = fileExtension.toLowerCase();
						}
					}
				}
			} catch (error) {
				console.debug('[SyncService] Error parsing image URL, using default extension:', error);
			}

			const timestamp = Date.now();
			const fileName = `${timestamp}.${extension}`;
			const filePath = normalizePath(`${bookmarkImageFolder}/${fileName}`);

			// Check if file already exists
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				console.debug(`[SyncService] Image already exists: ${filePath}`);
				return `${this.imageFolder}/${bookmarkId}/${fileName}`;
			}

			// Download image
			const response = await requestUrl({
				url: imageUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
				}
			});

			if (response.status === 200 && response.arrayBuffer) {
				// Save image file
				await this.app.vault.createBinary(filePath, response.arrayBuffer);
				console.debug(`[SyncService] Image saved: ${filePath}`);
				return `${this.imageFolder}/${bookmarkId}/${fileName}`;
			} else {
				console.error(`[SyncService] Failed to download image: HTTP ${response.status}`);
				return null;
			}
		} catch (error) {
			console.error(`[SyncService] Error downloading image ${imageUrl}:`, error);
			return null;
		}
	}

	private async downloadImagesInContent(content: string, bookmarkId: number, markdownFilePath: string): Promise<string> {
		if (!this.downloadImages) {
			console.debug(`[SyncService] Image download is disabled for bookmark ${bookmarkId}`);
			return content;
		}

		console.debug(`[SyncService] Processing images for bookmark ${bookmarkId}`);
		console.debug(`[SyncService] Content length: ${content.length} characters`);

		// Match markdown image syntax: ![alt](url)
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let match;
		const replacements: Array<{ original: string; replacement: string }> = [];
		let matchCount = 0;

		while ((match = imageRegex.exec(content)) !== null) {
			matchCount++;
			const fullMatch = match[0];
			const imageUrl = match[2];

			console.debug(`[SyncService] Found image #${matchCount}: ${imageUrl.substring(0, 100)}...`);

			// Skip if already a local path
			if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
				console.debug(`[SyncService] Skipping non-HTTP image: ${imageUrl}`);
				continue;
			}

			// Download image
			console.debug(`[SyncService] Downloading image from: ${imageUrl}`);
			const vaultRelativeImagePath = await this.downloadImage(imageUrl, bookmarkId);
			if (vaultRelativeImagePath) {
				// Extract filename from path - Obsidian can find files by name alone
				const fileName = vaultRelativeImagePath.split('/').pop() || vaultRelativeImagePath;
				const replacement = `![[${fileName}]]`;
				replacements.push({ original: fullMatch, replacement });
				console.debug(`[SyncService] Image downloaded successfully: ${fileName}`);
			} else {
				console.debug(`[SyncService] Failed to download image: ${imageUrl}`);
			}
		}

		console.debug(`[SyncService] Found ${matchCount} images in content, matched ${replacements.length} for download`);

		// Apply replacements
		let updatedContent = content;
		for (const { original, replacement } of replacements) {
			updatedContent = updatedContent.replace(original, replacement);
		}

		console.debug(`[SyncService] Processed ${replacements.length} images for bookmark ${bookmarkId}`);
		return updatedContent;
	}

	private getRelativePath(fromPath: string, toPath: string): string {
		// Get directory of the markdown file
		const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'));

		// Split paths into parts
		const fromParts = fromDir.split('/').filter(p => p);
		const toParts = toPath.split('/').filter(p => p);

		// Find common path
		let commonLength = 0;
		const minLength = Math.min(fromParts.length, toParts.length);
		for (let i = 0; i < minLength; i++) {
			if (fromParts[i] === toParts[i]) {
				commonLength++;
			} else {
				break;
			}
		}

		// Calculate how many levels to go up
		const upLevels = fromParts.length - commonLength;

		// Build relative path
		let relativePath: string;
		if (upLevels === 0 && commonLength === fromParts.length) {
			// Same directory or subdirectory
			const downPath = toParts.slice(commonLength).join('/');
			relativePath = downPath || '.';
		} else if (upLevels > 0) {
			// Need to go up directories
			const upPath = '../'.repeat(upLevels);
			const downPath = toParts.slice(commonLength).join('/');
			relativePath = upPath + downPath;
		} else {
			// Fallback to absolute path
			relativePath = toPath;
		}

		return relativePath;
	}

	private async fetchWebContent(url: string, retries: number = 3): Promise<string | null> {
		let lastError: Error | null = null;

		// Upgrade HTTP to HTTPS for WeChat articles to avoid ERR_BLOCKED_BY_CLIENT
		if (url.startsWith('http://mp.weixin.qq.com')) {
			url = url.replace('http://', 'https://');
			console.debug(`[SyncService] Upgraded WeChat URL to HTTPS: ${url}`);
		}

		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				console.debug(`[SyncService] Fetching web content from: ${url} (attempt ${attempt}/${retries})`);

				// Special headers for WeChat articles
				const isWechatArticle = url.includes('mp.weixin.qq.com');
				const headers: Record<string, string> = {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
					'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
					'Accept-Encoding': 'gzip, deflate, br',
					'Cache-Control': 'no-cache',
					'Pragma': 'no-cache',
				};

				if (isWechatArticle) {
					// Add WeChat-specific headers
					headers['Referer'] = 'https://mp.weixin.qq.com/';
					headers['Sec-Fetch-Dest'] = 'document';
					headers['Sec-Fetch-Mode'] = 'navigate';
					headers['Sec-Fetch-Site'] = 'none';
					headers['Upgrade-Insecure-Requests'] = '1';
				}

				const response = await requestUrl({
					url,
					method: 'GET',
					headers,
					throw: false
				});

				if (response.status !== 200) {
					console.error(`[SyncService] Failed to fetch web content: HTTP ${response.status}`);
					console.error(`[SyncService] URL:`, url);
					console.error(`[SyncService] Response headers:`, response.headers);
					console.error(`[SyncService] Response body preview:`, response.text?.substring(0, 500));
					lastError = new Error(`HTTP ${response.status}`);

					// Retry on server errors (5xx) or specific client errors
					if (response.status >= 500 || response.status === 429 || response.status === 408) {
						if (attempt < retries) {
							const delay = attempt * 1000; // Exponential backoff: 1s, 2s, 3s
							console.debug(`[SyncService] Retrying after ${delay}ms...`);
							await new Promise(resolve => setTimeout(resolve, delay));
							continue;
						}
					}
					return null;
				}

				const html = response.text;
				console.debug(`[SyncService] Response received, HTML length: ${html?.length || 0} bytes`);

				// Check if we got valid HTML content
				if (!html || html.trim().length === 0) {
					console.error(`[SyncService] Empty response body`);
					lastError = new Error('Empty response');
					return null;
				}

				// Check for WeChat error pages
				if (isWechatArticle && (html.includes('该内容已被发布者删除') || html.includes('链接已过期') || html.includes('此内容因违规无法查看'))) {
					console.error(`[SyncService] WeChat article is not accessible (deleted, expired, or blocked)`);
					lastError = new Error('WeChat article not accessible');
					return null;
				}

				console.debug(`[SyncService] Converting HTML to markdown...`);
				const markdown = this.htmlToMarkdown(html);
				console.debug(`[SyncService] Conversion complete, markdown length: ${markdown.length} characters`);

				// Check if we got a meaningful content or just loading placeholders
				const loadingIndicators = [
					'loading...',
					'loading',
					'加载中...',
					'加载中',
					'请稍候...',
					'正在加载',
					'load more',
					'skeleton',
				];

				const markdownLower = markdown.toLowerCase().trim();
				const contentLength = markdown.replace(/\s+/g, '').length;

				console.debug(`[SyncService] Content length (without whitespace): ${contentLength}`);

				// If content is suspiciously short or contains only loading indicators
				if (contentLength < 100) {
					console.warn(`[SyncService] Content is very short (${contentLength} chars)`);
					console.warn(`[SyncService] Full markdown content:`, markdown);

					const hasLoadingIndicator = loadingIndicators.some(indicator =>
						markdownLower.includes(indicator.toLowerCase())
					);

					if (hasLoadingIndicator) {
						console.warn(`[SyncService] Content appears to be a loading placeholder`);

						// If this is not the last attempt, retry with delay
						if (attempt < retries) {
							const delay = 2000 + (attempt * 1000); // 2s, 3s, 4s
							console.debug(`[SyncService] Waiting ${delay}ms before retry (page may need time to load)...`);
							await new Promise(resolve => setTimeout(resolve, delay));
							continue;
						} else {
							// On last attempt, return null to indicate failure
							console.error(`[SyncService] Failed to fetch actual content after ${retries} attempts`);
							console.error(`[SyncService] The page may require JavaScript to load content`);
							console.error(`[SyncService] URL will be saved but content could not be fetched: ${url}`);
							return null;
						}
					} else {
						console.warn(`[SyncService] Content is short but doesn't seem to be a loading placeholder, will use it`);
					}
				}

				console.debug(`[SyncService] Successfully fetched web content (${markdown.length} characters)`);
				return markdown;
			} catch (error) {
				console.error(`[SyncService] Error fetching web content (attempt ${attempt}/${retries}):`, error);
				lastError = error as Error;

				// Retry on network errors
				if (attempt < retries) {
					const delay = attempt * 1000; // Exponential backoff: 1s, 2s, 3s
					console.debug(`[SyncService] Retrying after ${delay}ms...`);
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				}
			}
		}

		console.error(`[SyncService] Failed to fetch web content after ${retries} attempts:`, lastError);
		return null;
	}

	private htmlToMarkdown(html: string): string {
		try {
			// Create a temporary DOM element to parse HTML
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// Remove script and style elements
			const scriptsAndStyles = doc.querySelectorAll('script, style, noscript, iframe');
			scriptsAndStyles.forEach(el => el.remove());

			// Process images to handle lazy loading and data attributes
			const images = doc.querySelectorAll('img');
			images.forEach(img => {
				// Handle WeChat lazy loading images (data-src)
				const dataSrc = img.getAttribute('data-src');
				if (dataSrc && !img.getAttribute('src')) {
					img.setAttribute('src', dataSrc);
				}

				// Handle other lazy loading attributes
				const dataOriginal = img.getAttribute('data-original');
				if (dataOriginal && !img.getAttribute('src')) {
					img.setAttribute('src', dataOriginal);
				}

				// Ensure alt text exists for better markdown
				if (!img.getAttribute('alt')) {
					const title = img.getAttribute('title') || 'image';
					img.setAttribute('alt', title);
				}
			});

			// Get the body content
			const bodyElement = doc.body;
			if (!bodyElement) return '';

			// Initialize Turndown service
			const turndownService = new TurndownService({
				headingStyle: 'atx',
				hr: '---',
				bulletListMarker: '-',
				codeBlockStyle: 'fenced',
				emDelimiter: '*',
			});

			// Remove unnecessary elements
			turndownService.remove(['script', 'style', 'button', 'nav', 'footer']);

			// Add custom rule for images with better handling
			turndownService.addRule('images', {
				filter: 'img',
				replacement: function(content: string, node: Node) {
					const element = node as HTMLImageElement;
					const alt = element.getAttribute('alt') || 'image';
					const src = element.getAttribute('src') ||
					           element.getAttribute('data-src') ||
					           element.getAttribute('data-original') || '';

					if (!src) return '';

					// Return markdown image syntax without extra newlines
					// Let the cleanup logic handle spacing
					return `![${alt}](${src})`;
				}
			});

			// Add custom rule for highlight/mark
			turndownService.addRule('highlight', {
				filter: 'mark',
				replacement: function(content: string) {
					return '==' + content + '==';
				}
			});

			// Add custom rule for strikethrough
			turndownService.addRule('strikethrough', {
				filter: (node: Node) =>
					node.nodeName === 'DEL' ||
					node.nodeName === 'S' ||
					node.nodeName === 'STRIKE',
				replacement: function(content: string) {
					return '~~' + content + '~~';
				}
			});

			// Convert to markdown
			let markdown = turndownService.turndown(bodyElement.innerHTML);

			// Remove WeChat article footer (starting from "预览时标签不可点")
			const footerMarkers = [
				'预览时标签不可点',
				'微信扫一扫',
				'关注该公众号',
				'Scan QR Code',
			];

			for (const marker of footerMarkers) {
				const footerIndex = markdown.indexOf(marker);
				if (footerIndex !== -1) {
					markdown = markdown.substring(0, footerIndex);
					break;
				}
			}

			// Clean up excessive whitespace and formatting issues
			markdown = markdown
				// Remove trailing whitespace from each line
				.split('\n')
				.map(line => line.trimEnd())
				.join('\n')
				// Fix list items: remove blank lines between consecutive list items
				// This matches: list item + blank line + another list item
				.replace(/^([-*]|\d+\.)\s+(.+?)\n\n(?=^([-*]|\d+\.)\s+)/gm, '$1 $2\n')
				// Remove excessive spaces (but keep single spaces)
				.replace(/ {2,}/g, ' ')
				// CRITICAL: Remove ALL instances of more than one consecutive blank line
				// This ensures NO MORE than one blank line (two \n) appears anywhere
				.replace(/\n{3,}/g, '\n\n')
				// Remove blank lines at the very start and end
				.trim();

			return markdown;
		} catch (error) {
			console.error('[SyncService] Error converting HTML to markdown:', error);
			return '';
		}
	}

	private generateMarkdownContent(bookmark: PinboxBookmark, webContent: string | null = null): string {
		const lines: string[] = [];

		// Frontmatter (YAML metadata)
		lines.push('---');
		lines.push(`id: ${bookmark.id}`);
		lines.push(`title: "${(bookmark.title || 'Untitled').replace(/"/g, '\\"')}"`);
		lines.push(`url: "${bookmark.url}"`);
		lines.push(`item_type: ${bookmark.item_type || 'unknown'}`);
		lines.push(`created_at: ${bookmark.created_at}`);

		if (bookmark.tags && bookmark.tags.length > 0) {
			const tags = bookmark.tags.map(tag => {
				if (typeof tag === 'string') {
					return tag;
				} else if (tag && tag.name) {
					return tag.name;
				}
				return '';
			}).filter(t => t);

			if (tags.length > 0) {
				lines.push('tags:');
				tags.forEach(tag => {
					lines.push(`  - ${tag}`);
				});
			}
		}

		if (bookmark.collection_id !== null && bookmark.collection_id !== undefined) {
			lines.push(`collection_id: ${bookmark.collection_id}`);
		}

		if (bookmark.view !== undefined) {
			lines.push(`view: ${bookmark.view}`);
		}

		if (bookmark.brief) {
			lines.push(`brief: "${bookmark.brief.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
		}

		if (bookmark.description) {
			lines.push(`description: "${bookmark.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
		}

		const imageUrl = bookmark.thumbnail || bookmark.cover;
		if (imageUrl) {
			lines.push(`image: "${imageUrl}"`);
		}

		lines.push(`synced_at: ${new Date().toISOString()}`);
		lines.push('---');
		lines.push('');

		// Note (user's personal notes)
		if (bookmark.note) {
			lines.push('## 笔记');
			lines.push('');
			lines.push(bookmark.note);
			lines.push('');
		}

		// Web content (if fetched successfully)
		if (webContent && webContent.length > 0) {
			lines.push(webContent);
		} else if (bookmark.url) {
			// If web content couldn't be fetched, add a note about it
			lines.push('> ⚠️ 无法自动获取网页内容。可能的原因:');
			lines.push('> - 网页需要 JavaScript 才能加载内容');
			lines.push('> - 网页加载速度过慢');
			lines.push('> - 网页需要登录或特殊权限');
			lines.push('> - 网页链接已失效');
			lines.push('>');
			lines.push('> 请在元数据中点击 url 链接查看完整内容。');
		}

		return lines.join('\n');
	}
}
