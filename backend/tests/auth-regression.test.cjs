const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
// 실제 서비스 메서드를 실행하되 DB/외부 SDK는 로드하지 않는다.
const source = fs.readFileSync('src/auth/auth.service.ts', 'utf8');
const parsed = ts.createSourceFile('auth.ts', source, ts.ScriptTarget.Latest, true);
const cls = parsed.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'AuthService');
function method(name) {
  const node = cls.members.find(n => n.name?.getText(parsed) === name);
  const code = ts.transpileModule(`class Subject { ${node.getText(parsed).replace(/^(@[^\n]+\n)+/, '')} }; Subject`, {compilerOptions: {target: ts.ScriptTarget.ES2021}}).outputText;
  return vm.runInNewContext(code, { UnauthorizedException: Error, ERROR_MESSAGE: {AUTH: {INVALID_TOKEN: 'invalid'}}, envVariableKeys: {JWT_REFRESH_SECRET: 'JWT_REFRESH_SECRET'}}).prototype[name];
}
const refresh = method('refreshAccessToken');
function fixture(type = 'refresh', saved = 'current') {
  const updates = [];
  return { updates, configService: {get: () => 'secret'}, jwtService: {verifyAsync: async () => ({type,email:'user@example.invalid'})}, checkUserExists: async () => ({id:1,email:'user@example.invalid',role:'Normal',refreshToken:saved}), generateToken: ({type}) => `new-${type}`, prisma: {user: {update: async args => updates.push(args)}} };
}
test('refresh rejects an access token without writing a session', async () => {
 const f = fixture('access'); await assert.rejects(refresh.call(f,{refreshToken:'current'})); assert.equal(f.updates.length,0);
});
test('refresh rejects a revoked token without writing a session', async () => {
 const f = fixture('refresh','revoked'); await assert.rejects(refresh.call(f,{refreshToken:'current'})); assert.equal(f.updates.length,0);
});
test('refresh persists rotated token for the verified account', async () => {
 const f = fixture(); const result = await refresh.call(f,{refreshToken:'current'}); assert.equal(result.accessToken,'new-access'); assert.equal(f.updates[0].where.id,1); assert.equal(f.updates[0].data.refreshToken,'new-refresh');
});
