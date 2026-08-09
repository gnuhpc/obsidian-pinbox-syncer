/* eslint-disable import/no-nodejs-modules */

import assert from 'node:assert/strict';
import test from 'node:test';
import { clearWebRequestListeners } from '../src/webRequestUtils';

void test('unsubscribes both login request listeners with null listeners', () => {
	const calls: Array<[string, unknown, unknown]> = [];
	const webRequest = {
		onSendHeaders(filter: unknown, listener: unknown) {
			calls.push(['onSendHeaders', filter, listener]);
		},
		onCompleted(filter: unknown, listener: unknown) {
			calls.push(['onCompleted', filter, listener]);
		}
	};

	clearWebRequestListeners(webRequest);

	assert.deepEqual(calls, [
		['onSendHeaders', null, null],
		['onCompleted', null, null]
	]);
});
