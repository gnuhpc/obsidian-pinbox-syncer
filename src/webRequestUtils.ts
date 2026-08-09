export interface WebRequestListenerController {
	onSendHeaders(filter: unknown, listener: ((details: Record<string, unknown>) => void) | null): void;
	onCompleted(filter: unknown, listener: ((details: Record<string, unknown>) => void) | null): void;
}

export function clearWebRequestListeners(webRequest: WebRequestListenerController): void {
	webRequest.onSendHeaders(null, null);
	webRequest.onCompleted(null, null);
}
