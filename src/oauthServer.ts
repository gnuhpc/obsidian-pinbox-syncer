import { PinboxAPI } from './pinboxApi';

export class OAuthServer {
	private onTokenReceived: ((token: string) => void) | null = null;
	private isPolling: boolean = false;
	private api: PinboxAPI;

	constructor() {
		// Create a temporary API instance (no token needed for polling)
		this.api = new PinboxAPI('');
	}

	stop() {
		this.isPolling = false;
		this.onTokenReceived = null;
	}

	async pollForSession(sessionId: string, maxAttempts = 60): Promise<string | null> {
		console.debug(`[OAuthServer] Starting to poll for session: ${sessionId}, max attempts: ${maxAttempts}`);
		this.isPolling = true;

		// Poll Pinbox API to check if user has completed login
		for (let i = 0; i < maxAttempts; i++) {
			if (!this.isPolling) {
				console.debug('[OAuthServer] Polling was stopped');
				return null;
			}

			console.debug(`[OAuthServer] Poll attempt ${i + 1}/${maxAttempts} for session ${sessionId}`);

			try {
				// Try to get token from the API
				const token = await this.api.getTokenBySession(sessionId);

				if (token) {
					console.debug(`[OAuthServer] Token received successfully on attempt ${i + 1}`);
					this.isPolling = false;
					return token;
				} else {
					console.debug(`[OAuthServer] No token yet on attempt ${i + 1}`);
				}
			} catch (error) {
				// Continue polling on error
				console.debug(`[OAuthServer] Poll attempt ${i + 1} failed:`, error);
			}

			// Wait 2 seconds before next poll
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		console.debug(`[OAuthServer] Polling timeout after ${maxAttempts} attempts`);
		this.isPolling = false;
		return null;
	}

	async exchangeCodeForToken(code: string, state: string): Promise<string | null> {
		try {
			return await this.api.exchangeCodeForToken(code, state);
		} catch (error) {
			console.error('Token exchange failed:', error);
			throw error;
		}
	}
}
