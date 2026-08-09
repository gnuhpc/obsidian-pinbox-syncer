/* eslint-disable import/no-nodejs-modules */

import assert from 'node:assert/strict';
import test from 'node:test';
import { extractLocalImageReferences, extractPinboxItemId, isPathInFolder } from '../src/deleteUtils';

void test('extracts a quoted Pinbox ID from frontmatter', () => {
	const content = ['---', 'id: "123456789"', '标题: "示例"', '---', '', '正文'].join('\n');

	assert.equal(extractPinboxItemId(content), '123456789');
});

void test('does not extract an ID from the markdown body', () => {
	const content = ['---', '标题: "没有 ID"', '---', '', 'id: 123456789'].join('\n');

	assert.equal(extractPinboxItemId(content), null);
});

void test('matches only files inside the configured sync folder', () => {
	assert.equal(isPathInFolder('Pinbox/article.md', 'Pinbox'), true);
	assert.equal(isPathInFolder('Pinbox/sub/article.md', 'Pinbox'), true);
	assert.equal(isPathInFolder('PinboxArchive/article.md', 'Pinbox'), false);
});

void test('extracts local image references without including remote images', () => {
	const content = [
		'![[Pinbox/pics/15936784/cover.jpg]]',
		'![[diagram.png|400]]',
		'![local image](Pinbox/pics/15936784/photo.webp)',
		'![remote image](https://example.com/image.png)',
		'[ordinary link](Pinbox/pics/15936784/ignored.jpg)'
	].join('\n');

	assert.deepEqual(extractLocalImageReferences(content), [
		'Pinbox/pics/15936784/cover.jpg',
		'diagram.png',
		'Pinbox/pics/15936784/photo.webp'
	]);
});
