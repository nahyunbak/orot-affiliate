#!/usr/bin/env node

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


function normalizeGeneratedText(content) {
  return `${content.replace(/[ \t]+$/gm, '').trimEnd()}\n`;
}

// Parse endpoint file to extract functions
function parseEndpointFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const functions = [];

  // Try to extract functions from API object - look for export const xxxAPI = {
  const apiObjectRegex = /export\s+const\s+(\w+API)\s*=\s*\{/;
  const apiObjectMatch = content.match(apiObjectRegex);

  if (apiObjectMatch) {
    // Parse functions from API object - need to handle both spaces and tabs
    // Updated regex to handle nested generics like Promise<CommonResponse<T>>
    const methodRegex = /(\w+):\s*async\s*\(([\s\S]*?)\)\s*:\s*Promise<([\s\S]*?)>\s*=>\s*\{/g;
    let functionMatch;

    while ((functionMatch = methodRegex.exec(content)) !== null) {
        const functionName = functionMatch[1];
        const params = functionMatch[2] ? functionMatch[2].trim() : '';
        const returnType = functionMatch[3] ? functionMatch[3].trim() : 'any';

        // Extract HTTP method from the function body
        // Use the match index from the regex instead of indexOf
        const functionStart = functionMatch.index;

        // Find the matching closing brace
        let braceCount = 0;
        let inString = false;
        let stringChar = '';
        let i = functionStart;
        let functionEnd = -1;

        // Find the arrow => first to skip parameter type annotations
        while (i < content.length && !(content[i] === '=' && content[i + 1] === '>')) {
          i++;
        }

        // Skip the arrow =>
        i += 2;

        // Move to the opening brace of the arrow function
        while (i < content.length && content[i] !== '{') {
          i++;
        }

        // Now find the matching closing brace
        for (; i < content.length; i++) {
          const char = content[i];
          const prevChar = i > 0 ? content[i - 1] : '';

          // Handle string literals
          if (!inString && (char === '"' || char === "'") && prevChar !== '\\') {
            inString = true;
            stringChar = char;
          } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
          }

          // Count braces only outside of strings
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                functionEnd = i + 1;
                break;
              }
            }
          }
        }

        if (functionEnd === -1) {
          continue;
        }

        const functionBody = content.substring(functionStart, functionEnd);

        // Look for method in the function body
        const httpMethodMatch = functionBody.match(/method:\s*['"](\w+)['"]/);
        const httpMethod = httpMethodMatch ? httpMethodMatch[1].toUpperCase() : null;

        // Determine if it's a query or mutation based on HTTP method
        const isQuery = httpMethod === 'GET';

        functions.push({
          name: functionName,
          isQuery,
          params,
          returnType,
          hasParams: params.length > 0
        });
      }
  }

  // Also extract regular exported functions
  const functionRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*Promise<[^>]+>)?/g;
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    const functionName = match[1];
    const functionContent = match[0];

    // Determine if it's a query or mutation based on function name or HTTP method
    const isQuery = functionName.startsWith('get') ||
                   functionName.startsWith('find') ||
                   functionName.startsWith('list') ||
                   functionName.includes('fetch');

    // Extract parameters
    const paramsMatch = functionContent.match(/\(([^)]*)\)/);
    const params = paramsMatch ? paramsMatch[1].trim() : '';

    // Extract return type if available
    const returnTypeMatch = functionContent.match(/:\s*Promise<(.+?)>/);
    const returnType = returnTypeMatch ? returnTypeMatch[1].trim() : 'any';

    functions.push({
      name: functionName,
      isQuery,
      params,
      returnType,
      hasParams: params.length > 0
    });
  }

  return functions;
}

function splitParamsRespectingBrackets(paramsString) {
  const result = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;

  for (const char of paramsString) {
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    if (char === '{') braceDepth++;
    if (char === '}') braceDepth--;
    if (char === '[') bracketDepth++;
    if (char === ']') bracketDepth--;
    if (char === '<') angleDepth++;
    if (char === '>') angleDepth = Math.max(angleDepth - 1, 0);

    if (
      char === ',' &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      angleDepth === 0
    ) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

// Generate React Query hook for a function
function generateHook(func, serviceName) {
  return generateHookWithRef(func, serviceName, func.name);
}

// Generate React Query hook with function reference
function generateHookWithRef(func, serviceName, functionRef) {
  const hookName = func.isQuery
    ? `use${func.name.charAt(0).toUpperCase()}${func.name.slice(1)}`
    : `use${func.name.charAt(0).toUpperCase()}${func.name.slice(1)}Mutation`;

  if (func.isQuery) {
    const allParams = splitParamsRespectingBrackets(func.params);
    const names = allParams.map(param => param.slice(0, param.indexOf(':')).trim().replace(/\?$/, ''));
    const hasAccessToken = names.includes('accessToken');
    const userParams = allParams.filter((_, index) => names[index] !== 'accessToken');
    const userNames = names.filter(name => name !== 'accessToken');
    const factory = `${func.name}QueryOptions`;
    const keyParts = [`queryKeys.${serviceName}.${func.name}`, ...userNames];
    const authHookLine = hasAccessToken
      ? '  const { accessToken } = authHook.useAccessToken();\n'
      : '';
    const enabledLine = hasAccessToken
      ? '    enabled: !!accessToken && (options?.enabled ?? true),'
      : '    enabled: options?.enabled ?? true,';

    // 훅과 prefetch/useQueries가 같은 요청과 토큰 없는 키를 재사용한다.
    return `
export function ${factory}(${func.params}) {
  return {
    queryKey: [${keyParts.join(', ')}],
    queryFn: () => ${functionRef}(${names.join(', ')}),
  };
}

export function ${hookName}(${userParams.length ? userParams.join(', ') + ', ' : ''}options?: Omit<UseQueryOptions<${func.returnType}>, 'queryKey' | 'queryFn'>) {
${authHookLine}  return useQuery<${func.returnType}>({
    ...${factory}(${names.join(', ')}),
    ...options,
${enabledLine}
  });
}`;
  } else {
    // Generate mutation hook
    const mutationKey = `mutationKeys.${serviceName}.${func.name}`;

    // Parse all parameters
    const allParams = splitParamsRespectingBrackets(func.params).map(p => {
      const colonIndex = p.trim().indexOf(':');
      if (colonIndex === -1) {
        return {
          name: p.trim(),
          type: 'any'
        };
      }
      return {
        name: p.trim().substring(0, colonIndex).trim(),
        type: p.trim().substring(colonIndex + 1).trim()
      };
    });

    // Filter out accessToken for user-facing parameters
    const userParams = allParams.filter(p => p.name !== 'accessToken');
    const hasAccessToken = allParams.some(p => p.name === 'accessToken');

    if (userParams.length === 0) {
      if (!hasAccessToken) {
        return `
export function ${hookName}(options?: UseMutationOptions<${func.returnType}, unknown, void>) {
  return useMutation<${func.returnType}, unknown, void>({
    mutationKey: [${mutationKey}],
    mutationFn: ${functionRef},
    ...options
  });
}`;
      }

      // No user parameters, only accessToken
      return `
export function ${hookName}(options?: UseMutationOptions<${func.returnType}, unknown, void>) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<${func.returnType}, unknown, void>({
    mutationKey: [${mutationKey}],
    mutationFn: () => ${functionRef}(accessToken),
    ...options
  });
}`;
    } else if (userParams.length === 1) {
      // Single parameter (plus optional accessToken)
      const paramType = userParams[0].type;
      const paramName = userParams[0].name;

      if (hasAccessToken) {
        return `
export function ${hookName}(options?: UseMutationOptions<${func.returnType}, unknown, ${paramType}>) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<${func.returnType}, unknown, ${paramType}>({
    mutationKey: [${mutationKey}],
    mutationFn: (${paramName}) => ${functionRef}(${paramName}, accessToken),
    ...options
  });
}`;
      } else {
        return `
export function ${hookName}(options?: UseMutationOptions<${func.returnType}, unknown, ${paramType}>) {
  return useMutation<${func.returnType}, unknown, ${paramType}>({
    mutationKey: [${mutationKey}],
    mutationFn: ${functionRef},
    ...options
  });
}`;
      }
    } else {
      // Multiple parameters
      const paramTypes = userParams.map(p => `${p.name}: ${p.type}`).join('; ');
      const paramNames = userParams.map(p => p.name).join(', ');
      const allParamNames = hasAccessToken ? `${paramNames}, accessToken` : paramNames;

      return `
export function ${hookName}(options?: UseMutationOptions<${func.returnType}, unknown, { ${paramTypes} }>) {
  ${hasAccessToken ? 'const { accessToken } = authHook.useAccessToken();\n' : ''}
  return useMutation<${func.returnType}, unknown, { ${paramTypes} }>({
    mutationKey: [${mutationKey}],
    mutationFn: ({ ${paramNames} }) => ${functionRef}(${allParamNames}),
    ...options
  });
}`;
    }
  }
}


// Main function
function generateAllHooks(targetName = 'mobile') {
  const target = config.getClientTarget(targetName);
  const fetchDir = target.fetch;
  const queryDir = target.query;
  const mutationDir = target.mutation;

  // Ensure output directories exist
  if (!fs.existsSync(queryDir)) {
    fs.mkdirSync(queryDir, { recursive: true });
  }
  if (!fs.existsSync(mutationDir)) {
    fs.mkdirSync(mutationDir, { recursive: true });
  }

  // Find endpoint files generated from controllers.
  // Helper modules like cameraScrap.ts/voiceScrap.ts should not produce hooks.
  const fetchFiles = fs.readdirSync(fetchDir).sort()
    .filter(file => file.endsWith('.ts') &&
            !file.includes('.d.ts') &&
            !['index.ts', 'constants.ts', 'types.ts'].includes(file));

  const endpointFiles = [];
  const skippedFiles = [];

  fetchFiles.forEach(file => {
    const filePath = path.join(fetchDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    if (/export\s+const\s+\w+API\s*=\s*\{/.test(content)) {
      endpointFiles.push(filePath);
      return;
    }

    skippedFiles.push(file);
  });

  console.log(`Found ${endpointFiles.length} endpoint files`);

  if (skippedFiles.length > 0) {
    console.log(`Skipping non-endpoint fetch helpers: ${skippedFiles.join(', ')}`);
  }

  // Generate hooks for each endpoint
  endpointFiles.forEach(endpointPath => {
    try {
      const functions = parseEndpointFile(endpointPath);

      // Separate queries and mutations
      const queries = functions.filter(f => f.isQuery);
      const mutations = functions.filter(f => !f.isQuery);

      // Generate query hooks
      if (queries.length > 0) {
        generateHooksForType(endpointPath, queryDir, queries, 'query', target);
      }

      // Generate mutation hooks
      if (mutations.length > 0) {
        generateHooksForType(endpointPath, mutationDir, mutations, 'mutation', target);
      }
    } catch (error) {
      console.error(`Error processing ${endpointPath}:`, error.message);
    }
  });

  // Generate index files
  generateIndexFile(queryDir, 'query');
  generateIndexFile(mutationDir, 'mutation');

  console.log('\nAll hooks generated successfully!');
}

// Generate hooks for a specific type (query or mutation)
function generateHooksForType(endpointPath, outputDir, functions, type, target = config.mobile) {
  const serviceName = path.basename(endpointPath, '.ts');
  const apiObjectName = `${serviceName.replace(/-/g, '')}API`;

  // Check if endpoint uses API object pattern
  const content = fs.readFileSync(endpointPath, 'utf8');
  const usesApiObject = content.includes(`export const ${apiObjectName}`);

  // Prepare imports
  const imports = [
    `// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.`,
    `// 재생성: pnpm generate-api`,
    type === 'query'
      ? `import { useQuery, UseQueryOptions } from '@tanstack/react-query';`
      : `import { useMutation, UseMutationOptions } from '@tanstack/react-query';`,
    `import { ${type}Keys } from '../fetch/utils/constants';`
  ];

  if (functions.some(func => /\baccessToken\s*:/.test(func.params))) {
    imports.push(`import { authHook } from '${target.authHookImport}';`);
  }

  if (usesApiObject) {
    imports.push(`import { ${apiObjectName} } from '../fetch/${serviceName}';`);
  } else {
    imports.push(`import { ${functions.map(f => f.name).join(', ')} } from '../fetch/${serviceName}';`);
  }

  // Add type imports if needed
  const typeImports = new Set();
  functions.forEach(func => {
    // Extract types from return type - only add complete type names
    if (func.returnType && func.returnType !== 'any' && func.returnType !== 'void') {
      // Extract all type names from the return type, including nested generics
      const typeRegex = /\b([A-Z][A-Za-z0-9]*(?:Dto|Req|Res|Type|Enum)?)\b/g;
      let match;
      while ((match = typeRegex.exec(func.returnType)) !== null) {
        const type = match[1];
        if (!['Promise', 'Array', 'void', 'any', 'unknown', 'string', 'number', 'boolean', 'File', 'Blob', 'FormData'].includes(type)) {
          typeImports.add(type);
        }
      }
    }

    // Extract types from parameters
    if (func.params) {
      // Look for type annotations like ": TypeName"
      const typeRegex = /:\s*([A-Z][A-Za-z0-9]*(?:Dto|Req|Res|Type|Enum)?)/g;
      let match;
      while ((match = typeRegex.exec(func.params)) !== null) {
        const type = match[1];
        if (!['Promise', 'Array', 'void', 'any', 'unknown', 'string', 'number', 'boolean', 'File', 'Blob', 'FormData'].includes(type)) {
          typeImports.add(type);
        }
      }
    }
  });

  if (typeImports.size > 0) {
    imports.push(`import { ${Array.from(typeImports).join(', ')} } from '../fetch/types';`);
  }

  // Generate hooks with API object consideration
  const hooks = functions.map(func => {
    const functionRef = usesApiObject ? `${apiObjectName}.${func.name}` : func.name;
    return generateHookWithRef(func, serviceName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), functionRef);
  }).join('\n');

  // Write file
  const outputPath = path.join(outputDir, `${serviceName}.ts`);
  const finalContent = [...imports, '', hooks].join('\n');

  fs.writeFileSync(outputPath, normalizeGeneratedText(finalContent));
  console.log(`Generated ${type} hooks: ${outputPath}`);
}

// Generate index file for hooks
function generateIndexFile(dir, type) {
  const files = fs.readdirSync(dir).sort()
    .filter(file => file.endsWith('.ts') && file !== 'index.ts' && hasNamedExports(path.join(dir, file)));

  const exports = files.map(file => `export * from './${file.replace('.ts', '')}';`);

  const indexPath = path.join(dir, 'index.ts');
  fs.writeFileSync(indexPath, exports.length ? exports.join('\n') + '\n' : 'export {};\n');
  console.log(`Generated ${type} index: ${indexPath}`);
}

// Run the script
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetFlagIndex = args.indexOf('--target');
  const targetName = targetFlagIndex >= 0 ? args[targetFlagIndex + 1] : 'mobile';

  if (!targetName) {
    console.error('--target 다음에 mobile 또는 web을 지정하세요.');
    process.exit(1);
  }

  generateAllHooks(targetName);
}

module.exports = {
  generateAllHooks,
  generateHookWithRef,
  generateHooksForType,
};
