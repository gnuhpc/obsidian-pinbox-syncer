import { requestUrl, RequestUrlParam } from 'obsidian';

interface JWTPayload {
	aud?: string;
	[key: string]: unknown;
}

interface CollectionItemsResponse {
	items: PinboxBookmark[];
	items_count: number;
}

interface SessionCheckResponse {
	status?: string;
	token?: string;
	access_token?: string;
	accessToken?: string;
	data?: {
		token?: string;
		access_token?: string;
	};
}

export interface PinboxTag {
	name: string;
	[key: string]: unknown;
}

export interface PinboxBookmark {
	id: number;
	title: string;
	url: string;
	description: string;
	tags: (string | PinboxTag)[];
	created_at: string;
	item_type: string;
	brief?: string;
	note?: string;
	thumbnail?: string;
	cover?: string;
	collection_id?: number | null;
	view?: number;
}

export interface PinboxCollection {
	id: number;
	parent_id: number | null;
	name: string;
	description: string;
	created_at: string;
	edited_at: string;
	items_count: number;
}

export class PinboxAPI {
	private baseUrl = 'https://withpinbox.com';
	private accessToken: string;
	private userId: string | null = null;

	constructor(accessToken: string) {
		this.accessToken = accessToken;
		console.debug('[PinboxAPI] Initialized with token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'empty');
	}

	setAccessToken(token: string) {
		console.debug('[PinboxAPI] Setting new token:', token ? `${token.substring(0, 20)}...` : 'empty');
		this.accessToken = token;
		this.userId = null; // Reset user ID when token changes
	}

	private extractUserIdFromToken(): string | null {
		if (!this.accessToken) {
			console.debug('[PinboxAPI] No token available to extract user ID');
			return null;
		}

		try {
			// JWT token format: header.payload.signature
			const parts = this.accessToken.split('.');
			if (parts.length !== 3) {
				console.debug('[PinboxAPI] Invalid JWT token format');
				return null;
			}

			// Decode payload (base64)
			const payload = JSON.parse(atob(parts[1])) as JWTPayload;
			console.debug('[PinboxAPI] Decoded JWT payload:', payload);

			// The "aud" field contains the user ID
			if (payload.aud) {
				console.debug('[PinboxAPI] Extracted user ID from token:', payload.aud);
				return payload.aud;
			}
		} catch (error) {
			console.error('[PinboxAPI] Error extracting user ID from token:', error);
		}

		return null;
	}

	private getUserId(): string {
		if (this.userId) {
			return this.userId;
		}

		this.userId = this.extractUserIdFromToken();
		if (!this.userId) {
			throw new Error('Unable to extract user ID from token');
		}

		return this.userId;
	}

	async getCollections(): Promise<PinboxCollection[]> {
		console.debug('[PinboxAPI] Fetching collections...');
		try {
			const userId = this.getUserId();
			const url = `${this.baseUrl}/api/user/${userId}/collection?order=default&sort=asc`;
			console.debug('[PinboxAPI] Collections URL:', url);

			const params: RequestUrlParam = {
				url: url,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
					'Accept': 'application/json, text/plain, */*'
				}
			};

			const response = await requestUrl(params);
			console.debug('[PinboxAPI] Collections response status:', response.status);
			console.debug('[PinboxAPI] Collections response:', response.json);

			if (response.status === 200) {
				const collections = Array.isArray(response.json) ? response.json as PinboxCollection[] : [];
				console.debug(`[PinboxAPI] Found ${collections.length} collections`);
				return collections;
			} else {
				throw new Error(`Failed to fetch collections: ${response.status}`);
			}
		} catch (error) {
			console.error('[PinboxAPI] Error fetching collections:', error);
			throw error;
		}
	}

	async getCollectionItems(collectionId: number | string, count = 50, offset = 0): Promise<{ items: PinboxBookmark[], total: number }> {
		console.debug(`[PinboxAPI] Fetching items from collection ${collectionId} (offset: ${offset}, count: ${count})...`);
		try {
			const userId = this.getUserId();
			const url = `${this.baseUrl}/api/user/${userId}/collection/${collectionId}/item?count=${count}&offset=${offset}&category=all&order=create&sort=desc`;
			console.debug('[PinboxAPI] Collection items URL:', url);

			const params: RequestUrlParam = {
				url: url,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
					'Accept': 'application/json, text/plain, */*'
				}
			};

			const response = await requestUrl(params);
			console.debug(`[PinboxAPI] Collection ${collectionId} response status:`, response.status);

			if (response.status === 200) {
				const data = response.json as CollectionItemsResponse;
				const items = data.items || [];
				const total = data.items_count || 0;
				console.debug(`[PinboxAPI] Found ${items.length} items in collection ${collectionId}, total count: ${total}`);
				return { items, total };
			} else {
				throw new Error(`Failed to fetch collection items: ${response.status}`);
			}
		} catch (error) {
			console.error(`[PinboxAPI] Error fetching collection ${collectionId} items:`, error);
			throw error;
		}
	}

	async getAllCollectionItems(collectionId: number | string): Promise<PinboxBookmark[]> {
		console.debug(`[PinboxAPI] Fetching all items from collection ${collectionId}...`);
		let allItems: PinboxBookmark[] = [];
		let offset = 0;
		const pageSize = 50;

		try {
			// First request to get total count
			const firstPage = await this.getCollectionItems(collectionId, pageSize, offset);
			allItems = allItems.concat(firstPage.items);
			const total = firstPage.total;

			console.debug(`[PinboxAPI] Collection ${collectionId} has ${total} total items`);

			// Fetch remaining pages
			offset += pageSize;
			while (offset < total) {
				console.debug(`[PinboxAPI] Fetching page at offset ${offset}...`);
				const page = await this.getCollectionItems(collectionId, pageSize, offset);
				allItems = allItems.concat(page.items);
				offset += pageSize;
			}

			console.debug(`[PinboxAPI] Fetched all ${allItems.length} items from collection ${collectionId}`);
			return allItems;
		} catch (error) {
			console.error(`[PinboxAPI] Error fetching all items from collection ${collectionId}:`, error);
			throw error;
		}
	}

	async getAllBookmarks(): Promise<PinboxBookmark[]> {
		console.debug('[PinboxAPI] Starting to fetch all bookmarks...');
		let allBookmarks: PinboxBookmark[] = [];

		try {
			// First, get all collections
			const collections = await this.getCollections();
			console.debug(`[PinboxAPI] Will fetch items from ${collections.length + 1} collections (including default)`);

			// Get items from default collection (id = 0)
			console.debug('[PinboxAPI] Fetching items from default collection (id=0)...');
			const defaultItems = await this.getAllCollectionItems(0);
			allBookmarks = allBookmarks.concat(defaultItems);
			console.debug(`[PinboxAPI] Total bookmarks so far: ${allBookmarks.length}`);

			// Get items from each collection
			for (const collection of collections) {
				console.debug(`[PinboxAPI] Fetching items from collection: ${collection.name} (id=${collection.id}, expected ${collection.items_count} items)...`);
				try {
					const items = await this.getAllCollectionItems(collection.id);
					allBookmarks = allBookmarks.concat(items);
					console.debug(`[PinboxAPI] Total bookmarks so far: ${allBookmarks.length}`);
				} catch (error) {
					console.error(`[PinboxAPI] Error fetching collection ${collection.id} (${collection.name}):`, error);
					// Continue with next collection
				}
			}

			console.debug(`[PinboxAPI] Finished fetching all bookmarks. Total: ${allBookmarks.length}`);
			return allBookmarks;
		} catch (error) {
			console.error('[PinboxAPI] Error in getAllBookmarks:', error);
			throw error;
		}
	}

	async testConnection(): Promise<boolean> {
		console.debug('[PinboxAPI] Testing connection...');
		try {
			const userId = this.getUserId();
			console.debug('[PinboxAPI] Testing with user ID:', userId);

			// Test by fetching collections (lightweight request)
			const collections = await this.getCollections();
			console.debug('[PinboxAPI] Connection test successful, found', collections.length, 'collections');
			return true;
		} catch (error) {
			console.error('[PinboxAPI] Connection test failed:', error);
			return false;
		}
	}

	async deleteItem(itemId: number | string): Promise<boolean> {
		console.debug(`[PinboxAPI] Deleting item ${itemId}...`);
		try {
			const userId = this.getUserId();
			const url = `${this.baseUrl}/api/user/${userId}/store?storeIds[]=${itemId}`;
			console.debug('[PinboxAPI] Delete URL:', url);
			console.debug('[PinboxAPI] Access Token:', this.accessToken ? `${this.accessToken.substring(0, 20)}...` : 'empty');

			const params: RequestUrlParam = {
				url: url,
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
					'Accept': 'application/json, text/plain, */*',
					'X-Requested-With': 'XMLHttpRequest'
				},
				throw: false
			};

			console.debug('[PinboxAPI] Sending DELETE request...');
			const response = await requestUrl(params);
			console.debug(`[PinboxAPI] Delete item ${itemId} response status:`, response.status);
			console.debug(`[PinboxAPI] Delete item ${itemId} response:`, response);

			if (response.status === 200 || response.status === 204) {
				console.debug(`[PinboxAPI] Successfully deleted item ${itemId}`);
				return true;
			} else {
				console.error(`[PinboxAPI] Failed to delete item ${itemId}:`, response.status, response.text);
				return false;
			}
		} catch (error) {
			console.error(`[PinboxAPI] Error deleting item ${itemId}:`, error);
			console.error(`[PinboxAPI] Error details:`, JSON.stringify(error));
			throw error;
		}
	}

	async getTokenBySession(sessionId: string): Promise<string | null> {
		console.debug(`[PinboxAPI] Checking session status for: ${sessionId}`);

		// Try multiple possible endpoints
		const possibleEndpoints = [
			`${this.baseUrl}/api/auth/session/${sessionId}`,
			`${this.baseUrl}/api/session/${sessionId}`,
			`${this.baseUrl}/api/login/session/${sessionId}`,
		];

		for (const endpoint of possibleEndpoints) {
			try {
				const params: RequestUrlParam = {
					url: endpoint,
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						'Accept': 'application/json, text/plain, */*'
					}
				};

				console.debug('[PinboxAPI] Trying session check URL:', endpoint);
				const response = await requestUrl(params);
				console.debug('[PinboxAPI] Session check response status:', response.status);
				console.debug('[PinboxAPI] Session check response data:', response.json);

				if (response.status === 200 && response.json) {
					const data = response.json as SessionCheckResponse;
					// Check if login is completed and token is available
					if (data.status === 'completed' || data.status === 'success' || data.token || data.access_token) {
						const token = data.token || data.access_token || data.accessToken || data.data?.token || data.data?.access_token;
						if (token) {
							console.debug('[PinboxAPI] Token found in session response:', token.substring(0, 20) + '...');
							return token;
						}
					} else {
						console.debug('[PinboxAPI] Session status:', data.status || 'pending');
					}
				}
			} catch (error) {
				// If 404 or other error, try next endpoint
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.debug(`[PinboxAPI] Endpoint ${endpoint} check failed (expected during polling):`, errorMessage);
			}
		}

		return null;
	}

	async exchangeCodeForToken(code: string, state: string): Promise<string | null> {
		console.debug('[PinboxAPI] Exchanging code for token');
		console.debug('[PinboxAPI] Code:', code);
		console.debug('[PinboxAPI] State:', state);

		try {
			// Try different possible API endpoints
			const possibleEndpoints = [
				`${this.baseUrl}/api/auth/wechat/callback`,
				`${this.baseUrl}/api/login/wechat`,
				`${this.baseUrl}/login/wechat/callback`,
			];

			for (const endpoint of possibleEndpoints) {
				try {
					console.debug('[PinboxAPI] Trying endpoint:', endpoint);

					const params: RequestUrlParam = {
						url: endpoint,
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Accept': 'application/json, text/plain, */*'
						},
						body: JSON.stringify({
							code: code,
							state: state
						})
					};

					const response = await requestUrl(params);
					console.debug('[PinboxAPI] Token exchange response status:', response.status);
					console.debug('[PinboxAPI] Token exchange response:', response.json);

					if (response.status === 200 && response.json) {
						const data = response.json as SessionCheckResponse;
						const token = data.token || data.access_token || data.accessToken || data.data?.token || data.data?.access_token;

						if (token) {
							console.debug('[PinboxAPI] Token found:', token.substring(0, 20) + '...');
							return token;
						}
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.debug(`[PinboxAPI] Endpoint ${endpoint} failed:`, errorMessage);
					// Continue to next endpoint
				}
			}

			console.error('[PinboxAPI] All token exchange endpoints failed');
			return null;
		} catch (error) {
			console.error('[PinboxAPI] Token exchange error:', error);
			throw error;
		}
	}
}
