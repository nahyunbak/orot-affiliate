const fs = require('fs');
const path = require('path');
const config = require('./config');
const ts = require('typescript');

// 빈 모듈 표시(export {})와 default export는 export *로 내보낼 이름이 없다.
function hasNamedExports(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.some(statement => {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) return true;
      if (ts.isNamespaceExport(statement.exportClause)) return true;
      return statement.exportClause.elements.some(element => element.name.text !== 'default');
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    return Boolean(modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      !modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  });
}


// 경로 설정
const SERVER_SRC_PATH = config.backend.src;
const targetFlagIndex = process.argv.indexOf('--target');
const targetName =
	targetFlagIndex >= 0 ? process.argv[targetFlagIndex + 1] : 'mobile';
if (!targetName) {
	throw new Error('--target 다음에 mobile 또는 web을 지정하세요.');
}
const SHARED_TYPES_PATH = config.getClientTarget(targetName).types;

// 제외할 서비스들 (dto가 없거나 변환이 필요없는 것들)
const EXCLUDED_SERVICES = config.excludedDirectories;

// 현재 파일에서 정의된 인터페이스/타입 추출
function extractDefinedTypes(content) {
	const definedTypes = new Set();

	// export interface/type/class 추출
	const typeDefRegex = /export\s+(?:interface|type|class)\s+([A-Za-z0-9_]+)(?:<[^>]*>)?/g;
	let match;
	while ((match = typeDefRegex.exec(content)) !== null) {
		definedTypes.add(match[1]);
	}

	return definedTypes;
}

// 코드에서 정의된 enum들을 추출하는 함수
function extractDefinedEnums(content) {
	const definedEnums = new Map(); // enum name -> enum definition
	const enumRegex = /export\s+enum\s+(\w+)\s*{([^}]+)}/gs;
	let match;

	while ((match = enumRegex.exec(content)) !== null) {
		const enumName = match[1];
		const enumBody = match[2];
		const fullDefinition = `export enum ${enumName} {${enumBody}}`;
		definedEnums.set(enumName, fullDefinition);
	}

	return definedEnums;
}

// 코드에서 정의된 export type들을 추출하는 함수
function extractDefinedExportTypes(content) {
	const definedTypes = new Map(); // type name -> type definition

	// export type TypeName = ... 패턴 추출 (세미콜론까지)
	const typeRegex = /export\s+type\s+(\w+)\s*=\s*([^;]+);/g;
	let match;

	while ((match = typeRegex.exec(content)) !== null) {
		const typeName = match[1];
		const typeBody = match[2].trim();
		const fullDefinition = `export type ${typeName} = ${typeBody};`;
		definedTypes.set(typeName, fullDefinition);
	}

	return definedTypes;
}

// 코드에서 사용된 Prisma 타입들을 추출하는 함수
function extractPrismaTypes(content, definedTypes) {
	const prismaTypes = new Set();

	// 주석을 제거한 내용 생성
	const contentWithoutComments = content
		.replace(/\/\*[\s\S]*?\*\//g, '') // 블록 주석 제거
		.replace(/\/\/.*$/gm, ''); // 라인 주석 제거

	// enum이나 type으로 보이는 것들을 찾기
	const typeRegex = /\b([A-Z][a-zA-Z]*(?:Type|Role|Enum|Mode|Status))\b/g;
	let match;
	while ((match = typeRegex.exec(contentWithoutComments)) !== null) {
		if (!['ValidatorConstraintInterface', 'ValidationOptions'].includes(match[1]) && !definedTypes.has(match[1])) {
			prismaTypes.add(match[1]);
		}
	}

	// Prisma 모델명 패턴 (대문자로 시작하는 타입명)
	// 속성 타입으로 사용된 것만 추출 (예: user?: User; 또는 animal: Animal)
	const propertyTypeRegex = /(\w+)\??\s*:\s*([A-Z][a-zA-Z]+)(?:\[\])?(?:[;\s]|\s*\|)/g;
	while ((match = propertyTypeRegex.exec(contentWithoutComments)) !== null) {
		const propertyName = match[1];
		const typeName = match[2];

		// location: Location을 location: LocationArea로 자동 수정
		if (propertyName === 'location' && typeName === 'Location') {
			continue; // LocationArea는 이미 다른 정규식에서 추가됨
		}

		// 기본 타입들과 현재 파일에서 정의된 타입들, 그리고 Request/DTO 타입 제외
		if (!['Date', 'string', 'number', 'boolean', 'any', 'void', 'null', 'undefined', 'Request'].includes(typeName)
			&& !definedTypes.has(typeName)
			&& !typeName.endsWith('Dto')) { // DTO는 별도로 처리
			prismaTypes.add(typeName);
		}
	}

	// 제네릭 타입 매개변수 찾아서 제거
	// 예: export interface PageResDto<TData> 또는 export class PageResDto<T>
	const genericParamsRegex = /(?:export\s+)?(?:interface|class|type)\s+\w+<([^>]+)>/g;
	const genericParams = new Set();
	while ((match = genericParamsRegex.exec(contentWithoutComments)) !== null) {
		const params = match[1].split(',').map(p => p.trim().split(/\s+/)[0]);
		params.forEach(param => genericParams.add(param));
	}

	// 제네릭 매개변수들을 prismaTypes에서 제거
	genericParams.forEach(param => prismaTypes.delete(param));

	return Array.from(prismaTypes);
}

// 같은 폴더 내의 로컬 타입 import를 추출하고 처리하는 함수
function extractLocalTypeImports(content, validImports, definedTypes) {
	const localImports = [];
	const localImportedTypes = new Set();

	validImports.forEach(importLine => {
		// 같은 폴더 내의 import인지 확인 (./로 시작하는 경로)
		const importMatch = importLine.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"](\.[^'"]+)['"]/);
		if (importMatch) {
			const importedTypes = importMatch[1].split(',').map(t => t.trim());
			const importPath = importMatch[2];

			// 각 타입이 content에서 사용되는지 확인
			const usedTypes = importedTypes.filter(type => {
				// 타입이 content에서 사용되는지 확인 (타입명 + 공백이 아닌 문자 또는 타입명 + 공백 + 세미콜론/콤마 등)
				const typeUsageRegex = new RegExp(`\\b${type}\\b`, 'g');
				const usageCount = (content.match(typeUsageRegex) || []).length;
				// import 문 자체에서의 사용은 제외 (2번 이상 사용되면 실제 사용으로 간주)
				return usageCount > 0 && !definedTypes.has(type);
			});

			if (usedTypes.length > 0) {
				localImports.push(`import { ${usedTypes.join(', ')} } from '${importPath}';`);
				usedTypes.forEach(type => localImportedTypes.add(type));
			}
		}
	});

	return { localImports, localImportedTypes };
}

// 코드에서 사용된 DTO 타입들을 추출하는 함수
function extractUsedDtoTypes(content, validImports, definedTypes) {
	const usedTypes = new Set();

	// DTO 타입명들을 찾기 (대문자로 시작하고 Dto로 끝나는 타입들)
	const dtoRegex = /\b([A-Z][a-zA-Z]*Dto)\b/g;
	let match;
	while ((match = dtoRegex.exec(content)) !== null) {
		// 현재 파일에서 정의된 타입은 제외
		if (!definedTypes.has(match[1])) {
			usedTypes.add(match[1]);
		}
	}

	// UserPublicInfo와 같은 특별한 타입들도 추가
	const specialTypes = ['UserPublicInfo'];
	specialTypes.forEach(type => {
		if (content.includes(type) && !definedTypes.has(type)) {
			usedTypes.add(type);
		}
	});

	// validImports에서 실제로 사용된 타입들만 필터링하여 반환 (같은 폴더 내의 import는 제외)
	const importsByPath = new Map(); // path -> Set<types>

	validImports.forEach(importLine => {
		// import 문에서 타입들과 경로 추출
		const importMatch = importLine.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"]/);
		if (importMatch) {
			const importedTypes = importMatch[1].split(',').map(t => t.trim());
			const importPath = importMatch[2];

			// 같은 폴더 내의 import는 별도로 처리하므로 건너뛰기
			if (importPath.startsWith('./')) {
				return;
			}

			// 실제로 사용된 타입들만 필터링
			const usedImportedTypes = importedTypes.filter(type => usedTypes.has(type));

			if (usedImportedTypes.length > 0) {
				if (!importsByPath.has(importPath)) {
					importsByPath.set(importPath, new Set());
				}
				usedImportedTypes.forEach(type => importsByPath.get(importPath).add(type));
			}
		}
	});

	// 중복 제거된 import 문 생성
	const neededImports = [];
	importsByPath.forEach((types, path) => {
		if (types.size > 0) {
			neededImports.push(`import { ${Array.from(types).join(', ')} } from '${path}';`);
		}
	});

	return neededImports;
}

// import 경로를 변환하는 함수
function transformImportPath(importLine) {
	// 상대 경로 import 처리 (../../service/dto/file → ../service/file)
	const relativePathRegex = /'\.\.\/\.\.\/([a-zA-Z-]+)\/dto\/([^']+)'/g;
	const relativePathRegexDouble = /"\.\.\/\.\.\/([a-zA-Z-]+)\/dto\/([^"]+)"/g;

	let transformedLine = importLine;

	// 상대 경로 변환
	transformedLine = transformedLine.replace(relativePathRegex, "'../$1/$2'");
	transformedLine = transformedLine.replace(relativePathRegexDouble, '"../$1/$2"');

	// @/common/dto/ 경로를 ../common/으로 변환
	if (transformedLine.includes("'@/common/dto/")) {
		transformedLine = transformedLine.replace("'@/common/dto/", "'../common/");
	}
	if (transformedLine.includes('"@/common/dto/')) {
		transformedLine = transformedLine.replace('"@/common/dto/', '"../common/');
	}

	// @/{service}/dto/ 경로를 ../{service}/로 변환 (다른 서비스 간 import)
	const servicePathRegex = /'@\/([a-zA-Z-]+)\/dto\/([^']+)'/g;
	const servicePathRegexDouble = /"@\/([a-zA-Z-]+)\/dto\/([^"]+)"/g;

	// 단일 따옴표 처리
	transformedLine = transformedLine.replace(servicePathRegex, "'../$1/$2'");

	// 쌍따옴표 처리
	transformedLine = transformedLine.replace(servicePathRegexDouble, '"../$1/$2"');

	return transformedLine;
}

// 파일 내용을 변환하는 메인 함수
function convertFileContent(content) {
	// Location 타입을 LocationArea로 자동 변경
	content = content.replace(/\blocation:\s*Location\b/g, 'location: LocationArea');

	const lines = content.split('\n');
	let result = '';
	let i = 0;

	// 1. imports 처리 - 유효한 import만 수집
	const validImports = [];
	while (i < lines.length) {
		const line = lines[i].trim();

		// import 문 처리
		if (line.startsWith('import')) {
			// Multiline import 처리를 위해 전체 import 문을 수집
			let fullImport = line;
			let j = i + 1;

			// import 문이 완료될 때까지 계속 읽기
			while (j < lines.length && !fullImport.includes('from') && !fullImport.includes(';')) {
				fullImport += ' ' + lines[j].trim();
				j++;
			}

			// @prisma/client imports는 건너뛰기 (나중에 필요한 것만 추가)
			if (!fullImport.includes('@prisma/client')) {
				// NestJS 관련 imports는 제거
				if (
					!fullImport.includes('@nestjs/') &&
					!fullImport.includes('class-validator') &&
					!fullImport.includes('class-transformer')
				) {
					// 유효한 import만 추가
					if (fullImport.includes('from') && fullImport.includes('{') && fullImport.includes('}')) {
						// import 경로 변환
						const transformedLine = transformImportPath(fullImport);
						validImports.push(transformedLine);
					}
				}
			}

			// 읽은 줄 수만큼 인덱스 이동
			i = j;
			continue;
		}

		// import 문이 끝나면 처리 중단
		if (line && !line.startsWith('import') && !line.startsWith('//') && line !== '') {
			break;
		}

		// 빈 줄이나 주석은 임시로 보관
		if (line === '' || line.startsWith('//')) {
			if (validImports.length === 0) {
				result += lines[i] + '\n';
			}
		}

		i++;
	}

	// 2. 클래스와 인터페이스 처리
	let contentWithoutImports = lines.slice(i).join('\n');

	// 원본 content에서 정의된 enum 추출
	const definedEnums = extractDefinedEnums(content);

	// 원본 content에서 정의된 export type 추출
	const definedExportTypes = extractDefinedExportTypes(content);

	// 이미 interface인 것들은 그대로 유지하고, class만 변환
	const processedContent = processClassesAndInterfaces(contentWithoutImports);

	// 3. 필요한 imports 추가
	const definedTypes = extractDefinedTypes(processedContent);

	// definedEnums의 키들을 definedTypes에 추가
	definedEnums.forEach((_, enumName) => {
		definedTypes.add(enumName);
	});

	// definedExportTypes의 키들을 definedTypes에 추가
	definedExportTypes.forEach((_, typeName) => {
		definedTypes.add(typeName);
	});

	const prismaTypes = extractPrismaTypes(processedContent, definedTypes);
	const neededDtoImports = extractUsedDtoTypes(processedContent, validImports, definedTypes);

	// 같은 폴더 내의 로컬 타입 import 추출
	const { localImports, localImportedTypes } = extractLocalTypeImports(processedContent, validImports, definedTypes);

	let finalContent = '';

	// 정의된 export type들을 먼저 추가
	if (definedExportTypes.size > 0) {
		definedExportTypes.forEach((typeDef) => {
			finalContent += typeDef + '\n\n';
		});
	}

	// 정의된 enum들을 추가
	if (definedEnums.size > 0) {
		definedEnums.forEach((enumDef) => {
			finalContent += enumDef + '\n\n';
		});
	}

	// 같은 폴더 내의 로컬 타입 imports 추가
	if (localImports.length > 0) {
		finalContent += localImports.join('\n') + '\n';
	}

	// 필요한 DTO imports 추가
	if (neededDtoImports.length > 0) {
		finalContent += neededDtoImports.join('\n') + '\n';
	}

	// import된 DTO 타입들 추출
	const importedDtoTypes = new Set();
	neededDtoImports.forEach(importLine => {
		const importMatch = importLine.match(/import\s*{\s*([^}]+)\s*}/);
		if (importMatch) {
			const types = importMatch[1].split(',').map(t => t.trim());
			types.forEach(type => importedDtoTypes.add(type));
		}
	});

	// prisma types에서 import된 DTO 타입과 로컬 import된 타입 제외
	const filteredPrismaTypes = prismaTypes.filter(type =>
		!importedDtoTypes.has(type) && !localImportedTypes.has(type)
	);

	// Prisma types import 추가
	if (filteredPrismaTypes.length > 0) {
		if (finalContent) finalContent += '\n';
		finalContent += `import { ${filteredPrismaTypes.join(', ')} } from '../prisma-types';\n`;
	}

	// 빈 줄 추가 후 content 추가
	if (finalContent) {
		finalContent += '\n';
	}
	finalContent += processedContent;

	const normalizedContent = finalContent.trim();
	return normalizedContent ? `${normalizedContent}\n` : 'export {};\n';
}

// 클래스와 인터페이스를 처리하는 함수
function processClassesAndInterfaces(content) {
	const lines = content.split('\n');
	let result = '';
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();

		// 블록 주석 처리 (/** ... */ 또는 /* ... */)
		if (line.startsWith('/*')) {
			// 블록 주석 전체를 건너뛰기
			while (i < lines.length) {
				if (lines[i].includes('*/')) {
					i++;
					break;
				}
				i++;
			}
			continue;
		}

		// export interface인 경우 - 그대로 유지
		if (line.startsWith('export interface')) {
			const { processedBlock, nextIndex } = processExistingInterface(lines, i);
			result += processedBlock + '\n';
			i = nextIndex;
			continue;
		}

		// export class 또는 class (export되지 않은 것도 포함)인 경우 - interface로 변환
		if (line.startsWith('export class') || line.startsWith('class ')) {
			const { processedBlock, nextIndex } = processClassToInterface(lines, i);
			result += processedBlock + '\n';
			i = nextIndex;
			continue;
		}

		// 다른 라인들은 그대로 추가 (빈 줄, 라인 주석 등)
		if (line === '' || line.startsWith('//')) {
			result += lines[i] + '\n';
		}

		i++;
	}

	return result;
}

// 기존 interface를 그대로 유지하는 함수
function processExistingInterface(lines, startIndex) {
	let result = '';
	let i = startIndex;
	let braceCount = 0;
	let foundOpenBrace = false;

	while (i < lines.length) {
		const line = lines[i];
		result += line + '\n';

		// 중괄호 개수 계산
		for (const char of line) {
			if (char === '{') {
				braceCount++;
				foundOpenBrace = true;
			} else if (char === '}') {
				braceCount--;
				if (foundOpenBrace && braceCount === 0) {
					return { processedBlock: result.trim(), nextIndex: i + 1 };
				}
			}
		}

		i++;
	}

	return { processedBlock: result.trim(), nextIndex: i };
}

// 클래스를 인터페이스로 변환하는 함수
function processClassToInterface(lines, startIndex) {
	let i = startIndex;
	let braceCount = 0;
	let foundOpenBrace = false;
	let classLines = [];

	// 클래스 블록 전체 수집
	while (i < lines.length) {
		const line = lines[i];
		classLines.push(line);

		// 중괄호 개수 계산
		for (const char of line) {
			if (char === '{') {
				braceCount++;
				foundOpenBrace = true;
			} else if (char === '}') {
				braceCount--;
				if (foundOpenBrace && braceCount === 0) {
					break;
				}
			}
		}

		if (foundOpenBrace && braceCount === 0) {
			break;
		}

		i++;
	}

	// 클래스를 인터페이스로 변환
	const interfaceContent = convertClassBlockToInterface(classLines);

	return { processedBlock: interfaceContent, nextIndex: i + 1 };
}

// 클래스 블록을 인터페이스로 변환
function convertClassBlockToInterface(classLines) {
	if (classLines.length === 0) return '';

	const firstLine = classLines[0].trim();

	// 클래스명과 extends 관계를 함께 추출
	const classMatch = firstLine.match(
		/export\s+class\s+([A-Za-z0-9_]+(?:<[^>]+>)?)(?:\s+extends\s+([A-Za-z0-9_]+(?:<[^>]+>)?(?:\([^)]*\))?))?/
	);
	if (!classMatch) return classLines.join('\n');

	const className = classMatch[1];
	let extendsClass = classMatch[2];

	// PartialType(SomeDto) 형태를 SomeDto로 변환
	if (extendsClass && extendsClass.includes('PartialType(')) {
		const partialMatch = extendsClass.match(/PartialType\(([^)]+)\)/);
		if (partialMatch) {
			extendsClass = `Partial<${partialMatch[1]}>`;
		}
	}

	// interface 선언 생성 (extends 관계 포함)
	let result = `export interface ${className}`;
	if (extendsClass) {
		result += ` extends ${extendsClass}`;
	}
	result += ` {\n`;

	let i = 1; // 첫 번째 줄(클래스 선언) 건너뛰기

	while (i < classLines.length - 1) {
		// 마지막 줄(닫는 중괄호) 제외
		const line = classLines[i];
		const trimmedLine = line.trim();

		// 빈 줄이나 주석은 건너뛰기
		if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
			i++;
			continue;
		}

		// 데코레이터는 건너뛰기
		if (trimmedLine.startsWith('@')) {
			// 멀티라인 데코레이터 처리
			let decoratorDepth = 0;
			while (i < classLines.length - 1) {
				const currentLine = classLines[i].trim();
				const openParens = (currentLine.match(/\(/g) || []).length;
				const closeParens = (currentLine.match(/\)/g) || []).length;
				decoratorDepth += openParens - closeParens;

				i++;

				if (decoratorDepth <= 0 && !classLines[i]?.trim().startsWith('@')) {
					break;
				}
			}
			continue;
		}

		// 메서드나 생성자 건너뛰기
		if (trimmedLine.includes('(') && (trimmedLine.includes('{') || trimmedLine.includes('constructor'))) {
			i++;
			continue;
		}

		// 프로퍼티 정의 처리
		if (trimmedLine.includes(':')) {
			// 전체 프로퍼티 정의를 수집 (멀티라인 타입 포함)
			let fullProperty = trimmedLine;
			let j = i + 1;
			let braceDepth = 0;
			let foundSemicolon = trimmedLine.includes(';');

			// 중괄호 개수 계산
			for (const char of trimmedLine) {
				if (char === '{') braceDepth++;
				else if (char === '}') braceDepth--;
			}

			// 세미콜론이 없고 중괄호가 열려있으면 계속 읽기
			while (j < classLines.length - 1 && (!foundSemicolon || braceDepth > 0)) {
				const nextLine = classLines[j].trim();
				if (!nextLine) {
					j++;
					continue;
				}

				fullProperty += ' ' + nextLine;

				// 중괄호 개수 업데이트
				for (const char of nextLine) {
					if (char === '{') braceDepth++;
					else if (char === '}') braceDepth--;
				}

				if (nextLine.includes(';')) {
					foundSemicolon = true;
				}

				j++;

				// 세미콜론을 찾고 중괄호가 모두 닫혔으면 종료
				if (foundSemicolon && braceDepth <= 0) {
					break;
				}
			}

			// 접근 제한자 제거
			let cleanProperty = fullProperty.replace(/^(public|private|protected|readonly)\s+/, '');

			// 기본값 제거 및 옵셔널 속성 처리
			const hasDefaultValue = cleanProperty.includes('=');
			if (hasDefaultValue) {
				// 기본값 제거 (= 뒤의 모든 내용 제거)
				cleanProperty = cleanProperty.replace(/\s*=\s*[^;]+/, '');

				// 이미 옵셔널이 아니라면 옵셔널로 만들기
				if (!cleanProperty.includes('?:')) {
					cleanProperty = cleanProperty.replace(':', '?:');
				}
			}

			// 프로퍼티 이름과 타입이 올바른 형식인지 확인
			if (cleanProperty.match(/^[a-zA-Z_?][a-zA-Z0-9_?]*\s*[?]?\s*:\s*/)) {
				// 세미콜론 추가 (없으면)
				if (!cleanProperty.endsWith(';')) {
					cleanProperty += ';';
				}

				result += `  ${cleanProperty}\n`;
			}

			i = j;
			continue;
		}

		i++;
	}

	result += '}';
	return result;
}

// 파일을 읽고 변환하는 함수
function processFile(filePath, outputPath) {
	try {
		const content = fs.readFileSync(filePath, 'utf8');

		// 파일 내용 변환
		const convertedContent = convertFileContent(content);

		// 출력 디렉토리 생성
		const outputDir = path.dirname(outputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// 파일 작성
		fs.writeFileSync(outputPath, convertedContent, 'utf8');
		console.log(`✅ Generated: ${outputPath}`);
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error.message);
	}
}

// 서비스의 DTO 파일들을 처리하는 함수
function processService(serviceName) {
	const servicePath = path.join(SERVER_SRC_PATH, serviceName);
	const dtoPath = path.join(servicePath, 'dto');

	if (!fs.existsSync(dtoPath)) {
		console.log(`⚠️  No dto folder found for service: ${serviceName}`);
		return;
	}

	const files = fs.readdirSync(dtoPath).sort();

	files.forEach(file => {
		if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
			const inputPath = path.join(dtoPath, file);
			const outputPath = path.join(SHARED_TYPES_PATH, serviceName, file);

			processFile(inputPath, outputPath);
		}
	});
}

// index.ts 파일 업데이트 함수
function updateIndexFile() {
	const services = fs.readdirSync(SERVER_SRC_PATH).sort().filter(item => {
		const itemPath = path.join(SERVER_SRC_PATH, item);
		return (
			fs.statSync(itemPath).isDirectory() &&
			!EXCLUDED_SERVICES.includes(item) &&
			fs.existsSync(path.join(itemPath, 'dto'))
		);
	});

	let indexContent = '// Export prisma types and enums\n';
	if (hasNamedExports(path.join(SHARED_TYPES_PATH, 'prisma-types.ts'))) {
		indexContent += "export * from './prisma-types';\n";
	}

	if (hasNamedExports(path.join(SHARED_TYPES_PATH, 'app-types.ts'))) {
		indexContent += "\n// Export app-specific types (not auto-generated)\nexport * from './app-types';\n";
	}
	indexContent += '\n// Export DTOs by domain\n';

	services.forEach(service => {
		const servicePath = path.join(SHARED_TYPES_PATH, service);
		if (fs.existsSync(servicePath)) {
			const dtoFiles = fs.readdirSync(servicePath).sort().filter(file => file.endsWith('.ts') && !file.includes('index') && hasNamedExports(path.join(servicePath, file)));

			if (dtoFiles.length > 0) {
				indexContent += `\n// ${service.charAt(0).toUpperCase() + service.slice(1)}\n`;
				dtoFiles.forEach(file => {
					const exportName = file.replace('.ts', '');
					indexContent += `export * from './${service}/${exportName}';\n`;
				});
			}
		}
	});

	if (hasNamedExports(path.join(SHARED_TYPES_PATH, 'backend-types.ts'))) {
		indexContent += "\n// Backend public types and constants\n";
		indexContent += "export * from './backend-types';\n";
	}

	if (!indexContent.includes('export *')) indexContent += 'export {};\n';
	fs.writeFileSync(path.join(SHARED_TYPES_PATH, 'index.ts'), indexContent, 'utf8');
	console.log('✅ Updated index.ts');
}

// 메인 실행 함수
function main() {
	console.log('🚀 Starting DTO to Interface conversion...\n');

	// 서버의 모든 서비스 폴더 스캔
	const services = fs.readdirSync(SERVER_SRC_PATH).sort().filter(item => {
		const itemPath = path.join(SERVER_SRC_PATH, item);
		return fs.statSync(itemPath).isDirectory() && !EXCLUDED_SERVICES.includes(item);
	});

	console.log(`Found services: ${services.join(', ')}\n`);

	// 각 서비스 처리
	services.forEach(service => {
		console.log(`Processing service: ${service}`);
		processService(service);
	});

	// index.ts 업데이트
	console.log('\n📝 Updating index.ts file...');
	updateIndexFile();

	console.log('\n🎉 DTO to Interface conversion completed!');
}

// 스크립트 실행
if (require.main === module) {
	main();
}

module.exports = {
	main,
	processService,
	convertFileContent
};
