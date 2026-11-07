require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {JwtService}=require('@nestjs/jwt');
const {AuthService}=require('../src/auth/auth.service');
const secret='test-only-access-secret-at-least-32-characters';
const jwt=new JwtService();
const guest={id:7,email:'guest@example.invalid',role:'Normal',auth_provider:'anonymous',isDeleted:false};
function fixture(account=guest){
 const writes=[]; const auth=Object.assign(Object.create(AuthService.prototype),{
  jwtService:jwt,configService:{get:()=>secret},
  prisma:{user:{findFirst:async ({where})=>where.auth_provider ? (account && (where.id===undefined || where.id===account.id) && where.email===account.email && !account.isDeleted && account.auth_provider==='anonymous' ? account : null) : null,update:async args=>{writes.push(args);return {...guest,...args.data}}},$transaction:async()=>assert.fail('must not merge unrelated account')},
  sendNewUserDiscordNotification:()=>{},generateAndSaveTokens:async user=>({accessToken:`account-${user.id}`,refreshToken:'new'})
 });return {auth,writes};
}
function token(overrides={}, signingSecret=secret){return jwt.sign({id:7,email:guest.email,type:'access',...overrides},{secret:signingSecret,...('exp' in overrides ? {} : {expiresIn:'5m'})})}
const params={anonymousEmail:guest.email,email:'social@example.invalid',nickName:'Social',providerId:'social-id',providerIdField:'googleId',authProvider:'google'};
test('anonymous email alone cannot claim an account',async()=>{const {auth,writes}=fixture();await assert.rejects(auth.linkAnonymousToSocialAccount(params));assert.equal(writes.length,0)});
test('forged, expired, refresh, and mismatched proof cannot claim an account',async()=>{
 for(const proof of [token({},'attacker-secret'),token({exp:1,iat:0}),token({type:'refresh'}),token({id:8}),token({email:'other@example.invalid'})]){
  const {auth,writes}=fixture();await assert.rejects(auth.linkAnonymousToSocialAccount({...params,anonymousAccessToken:proof}));assert.equal(writes.length,0);
 }
});
test('deleted or already-social guest cannot be linked',async()=>{
 for(const account of [{...guest,isDeleted:true},{...guest,auth_provider:'google'},null]){
  const {auth,writes}=fixture(account);await assert.rejects(auth.linkAnonymousToSocialAccount({...params,anonymousAccessToken:token()}));assert.equal(writes.length,0);
 }
});
test('valid access proof preserves guest-to-social linking',async()=>{
 const {auth,writes}=fixture();const result=await auth.linkAnonymousToSocialAccount({...params,anonymousAccessToken:token()});assert.equal(result.accessToken,'account-7');assert.equal(writes[0].where.id,7);assert.equal(writes[0].data.auth_provider,'google');
});
test('FCM token alone creates a new guest and never reads the token owner',async()=>{
 const {auth}=fixture();auth.prisma.fcmToken={findFirst:async()=>assert.fail('FCM is not authentication proof')};auth.createAccount=async()=>({id:99,email:'fresh@example.invalid',role:'Normal'});auth.generateToken=({id,type})=>`${id}-${type}`;
 const result=await auth.anonymousLogin({fcmToken:'victim-device-token'});assert.equal(result.accessToken,'99-access');
});
test('valid proof merges only its guest into an existing active social account', async()=>{
 const {auth,writes}=fixture();let reads=0;let deleted;
 auth.prisma.user.findFirst=async ({where})=>{reads++;return where.auth_provider ? guest : {id:42,email:params.email,role:'Normal',isDeleted:false}};
 auth.prisma.$transaction=async fn=>fn({fcmToken:{findMany:async ({where})=>{assert.equal(where.userId,7);return []}},payment:{updateMany:async ({where})=>assert.equal(where.userId,7)},user:{delete:async ({where})=>{deleted=where.id}}});
 const result=await auth.linkAnonymousToSocialAccount({...params,anonymousAccessToken:token()});assert.equal(result.accessToken,'account-42');assert.equal(deleted,7);assert.equal(reads,2);assert.equal(writes.length,0);
});
test('email without proof cannot even look up the destination social account',async()=>{
 const {auth}=fixture();auth.prisma.user.findFirst=async()=>assert.fail('no reads before proof');
 await assert.rejects(auth.linkAnonymousToSocialAccount(params),/유효하지 않은 토큰/);
});
