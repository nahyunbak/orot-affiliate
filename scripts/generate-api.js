#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { createRequire } = require('node:module');

const API_GENERATION_TARGETS_ENV = 'API_GENERATION_TARGETS';

function readBackendEnvValue(
  key,
  envPath = path.join(__dirname, '../backend/.env'),
) {
  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().startsWith(`${key}=`));

  if (!line) {
    return undefined;
  }

  const value = line.slice(line.indexOf('=') + 1).trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1).trim();
  }

  return value.split(/\s+#/)[0].trim();
}

function parseTargetsValue(value, supportedTargets) {
  if (!value || value === 'all' || value === 'both') {
    return supportedTargets;
  }

  const targets = [...new Set(value.split(',').map((target) => target.trim()))].filter(
    Boolean,
  );

  if (
    targets.length === 0 ||
    targets.some((target) => !supportedTargets.includes(target))
  ) {
    throw new Error(
      `${API_GENERATION_TARGETS_ENV} 또는 --target은 all, both, ${supportedTargets.join(', ')} 조합 중 하나여야 합니다.`,
    );
  }

  return targets;
}

function resolveTargets(argv, env = process.env, envPath) {
  const targetIndex = argv.indexOf('--target');
  const supportedTargets = Object.keys(config.clients);
  const cliTarget = targetIndex >= 0 ? argv[targetIndex + 1] : undefined;

  if (targetIndex >= 0 && !cliTarget) {
    throw new Error('--target 다음에 생성 대상을 지정하세요.');
  }

  const configuredTargets =
    cliTarget ??
    env[API_GENERATION_TARGETS_ENV] ??
    readBackendEnvValue(API_GENERATION_TARGETS_ENV, envPath);

  return parseTargetsValue(configuredTargets ?? 'all', supportedTargets);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function cleanGeneratedTypes(targetName) {
  const typesPath = config.getClientTarget(targetName).types;
  if (!fs.existsSync(typesPath)) {
    return;
  }

  fs.readdirSync(typesPath, { withFileTypes: true }).forEach((entry) => {
    // app-types.ts는 각 클라이언트가 직접 관리하는 확장 지점입니다.
    if (entry.name === 'app-types.ts') {
      return;
    }
    fs.rmSync(path.join(typesPath, entry.name), { recursive: true, force: true });
  });
}

async function formatGeneratedClient(targetName, packageDir = path.resolve(__dirname, '..', targetName)) {
  const target = config.getClientTarget(targetName);
  const clientRequire = createRequire(path.join(packageDir, 'package.json'));
  const prettier = clientRequire('prettier');
  const files = [];
  function collect(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { collect(file); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.ts') || ['app-types.ts', 'custom.ts'].includes(entry.name)) continue;
      if (file === path.join(target.fetch, 'constants.ts')) continue;
      const content = fs.readFileSync(file, 'utf8');
      const generated = file.startsWith(target.types + path.sep) ||
        [target.fetch, target.query, target.mutation].some(dir => file === path.join(dir, 'index.ts')) ||
        file === path.join(target.fetch, 'utils/constants.ts') ||
        /자동 생성|automatically generated|Auto-generated/.test(content.split('\n').slice(0, 3).join('\n'));
      if (generated) files.push(file);
    }
  }
  for (const dir of [target.fetch, target.query, target.mutation]) collect(dir);
  if (target.copyBackendUtils) collect(path.join(packageDir, 'utils/backend'));
  for (const file of files.sort()) {
    const options = await prettier.resolveConfig(file);
    const plugins = (options?.plugins || []).map(plugin => typeof plugin === 'string' ? clientRequire.resolve(plugin) : plugin);
    const content = fs.readFileSync(file, 'utf8');
    const formatted = await prettier.format(content, { ...options, plugins, filepath: file });
    if (formatted !== content) fs.writeFileSync(file, formatted);
  }
}

async function main() {

  const targets = resolveTargets(process.argv.slice(2));

  if (config.generation?.controllers !== false) {
    run('pnpm', ['exec', 'ts-node', 'scripts/generate-controllers.ts']);
  }

  targets.forEach((targetName) => {
    cleanGeneratedTypes(targetName);
    run(process.execPath, ['scripts/copy-prisma-types.js', '--target', targetName]);
    run(process.execPath, ['scripts/generate-shared-types.js', '--target', targetName]);
    run(process.execPath, ['scripts/generate-endpoint.js', '--target', targetName]);
    run(process.execPath, ['scripts/generate-hooks.js', '--target', targetName]);
  });

  if (targets.some((targetName) => config.getClientTarget(targetName).copyBackendUtils)) {
    run(process.execPath, ['scripts/copy-backend-utils.js']);
  }

  for (const targetName of targets) await formatGeneratedClient(targetName);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  API_GENERATION_TARGETS_ENV,
  cleanGeneratedTypes,
  formatGeneratedClient,
  parseTargetsValue,
  readBackendEnvValue,
  resolveTargets,
};
