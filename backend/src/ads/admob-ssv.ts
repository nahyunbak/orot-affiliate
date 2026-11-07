import axios from 'axios';
import { createVerify } from 'crypto';

const ADMOB_VERIFIER_KEYS_URL =
  'https://www.gstatic.com/admob/reward/verifier-keys.json';
const VERIFIER_KEYS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FORCED_VERIFIER_KEYS_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;
const VERIFIER_KEYS_FETCH_RETRY_MIN_INTERVAL_MS = 3 * 1000;
const UNKNOWN_KEY_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const UNKNOWN_KEY_NEGATIVE_CACHE_MAX_ENTRIES = 5_000;
const SSV_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const SSV_RATE_LIMIT_GLOBAL = 3_000;
const SSV_RATE_LIMIT_PER_TRANSACTION = 10;
const SSV_RATE_LIMIT_MAX_TRANSACTIONS = 10_000;

type AdMobVerifierKey = {
  keyId: string | number;
  pem: string;
};

type AdMobVerifierKeysResponse = {
  keys?: AdMobVerifierKey[];
};

export type VerifiedAdMobSsv = {
  adUnitId: string;
  claimId: string;
  rewardedAt: Date;
  transactionId: string;
};

let verifierKeysCache:
  | { expiresAt: number; keys: Map<string, string> }
  | undefined;
let verifierKeysFetchInFlight: Promise<Map<string, string>> | undefined;
let lastForcedVerifierKeysRefreshAt = 0;
let lastVerifierKeysFetchAttemptAt = 0;
const unknownKeyNegativeCache = new Map<string, number>();

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const ssvRateLimitByTransaction = new Map<string, RateLimitBucket>();
let ssvGlobalRateLimit: RateLimitBucket = { count: 0, resetAt: 0 };

const fetchVerifierKeys = async (): Promise<Map<string, string>> => {
  const response = await axios.get<AdMobVerifierKeysResponse>(
    ADMOB_VERIFIER_KEYS_URL,
    { timeout: 2_000 },
  );
  const keys = new Map<string, string>();

  for (const key of response.data.keys ?? []) {
    if (key.pem) {
      keys.set(String(key.keyId), key.pem);
    }
  }

  if (keys.size === 0) {
    throw new Error('AdMob verifier key response is empty');
  }

  verifierKeysCache = {
    expiresAt: Date.now() + VERIFIER_KEYS_CACHE_TTL_MS,
    keys,
  };
  unknownKeyNegativeCache.clear();
  return keys;
};

const getVerifierKeys = async (
  forceRefresh = false,
): Promise<Map<string, string>> => {
  const now = Date.now();
  if (!forceRefresh && verifierKeysCache && verifierKeysCache.expiresAt > now) {
    return verifierKeysCache.keys;
  }

  if (
    forceRefresh &&
    verifierKeysCache &&
    now - lastForcedVerifierKeysRefreshAt <
      FORCED_VERIFIER_KEYS_REFRESH_MIN_INTERVAL_MS
  ) {
    return verifierKeysCache.keys;
  }

  if (verifierKeysFetchInFlight) {
    return verifierKeysFetchInFlight;
  }

  if (
    now - lastVerifierKeysFetchAttemptAt <
    VERIFIER_KEYS_FETCH_RETRY_MIN_INTERVAL_MS
  ) {
    throw new Error('AdMob verifier key fetch is temporarily throttled');
  }

  lastVerifierKeysFetchAttemptAt = now;

  verifierKeysFetchInFlight = fetchVerifierKeys();
  try {
    const keys = await verifierKeysFetchInFlight;
    if (forceRefresh) {
      lastForcedVerifierKeysRefreshAt = Date.now();
    }
    return keys;
  } finally {
    verifierKeysFetchInFlight = undefined;
  }
};

const cacheUnknownVerifierKey = (keyId: string): void => {
  if (unknownKeyNegativeCache.size >= UNKNOWN_KEY_NEGATIVE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [cachedKeyId, expiresAt] of unknownKeyNegativeCache) {
      if (expiresAt <= now) {
        unknownKeyNegativeCache.delete(cachedKeyId);
      }
    }
  }
  if (unknownKeyNegativeCache.size >= UNKNOWN_KEY_NEGATIVE_CACHE_MAX_ENTRIES) {
    const oldestKeyId = unknownKeyNegativeCache.keys().next().value;
    if (typeof oldestKeyId === 'string') {
      unknownKeyNegativeCache.delete(oldestKeyId);
    }
  }
  unknownKeyNegativeCache.set(
    keyId,
    Date.now() + UNKNOWN_KEY_NEGATIVE_CACHE_TTL_MS,
  );
};

const getCurrentRateLimitBucket = (
  bucket: RateLimitBucket | undefined,
  now: number,
): RateLimitBucket =>
  !bucket || bucket.resetAt <= now
    ? { count: 0, resetAt: now + SSV_RATE_LIMIT_WINDOW_MS }
    : bucket;

/** 서명 검증 전 공개 SSV 경로의 전체 유입량을 제한한다. */
export const consumeAdMobSsvGlobalRateLimit = (): boolean => {
  const now = Date.now();
  ssvGlobalRateLimit = getCurrentRateLimitBucket(ssvGlobalRateLimit, now);
  if (ssvGlobalRateLimit.count >= SSV_RATE_LIMIT_GLOBAL) {
    return false;
  }

  ssvGlobalRateLimit = {
    ...ssvGlobalRateLimit,
    count: ssvGlobalRateLimit.count + 1,
  };
  return true;
};

/**
 * Google 서명 검증 후 transaction_id별 재전송만 제한한다. 프록시가 실제
 * 원격 IP를 전달한다는 보장이 없어 X-Forwarded-For는 신뢰하지 않는다.
 */
export const consumeAdMobSsvTransactionRateLimit = (
  transactionId: string,
): boolean => {
  const now = Date.now();
  let bucket = getCurrentRateLimitBucket(
    ssvRateLimitByTransaction.get(transactionId),
    now,
  );
  if (bucket.count >= SSV_RATE_LIMIT_PER_TRANSACTION) {
    return false;
  }

  if (!ssvRateLimitByTransaction.has(transactionId)) {
    if (ssvRateLimitByTransaction.size >= SSV_RATE_LIMIT_MAX_TRANSACTIONS) {
      for (const [key, existingBucket] of ssvRateLimitByTransaction) {
        if (existingBucket.resetAt <= now) {
          ssvRateLimitByTransaction.delete(key);
        }
      }
    }
    if (ssvRateLimitByTransaction.size >= SSV_RATE_LIMIT_MAX_TRANSACTIONS) {
      return false;
    }
  }

  bucket = { ...bucket, count: bucket.count + 1 };
  ssvRateLimitByTransaction.set(transactionId, bucket);
  return true;
};

const requireSingleQueryValue = (
  params: URLSearchParams,
  name: string,
): string => {
  const values = params.getAll(name);
  if (values.length !== 1 || !values[0]) {
    throw new Error(`Invalid AdMob SSV parameter: ${name}`);
  }
  return values[0];
};

const decodeWebSafeBase64 = (value: string): Buffer => {
  if (value.length > 1_024 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    throw new Error('Invalid AdMob SSV signature encoding');
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(paddingLength), 'base64');
};

/**
 * Express가 보존한 원본 query string을 그대로 서명 대상으로 사용한다.
 * URLSearchParams는 필드 추출에만 쓰며, 서명 대상 문자열을 재조립하지 않는다.
 */
export const verifyAdMobSsvRequest = async (
  originalUrl: string,
): Promise<VerifiedAdMobSsv> => {
  const queryStart = originalUrl.indexOf('?');
  if (queryStart < 0) {
    throw new Error('AdMob SSV query string is missing');
  }

  const rawQuery = originalUrl.slice(queryStart + 1);
  if (rawQuery.length > 8_192) {
    throw new Error('AdMob SSV query string is too long');
  }
  const signatureMarker = '&signature=';
  const signatureStart = rawQuery.indexOf(signatureMarker);
  if (
    signatureStart <= 0 ||
    signatureStart !== rawQuery.lastIndexOf(signatureMarker)
  ) {
    throw new Error('AdMob SSV signature position is invalid');
  }

  const signedData = rawQuery.slice(0, signatureStart);
  const unsignedParams = rawQuery.slice(signatureStart + 1);
  const params = new URLSearchParams(rawQuery);
  const unsignedFields = new URLSearchParams(unsignedParams);

  const signature = requireSingleQueryValue(params, 'signature');
  const keyId = requireSingleQueryValue(params, 'key_id');
  const adUnitId = requireSingleQueryValue(params, 'ad_unit');
  const claimId = requireSingleQueryValue(params, 'custom_data');
  const timestamp = requireSingleQueryValue(params, 'timestamp');
  const transactionId = requireSingleQueryValue(params, 'transaction_id');

  if (!/^\d{1,20}$/.test(keyId)) {
    throw new Error('Invalid AdMob SSV key_id');
  }
  if (!/^(?:ca-app-pub-\d{1,20}\/)?\d{1,20}$/.test(adUnitId)) {
    throw new Error('Invalid AdMob SSV ad_unit');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      claimId,
    )
  ) {
    throw new Error('Invalid AdMob SSV custom_data');
  }
  if (transactionId.length > 256) {
    throw new Error('Invalid AdMob SSV transaction_id');
  }
  if (!/^\d{10,16}$/.test(timestamp)) {
    throw new Error('Invalid AdMob SSV timestamp');
  }
  const timestampMs = Number(timestamp);
  const rewardedAt = new Date(timestampMs);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Number.isNaN(rewardedAt.getTime())
  ) {
    throw new Error('Invalid AdMob SSV timestamp');
  }

  if (
    unsignedFields.getAll('signature').length !== 1 ||
    unsignedFields.getAll('key_id').length !== 1 ||
    [...unsignedFields.keys()].some(
      (name) => name !== 'signature' && name !== 'key_id',
    )
  ) {
    throw new Error('AdMob SSV unsigned fields are invalid');
  }

  let verifierKeys = await getVerifierKeys();
  let publicKey = verifierKeys.get(keyId);
  if (!publicKey) {
    const negativeCacheExpiresAt = unknownKeyNegativeCache.get(keyId) ?? 0;
    if (negativeCacheExpiresAt > Date.now()) {
      throw new Error('Unknown AdMob SSV verifier key');
    }

    verifierKeys = await getVerifierKeys(true);
    publicKey = verifierKeys.get(keyId);
  }
  if (!publicKey) {
    cacheUnknownVerifierKey(keyId);
    throw new Error('Unknown AdMob SSV verifier key');
  }

  const verifier = createVerify('SHA256');
  verifier.update(signedData, 'utf8');
  verifier.end();

  if (!verifier.verify(publicKey, decodeWebSafeBase64(signature))) {
    throw new Error('Invalid AdMob SSV signature');
  }

  return { adUnitId, claimId, rewardedAt, transactionId };
};
