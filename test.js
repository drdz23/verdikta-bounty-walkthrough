#!/usr/bin/env node
// Tiny zero-dependency test suite for the pure helpers in index.js.
// Run: node test.js   (exits non-zero if any assertion fails)
'use strict';

const assert = require('node:assert');
const { weiToEth, decodeUint, decodeString, parseJobsTxt, chooseBounty } = require('./index.js');

let passed = 0;
function t(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// weiToEth
t('weiToEth: whole ETH', () => assert.strictEqual(weiToEth('1000000000000000000'), '1'));
t('weiToEth: the oracle prepay', () => assert.strictEqual(weiToEth('240000000000000'), '0.00024'));
t('weiToEth: zero', () => assert.strictEqual(weiToEth('0'), '0'));

// decodeUint
t('decodeUint: hex to BigInt', () =>
  assert.strictEqual(decodeUint('0x' + (240000000000000n).toString(16).padStart(64, '0')), 240000000000000n));

// decodeString: ABI-encode "OPEN" and decode it back
function encodeString(s) {
  const body = Buffer.from(s, 'utf8').toString('hex');
  return '0x' +
    (32).toString(16).padStart(64, '0') +            // offset
    s.length.toString(16).padStart(64, '0') +        // length
    body.padEnd(Math.ceil(body.length / 64) * 64, '0'); // padded bytes
}
t('decodeString: round-trips "OPEN"', () => assert.strictEqual(decodeString(encodeString('OPEN')), 'OPEN'));
t('decodeString: round-trips "EXPIRED"', () => assert.strictEqual(decodeString(encodeString('EXPIRED')), 'EXPIRED'));

// parseJobsTxt: parses open bounties and ignores the RECENTLY CLOSED section
const sample = [
  'VERDIKTA BOUNTIES - 2026-10-24T00:00:00.000Z',
  '',
  'OPEN BOUNTIES (2)',
  '========================================',
  '#330 | Build a working agent tutorial | 0.005 ETH | deadline: 2026-10-31T19:00:03.000Z | 167.9h left | 0 submissions',
  '#307 | Verdikta awareness post | 0.0025 ETH | deadline: 2026-10-25T20:13:19.000Z | 1.0h left | 2 submissions',
  '',
  'RECENTLY CLOSED (1)',
  '#321 | Publicacao sobre a Verdikta | AWARDED | 2 submissions',
].join('\n');

t('parseJobsTxt: finds both open bounties', () => assert.strictEqual(parseJobsTxt(sample).length, 2));
t('parseJobsTxt: reads id, eth, hours', () => {
  const [a] = parseJobsTxt(sample);
  assert.strictEqual(a.id, 330);
  assert.strictEqual(a.eth, '0.005');
  assert.strictEqual(a.hoursLeft, 167.9);
});
t('parseJobsTxt: ignores the closed section', () =>
  assert.ok(!parseJobsTxt(sample).some((j) => j.id === 321)));

// chooseBounty: skips bounties too close to their deadline
t('chooseBounty: skips the 1h bounty, takes the 167.9h one', () => {
  const pick = chooseBounty(parseJobsTxt(sample), 2);
  assert.strictEqual(pick.id, 330);
});
t('chooseBounty: returns null when nothing qualifies', () =>
  assert.strictEqual(chooseBounty(parseJobsTxt(sample), 1000), null));

console.log(`\n${passed} assertions passed.`);
