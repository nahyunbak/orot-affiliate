const fs = require('fs');
const path = require('path');
const config = require('./config');

function normalizeGeneratedText(content) {
  return `${content.replace(/[ \t]+$/gm, '').trimEnd()}\n`;
}

// Parse TypeScript controller file to extract endpoints
function parseController(controllerPath, targetName = 'mobile') {
  const content = fs.readFileSync(controllerPath, 'utf8');
  const endpoints = [];

  // Extract controller name from @Controller decorator
  const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]\)/);
  const basePath = controllerMatch ? controllerMatch[1] : '';


  // Split content by lines to process method by method
  const lines = content.split('\n');

  const isTargetExcluded = decoratorIndex => {
    const markers = [`@${targetName}-exclude`, '@client-exclude'];

    for (let index = decoratorIndex - 1; index >= 0; index -= 1) {
      const precedingLine = lines[index].trim();
      if (!precedingLine || precedingLine.startsWith('@')) {
        continue;
      }
      return markers.some(marker => precedingLine.includes(marker));
    }

    return false;
  };

  // Process each method
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this line has HTTP method decorator
    const httpMethodMatch = line.match(/@(Get|Post|Patch|Put|Delete)\((?:['"]([^'"]*)['"])?\)?/);

    if (httpMethodMatch) {
      if (isTargetExcluded(i)) {
        continue;
      }

      const [, httpMethod, path = ''] = httpMethodMatch;
      let isPublic = false;

      // HTTP decorator 바로 위의 decorator 묶음에서 @Public()을 찾습니다.
      // 하드코딩된 경로 목록만 사용하면 새 로그인 endpoint가 인증 필요 API로 잘못 생성됩니다.
      for (let decoratorIndex = i - 1; decoratorIndex >= 0; decoratorIndex -= 1) {
        const decoratorLine = lines[decoratorIndex].trim();
        if (!decoratorLine || decoratorLine.startsWith('*') || decoratorLine.startsWith('/**')) {
          continue;
        }
        if (decoratorLine.startsWith('@Public')) {
          isPublic = true;
          break;
        }
        if (!decoratorLine.startsWith('@')) {
          break;
        }
      }


      // Find the method name by looking at next non-decorator lines
      let methodName = '';
      let j = i + 1;

      // Look for method name in next few lines, skipping decorators
      for (let k = j; k < Math.min(i + 50, lines.length); k++) {
        const methodLine = lines[k];
        if (!methodLine.trim().startsWith('@') && methodLine.trim() !== '') {
          const methodMatch = methodLine.match(/^\s*(?:async\s+)?([a-zA-Z_]\w*)\s*\(/);
          if (methodMatch) {
            methodName = methodMatch[1];
            j = k;
            break;
          }
        }
      }


      if (methodName) {

        // Find the method implementation starting from current position
        let methodSignature = '';
        let braceCount = 0;
        let foundStart = false;
        let methodStartIdx = -1;

        // 위 탐색에서 확보한 실제 메서드 선언 위치를 사용합니다.
        // 라우트 경로와 메서드명이 같을 때 @Get('list')를 선언부로 오인하면
        // @Query/@Body 매개변수가 모두 사라지므로 decorator 라인을 재탐색하지 않습니다.
        foundStart = j >= 0;
        methodStartIdx = j;

        // Now collect the full method signature
        if (foundStart && methodStartIdx >= 0) {
          for (let k = methodStartIdx; k < lines.length; k++) {
            const currentLine = lines[k];
            methodSignature += currentLine + '\n';
            braceCount += (currentLine.match(/\(/g) || []).length;
            braceCount -= (currentLine.match(/\)/g) || []).length;

            // Stop when we've closed all parentheses and hit the opening brace
            if (braceCount === 0 && currentLine.includes('{')) {
              break;
            }
          }
        }

        // Extract parameters from method signature
        const paramsList = [];

        // Find the opening and closing parentheses of the method
        // Look for the method name followed by parenthesis to avoid decorator parentheses
        const methodPattern = new RegExp(`${methodName}\\s*\\(`);
        const methodMatch = methodSignature.match(methodPattern);
        const openParenIndex = methodMatch ? methodSignature.indexOf(methodMatch[0]) + methodMatch[0].length - 1 : -1;
        let closeParenIndex = -1;
        let parenCount = 0;

        for (let i = openParenIndex; i < methodSignature.length; i++) {
          if (methodSignature[i] === '(') parenCount++;
          if (methodSignature[i] === ')') parenCount--;
          if (parenCount === 0) {
            closeParenIndex = i;
            break;
          }
        }

        const params = closeParenIndex > openParenIndex ?
          methodSignature.substring(openParenIndex + 1, closeParenIndex) : '';

        // Split parameters more carefully, respecting nested parentheses
        const decoratorParams = [];
        let currentParam = '';
        let parenDepth = 0;

        for (let char of params) {
          if (char === '(') parenDepth++;
          if (char === ')') parenDepth--;

          if (char === ',' && parenDepth === 0) {
            if (currentParam.trim()) {
              decoratorParams.push(currentParam.trim());
            }
            currentParam = '';
          } else {
            currentParam += char;
          }
        }

        if (currentParam.trim()) {
          decoratorParams.push(currentParam.trim());
        }

        decoratorParams.forEach(param => {
          // Clean up the parameter (remove newlines and extra spaces)
          const cleanParam = param.replace(/\s+/g, ' ').trim();
          if (cleanParam.includes('@Body')) {
            // More flexible regex to handle whitespace, pipes, and array DTO bodies
            const bodyMatch = cleanParam.match(/@Body\([\s\S]*\)\s*(\w+)\s*:\s*([\w]+(?:\[\])?)/);
            if (bodyMatch) {
              paramsList.push({ type: 'body', name: bodyMatch[1], dtoType: bodyMatch[2] });
            }
          } else if (cleanParam.includes('@Param')) {
            const paramMatch = cleanParam.match(/@Param\(['"](\w+)['"]\)\s*(\w+):\s*(\w+)/);
            if (paramMatch) {
              paramsList.push({ type: 'param', name: paramMatch[1], varName: paramMatch[2], dataType: paramMatch[3] });
            }
          } else if (cleanParam.includes('@Query')) {
            // Handle queries with ParseIntPipe, ParseBoolPipe, ParseEnumPipe, etc.
            // Check if parameter is optional (has ?: in type declaration)
            const isOptional =
              /\?\s*:/.test(cleanParam) ||
              /optional\s*:\s*true/.test(cleanParam);

            // First try to match queries with pipes
            const queryWithPipeMatch = cleanParam.match(/@Query\(['"](\w+)['"],\s*new\s+\w+(?:\([^)]*\))?\)\s*(\w+)\??:\s*(\w+)/);
            if (queryWithPipeMatch) {
              paramsList.push({
                type: 'query',
                name: queryWithPipeMatch[1],
                varName: queryWithPipeMatch[2],
                dataType: queryWithPipeMatch[3],
                isOptional
              });
            } else {
              // Then try to match queries without pipes but with potential default values
              const queryMatch = cleanParam.match(/@Query\(['"](\w+)['"](?:,\s*[^)]+)?\)\s*(\w+)\??:\s*(\w+)(?:\s*=\s*[^,]+)?/);
              if (queryMatch) {
                paramsList.push({
                  type: 'query',
                  name: queryMatch[1],
                  varName: queryMatch[2],
                  dataType: queryMatch[3],
                  isOptional
                });
              } else {
                // Handle @Query() without specific parameter name (entire DTO)
                const queryDtoMatch = cleanParam.match(/@Query\(\)\s*(\w+):\s*(\w+)/);
                if (queryDtoMatch) {
                  paramsList.push({ type: 'queryDto', varName: queryDtoMatch[1], dtoType: queryDtoMatch[2] });
                }
              }
            }
          } else if (cleanParam.includes('@UploadedFile')) {
            // Handle file uploads
            const fileMatch = cleanParam.match(/@UploadedFile\(\)\s*(\w+):\s*(.+)/);
            if (fileMatch) {
              paramsList.push({ type: 'file', name: fileMatch[1], dataType: 'File' });
            }
          }
        });

        // Swagger 표준 응답 decorator와 프로젝트 호환 decorator를 모두 인식합니다.
        let returnType = 'unknown';
        let foundSpecificDecorator = false;

        // Find the actual method line first to set a better boundary
        let actualMethodLine = -1;
        for (let k = i + 1; k < Math.min(i + 20, lines.length); k++) {
          if (lines[k].includes(`async ${methodName}(`)) {
            actualMethodLine = k;
            break;
          }
        }

        // Set search boundaries - don't go beyond the method declaration
        const searchStart = actualMethodLine > 0 ? actualMethodLine - 1 : i + 10;
        const searchEnd = Math.max(0, searchStart - 15);

        // First pass: Look specifically for @ApiGetResponse or @ApiPostResponse
        for (let k = searchStart; k >= searchEnd; k--) {
          const checkLine = lines[k];
          if (
            /@Api(?:Get|Post|Ok|Created)Response/.test(checkLine)
          ) {
            const responseMatch = checkLine.match(
              /@Api(?:Get|Post|Ok|Created)Response\(([^)]+)\)/,
            );
            if (responseMatch) {
              let type = responseMatch[1].trim();
              const swaggerTypeMatch = type.match(
                /^\{\s*type:\s*(\[[A-Za-z_$][\w$]*\]|[A-Za-z_$][\w$]*)\s*\}$/,
              );
              if (swaggerTypeMatch) {
                type = swaggerTypeMatch[1];
              }
              // Convert [Type] notation to Type[]
              if (type.startsWith('[') && type.endsWith(']') && !type.includes('<')) {
                type = type.slice(1, -1).trim() + '[]';
              }
              // For findOne methods, ensure single object return type (but keep CommonResponse wrapper)
              if (methodName.startsWith('findOne') && type.endsWith('[]') && !type.includes('<')) {
                type = type.slice(0, -2); // Remove the [] suffix
              }
              returnType = type;
              foundSpecificDecorator = true;
              break;
            }
          }
        }

        // Second pass: If no specific decorator found, look for @ApiResponse
        if (!foundSpecificDecorator) {
          for (let k = searchStart; k >= searchEnd; k--) {
            const checkLine = lines[k];
            if (checkLine.includes('@ApiResponse')) {
              // Try to match @ApiResponse({ type: ... }) format first
              const typeMatch = checkLine.match(/@ApiResponse\(\s*{\s*type:\s*([\w<>\[\]\s]+)\s*}\s*\)/);
              if (typeMatch) {
                let type = typeMatch[1].trim();
                // Handle CommonResponse<[Type]> to CommonResponse<Type[]>
                if (type.includes('<') && type.includes('[')) {
                  type = type.replace(/\[([^\]]+)\]/g, '$1[]');
                }
                // Convert [Type] notation to Type[] (for non-generic types)
                else if (type.startsWith('[') && type.endsWith(']') && !type.includes('<')) {
                  type = type.slice(1, -1).trim() + '[]';
                }
                // For findOne methods, ensure single object return type
                if (methodName.startsWith('findOne') && type.endsWith('[]') && !type.includes('<')) {
                  type = type.slice(0, -2); // Remove the [] suffix
                }
                returnType = type;
                break;
              }

              // Fall back to status: 200 format
              if (checkLine.includes('status: 200')) {
                const responseMatch = checkLine.match(/type:\s*(\[?[\w\s<>]+\]?)/);
                if (responseMatch) {
                  let type = responseMatch[1].trim();
                  // Convert [Type] notation to Type[]
                  if (type.startsWith('[') && type.endsWith(']') && !type.includes('<')) {
                    type = type.slice(1, -1).trim() + '[]';
                  }
                  // For findOne methods, ensure single object return type
                  if (methodName.startsWith('findOne') && type.endsWith('[]') && !type.includes('<')) {
                    type = type.slice(0, -2); // Remove the [] suffix
                  }
                  returnType = type;
                  break;
                }
              }
            }
          }
        }

        // Extract path parameters from the route (e.g., :id, :userId)
        const pathParamMatches = path.match(/:(\w+)/g);
        if (pathParamMatches) {
          pathParamMatches.forEach(match => {
            const paramName = match.substring(1); // Remove the :
            // Check if this param is not already in the list
            const existingParam = paramsList.find(p => p.type === 'param' && p.name === paramName);
            if (!existingParam) {
              // Add it with a generic type
              paramsList.push({
                type: 'param',
                name: paramName,
                varName: paramName,
                dataType: paramName === 'id' ? 'number' : 'string'
              });
            }
          });
        }

        endpoints.push({
          method: httpMethod.toLowerCase(),
          path: path || '',
          methodName,
          params: paramsList,
          returnType,
          basePath,
          isPublic,
        });
      }
    }
  }

  return endpoints;
}

// Generate TypeScript fetch functions
function generateFetchFunction(endpoint, basePath, controllerName) {
  const { method, path, methodName, params, returnType } = endpoint;
  // Handle paths that already start with /
  const fullPath = path ?
    (path.startsWith('/') ? `/${basePath}${path}` : `/${basePath}/${path}`) :
    `/${basePath}`;

  // Build function parameters
  const functionParams = [];
  const bodyParam = params.find(p => p.type === 'body');
  const fileParam = params.find(p => p.type === 'file');
  const pathParams = params.filter(p => p.type === 'param');
  const queryParams = params.filter(p => p.type === 'query');
  const queryDtoParam = params.find(p => p.type === 'queryDto');
  const hasOptionalFileUpload = Boolean(fileParam && bodyParam);
  const isPublicEndpoint =
    endpoint.isPublic || config.auth.publicEndpoints.includes(fullPath);

  if (fileParam) {
    functionParams.push(`file: ${hasOptionalFileUpload ? 'File | null' : 'File'}`);
  }

  if (bodyParam) {
    functionParams.push(`data: ${bodyParam.dtoType}`);
  }

  if (pathParams.length > 0) {
    pathParams.forEach(p => {
      // Use original parameter type
      const paramType = p.dataType;
      functionParams.push(`${p.varName}: ${paramType}`);
    });
  }

  if (queryParams.length > 0) {
    // Separate required and optional params
    const requiredParams = queryParams.filter(p => !p.isOptional);
    const optionalParams = queryParams.filter(p => p.isOptional);

    const queryParamObj = [
      ...requiredParams.map(p => `${p.name}: ${p.dataType}`),
      ...optionalParams.map(p => `${p.name}?: ${p.dataType}`)
    ].join('; ');
    functionParams.push(`params: { ${queryParamObj} }`);
  } else if (queryDtoParam) {
    functionParams.push(`${queryDtoParam.varName}: ${queryDtoParam.dtoType}`);
  }

  if (!isPublicEndpoint) {
    functionParams.push('accessToken: string');
  }

  // Build URL with path parameters
  let url = fullPath;
  pathParams.forEach(p => {
    url = url.replace(`:${p.name}`, `\${${p.varName}}`);
  });

  // Build query string
  let queryString = '';
  if (queryParams.length > 0) {
    // Filter out undefined optional params
    const hasOptionalParams = queryParams.some(p => p.isOptional);
    if (hasOptionalParams) {
      queryString = `const queryString = toSearchParams(params);\n\t\t`;
    } else {
      queryString = `const queryString = toSearchParams(params);\n\t\t`;
    }
    url = `${url}?\${queryString}`;
  } else if (queryDtoParam) {
    queryString = `const queryString = toSearchParams(${queryDtoParam.varName});\n\t\t`;
    url = `${url}?\${queryString}`;
  }

  // Determine cache strategy and keys based on method
  let cacheStrategy = '';
  let keyType = '';
  let keyName = '';

  if (method === 'get') {
    // Use getNoCache for GET requests
    keyType = 'queryKeys';
    const camelCaseController = controllerName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    keyName = `query-${controllerName}-${methodName}`;
    cacheStrategy = `\t\t\t...getNoCache(queryKeys.${camelCaseController}.${methodName})\n`;
  } else {
    // Use mutation keys for other methods
    keyType = 'mutationKeys';
    const camelCaseController = controllerName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    keyName = `mutation-${controllerName}-${methodName}`;
  }

  // Generate function
  let functionBody = `\t${methodName}: async (${functionParams.join(', ')}): Promise<${returnType}> => {\n`;

  if (queryParams.length > 0 || queryDtoParam) {
    functionBody += `\t\t${queryString}`;
  }

  // Handle file upload
  if (fileParam) {
    if (hasOptionalFileUpload) {
      functionBody += `\t\tif (file) {\n`;
      functionBody += `\t\t\tconst formData = new FormData();\n`;
      functionBody += `\t\t\tformData.append('file', file);\n`;
      functionBody += `\t\t\tObject.entries(data).forEach(([key, value]) => {\n`;
      functionBody += `\t\t\t\tif (value === undefined || value === null) {\n`;
      functionBody += `\t\t\t\t\treturn;\n`;
      functionBody += `\t\t\t\t}\n`;
      functionBody += `\t\t\t\tif (Array.isArray(value)) {\n`;
      functionBody += `\t\t\t\t\tvalue.forEach(item => {\n`;
      functionBody += `\t\t\t\t\t\tif (item !== undefined && item !== null) {\n`;
      functionBody += `\t\t\t\t\t\t\tformData.append(key, String(item));\n`;
      functionBody += `\t\t\t\t\t\t}\n`;
      functionBody += `\t\t\t\t\t});\n`;
      functionBody += `\t\t\t\t\treturn;\n`;
      functionBody += `\t\t\t\t}\n`;
      functionBody += `\t\t\t\tformData.append(key, String(value));\n`;
      functionBody += `\t\t\t});\n\n`;
      functionBody += `\t\t\treturn fetchWithAuth(\`${url}\`, {\n`;
      functionBody += `\t\t\t\tmethod: '${method.toUpperCase()}',\n`;
      functionBody += `\t\t\t\theaders: {\n`;
      if (!isPublicEndpoint) {
        functionBody += `\t\t\t\t\t'Authorization': accessToken ? \`Bearer \${accessToken}\` : '',\n`;
      }
      functionBody += `\t\t\t\t},\n`;
      functionBody += `\t\t\t\tbody: formData,\n`;
      functionBody += `\t\t\t});\n`;
      functionBody += `\t\t}\n\n`;
    } else {
      functionBody += `\t\tconst formData = new FormData();\n`;
      functionBody += `\t\tformData.append('file', file);\n\t\t\n`;
    }
  }

  functionBody += `\t\treturn fetchWithAuth(\`${url}\`, {\n`;
  functionBody += `\t\t\tmethod: '${method.toUpperCase()}',\n`;

  if (fileParam && !hasOptionalFileUpload) {
    functionBody += `\t\t\theaders: {\n`;
    if (!isPublicEndpoint) {
      functionBody += `\t\t\t\t'Authorization': accessToken ? \`Bearer \${accessToken}\` : '',\n`;
    }
    functionBody += `\t\t\t},\n`;
    functionBody += `\t\t\tbody: formData,\n`;
  } else {
    functionBody += `\t\t\theaders: getBaseHeader(${isPublicEndpoint ? '' : 'accessToken'}),\n`;

    if (bodyParam) {
      functionBody += `\t\t\tbody: JSON.stringify(data),\n`;
    }
  }

  if (cacheStrategy && !fileParam) {
    functionBody += cacheStrategy;
  }

  functionBody += `\t\t});\n`;
  functionBody += `\t},`;

  return functionBody;
}

function getControllerExportedTypes(typesRootDir, controllerName) {
  const exportedTypes = new Set();
  const controllerTypesDir = path.join(typesRootDir, controllerName);

  if (!fs.existsSync(controllerTypesDir)) {
    return exportedTypes;
  }

  ['req.dto.ts', 'res.dto.ts'].forEach(fileName => {
    const filePath = path.join(controllerTypesDir, fileName);

    if (!fs.existsSync(filePath)) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const exportMatches = content.match(/export\s+(?:interface|type|class|enum)\s+(\w+)/g);

    if (!exportMatches) {
      return;
    }

    exportMatches.forEach(match => {
      const typeMatch = match.match(/export\s+(?:interface|type|class|enum)\s+(\w+)/);
      if (typeMatch) {
        exportedTypes.add(typeMatch[1]);
      }
    });
  });

  return exportedTypes;
}

// Generate endpoints for a single controller
function generateEndpointsForController(controllerPath, outputDir, targetName = 'mobile') {
  console.log(`\nProcessing: ${controllerPath}`);

  fs.mkdirSync(outputDir, { recursive: true });

  // Skip app.controller.ts as it's not an API controller
  if (controllerPath.includes('app.controller.ts')) {
    console.log('Skipping app.controller.ts');
    return;
  }

  const endpoints = parseController(controllerPath, targetName);

  if (endpoints.length === 0) {
    console.log('No endpoints found, skipping...');
    return;
  }

  console.log(`Found ${endpoints.length} endpoints`);

  // Determine output file name based on controller path
  const controllerName = path.basename(controllerPath, '.controller.ts');
  const outputFileName = `${controllerName}.ts`;
  const outputPath = path.join(outputDir, outputFileName);

  // Skip if it's a copy file
  if (outputFileName.includes('copy')) {
    console.log('Skipping copy file');
    return;
  }

  // Prepare imports based on controller name
  const imports = [
    `// 이 파일은 backend controller에서 자동 생성됩니다. 직접 수정하지 마세요.`,
    `// 재생성: pnpm generate-api`,
    `import { fetchWithAuth, getBaseHeader, toSearchParams } from '${config.imports.fetch.constants}';`,
    `import { getNoCache, getNoStoreRevalidate, getRefetchWithCache } from '${config.imports.fetch.utils.next}';`,
    `import { queryKeys, mutationKeys } from '${config.imports.fetch.utils.constants}';`
  ];

  // Add type imports based on controller
  const typeImports = [];
  const additionalTypes = [];
  const prismaTypes = [];
  const controllerExportedTypes = getControllerExportedTypes(
    path.join(outputDir, 'types'),
    controllerName,
  );

  // Always import common types
  typeImports.push('CommonResponse');
  typeImports.push('SingleMessageDto');

  // Collect all types used in endpoints
  endpoints.forEach(endpoint => {
    // Add return types
    if (endpoint.returnType && endpoint.returnType !== 'unknown') {
      // Handle generic types like CommonResponse<TaskResDto>
      if (endpoint.returnType.includes('<')) {
        // Extract both the wrapper type and the inner type
        const genericMatch = endpoint.returnType.match(/(\w+)<(\w+(?:\[\])?)>/);
        if (genericMatch) {
          const [, wrapperType, innerType] = genericMatch;
          if (!typeImports.includes(wrapperType)) {
            typeImports.push(wrapperType);
          }
          // Handle array types in inner type
          const cleanInnerType = innerType.replace(/\[\]/g, '');
          if (cleanInnerType && !typeImports.includes(cleanInnerType)) {
            typeImports.push(cleanInnerType);
          }
        }
      } else {
        // Handle simple types and array types like GroupLessonResDto[]
        const cleanType = endpoint.returnType.replace(/\[\]/g, '');
        if (cleanType && !typeImports.includes(cleanType)) {
          typeImports.push(cleanType);
        }
      }
    }

    // Add parameter types
    endpoint.params.forEach(param => {
      if (param.dtoType) {
        const cleanDtoType = param.dtoType.replace(/\[\]/g, '');
        if (cleanDtoType && !typeImports.includes(cleanDtoType)) {
          typeImports.push(cleanDtoType);
        }
      }
      if (param.dataType && param.dataType !== 'string' && param.dataType !== 'number' && param.dataType !== 'boolean' && param.dataType !== 'File') {
        // Check if this is an enum type
        if (param.dataType.endsWith('Enum')) {
          if (controllerExportedTypes.has(param.dataType)) {
            if (!typeImports.includes(param.dataType)) {
              typeImports.push(param.dataType);
            }
          } else if (!prismaTypes.includes(param.dataType)) {
            prismaTypes.push(param.dataType);
          }
        } else {
          // This might be a custom type
          if (!additionalTypes.includes(param.dataType)) {
            additionalTypes.push(param.dataType);
          }
        }
      }
    });
  });

  // Add controller-specific types if they exist
  controllerExportedTypes.forEach(typeName => {
    typeImports.push(typeName);
  });

  // Add additional types (like UploadKind)
  additionalTypes.forEach(type => {
    if (!typeImports.includes(type)) {
      typeImports.push(type);
    }
  });

  // Remove duplicates and filter out primitive types and 'any'
  const primitiveTypes = ['string', 'number', 'boolean', 'any', 'unknown', 'void', 'never', 'object'];
  // Also exclude 'Request' type as it's from Express and not part of our types
  const excludedTypes = [...primitiveTypes, 'Request'];
  const uniqueTypeImports = [...new Set(typeImports)].filter(type => !excludedTypes.includes(type) && !prismaTypes.includes(type));

  // Add prisma types import if needed
  const uniquePrismaTypes = [...new Set(prismaTypes)];
  if (uniquePrismaTypes.length > 0) {
    imports.push(`import { ${uniquePrismaTypes.join(', ')} } from './types/prisma-types';`);
  }

  if (uniqueTypeImports.length > 0) {
    imports.push(`import { ${uniqueTypeImports.join(', ')} } from './types';`);
  }

  // Generate API object name
  const apiObjectName = `${controllerName.replace(/-/g, '')}API`;

  // Generate new functions
  const newFunctions = endpoints.map(endpoint => generateFetchFunction(endpoint, endpoints[0].basePath, controllerName)).join('\n\n');

  // Create new content
  let newContent = imports.join('\n') + '\n\n';
  newContent += `export const ${apiObjectName} = {\n`;
  newContent += newFunctions + '\n';
  newContent += `}`;

  // Write to file
  fs.writeFileSync(outputPath, normalizeGeneratedText(newContent));
  console.log(`Generated: ${outputPath}`);
}

function generateFetchIndex(outputDir) {
  const endpointFiles = fs
    .readdirSync(outputDir)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        file !== 'index.ts' &&
        !file.endsWith('.d.ts'),
    )
    .sort();
  const exports = endpointFiles.map(
    (file) => `export * from './${file.replace(/\.ts$/, '')}';`,
  );

  if (fs.existsSync(path.join(outputDir, 'types/index.ts'))) {
    exports.push("export * from './types';");
  }
  if (fs.existsSync(path.join(outputDir, 'utils/index.ts'))) {
    exports.push("export * from './utils';");
  }

  fs.writeFileSync(path.join(outputDir, 'index.ts'), `${exports.join('\n')}\n`);
  console.log(`Generated fetch index: ${path.join(outputDir, 'index.ts')}`);
}

// Main function to generate all endpoints
function generateAllEndpoints(targetName = 'mobile') {
  const controllersDir = config.backend.src;
  const outputDir = config.getClientTarget(targetName).fetch;

  // Find all controller files
  const controllerFiles = [];

  function findControllerFiles(dir) {
    const files = fs.readdirSync(dir).sort();
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        findControllerFiles(filePath);
      } else if (file.endsWith('.controller.ts') && !file.endsWith('.spec.ts')) {
        controllerFiles.push(filePath);
      }
    });
  }

  findControllerFiles(controllersDir);

  console.log(`Found ${controllerFiles.length} controller files`);

  // Process each controller
  controllerFiles.forEach(controllerPath => {
    try {
      generateEndpointsForController(controllerPath, outputDir, targetName);
    } catch (error) {
      console.error(`Error processing ${controllerPath}:`, error.message);
    }
  });

  generateFetchIndex(outputDir);

  console.log('\nAll endpoints generated successfully!');

  // Update query and mutation keys
  updateKeysInConstants(controllersDir, outputDir, targetName);
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetFlagIndex = args.indexOf('--target');

  if (targetFlagIndex >= 0) {
    const targetName = args[targetFlagIndex + 1];
    if (!targetName) {
      console.error('--target 다음에 mobile 또는 web을 지정하세요.');
      process.exit(1);
    }
    generateAllEndpoints(targetName);
    return;
  }

  if (args.length === 2) {
    // Old usage: specific controller and output
    const [controllerPath, outputPath] = args;

    if (!fs.existsSync(controllerPath)) {
      console.error(`Controller file not found: ${controllerPath}`);
      process.exit(1);
    }

    const endpoints = parseController(controllerPath);
    const controllerName = path.basename(controllerPath, '.controller.ts');

    console.log(`Found ${endpoints.length} endpoints`);

    if (endpoints.length === 0) {
      console.log('No endpoints found!');
      return;
    }

    // Read existing file content
    const existingContent = fs.readFileSync(outputPath, 'utf8');

    // Extract imports and API object structure
    const importEndIndex = existingContent.lastIndexOf('import');
    const importSection = existingContent.slice(0, existingContent.indexOf('\n', importEndIndex) + 1);

    // Find the API object
    const apiObjectMatch = existingContent.match(/const\s+(\w+Api)\s*=\s*{/);
    const apiObjectName = apiObjectMatch ? apiObjectMatch[1] : 'api';

    // Generate new functions
    const newFunctions = endpoints.map(endpoint => generateFetchFunction(endpoint, endpoints[0].basePath, controllerName)).join('\n\n');

    // Create new content
    let newContent = importSection + '\n';
    newContent += `export const ${apiObjectName} = {\n`;
    newContent += newFunctions + '\n';
    newContent += `}`;

    // Write to file
    fs.writeFileSync(outputPath, newContent);
    console.log(`Generated endpoints written to: ${outputPath}`);
  } else {
    // New usage: generate all endpoints
    generateAllEndpoints();
  }
}

// Generate and update query/mutation keys in constants file
function updateKeysInConstants(controllersDir, outputDir, targetName = 'mobile') {
  const constantsPath = path.join(outputDir, 'utils/constants.ts');
  const controllerFiles = [];

  function findControllerFiles(dir) {
    const files = fs.readdirSync(dir).sort();
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        findControllerFiles(filePath);
      } else if (file.endsWith('.controller.ts') && !file.endsWith('.spec.ts') && !file.endsWith('app.controller.ts')) {
        controllerFiles.push(filePath);
      }
    });
  }

  findControllerFiles(controllersDir);

  const queryKeysObj = {};
  const mutationKeysObj = {};

  // Process each controller to collect keys
  controllerFiles.forEach(controllerPath => {
    const endpoints = parseController(controllerPath, targetName);
    if (endpoints.length === 0) return;

    const controllerName = path.basename(controllerPath, '.controller.ts');
    const camelCaseName = controllerName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

    if (!queryKeysObj[camelCaseName]) {
      queryKeysObj[camelCaseName] = {};
    }
    if (!mutationKeysObj[camelCaseName]) {
      mutationKeysObj[camelCaseName] = {};
    }

    endpoints.forEach(endpoint => {
      const { method, methodName } = endpoint;
      if (method === 'get') {
        const kebabMethodName = methodName.replace(/([A-Z])/g, '-$1').toLowerCase();
        const cleanKebabName = kebabMethodName.startsWith('-') ? kebabMethodName.substring(1) : kebabMethodName;
        queryKeysObj[camelCaseName][methodName] = `'query-${controllerName}-${cleanKebabName}'`;
      } else {
        const kebabMethodName = methodName.replace(/([A-Z])/g, '-$1').toLowerCase();
        const cleanKebabName = kebabMethodName.startsWith('-') ? kebabMethodName.substring(1) : kebabMethodName;
        mutationKeysObj[camelCaseName][methodName] = `'mutation-${controllerName}-${cleanKebabName}'`;
      }
    });
  });

  fs.mkdirSync(path.dirname(constantsPath), { recursive: true });

  // Generate new queryKeys object
  let newQueryKeys = 'export const queryKeys = {\n';
  Object.keys(queryKeysObj).sort().forEach(controller => {
    if (Object.keys(queryKeysObj[controller]).length > 0) {
      newQueryKeys += `\t${controller}: {\n`;
      Object.keys(queryKeysObj[controller]).sort().forEach(method => {
        newQueryKeys += `\t\t${method}: ${queryKeysObj[controller][method]},\n`;
      });
      newQueryKeys = newQueryKeys.replace(/,\n$/, '\n'); // Remove last comma
      newQueryKeys += `\t},\n`;
    }
  });
  newQueryKeys = newQueryKeys.replace(/,\n$/, '\n'); // Remove last comma
  newQueryKeys += '} as const;\n';

  // Generate new mutationKeys object
  let newMutationKeys = '\nexport const mutationKeys = {\n';
  Object.keys(mutationKeysObj).sort().forEach(controller => {
    if (Object.keys(mutationKeysObj[controller]).length > 0) {
      newMutationKeys += `\t${controller}: {\n`;
      Object.keys(mutationKeysObj[controller]).sort().forEach(method => {
        newMutationKeys += `\t\t${method}: ${mutationKeysObj[controller][method]},\n`;
      });
      newMutationKeys = newMutationKeys.replace(/,\n$/, '\n'); // Remove last comma
      newMutationKeys += `\t},\n`;
    }
  });
  newMutationKeys = newMutationKeys.replace(/,\n$/, '\n'); // Remove last comma
  newMutationKeys += '} as const;\n';

  // Generate QueryKey type
  let queryKeyType = '\nexport type QueryKey =\n';
  const queryControllers = Object.keys(queryKeysObj).filter(c => Object.keys(queryKeysObj[c]).length > 0);
  queryControllers.forEach((controller, index) => {
    queryKeyType += `\t| (typeof queryKeys.${controller})[keyof typeof queryKeys.${controller}]`;
    if (index < queryControllers.length - 1) {
      queryKeyType += '\n';
    }
  });
  if (queryControllers.length === 0) queryKeyType += '\tnever';
  queryKeyType += ';\n';

  // Generate MutationKey type
  let mutationKeyType = '\nexport type MutationKey =\n';
  const mutationControllers = Object.keys(mutationKeysObj).filter(c => Object.keys(mutationKeysObj[c]).length > 0);
  mutationControllers.forEach((controller, index) => {
    mutationKeyType += `\t| (typeof mutationKeys.${controller})[keyof typeof mutationKeys.${controller}]`;
    if (index < mutationControllers.length - 1) {
      mutationKeyType += '\n';
    }
  });
  if (mutationControllers.length === 0) mutationKeyType += '\tnever';
  mutationKeyType += ';\n';

  // Combine everything
  const newContent = newQueryKeys + newMutationKeys + queryKeyType + mutationKeyType;

  // Write updated content
  fs.writeFileSync(constantsPath, newContent);
  console.log('Updated query and mutation keys in constants.ts');
}

module.exports = {
  generateEndpoints: generateEndpointsForController,
  generateAllEndpoints,
  generateFetchFunction,
  generateFetchIndex,
  updateKeysInConstants,
};
