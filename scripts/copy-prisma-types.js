#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const config = require('./config');

console.log('🚀 Prisma & Backend Types 복사 스크립트 시작...');

// 경로 설정
const targetFlagIndex = process.argv.indexOf('--target');
const targetName =
  targetFlagIndex >= 0 ? process.argv[targetFlagIndex + 1] : 'mobile';
if (!targetName) {
  throw new Error('--target 다음에 mobile 또는 web을 지정하세요.');
}
const sharedTypesPath = config.getClientTarget(targetName).types;
const targetTypesPath = path.join(sharedTypesPath, 'prisma-types.ts');
const backendTypesPath = path.join(sharedTypesPath, 'backend-types.ts');

function normalizeGeneratedText(content) {
  return `${content.replace(/[ \t]+$/gm, '').trimEnd()}\n`;
}

console.log('📁 타입 생성 경로:', targetTypesPath);

// Prisma client 경로 자동 찾기
function findPrismaClientPath() {
  console.log('🔍 Prisma client 경로 자동 탐색 중...');

  const serverNodeModules = path.join(config.backend.src, '..', 'node_modules');

  // .pnpm 폴더에서 @prisma+client로 시작하는 폴더 찾기
  try {
    const pnpmPath = path.join(serverNodeModules, '.pnpm');
    if (fs.existsSync(pnpmPath)) {
      const pnpmDirs = fs.readdirSync(pnpmPath).sort();
      const prismaClientDir = pnpmDirs.find(dir => dir.startsWith('@prisma+client@'));

      if (prismaClientDir) {
        const candidatePath = path.join(pnpmPath, prismaClientDir, 'node_modules', '.prisma', 'client', 'index.d.ts');
        if (fs.existsSync(candidatePath)) {
          console.log('✅ Prisma client 파일 발견:', candidatePath);
          return candidatePath;
        }
      }
    }
  } catch (error) {
    console.log('⚠️ .pnpm 경로에서 검색 실패:', error.message);
  }

  return null;
}

// Prisma schema에서 모델 정의 추출
function extractModelsFromSchema() {
  console.log('🔍 Prisma schema에서 모델 정의 추출 중...');

  const schemaPath = config.backend.prisma.schema;

  if (!fs.existsSync(schemaPath)) {
    console.log('⚠️ Prisma schema 파일을 찾을 수 없습니다:', schemaPath);
    return {};
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  // 먼저 enum 목록을 추출
  const enumNames = [];
  const enumMatches = schemaContent.matchAll(/enum\s+(\w+)\s*\{([^}]+)\}/g);
  for (const match of enumMatches) {
    enumNames.push(match[1]);
  }

  const models = {};

  // 모델 추출 정규식
  const modelMatches = schemaContent.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g);

  for (const match of modelMatches) {
    const modelName = match[1];
    const modelBody = match[2];

    // 필드 추출
    const fields = [];
    const fieldLines = modelBody.split('\n');

    for (const line of fieldLines) {
      const trimmed = line.trim();

      // 빈 줄, 주석, 관계 설정, 인덱스 설정 등은 건너뛰기
      if (!trimmed ||
        trimmed.startsWith('//') ||
        trimmed.includes('@relation') ||
        trimmed.includes('@@')) {
        continue;
      }

      // 기본 필드 정의 파싱: fieldName Type [optional] [attributes]
      const fieldMatch = trimmed.match(/^(\w+)\s+([^\s@]+)(\?)?/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        let fieldType = fieldMatch[2];
        const hasQuestionMark = fieldMatch[3] === '?';
        const hasDefault = trimmed.includes('@default');

        // 타입에 ?가 포함되어 있는 경우 처리 (예: Int?, String?)
        let isOptionalType = false;
        if (fieldType.endsWith('?')) {
          fieldType = fieldType.slice(0, -1);
          isOptionalType = true;
        }

        // 배열 타입인지 확인
        const isArray = fieldType.endsWith('[]');
        if (isArray) {
          fieldType = fieldType.slice(0, -2); // [] 제거
        }

        // Prisma 타입을 TypeScript 타입으로 변환
        let tsType;
        switch (fieldType) {
          case 'String':
            tsType = 'string';
            break;
          case 'Int':
            tsType = 'number';
            break;
          case 'Float':
            tsType = 'number';
            break;
          case 'Boolean':
            tsType = 'boolean';
            break;
          case 'DateTime':
            tsType = 'Date';
            break;
          case 'Json':
            tsType = 'unknown';
            break;
          default:
            // 동적으로 추출된 enum 목록에서 확인
            if (enumNames.includes(fieldType)) {
              tsType = fieldType;
            } else {
              continue; // 알 수 없는 타입이면 건너뛰기 (관계 필드일 가능성)
            }
        }

        // 배열 타입 처리
        if (isArray) {
          tsType += '[]';
        }

        // 옵셔널 타입 처리
        const isOptional = hasQuestionMark || isOptionalType || hasDefault;

        fields.push({
          name: fieldName,
          type: tsType,
          optional: isOptional
        });
      }
    }

    models[modelName] = fields;
  }

  console.log(`✅ ${Object.keys(models).length}개의 모델을 추출했습니다:`, Object.keys(models).join(', '));
  return models;
}

// Prisma schema에서 enum 정의 추출
function extractEnumsFromSchema() {
  console.log('🔍 Prisma schema에서 enum 정의 추출 중...');

  const schemaPath = config.backend.prisma.schema;

  if (!fs.existsSync(schemaPath)) {
    console.log('⚠️ Prisma schema 파일을 찾을 수 없습니다:', schemaPath);
    return {};
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const enums = {};

  // enum 추출 정규식
  const enumMatches = schemaContent.matchAll(/enum\s+(\w+)\s*\{([^}]+)\}/g);

  for (const match of enumMatches) {
    const enumName = match[1];
    const enumBody = match[2];

    // enum 값들 추출
    const values = [];
    const enumLines = enumBody.split('\n');

    for (const line of enumLines) {
      const trimmed = line.trim();

      // 빈 줄이나 주석은 건너뛰기
      if (!trimmed || trimmed.startsWith('//')) {
        continue;
      }

      // enum 값 추출 (공백으로 구분된 첫 번째 단어)
      const enumValue = trimmed.split(/\s+/)[0];
      if (enumValue) {
        values.push(enumValue);
      }
    }

    enums[enumName] = values;
  }

  console.log(`✅ ${Object.keys(enums).length}개의 enum을 추출했습니다:`, Object.keys(enums).join(', '));
  return enums;
}

// 간단한 타입 정의 생성
function generateSimpleTypes() {
  console.log('🔍 간단한 타입 정의 생성 중...');

  const models = extractModelsFromSchema();
  const enums = extractEnumsFromSchema();

  let content = `// This file is automatically generated from Prisma schema
// DO NOT EDIT THIS FILE DIRECTLY - it will be overwritten
// To update this file, run: pnpm generate-api

// ===== Enums =====

`;

  // 동적으로 enum 정의 생성
  for (const [enumName, enumValues] of Object.entries(enums)) {
    content += `export enum ${enumName} {\n`;

    for (const value of enumValues) {
      content += `  ${value} = '${value}',\n`;
    }

    content += `}\n\n`;
  }

  content += `// ===== Base Model Types =====

`;

  // 각 모델에 대한 타입 정의 생성
  for (const [modelName, fields] of Object.entries(models)) {
    content += `export interface ${modelName} {\n`;

    for (const field of fields) {
      const optionalMark = field.optional ? '?' : '';
      content += `  ${field.name}${optionalMark}: ${field.type};\n`;
    }

    content += `}\n\n`;
  }

  // Common Input Types 추가
  content += `// ===== Common Input Types =====

export type PartialType<T = unknown> = Partial<T>;

export interface CreateInput<T> {
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface UpdateInput<T> {
  where: { id: string | number };
  data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;
}

export interface FindManyInput {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  skip?: number;
  take?: number;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

export interface FindUniqueInput {
  where: { id: string | number } | { email: string };
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}
`;

  console.log(`✅ 타입 정의 생성 완료 (크기: ${content.length} 문자)`);
  return content;
}

// 타입 파일 저장
function saveTypesFile(content) {
  console.log('💾 타입 파일 저장 중...');

  // 대상 디렉토리 존재 확인 및 생성
  if (!fs.existsSync(sharedTypesPath)) {
    console.log('📁 대상 디렉토리가 없어서 생성합니다:', sharedTypesPath);
    fs.mkdirSync(sharedTypesPath, { recursive: true });
  }

  try {
    fs.writeFileSync(targetTypesPath, normalizeGeneratedText(content), 'utf-8');
    console.log('✅ 타입 파일이 성공적으로 저장되었습니다!');
    console.log('📄 파일 크기:', Math.round(fs.statSync(targetTypesPath).size / 1024), 'KB');
    return true;
  } catch (error) {
    console.error('❌ 파일 저장 중 오류가 발생했습니다:', error.message);
    return false;
  }
}

// index.ts 파일 업데이트
function updateIndexFile() {
  console.log('🔄 index.ts 파일 업데이트 중...');

  const indexPath = path.join(sharedTypesPath, 'index.ts');

  if (!fs.existsSync(indexPath)) {
    console.log('📄 index.ts 파일이 없어서 새로 생성합니다.');
    fs.writeFileSync(indexPath, '// Auto-generated exports\n');
  }

  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const prismaExport = "export * from './prisma-types';";
  const backendExport = "export * from './backend-types';";

  let updatedContent = indexContent;
  let hasChanges = false;

  // prisma-types export 확인 및 추가
  if (!indexContent.includes(prismaExport) && !indexContent.includes("export * from './prisma-types'")) {
    updatedContent += '\n' + prismaExport + '\n';
    hasChanges = true;
    console.log('✅ index.ts에 prisma-types export가 추가되었습니다.');
  } else {
    console.log('✅ index.ts에 이미 prisma-types export가 있습니다.');
  }

  // backend-types export 확인 및 추가
  if (fs.existsSync(backendTypesPath)) {
    if (
      !indexContent.includes(backendExport) &&
      !indexContent.includes("export * from './backend-types'")
    ) {
      updatedContent += backendExport + '\n';
      hasChanges = true;
      console.log('✅ index.ts에 backend-types export가 추가되었습니다.');
    } else {
      console.log('✅ index.ts에 이미 backend-types export가 있습니다.');
    }
  } else {
    console.log('⏭️ backend-types.ts가 없어 export를 추가하지 않습니다.');
  }

  if (hasChanges) {
    fs.writeFileSync(indexPath, updatedContent, 'utf-8');
  }
}

// Backend 타입 파일들을 재귀적으로 탐색
function findBackendTypeFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir).sort();

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // node_modules, dist 등 제외
      if (!['node_modules', 'dist', '.git'].includes(file)) {
        findBackendTypeFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test.ts')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

function isPublicJsonDoc(comment) {
  return /@jsonDoc[\s\S]*["']?\bisPublic\b["']?\s*:\s*true\b/.test(comment);
}

function isPublicBackendExportLine(trimmed) {
  return trimmed.startsWith('export type ') ||
    trimmed.startsWith('export interface ') ||
    trimmed.startsWith('export enum ') ||
    trimmed.startsWith('export const ');
}

function countDefinitionDelimiters(line) {
  const openCount = (line.match(/[{\[(]/g) || []).length;
  const closeCount = (line.match(/[}\])]/g) || []).length;
  return openCount - closeCount;
}

function collectExportDefinition(lines, startIndex) {
  let definition = '';
  let delimiterCount = 0;
  let sawDelimiter = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    definition += definition ? `\n${line}` : line;

    const lineDelimiterCount = countDefinitionDelimiters(line);
    delimiterCount += lineDelimiterCount;
    sawDelimiter = sawDelimiter || lineDelimiterCount > 0;

    if (
      delimiterCount === 0 &&
      (trimmed.endsWith(';') || (sawDelimiter && trimmed.endsWith('}')))
    ) {
      return { definition, nextIndex: i + 1 };
    }
  }

  return { definition, nextIndex: lines.length };
}

function extractPrismaImports(content) {
  const imports = new Set();
  const importRegex = /import\s+{([^}]+)}\s+from\s+['"]@prisma\/client['"]/gs;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importedTypes = match[1].split(',').map(t => t.trim()).filter(Boolean);

    importedTypes.forEach(type => {
      const normalizedType = type
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();

      if (normalizedType) {
        imports.add(normalizedType);
      }
    });
  }

  return imports;
}

function findUsedPrismaImports(definitions, prismaImports) {
  const usedImports = [];

  prismaImports.forEach(importName => {
    const usageRegex = new RegExp(`\\b${importName}\\b`);

    if (definitions.some(definition => usageRegex.test(definition))) {
      usedImports.push(importName);
    }
  });

  return usedImports;
}

// 타입/상수 정의 추출. @jsonDoc { "isPublic": true }가 붙은 export만 프론트로 복사한다.
function extractTypeDefinitions(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const exports = [];
  let pendingPublicJsonDoc = false;

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('/**')) {
      let comment = line;
      let j = i + 1;

      while (j < lines.length && !comment.includes('*/')) {
        comment += `\n${lines[j]}`;
        j++;
      }

      pendingPublicJsonDoc = isPublicJsonDoc(comment);
      i = j;
      continue;
    }

    if (trimmed === '') {
      i++;
      continue;
    }

    if (isPublicBackendExportLine(trimmed)) {
      const { definition, nextIndex } = collectExportDefinition(lines, i);

      if (pendingPublicJsonDoc) {
        exports.push(definition);
      }

      pendingPublicJsonDoc = false;
      i = nextIndex;
      continue;
    }

    pendingPublicJsonDoc = false;
    i++;
  }

  const prismaImports = extractPrismaImports(content);

  return {
    exports,
    imports: findUsedPrismaImports(exports, prismaImports)
  };
}

// Backend 타입들을 수집하고 파일 생성
function generateBackendTypes() {
  console.log('🔍 Backend 타입 파일 수집 중...');

  const backendSrc = config.backend.src;
  const typeFiles = findBackendTypeFiles(backendSrc);

  console.log(`✅ ${typeFiles.length}개의 TypeScript 파일을 발견했습니다.`);

  const allExports = [];
  const allImports = new Set();

  for (const filePath of typeFiles) {
    const { exports, imports } = extractTypeDefinitions(filePath);

    if (exports.length > 0) {
      const relativePath = path.relative(backendSrc, filePath);
      allExports.push({
        file: relativePath,
        exports
      });

      imports.forEach(imp => allImports.add(imp));
    }
  }

  if (allExports.length === 0) {
    console.log('⚠️ Backend에서 export된 타입을 찾을 수 없습니다.');
    return null;
  }

  console.log(`✅ ${allExports.length}개 파일에서 타입 정의를 추출했습니다.`);

  // 최종 타입 파일 생성
  let content = `// This file is automatically generated from backend source files
// DO NOT EDIT THIS FILE DIRECTLY - it will be overwritten
// To update this file, run: pnpm generate-api

`;

  // Prisma imports 추가
  if (allImports.size > 0) {
    content += `// Prisma types\nimport { ${Array.from(allImports).join(', ')} } from './prisma-types';\n\n`;
  }

  content += `// ===== Backend Type Definitions =====\n\n`;

  // 각 파일에서 추출한 타입들 추가
  for (const { file, exports } of allExports) {
    content += `// From: ${file}\n`;
    content += exports.join('\n\n') + '\n\n';
  }

  return content;
}

// Backend 타입 파일 저장
function saveBackendTypesFile(content) {
  if (!content) {
    console.log('⏭️ Backend 타입 파일 생성을 건너뜁니다.');
    return false;
  }

  console.log('💾 Backend 타입 파일 저장 중...');

  // 대상 디렉토리 존재 확인 및 생성
  if (!fs.existsSync(sharedTypesPath)) {
    console.log('📁 대상 디렉토리가 없어서 생성합니다:', sharedTypesPath);
    fs.mkdirSync(sharedTypesPath, { recursive: true });
  }

  try {
    fs.writeFileSync(backendTypesPath, normalizeGeneratedText(content), 'utf-8');
    console.log('✅ Backend 타입 파일이 성공적으로 저장되었습니다!');
    console.log('📄 파일 크기:', Math.round(fs.statSync(backendTypesPath).size / 1024), 'KB');
    return true;
  } catch (error) {
    console.error('❌ Backend 타입 파일 저장 중 오류가 발생했습니다:', error.message);
    return false;
  }
}

// 메인 실행 함수
function main() {
  console.log('📋 Prisma & Backend Types 생성 작업을 시작합니다...\n');

  // 1. Prisma 타입 생성
  console.log('\n--- Prisma Types ---');
  const prismaContent = generateSimpleTypes();

  if (!prismaContent || prismaContent.trim().length === 0) {
    console.log('\n❌ Prisma 타입 생성이 실패했습니다.');
    process.exit(1);
  }

  const prismaSuccess = saveTypesFile(prismaContent);
  if (!prismaSuccess) {
    console.log('\n❌ Prisma 타입 파일 저장이 실패했습니다.');
    process.exit(1);
  }

  // 2. Backend 타입 생성
  console.log('\n--- Backend Types ---');
  const backendContent = generateBackendTypes();
  const backendSuccess = saveBackendTypesFile(backendContent);

  // 3. index.ts 업데이트
  updateIndexFile();

  console.log('\n🎉 모든 작업이 완료되었습니다!');
  console.log(`💡 이제 ${targetName} 클라이언트의 생성 타입을 사용할 수 있습니다.`);
  console.log('💡 사용법:');
  console.log('   // Prisma 타입');
  console.log('   import { User, UserRole } from "fetch/types";');
  if (backendSuccess) {
    console.log('   // Backend 타입');
    console.log('   import { TokenType, Payload } from "fetch/types";');
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = { generateSimpleTypes, saveTypesFile, updateIndexFile };
