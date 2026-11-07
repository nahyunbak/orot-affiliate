require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {AuthService} = require('../src/auth/auth.service');
const {UserService} = require('../src/user/user.service');
const {FcmService} = require('../src/fcm/fcm.service');
const {PaymentService} = require('../src/payment/payment.service');
const {UpdateUserInfoReqDto} = require('../src/user/dto/req.dto');
const {validate} = require('class-validator');
const {plainToInstance} = require('class-transformer');
function subject(Class, props) {return Object.assign(Object.create(Class.prototype), props)}
test('account deletion retains purchased account and revokes refresh token', async () => {
 const writes=[];const tx={fcmToken:{deleteMany: async a => writes.push(['tokens',a])},user:{update:async a=>writes.push(['update',a]),delete:async()=>assert.fail('paid account must not be immediately deleted')}};
 const auth=subject(AuthService,{prisma:{user:{findUnique:async()=>({id:7,isDeleted:false})},payment:{count:async a=>{assert.equal(a.where.userId,7);return 1}},$transaction:async fn=>fn(tx)}});
 await auth.deleteUser({id:7});assert.equal(writes[1][1].data.refreshToken,null);assert.equal(writes[1][1].data.isDeleted,true);assert.equal(writes[0][1].where.userId,7);
});
test('automatic account purge is disabled without an explicit retention period', async()=>{
 for(const retention of [undefined,'','0','-1','not-a-number','1.5']) {
  const auth=subject(AuthService,{configService:{get:()=>retention},prisma:{user:{findMany:()=>assert.fail('purge must be disabled')}}});
  await auth.deleteWithdrawnUsers();
 }
});
test('profile exposes no refresh tokens and updates only authenticated account',async()=>{
 let query; const user=new UserService({user:{update:async a=>query=a}});
 await user.updateUserInfo({nickName:'New name',role:'Admin',email:'other@example.invalid'},{id:7});
 assert.equal(query.where.id,7); assert.deepEqual(query.data,{nickName:'New name'});
});
test('profile DTO rejects blank names, non-HTTPS URL, invalid timezone and language',async()=>{
 for(const data of [{nickName:'   '},{profile_image:'http://example.invalid/a.png'},{timezone:'not/a-zone'},{language:'invalid'}]) {
  const errors=await validate(plainToInstance(UpdateUserInfoReqDto,data));assert.ok(errors.length>0,JSON.stringify(data));
 }
});
test('FCM credentials are optional during initialization but sending fails clearly',()=>{
 const fcm=subject(FcmService,{configService:{get:()=>undefined}});assert.doesNotThrow(()=>fcm.onModuleInit());assert.throws(()=>fcm.requireMessaging(),/not configured/);
});
test('payment allowlist fails closed when missing or unknown',()=>{
 const payment=subject(PaymentService,{configService:{get:()=>undefined}});assert.throws(()=>payment.requireConfiguredProduct('unknown'),/not configured/);
 payment.configService={get:()=> ' configured.monthly ,configured.yearly'};assert.throws(()=>payment.requireConfiguredProduct('other'));assert.doesNotThrow(()=>payment.requireConfiguredProduct('configured.monthly'));
});

test('a deleted account cannot reuse an unexpired access token', async()=>{
 const {BearerTokenMiddleware}=require('../src/auth/middleware/bearer-token.middleware');
 const middleware=new BearerTokenMiddleware({decode:()=>({type:'access'}),verifyAsync:async()=>({id:7,email:'user@example.invalid',type:'access'})},{get:()=> 'test-signing-secret'},{user:{findFirst:async()=>null}});
 const req={headers:{authorization:'Bearer token'}};let next=false;
 await middleware.use(req,{},()=>{next=true});assert.equal(req.user,undefined);assert.ok(req.error);assert.equal(next,true);
});

test('AdMob SSV rejects unsigned and duplicate-signature requests before network access', async()=>{
 const {verifyAdMobSsvRequest}=require('../src/ads/admob-ssv');
 await assert.rejects(verifyAdMobSsvRequest('/ads/reward'),/missing/);
 await assert.rejects(verifyAdMobSsvRequest('/ads/reward?a=1&signature=first&signature=second'),/position/);
});
