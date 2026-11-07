require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const apple=require('apple-signin-auth');
const {AuthService}=require('../src/auth/auth.service');
function fixture(claimNonce){
 const calls=[];
 apple.verifyIdToken=async (token,options)=>{calls.push(options);return {sub:'apple-user',email:'apple@example.invalid',nonce:claimNonce}};
 const service=Object.assign(Object.create(AuthService.prototype),{
  configService:{get:()=> 'configured-id'},logger:{error:()=>{}},
  getAppleWebSignInConfig:()=>({clientId:'configured-service-id'}),
  exchangeAppleAuthCode:async()=>({id_token:'verified-token'}),
  prisma:{user:{findFirst:async()=>({id:42,email:'apple@example.invalid',appleId:'apple-user'})}},
  generateAndSaveTokens:async user=>({accessToken:`account-${user.id}`,refreshToken:'refresh'})
 });return {service,calls};
}
test('Android code exchange requires a nonce before exchange or account access',async()=>{
 const {service}=fixture();service.exchangeAppleAuthCode=async()=>assert.fail('must reject before exchange');await assert.rejects(service.appleLogin({authorizationCode:'code',initialPlatform:'ANDROID'}),/유효하지 않은 토큰/);
});
test('Android rejects missing or mismatched verified nonce claim',async()=>{
 for(const nonce of [undefined,'other']){
  const {service}=fixture(nonce);service.prisma.user.findFirst=async()=>assert.fail('must reject before account access');
  await assert.rejects(service.appleLogin({authorizationCode:'code',nonce:'random-2',initialPlatform:'ANDROID'}),/유효하지 않은 토큰/);
 }
});
test('Android passes raw nonce to verifier and accepts matching verified claim',async()=>{
 const {service,calls}=fixture('random-2');const result=await service.appleLogin({authorizationCode:'code',nonce:'random-2',initialPlatform:'ANDROID'});assert.equal(result.accessToken,'account-42');assert.equal(calls[0].nonce,'random-2');assert.equal(calls[0].audience,'configured-service-id');
});
test('native iOS remains compatible without nonce but verifies a supplied nonce',async()=>{
 const {service}=fixture();assert.equal((await service.appleLogin({identityToken:'identity-token',initialPlatform:'IOS'})).accessToken,'account-42');
 await assert.rejects(service.appleLogin({identityToken:'identity-token',nonce:'expected',initialPlatform:'IOS'}),/유효하지 않은 토큰/);
});
test('DTO property declarations stay on separate lines from decorators',()=>{
 const fs=require('node:fs');for(const path of ['src/user/dto/res.dto.ts','src/user/dto/req.dto.ts','src/auth/dto/req.dto.ts'])assert.doesNotMatch(fs.readFileSync(path,'utf8'),/@\w+\([^\n]*\)[ \t]+\w+\??:/);
});
