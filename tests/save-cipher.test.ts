import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, SAVE_EXPORT_KEYS } from '../src/data/config';
import {
  SAVE_ENVELOPE_PREFIX, SaveCipherError, decodeSaveText, decryptSaveText,
  encryptSaveText, isEncryptedSave, isSaveCryptoAvailable, parseSaveKey,
} from '../src/state/save-cipher';

const plaintext = JSON.stringify({ version: 31, clicks: 7, nested: { ok: true }, 中文: '存档' });

test('the shipped key is a 32-byte hex secret and parsing is strict', () => {
  const version = Number(Object.keys(SAVE_EXPORT_KEYS)[0]);
  const hex = SAVE_EXPORT_KEYS[version]!;
  assert.match(hex, /^[0-9a-f]{64}$/, 'keys are lowercase 64-hex (32 bytes)');
  assert.equal(parseSaveKey(hex).length, 32);
  for (const bad of ['', 'abc', hex.slice(1), hex + 'ff', 'z'.repeat(64), ' '.repeat(64)]) {
    assert.throws(() => parseSaveKey(bad), SaveCipherError, JSON.stringify(bad));
  }
  // Surrounding whitespace is tolerated (a copy/pasted key may carry it).
  assert.equal(parseSaveKey(`  ${hex}\n`).length, 32);
});

test('encrypt/decrypt round-trips the exact plaintext and stays utf-8 safe', async () => {
  const envelope = await encryptSaveText(plaintext);
  assert.ok(envelope.startsWith(`${SAVE_ENVELOPE_PREFIX}.1.`), envelope.slice(0, 16));
  assert.ok(!envelope.includes('{'), 'ciphertext hides the JSON payload');
  assert.equal(isEncryptedSave(envelope), true);
  assert.equal(await decryptSaveText(envelope), plaintext);
  assert.equal(await decodeSaveText(envelope), plaintext);
  // Two exports of the same state must differ: the IV is random every time.
  const again = await encryptSaveText(plaintext);
  assert.notEqual(again, envelope);
  assert.equal(await decryptSaveText(again), plaintext);
});

test('the envelope is a fixed three-part single line', async () => {
  const envelope = await encryptSaveText(plaintext);
  const parts = envelope.split('.');
  assert.equal(parts.length, 3);
  assert.equal(parts[0], SAVE_ENVELOPE_PREFIX);
  assert.equal(parts[1], '1');
  assert.match(parts[2]!, /^[A-Za-z0-9+/]+={0,2}$/);
  // base64 payload = 12-byte IV + ciphertext + 16-byte tag.
  const bytes = Buffer.from(parts[2]!, 'base64');
  assert.equal(bytes.length, 12 + Buffer.byteLength(plaintext, 'utf8') + 16);
});

test('tampering, truncation and unknown key versions are rejected without throwing raw errors', async () => {
  const envelope = await encryptSaveText(plaintext);
  const [, version, payload] = envelope.split('.');

  // Flip one byte of the ciphertext: the GCM tag must reject it.
  const raw = Buffer.from(payload!, 'base64');
  raw[raw.length - 20] = (raw[raw.length - 20] ?? 0) ^ 0xff;
  const tampered = `${SAVE_ENVELOPE_PREFIX}.${version}.${raw.toString('base64')}`;
  await assert.rejects(() => decryptSaveText(tampered), (error: unknown) => {
    assert.ok(error instanceof SaveCipherError);
    assert.equal(error.kind, 'decrypt-failed');
    return true;
  });

  for (const bad of [
    'MEOE1.1.',
    'MEOE1.2.' + payload,
    'MEOE1.x.' + payload,
    'MEOE1.1.%%%',
    `${SAVE_ENVELOPE_PREFIX}.1.${Buffer.alloc(20).toString('base64')}`,
    'MEOE2.1.' + payload,
    'not-a-save',
  ]) {
    await assert.rejects(() => decryptSaveText(bad), SaveCipherError, bad.slice(0, 24));
  }
});

test('legacy plaintext saves still import unchanged', async () => {
  assert.equal(isEncryptedSave(plaintext), false);
  assert.equal(await decodeSaveText(plaintext), plaintext);
  assert.equal(await decodeSaveText(`\n  ${plaintext}  \n`), plaintext);
  await assert.rejects(() => decodeSaveText('   '), SaveCipherError);
});

test('encryption is unavailable without crypto.subtle, with an actionable message', async () => {
  if (!isSaveCryptoAvailable()) return; // the suite itself needs it to build a fixture
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  // Simulate a non-secure context (http://192.168.x.x) by removing subtle.
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try {
    assert.equal(isSaveCryptoAvailable(), false);
    await assert.rejects(() => encryptSaveText(plaintext), (error: unknown) => {
      assert.ok(error instanceof SaveCipherError);
      assert.equal(error.kind, 'unsupported-environment');
      assert.match(error.message, /https|localhost/);
      return true;
    });
    // Plaintext import keeps working even when decryption cannot run.
    assert.equal(await decodeSaveText(plaintext), plaintext);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  }
  assert.equal(isSaveCryptoAvailable(), true);
});
