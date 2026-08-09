export function extractPinboxItemId(content: string): string | null {
	const frontmatterMatch = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!frontmatterMatch) {
		return null;
	}

	const idMatch = frontmatterMatch[1].match(/^[ \t]*id:[ \t]*(?:"(\d+)"|'(\d+)'|(\d+))[ \t]*(?:#.*)?$/m);
	return idMatch?.[1] ?? idMatch?.[2] ?? idMatch?.[3] ?? null;
}

export function isPathInFolder(filePath: string, folderPath: string): boolean {
	const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	const normalizedFolderPath = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

	return normalizedFolderPath.length > 0 && normalizedFilePath.startsWith(`${normalizedFolderPath}/`);
}

export function extractLocalImageReferences(content: string): string[] {
	const references: string[] = [];
	const seenReferences = new Set<string>();
	const addReference = (reference: string) => {
		const normalizedReference = reference.trim();
		const pathWithoutQuery = normalizedReference.split(/[?#]/, 1)[0];
		const isRemote = /^(?:https?:|data:|mailto:)/i.test(normalizedReference);
		const isImage = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(pathWithoutQuery);

		if (!isRemote && isImage && !seenReferences.has(normalizedReference)) {
			seenReferences.add(normalizedReference);
			references.push(normalizedReference);
		}
	};

	const embeddedImageRegex = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
	for (const match of content.matchAll(embeddedImageRegex)) {
		addReference(match[1]);
	}

	const markdownImageRegex = /!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g;
	for (const match of content.matchAll(markdownImageRegex)) {
		addReference(match[1] ?? match[2] ?? '');
	}

	return references;
}
