'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { signInErrorCopy } = loadTs('src/components/signInErrors.ts');

test('no Apple Account on the device tells the player how to fix it', () => {
  const copy = signInErrorCopy({ code: 'ERR_REQUEST_UNKNOWN' }, false);
  assert.equal(copy.title, 'Sign in to an Apple Account');
  assert.match(copy.message, /Settings app/);
});

test('a cancel is silent, server failures and other Apple errors keep their copy', () => {
  assert.equal(signInErrorCopy({ code: 'ERR_REQUEST_CANCELED' }, false), null);
  assert.match(signInErrorCopy(new Error('500'), true).message, /unavailable right now/);
  assert.deepEqual({ ...signInErrorCopy({ code: 'ERR_REQUEST_FAILED' }, false, { title: 'Oops', message: 'Again' }) },
    { title: 'Oops', message: 'Again' });
  assert.equal(signInErrorCopy({ code: 'ERR_REQUEST_FAILED' }, false).title, "Couldn't sign in");
});

test('the sign-in card uses the brand dialog and loader', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/components/SignInButtons.tsx'), 'utf8');
  assert.doesNotMatch(source, /Alert\.alert|ActivityIndicator/);
  assert.match(source, /signInErrorCopy/);
});
