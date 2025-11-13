import { App, Notice, TFile, normalizePath, requestUrl } from 'obsidian';
import { PinboxAPI, PinboxBookmark } from './pinboxApi';
import * as TurndownServiceImport from 'turndown';

// Handle both ESM and CommonJS imports
const TurndownService = (TurndownServiceImport as any).default || TurndownServiceImport;

export class SyncService {
	private app: App;
	private api: PinboxAPI;
	private syncFolder: string;

	constructor(app: App, api: PinboxAPI, syncFolder: string) {
		this.app = app;
		this.api = api;
		this.syncFolder = syncFolder;
	}

	setSyncFolder(folder: string) {
		this.syncFolder = folder;
	}

	async sync(): Promise<number> {
		console.log('[SyncService] Starting sync process...');
		try {
			new Notice('开始同步 Pinbox...');

			// Ensure sync folder exists
			console.log('[SyncService] Ensuring sync folder exists:', this.syncFolder);
			await this.ensureFolderExists(this.syncFolder);

			// Fetch all bookmarks
			console.log('[SyncService] Fetching all bookmarks...');
			const bookmarks = await this.api.getAllBookmarks();
			console.log('[SyncService] Fetched', bookmarks.length, 'bookmarks');

			if (bookmarks.length === 0) {
				console.log('[SyncService] No bookmarks found');
				new Notice('未找到书签');
				return 0;
			}

			// Create or update markdown files for each bookmark
			let syncedCount = 0;
			let newCount = 0;
			let skippedCount = 0;
			console.log('[SyncService] Starting to create/update bookmark files...');
			for (const bookmark of bookmarks) {
				console.log(`[SyncService] Processing bookmark ${syncedCount + 1}/${bookmarks.length}: ${bookmark.title} (id=${bookmark.id})`);
				const result = await this.createOrUpdateBookmark(bookmark);
				syncedCount++;
				if (result === 'created') {
					newCount++;
				} else if (result === 'skipped') {
					skippedCount++;
				}
			}

			console.log('[SyncService] Sync completed successfully. Total synced:', syncedCount);
			new Notice(`同步完成: 共${syncedCount}个项目，新增${newCount}个，跳过${skippedCount}个`);
			return syncedCount;
		} catch (error) {
			console.error('[SyncService] Sync error:', error);
			new Notice(`同步失败: ${error.message}`);
			throw error;
		}
	}

	private async ensureFolderExists(folderPath: string) {
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!folder) {
			await this.app.vault.createFolder(normalizedPath);
		}
	}

	private async createOrUpdateBookmark(bookmark: PinboxBookmark): Promise<'created' | 'skipped'> {
		const fileName = this.sanitizeFileName(bookmark.title || String(bookmark.id));
		const filePath = normalizePath(`${this.syncFolder}/${fileName}.md`);
		console.log(`[SyncService] Processing file: ${filePath}`);

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);

		if (existingFile instanceof TFile) {
			// Skip existing file (don't update)
			console.log(`[SyncService] Skipping existing file: ${filePath}`);
			return 'skipped';
		} else {
			// Fetch web content if URL exists
			let webContent: string | null = null;
			if (bookmark.url) {
				webContent = await this.fetchWebContent(bookmark.url);
			}

			// Generate markdown content with web content
			const content = this.generateMarkdownContent(bookmark, webContent);

			// Create new file
			console.log(`[SyncService] Creating new file: ${filePath}`);
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

	private async fetchWebContent(url: string, retries: number = 3): Promise<string | null> {
		let lastError: any = null;

		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				console.log(`[SyncService] Fetching web content from: ${url} (attempt ${attempt}/${retries})`);

				const response = await requestUrl({
					url,
					method: 'GET',
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
						'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
					},
					throw: false
				});

				if (response.status !== 200) {
					console.error(`[SyncService] Failed to fetch web content: HTTP ${response.status}`);
					lastError = new Error(`HTTP ${response.status}`);

					// Retry on server errors (5xx) or specific client errors
					if (response.status >= 500 || response.status === 429 || response.status === 408) {
						if (attempt < retries) {
							const delay = attempt * 1000; // Exponential backoff: 1s, 2s, 3s
							console.log(`[SyncService] Retrying after ${delay}ms...`);
							await new Promise(resolve => setTimeout(resolve, delay));
							continue;
						}
					}
					return null;
				}

				const html = response.text;
				const markdown = this.htmlToMarkdown(html);

				console.log(`[SyncService] Successfully fetched web content (${markdown.length} characters)`);
				return markdown;
			} catch (error) {
				console.error(`[SyncService] Error fetching web content (attempt ${attempt}/${retries}):`, error);
				lastError = error;

				// Retry on network errors
				if (attempt < retries) {
					const delay = attempt * 1000; // Exponential backoff: 1s, 2s, 3s
					console.log(`[SyncService] Retrying after ${delay}ms...`);
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
				replacement: function(content: string, node: any) {
					const alt = node.getAttribute('alt') || 'image';
					const src = node.getAttribute('src') ||
					           node.getAttribute('data-src') ||
					           node.getAttribute('data-original') || '';

					if (!src) return '';

					// Return markdown image syntax with single blank line
					return `\n![${alt}](${src})\n`;
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

			// Clean up excessive whitespace - reduce all multiple newlines to single blank line
			markdown = markdown
				.replace(/\n{3,}/g, '\n\n')  // Reduce 3+ newlines to 2 (one blank line)
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

		// URL (only the link, title is in frontmatter)
		lines.push(`[访问原文](${bookmark.url})`);
		lines.push('');

		// Note (user's personal notes)
		if (bookmark.note) {
			lines.push('## 笔记');
			lines.push('');
			lines.push(bookmark.note);
			lines.push('');
		}

		// Thumbnail or Cover image
		if (imageUrl) {
			lines.push('## 图片');
			lines.push('');
			lines.push(`![预览](${imageUrl})`);
			lines.push('');
		}

		// Web content (if fetched successfully)
		if (webContent && webContent.length > 0) {
			lines.push('## 网页内容');
			lines.push('');
			lines.push(webContent);
			lines.push('');
		}

		return lines.join('\n');
	}
}
