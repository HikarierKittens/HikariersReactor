/**
 * Exported-save encryption: AES-256-GCM, the only format a new export is written in.
 *
 * Threat model: this is integrity + obfuscation for a client-only game. The key ships
 * inside the bundle, so a determined player can always extract it; what this buys is
 * "a hand-edited save will not load", not secrecy. Never treat it as anti-cheat.
 *
 * Wire format (single line, no whitespace):
 *   MEOE1.<keyVersion>.<base64(iv || ciphertext || tag)>
 * The plaintext inside is exactly the previous `JSON.stringify(state)` text, so the
 * validation chain after decryption is unchanged.
 */
import { SAVE_EXPORT_KEYS } from '../data/config';

/** Format marker: bump the digit only on an incompatible envelope change. */
export const SAVE_ENVELOPE_PREFIX = 'MEOE1';
const IV_BYTES = 12;
const TAG_BITS = 128;
const KEY_VERSION = 1;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type SaveCipherFailure =
  | 'unsupported-environment'
  | 'malformed-envelope'
  | 'unknown-key-version'
  | 'decrypt-failed';

export class SaveCipherError extends Error {
  constructor(readonly kind: SaveCipherFailure, message: string) {
    super(message);
    this.name = 'SaveCipherError';
  }
}

/** `crypto.subtle` exists only in secure contexts (https or localhost). */
export function isSaveCryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.importKey === 'function';
}

function subtle(): SubtleCrypto {
  if (!isSaveCryptoAvailable()) {
    throw new SaveCipherError('unsupported-environment',
      '当前页面不是安全上下文（需 https 或 localhost），无法加解密存档。请通过 https 或本机地址访问游戏。');
  }
  return globalThis.crypto.subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked to keep the argument list small for multi-megabyte saves.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Strict 64-hex-char (32-byte) key parsing; any other length is a hard error. */
export function parseSaveKey(hex: string): Uint8Array<ArrayBuffer> {
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new SaveCipherError('malformed-envelope', '存档密钥格式无效：必须为 64 个十六进制字符（32 字节）。');
  }
  return Uint8Array.from(trimmed.match(/../g)!.map(byte => parseInt(byte, 16)));
}

async function importSaveKey(version: number): Promise<CryptoKey> {
  const hex = SAVE_EXPORT_KEYS[version];
  if (!hex) throw new SaveCipherError('unknown-key-version', `存档使用了未知的密钥版本 ${version}，请更新游戏后再导入。`);
  return subtle().importKey('raw', parseSaveKey(hex), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedSave(text: string): boolean {
  return text.trimStart().startsWith(`${SAVE_ENVELOPE_PREFIX}.`);
}

/** Encrypt the plaintext save JSON into the envelope above. */
export async function encryptSaveText(plaintext: string): Promise<string> {
  // Check the environment before touching getRandomValues: a non-secure context
  // usually lacks both, and the actionable message matters more than the first throw.
  const cryptoApi = subtle();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const key = await importSaveKey(KEY_VERSION);
  const ciphertext = await cryptoApi.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS },
    key,
    new TextEncoder().encode(plaintext),
  );
  const payload = new Uint8Array(new ArrayBuffer(iv.length + ciphertext.byteLength));
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  return `${SAVE_ENVELOPE_PREFIX}.${KEY_VERSION}.${bytesToBase64(payload)}`;
}

/**
 * Decrypt an envelope produced by `encryptSaveText`. Malformed input, a wrong key and
 * a tampered ciphertext all surface as `SaveCipherError` so callers can explain it.
 */
export async function decryptSaveText(text: string): Promise<string> {
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== SAVE_ENVELOPE_PREFIX) {
    throw new SaveCipherError('malformed-envelope', '存档格式无法识别：既不是加密存档，也不是有效的 JSON。');
  }
  const versionText = parts[1] ?? '', payloadText = parts[2] ?? '';
  if (!/^\d+$/.test(versionText) || !payloadText || !BASE64.test(payloadText)) {
    throw new SaveCipherError('malformed-envelope', '加密存档内容已损坏，无法解析。');
  }
  const payload = base64ToBytes(payloadText);
  if (payload.length <= IV_BYTES + TAG_BITS / 8) {
    throw new SaveCipherError('malformed-envelope', '加密存档内容不完整，可能被截断。');
  }
  const key = await importSaveKey(Number(versionText));
  const iv = payload.subarray(0, IV_BYTES);
  const body = payload.slice(IV_BYTES);
  try {
    const plaintext = await subtle().decrypt({ name: 'AES-GCM', iv, tagLength: TAG_BITS }, key, body);
    return new TextDecoder().decode(plaintext);
  } catch {
    // GCM cannot distinguish "wrong key" from "edited bytes"; both mean "do not load".
    throw new SaveCipherError('decrypt-failed', '存档解密失败：密钥不匹配或内容已被修改。');
  }
}

/**
 * Import entry point: accepts the encrypted envelope or a legacy plaintext JSON save.
 * Plaintext stays supported so backups made before encryption keep working.
 */
export async function decodeSaveText(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new SaveCipherError('malformed-envelope', '存档内容为空。');
  if (isEncryptedSave(trimmed)) return decryptSaveText(trimmed);
  // Legacy plaintext: leave parsing/validation to the existing JSON chain.
  return trimmed;
}
