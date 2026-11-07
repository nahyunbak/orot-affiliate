require('dotenv').config();

const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');

/**
 * [Apple App Store Server API용 JWT 생성기]
 * 공식 문서 요구사항:
 * 1. Header: alg(ES256), kid(Key ID), typ(JWT)
 * 2. Payload: iss(Issuer ID), iat(발급시간), exp(만료시간), aud(appstoreconnect-v1), bid(Bundle ID)
 * 3. Signature: ES256 알고리즘 + .p8 Private Key 서명
 *
 * @see https://developer.apple.com/documentation/appstoreserverapi/generating_tokens_for_api_requests
 */

// ==========================================
// [설정 영역] 환경변수 또는 직접 입력
// ==========================================
const CONFIG = {
    keyId: process.env.APPLE_KEY_ID || 'YOUR_KEY_ID',           // App Store Connect > 키 > Key ID
    issuerId: process.env.APPLE_ISSUER_ID || 'YOUR_ISSUER_ID',  // App Store Connect > 키 > Issuer ID
    bundleId: process.env.BUNDLE_ID || 'com.example.app', // 앱의 Bundle ID
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH || './AuthKey_XXXXXXXXXX.p8' // .p8 파일 경로
};

/**
 * Apple App Store Server API용 JWT 토큰 생성
 * @param {Object} config - 설정 객체
 * @param {string} config.keyId - Apple Key ID
 * @param {string} config.issuerId - Apple Issuer ID
 * @param {string} config.bundleId - 앱 Bundle ID
 * @param {string} config.privateKeyPath - .p8 파일 경로
 * @param {number} config.expiresIn - 만료 시간 (초, 기본값: 3600)
 * @returns {string} JWT 토큰
 */
function generateAppleJWT(config) {
    const {
        keyId,
        issuerId,
        bundleId,
        privateKeyPath,
        expiresIn = 60 * 60 // 기본 1시간 (최대 유효시간)
    } = config;

    // 필수 값 검증
    if (!keyId || keyId === 'YOUR_KEY_ID') {
        throw new Error('❌ Apple Key ID가 설정되지 않았습니다. CONFIG.keyId를 설정하거나 APPLE_KEY_ID 환경변수를 설정하세요.');
    }
    if (!issuerId || issuerId === 'YOUR_ISSUER_ID') {
        throw new Error('❌ Apple Issuer ID가 설정되지 않았습니다. CONFIG.issuerId를 설정하거나 APPLE_ISSUER_ID 환경변수를 설정하세요.');
    }
    if (!bundleId || bundleId === 'com.example.app') {
        throw new Error('❌ Bundle ID가 설정되지 않았습니다. CONFIG.bundleId를 설정하거나 BUNDLE_ID 환경변수를 설정하세요.');
    }

    // .p8 프라이빗 키 파일 읽기
    const resolvedPath = path.resolve(privateKeyPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`❌ .p8 파일을 찾을 수 없습니다: ${resolvedPath}\n   CONFIG.privateKeyPath를 확인하거나 APPLE_PRIVATE_KEY_PATH 환경변수를 설정하세요.`);
    }
    const privateKey = fs.readFileSync(resolvedPath, 'utf8');

    // 시간 설정 (UNIX Timestamp, 초 단위)
    const now = Math.floor(Date.now() / 1000);

    // JWT 토큰 생성
    const token = jwt.sign(
        {
            // Payload
            iss: issuerId,              // Issuer ID
            iat: now,                   // Issued At
            exp: now + expiresIn,       // Expiration Time
            aud: 'appstoreconnect-v1',  // Audience (고정값)
            bid: bundleId               // Bundle ID
        },
        privateKey,
        {
            // Header
            algorithm: 'ES256',
            header: {
                kid: keyId,
                typ: 'JWT'
            }
        }
    );

    return token;
}

// ==========================================
// 메인 실행부
// ==========================================
if (require.main === module) {
    try {
        console.log('🔐 Apple App Store Server API JWT 생성 중...\n');

        const token = generateAppleJWT(CONFIG);

        console.log('✅ JWT 생성 성공!\n');
        console.log('---------------------------------------------------');
        console.log(token);
        console.log('---------------------------------------------------\n');

        console.log('📋 [설정 정보]');
        console.log(`   Key ID: ${CONFIG.keyId}`);
        console.log(`   Issuer ID: ${CONFIG.issuerId}`);
        console.log(`   Bundle ID: ${CONFIG.bundleId}`);
        console.log(`   Private Key: ${CONFIG.privateKeyPath}\n`);

        console.log('👇 [Sandbox 환경 테스트 Curl 명령어]');
        console.log(`curl -v -X POST "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/notifications/test" \\`);
        console.log(`  -H "Authorization: Bearer ${token}" \\`);
        console.log(`  -H "Content-Type: application/json"\n`);

        console.log('👇 [Production 환경 Curl 명령어]');
        console.log(`curl -v -X POST "https://api.storekit.itunes.apple.com/inApps/v1/notifications/test" \\`);
        console.log(`  -H "Authorization: Bearer ${token}" \\`);
        console.log(`  -H "Content-Type: application/json"\n`);

    } catch (error) {
        console.error('❌ 에러 발생:', error.message);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = {
    generateAppleJWT
};
