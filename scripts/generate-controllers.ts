import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { createRequire } from 'module';
const config = require('./config');

interface ServiceParameter {
  name: string;
  type: string;
  isOptional: boolean;
}

interface MethodInfo {
  name: string;
  jsDoc: string;
  parameters: string[];
  decorators: string[];
  httpMethod: string;
  route: string;
  returnType: string;
  bodyParam?: string;
  queryParams: string[];
  paramParams: string[];
  rbacRole?: string;
  guards?: string[];
  dtoImports: Set<string>;
  hasUser?: boolean;
  responseType?: string;
  serviceParams: ServiceParameter[]; // Store actual service method parameters
  hasRequest?: boolean;
  hasFile?: boolean;
  fileName?: string;
  whitelist?: boolean;
  mobileExclude?: boolean;
  jsDocQueryTypes?: string[]; // Original JSDoc query types like ['type:string', 'limit?:number']
}

function extractServiceName(fileName: string): string {
  return fileName.replace('.service.ts', '');
}

function generateControllerName(serviceName: string): string {
  const parts = serviceName.split('-');
  return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('') + 'Controller';
}

function parseJsDoc(jsDoc: string): { summary: string; description: string; access: string; route: string; query: string[]; body: string; response: string; params: string[]; request?: string; file?: string; auth?: string; whitelist?: boolean; mobileExclude?: boolean } {
  const summaryMatch = jsDoc.match(/@summary\s+(.+)/);
  const descriptionMatch = jsDoc.match(/@description\s+([\s\S]+?)(?=@|$)/);
  const accessMatch = jsDoc.match(/@access\s+(.+)/);
  const routeMatch = jsDoc.match(/@route\s+(.+)/);
  const queryMatch = jsDoc.match(/@query\s+(.+)/);
  const bodyMatch = jsDoc.match(/@body\s+(.+)/);
  const responseMatch = jsDoc.match(/@response\s+(.+)/);
  const requestMatch = jsDoc.match(/@request\s+(.+)/);
  const fileMatch = jsDoc.match(/@file\s+(.+)/);
  const authMatch = jsDoc.match(/@auth\s+(.+)/);
  const whitelistMatch = jsDoc.match(/@whitelist/);
  const mobileExcludeMatch = jsDoc.match(/@mobile-exclude/);
  const paramMatches = jsDoc.matchAll(/@param\s+(.+)/g);

  const queryParams = queryMatch
    ? queryMatch[1].split(',').map(q => q.trim()).filter(q => q.length > 0)
    : [];

  const params: string[] = [];
  for (const match of paramMatches) {
    if (match[1]) {
      params.push(match[1].trim());
    }
  }

  return {
    summary: summaryMatch ? summaryMatch[1].trim() : '',
    description: descriptionMatch ? descriptionMatch[1].trim().replace(/\n\s*\*/g, '\n *') : '',
    access: accessMatch ? accessMatch[1].trim() : '',
    route: routeMatch ? routeMatch[1].trim() : '',
    query: queryParams,
    body: bodyMatch ? bodyMatch[1].trim() : '',
    response: responseMatch ? responseMatch[1].trim() : '',
    params,
    request: requestMatch ? requestMatch[1].trim() : undefined,
    file: fileMatch ? fileMatch[1].trim() : undefined,
    auth: authMatch ? authMatch[1].trim() : undefined,
    whitelist: whitelistMatch ? true : undefined,
    mobileExclude: mobileExcludeMatch ? true : undefined
  };
}

function determineHttpMethod(methodName: string, route: string): string {
  const routeParts = route.split(' ');
  if (routeParts.length > 1) {
    return routeParts[0].toUpperCase();
  }

  if (methodName.startsWith('create') || methodName.startsWith('add')) return 'POST';
  if (methodName.startsWith('find') || methodName.startsWith('get')) return 'GET';
  if (methodName.startsWith('update') || methodName.startsWith('modify')) return 'PUT';
  if (methodName.startsWith('delete') || methodName.startsWith('remove') || methodName.startsWith('cancel')) return 'DELETE';
  return 'POST';
}

function extractRouteFromJsDoc(route: string): string {
  const routeParts = route.split(' ');
  if (routeParts.length > 1) {
    // Join all parts after the HTTP method
    const fullRoute = routeParts.slice(1).join(' ');
    // Remove leading slash and the first segment (e.g., /mentor/ -> '')
    // But keep the rest of the route (e.g., /mentor/public -> public)
    const match = fullRoute.match(/^\/[^/]+\/(.*)$/);
    if (match) {
      return match[1];
    }
    // If no match, return the route without leading slash
    return fullRoute.replace(/^\//, '');
  }
  return '';
}

async function determineRbacRole(access: string): Promise<string | undefined> {
  const enums = await config.getEnums();
  const userRoles = enums.UserRole

  // Map access to available roles
  const accessLower = access.toLowerCase();
  for (const role of userRoles) {
    if (role.toLowerCase() === accessLower) {
      return `UserRole.${role}`;
    }
  }

  return undefined;
}

async function parseServiceFile(filePath: string): Promise<{ methods: MethodInfo[], serviceImports: string[] }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const methods: MethodInfo[] = [];
  const serviceImports: string[] = [];

  // Extract all imports from service file
  sourceFile.statements.forEach(statement => {
    if (ts.isImportDeclaration(statement)) {
      const importText = statement.getText();
      const moduleSpecifier = statement.moduleSpecifier?.getText().replace(/['"]/g, '');

      // Skip only specific imports we don't need in controllers
      const skipImports = [
        '@nestjs/common',
        'dayjs',
        '@/common/helper/slackbot',
        '@/common/helper/format',
        '@/common/constants/errorMessage',
        '.service', // Skip service imports
        'googleapis',
        'redis',
        'bull',
        'winston',
        'typeorm',
        'knex',
        'sequelize',
        '@nestjs/config',
        '@nestjs/schedule',
        '@nestjs/cache-manager',
        'cache-manager'
      ];

      if (moduleSpecifier && !skipImports.some(skip => moduleSpecifier.includes(skip))) {
        // Preserve the entire import statement as-is
        serviceImports.push(importText);
      }
    }
  });

  async function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name?.text.endsWith('Service')) {
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const methodName = member.name.text;

          // Skip constructor and private methods
          if (methodName === 'constructor' || member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) {
            continue;
          }

          const jsDocText = ts.getJSDocCommentsAndTags(member)
            .map(jsDoc => jsDoc.getText())
            .join('\n');

          if (jsDocText) {
            const jsDocInfo = parseJsDoc(jsDocText);
            const httpMethod = determineHttpMethod(methodName, jsDocInfo.route);
            const route = extractRouteFromJsDoc(jsDocInfo.route);
            const rbacRole = await determineRbacRole(jsDocInfo.access);

            const parameters: string[] = [];
            const queryParams: string[] = [];
            const paramParams: string[] = [];
            const dtoImports = new Set<string>();
            let bodyParam = '';
            let hasUser = false;
            let hasRequest = false;
            let hasFile = false;
            let fileName: string | undefined;
            const serviceParams: ServiceParameter[] = [];

            // Create a map to store parameter types from method signature
            const paramTypeMap = new Map<string, string>();

            // Extract parameter types from method signature and store service parameters
            member.parameters.forEach((param) => {
              // Handle different parameter patterns
              if (param.name && param.type) {
                const paramType = param.type.getText().replace(/;/g, '').replace(/\s+/g, ' ').trim();

                // Handle object binding pattern (destructuring) like { role }: { role: UserRole }
                if (ts.isObjectBindingPattern(param.name)) {
                  // Store the entire object parameter as a single service parameter
                  serviceParams.push({
                    name: 'object', // We'll use a generic name since it's destructured
                    type: paramType,
                    isOptional: !!param.questionToken
                  });

                  // Extract properties from the type annotation for paramTypeMap
                  const objectProps = paramType.match(/\{([^}]+)\}/)?.[1];
                  if (objectProps) {
                    objectProps.split(',').forEach(prop => {
                      const propWithOptional = prop.trim();
                      const [propNamePart, propTypePart] = propWithOptional.split(':').map(s => s.trim());
                      const propName = propNamePart.replace('?', '').trim();
                      const propType = propTypePart;

                      if (propName && propType) {
                        paramTypeMap.set(propName, propType);
                      }
                    });
                  }
                } else if (ts.isIdentifier(param.name)) {
                  // Handle regular parameters
                  const paramName = param.name.text;
                  paramTypeMap.set(paramName, paramType);

                  // Store service parameter info
                  serviceParams.push({
                    name: paramName,
                    type: paramType,
                    isOptional: !!param.questionToken
                  });
                }
              }
            });

            // Track which parameters we've already added to avoid duplicates
            const addedParams = new Set<string>();

            // First, generate query parameters from JSDoc @query annotation
            jsDocInfo.query.forEach(queryParam => {
              // Parse param:type syntax and optional indicator
              let paramName = queryParam.trim();
              let explicitType: string | null = null;
              let isOptionalFromJsDoc = false;

              // Check if parameter has optional indicator (? before :)
              // e.g., "student_id?:string" -> optional
              // e.g., "limit" -> required
              if (paramName.includes('?:')) {
                isOptionalFromJsDoc = true;
                paramName = paramName.replace('?:', ':');
              }

              if (paramName.includes(':')) {
                const [name, type] = paramName.split(':').map(s => s.trim());
                paramName = name;
                explicitType = type;
              }

              if (addedParams.has(paramName)) return;
              addedParams.add(paramName);

              // Use explicit type from JSDoc if provided, otherwise fallback to paramTypeMap
              const paramType = explicitType || paramTypeMap.get(paramName) || 'string';

              // Check if this parameter is optional (from JSDoc or service method)
              const serviceParam = serviceParams.find(p => p.name === paramName);
              const isOptional = isOptionalFromJsDoc || serviceParam?.isOptional || false;


              if (paramType.includes('Enum') || paramType.endsWith('Role')) {
                // Handle any enum type (including UserRole)
                if (isOptional) {
                  queryParams.push(
                    `@Query('${paramName}', new ParseEnumPipe(${paramType}, { optional: true })) ${paramName}?: ${paramType}`
                  );
                } else {
                  queryParams.push(
                    `@Query('${paramName}', new ParseEnumPipe(${paramType})) ${paramName}: ${paramType}`
                  );
                }
              } else if (paramType.endsWith('Type')) {
                // Handle string literal union types (like SummaryType = 'daily' | 'weekly' | 'monthly')
                // These don't need ParseEnumPipe as they're type aliases
                const optionalIndicator = isOptional ? '?' : '';
                queryParams.push(`@Query('${paramName}') ${paramName}${optionalIndicator}: ${paramType}`);
                dtoImports.add(paramType); // Add to imports
              } else if (paramType === 'boolean') {
                if (isOptional) {
                  queryParams.push(
                    `@Query('${paramName}', new ParseBoolPipe({ optional: true })) ${paramName}?: boolean`
                  );
                } else {
                  queryParams.push(`@Query('${paramName}', ParseBoolPipe) ${paramName}: boolean`);
                }
              } else if (paramType.includes('Date')) {
                queryParams.push(`@Query('${paramName}') ${paramName}?: Date`);
              } else if (paramType === 'number') {
                if (isOptional) {
                  queryParams.push(
                    `@Query('${paramName}', new ParseIntPipe({ optional: true })) ${paramName}?: number`
                  );
                } else {
                  queryParams.push(`@Query('${paramName}', ParseIntPipe) ${paramName}: number`);
                }
              } else {
                const optionalIndicator = isOptional ? '?' : '';
                queryParams.push(`@Query('${paramName}') ${paramName}${optionalIndicator}: ${paramType}`);
              }
            });

            // Handle route parameters from JSDoc @param first
            jsDocInfo.params.forEach(param => {
              // Parse param:type syntax
              let paramName = param;
              let explicitType: string | null = null;

              if (param.includes(':')) {
                const [name, type] = param.split(':').map(s => s.trim());
                paramName = name;
                explicitType = type;
              }

              // Check if this parameter is in the route
              if (route.includes(`:${paramName}`)) {
                if (addedParams.has(paramName)) return;
                addedParams.add(paramName);

                const paramType = explicitType || paramTypeMap.get(paramName) || 'string';

                // Add appropriate parser based on type
                if (paramType === 'number') {
                  paramParams.push(`@Param('${paramName}', ParseIntPipe) ${paramName}: number`);
                } else if (paramType === 'boolean') {
                  paramParams.push(`@Param('${paramName}', ParseBoolPipe) ${paramName}: boolean`);
                } else if (paramType.includes('Enum') || paramType.endsWith('Role')) {
                  paramParams.push(`@Param('${paramName}', new ParseEnumPipe(${paramType})) ${paramName}: ${paramType}`);
                } else {
                  // Default to string for route parameters
                  paramParams.push(`@Param('${paramName}') ${paramName}: string`);
                }
              }
            });

            // Fallback: Add route parameters if route contains :id or :slotId and not already added
            if (route.includes(':id') && !addedParams.has('id')) {
              paramParams.push(`@Param('id') id: string`);
              addedParams.add('id');
            } else if (route.includes(':slotId') && !addedParams.has('slotId')) {
              paramParams.push(`@Param('slotId') slotId: string`);
              addedParams.add('slotId');
            }

            // Track whether we've already added route params to avoid duplicates
            let hasRouteParams = paramParams.length > 0;

            // Handle @body from JSDoc first
            if (jsDocInfo.body) {
              let paramName: string;
              let paramType: string;

              // Check if body has paramName:type format
              if (jsDocInfo.body.includes(':')) {
                const [name, type] = jsDocInfo.body.split(':').map(s => s.trim());
                paramName = name;
                paramType = type;
              } else {
                // Original logic for when no explicit name is provided
                const isArray = jsDocInfo.body.endsWith('[]');
                const baseType = isArray ? jsDocInfo.body.slice(0, -2) : jsDocInfo.body;

                // Generate parameter name based on whether it's array or not
                if (isArray) {
                  // For arrays, just add 's' to make it plural
                  paramName = baseType.charAt(0).toLowerCase() + baseType.slice(1) + 's';
                } else {
                  paramName = baseType.charAt(0).toLowerCase() + baseType.slice(1);
                }

                paramType = jsDocInfo.body;
              }

              const baseBodyType = paramType.endsWith('[]')
                ? paramType.slice(0, -2)
                : paramType;
              bodyParam = paramType.endsWith('[]')
                ? `@Body(new ParseSingleOrArrayPipe({ items: ${baseBodyType} })) ${paramName}: ${paramType}`
                : `@Body() ${paramName}: ${paramType}`;

              // Extract base type for imports (handle arrays and basic types)
              if (paramType !== 'any' && paramType !== 'string' && paramType !== 'number' && paramType !== 'boolean') {
                const baseType = paramType.endsWith('[]') ? paramType.slice(0, -2) : paramType;
                dtoImports.add(baseType);
              }
            }

            member.parameters.forEach(param => {
              if (param.name && ts.isIdentifier(param.name)) {
                const paramName = param.name.text;
                const paramType = param.type ? param.type.getText().replace(/;/g, '') : 'any';

                // Skip if already added from JSDoc
                if (addedParams.has(paramName)) return;

                // Only set bodyParam if not already set by JSDoc
                // Don't add @Body() for GET requests when @query is specified
                const isGetRequest = httpMethod === 'GET';
                const hasQueryFromJsDoc = jsDocInfo.query.length > 0;
                if (!bodyParam && (paramName.includes('Dto') || paramName.includes('dto')) && !(isGetRequest && hasQueryFromJsDoc)) {
                  bodyParam = `@${isGetRequest ? 'Query' : 'Body'}() ${paramName}: ${paramType}`;
                  if (paramType !== 'any' && paramType.includes('Dto')) {
                    dtoImports.add(paramType);
                  }
                } else if (paramName.endsWith('Id') && paramName !== 'userId' && !hasRouteParams) {
                  const paramKey = paramName === 'id' ? 'id' : paramName.replace(/Id$/, '_id');
                  if (!addedParams.has(paramKey)) {
                    paramParams.push(`@Param('${paramKey === 'id' ? 'id' : paramKey}') ${paramKey === 'id' ? 'id: string' : paramName + ': string'}`);
                    addedParams.add(paramKey);
                  }
                } else if (paramName === 'user' || paramName === 'payload') {
                  hasUser = true;
                } else if (paramType.includes('{') && paramType.includes('}') && jsDocInfo.query.length === 0 && !jsDocInfo.body) {
                  // Handle object parameters - only if no JSDoc @query and no JSDoc @body
                  const objectProps = paramType.match(/\{([^}]+)\}/)?.[1];
                  if (objectProps) {
                    objectProps.split(',').forEach(propStr => {
                      const propWithOptional = propStr.trim();
                      const isOptionalProp = propWithOptional.includes('?');
                      const [propNamePart, propTypePart] = propWithOptional.split(':').map(s => s.trim());
                      const prop = propNamePart.replace('?', '').trim();
                      const propType = propTypePart || 'string';

                      if (prop && prop !== 'user' && !addedParams.has(prop)) {
                        addedParams.add(prop);

                        if (propType === 'number' && !isOptionalProp) {
                          queryParams.push(`@Query('${prop}', ParseIntPipe) ${prop}: number`);
                        } else if (propType === 'number' && isOptionalProp) {
                          queryParams.push(
                            `@Query('${prop}', new ParseIntPipe({ optional: true })) ${prop}?: number`
                          );
                        } else if (propType === 'boolean') {
                          if (isOptionalProp) {
                            queryParams.push(
                              `@Query('${prop}', new ParseBoolPipe({ optional: true })) ${prop}?: boolean`
                            );
                          } else {
                            queryParams.push(`@Query('${prop}', ParseBoolPipe) ${prop}: boolean`);
                          }
                        } else if (propType.includes('Enum')) {
                          if (isOptionalProp) {
                            queryParams.push(
                              `@Query('${prop}', new ParseEnumPipe(${propType}, { optional: true })) ${prop}?: ${propType}`
                            );
                          } else {
                            queryParams.push(
                              `@Query('${prop}', new ParseEnumPipe(${propType})) ${prop}: ${propType}`
                            );
                          }
                        } else if (propType.includes('Date')) {
                          queryParams.push(`@Query('${prop}') ${prop}?: Date`);
                        } else {
                          const optionalMark = isOptionalProp ? '?' : '';
                          queryParams.push(`@Query('${prop}') ${prop}${optionalMark}: ${propType}`);
                        }
                      }
                    });
                  }
                } else if (paramType.includes('Enum') && jsDocInfo.query.length === 0 && !addedParams.has(paramName)) {
                  // Handle enum parameters directly - only if no JSDoc @query
                  addedParams.add(paramName);
                  if (param.questionToken) {
                    queryParams.push(
                      `@Query('${paramName}', new ParseEnumPipe(${paramType}, { optional: true })) ${paramName}?: ${paramType}`
                    );
                  } else {
                    queryParams.push(
                      `@Query('${paramName}', new ParseEnumPipe(${paramType})) ${paramName}: ${paramType}`
                    );
                  }
                } else if (jsDocInfo.query.length === 0 && !paramName.endsWith('Id') && !addedParams.has(paramName)) {
                  // Handle simple parameters - only if no JSDoc @query and not an ID parameter
                  // Skip DTO parameters - they should be handled as body params
                  // Skip Request type parameters - they should be handled with @Req()
                  // Skip if @body is already defined in JSDoc
                  if (!paramType.includes('Dto') && !paramName.includes('dto') && paramType !== 'Request' && !jsDocInfo.body) {
                    addedParams.add(paramName);
                    if (paramType === 'number') {
                      queryParams.push(`@Query('${paramName}', ParseIntPipe) ${paramName}: number`);
                    } else if (paramType === 'boolean') {
                      if (param.questionToken) {
                        queryParams.push(
                          `@Query('${paramName}', new ParseBoolPipe({ optional: true })) ${paramName}?: boolean`
                        );
                      } else {
                        queryParams.push(`@Query('${paramName}', ParseBoolPipe) ${paramName}: boolean`);
                      }
                    } else if (paramName !== 'filter' && paramName !== 'dto') {
                      queryParams.push(`@Query('${paramName}') ${paramName}: ${paramType}`);
                    }
                  } else if (paramType === 'Request' && paramName === 'req') {
                    // Mark that this method needs @Req() req: Request
                    hasRequest = true;
                  }
                }
              }
            });

            // Also check if method has @request tag from JSDoc
            if (jsDocInfo.request) {
              hasRequest = true;
            }

            // Check if method has @file tag from JSDoc
            if (jsDocInfo.file) {
              hasFile = true;
              fileName = jsDocInfo.file;
            }

            if (!hasFile) {
              const fileParam = serviceParams.find(param =>
                param.type.includes('Express.Multer.File')
              );

              if (fileParam) {
                hasFile = true;
                fileName = fileParam.name;
              }
            }

            const decorators: string[] = [];
            if (jsDocInfo.access.toLowerCase() === 'public') {
              decorators.push('@Public()');
            } else if (rbacRole) {
              decorators.push(`@RBAC(${rbacRole})`);
            }

            const guards: string[] = [];
            // Only add AdminOrSelfGuard if method has user_id parameter
            // Skip methods that update self (like updateUserInfo)
            const hasUserIdParam = jsDocInfo.params.some(p => p.includes('user_id')) ||
                                   jsDocInfo.query.some(q => q.includes('user_id')) ||
                                   jsDocInfo.body?.includes('user_id');

            if (hasUserIdParam &&
                (methodName.includes('User') || methodName.includes('reservation')) &&
                !jsDocInfo.access.toLowerCase().includes('admin')) {
              guards.push('AdminOrSelfGuard');
              decorators.push('@AdminOrSelf()');
              decorators.push('@UseGuards(AdminOrSelfGuard)');
            }

            // Add response type to DTO imports if specified (skip basic types)
            if (jsDocInfo.response) {
              // Extract base type from response (handle arrays and CommonResponse wrapper)
              let responseType = jsDocInfo.response;

              // Remove CommonResponse wrapper if present
              const commonResponseMatch = responseType.match(/CommonResponse<(.+)>$/);
              if (commonResponseMatch) {
                responseType = commonResponseMatch[1];
              }

              // Check for complex object types like { purchases: Purchase[], total: number }
              const objectTypeMatch = responseType.match(/\{([^}]+)\}/);
              if (objectTypeMatch) {
                // Extract all type names from the object
                const objectContent = objectTypeMatch[1];
                // Find all type references (excluding basic types)
                const typeMatches = objectContent.matchAll(/:\s*([A-Z]\w+)(?:\[\])?/g);
                for (const match of typeMatches) {
                  const typeName = match[1];
                  const basicTypes = ['string', 'number', 'boolean', 'any', 'void', 'object', 'String', 'Number', 'Boolean'];
                  if (!basicTypes.includes(typeName)) {
                    dtoImports.add(typeName);
                  }
                }
              } else {
                // Simple type - remove array brackets
                responseType = responseType.replace(/\[|\]/g, '');

                const basicTypes = ['string', 'number', 'boolean', 'any', 'void', 'object'];
                if (!basicTypes.includes(responseType) && responseType) {
                  dtoImports.add(responseType);
                }
              }
            }


            methods.push({
              name: methodName,
              jsDoc: jsDocText,
              parameters,
              decorators,
              httpMethod,
              route,
              returnType: member.type ? member.type.getText() : 'any',
              bodyParam,
              queryParams,
              paramParams,
              rbacRole,
              guards,
              dtoImports,
              hasUser,
              responseType: jsDocInfo.response,
              serviceParams,
              hasRequest,
              hasFile,
              fileName,
              whitelist: jsDocInfo.whitelist,
              mobileExclude: jsDocInfo.mobileExclude,
              jsDocQueryTypes: jsDocInfo.query
            });
          }
        }
      }
    }

    for (const child of node.getChildren()) {
      await visit(child);
    }
  }

  await visit(sourceFile);
  return { methods, serviceImports };
}

function extractBodyParamName(bodyParam: string): string {
  return bodyParam.match(/\)\s*(\w+)\s*:/)?.[1] || '';
}

function generateControllerMethod(method: MethodInfo, serviceName: string): string {
  const { summary, description, response } = parseJsDoc(method.jsDoc);

  const decorators = [...method.decorators];

  // Add ValidationPipe if whitelist is true
  if (method.whitelist) {
    decorators.push(`@UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // 웹훅은 추가 필드 허용
      transform: true,
    }),
  )`);
  }

  // Add file interceptor if needed
  if (method.hasFile && method.fileName) {
    decorators.push(`@UseInterceptors(FileInterceptor('${method.fileName}'))`);
  }

  const httpDecorator = `@${method.httpMethod.charAt(0).toUpperCase() + method.httpMethod.slice(1).toLowerCase()}(${method.route ? `'${method.route}'` : ''})`;

  // Sort parameters: required first, then optional
  const requiredParams: string[] = [];
  const optionalParams: string[] = [];

  // Categorize parameters
  method.paramParams.forEach(p => requiredParams.push(p));
  method.queryParams.forEach(p => {
    if (p.includes('?')) {
      optionalParams.push(p);
    } else {
      requiredParams.push(p);
    }
  });
  if (method.bodyParam) requiredParams.push(method.bodyParam);

  // Add file parameter if needed
  if (method.hasFile && method.fileName) {
    requiredParams.push(`@UploadedFile() ${method.fileName}: Express.Multer.File`);
  }

  // Check if service method needs user parameter
  const needsUserParam = method.serviceParams.some(p =>
    p.name === 'user' || p.name === 'payload' || p.name === 'userId'
  );

  if (method.hasRequest || method.hasUser || needsUserParam || (method.rbacRole && method.rbacRole !== 'UserRole.Admin' && method.rbacRole !== 'UserRole.SuperAdmin')) {
    requiredParams.push('@Req() req: Request');
  }

  // Combine parameters with required first, then optional
  const allParams: string[] = [...requiredParams, ...optionalParams];

  // Build service call arguments dynamically based on service method signature
  let serviceArgs: string[] = [];


  // If we have service parameters, use them to build arguments in the correct order
  if (method.serviceParams.length > 0) {
    // Check if the service method takes an object parameter as the first parameter
    if (method.serviceParams[0].type.includes('{')) {
      // Build object from all available parameters
      const objectProps: string[] = [];

      // Extract property names from the type
      const typeMatch = method.serviceParams[0].type.match(/\{([^}]+)\}/);
      if (typeMatch) {
        const propsStr = typeMatch[1];

        // Split by either comma or space followed by a property name (handles cases without commas)
        const props = propsStr.split(/[,;]|\s+(?=\w+\s*\??\s*:)/).map(p => {
          const [propName] = p.trim().split(':').map(s => s.trim().replace('?', ''));
          return propName;
        }).filter(name => name);

        // Build object properties
        props.forEach(propName => {
          // Check if it's from route params
          const routeParam = method.paramParams.find(p => {
            const match = p.match(/@Param\('([^']+)'(?:,\s*[^)]+)?\)\s+(\w+)/);
            return match && (match[2] === propName || match[1] === propName);
          });

          if (routeParam) {
            const match = routeParam.match(/@Param\('([^']+)'(?:,\s*[^)]+)?\)\s+(\w+)/);
            const varName = match ? match[2] : propName;
            objectProps.push(propName);
          }
          // Check if it's from query params
          else if (method.queryParams.some(q => q.includes(`'${propName}'`))) {
            const queryParam = method.queryParams.find(q => q.includes(`'${propName}'`));

            // Find the service parameter info
            const serviceProp = method.serviceParams[0].type.match(new RegExp(`${propName}\\s*\\?*\\s*:\\s*([^,}]+)`));
            const propType = serviceProp ? serviceProp[1].trim() : 'string';
            const isOptional = method.serviceParams[0].type.includes(`${propName}?:`);

            // Handle type conversions for optional fields
            if (isOptional && propType === 'number' && queryParam && !queryParam.includes('ParseIntPipe')) {
              objectProps.push(`${propName}: ${propName} ? parseInt(${propName}, 10) : undefined`);
            } else if (propName.includes('Date')) {
              objectProps.push(`${propName}: ${propName} ? new Date(${propName}) : undefined`);
            } else {
              objectProps.push(propName);
            }
          }
          // Check if it's user/payload
          else if (propName === 'user' || propName === 'payload') {
            objectProps.push(`${propName}: req?.user as Payload`);
          } else if (propName === 'userId' || propName === 'user_id') {
            console.warn(`Warning: Service method ${method.name} uses ${propName} in object parameter. Consider using user: Payload instead.`);
            objectProps.push(`${propName}: (req?.user as Payload)?.id`);
          }
        });
      }

      serviceArgs.push(`{ ${objectProps.join(', ')} }`);

      // Process remaining parameters after the object parameter
      for (let i = 1; i < method.serviceParams.length; i++) {
        const param = method.serviceParams[i];
        if (param.name === 'user' || param.name === 'payload') {
          serviceArgs.push('req?.user as Payload');
        } else if (param.name === 'userId') {
          serviceArgs.push('(req?.user as Payload)?.id');
        }
      }
    } else {
      // Process each service parameter in order
      method.serviceParams.forEach(param => {

        // Handle user/payload parameters
        if (param.name === 'user' || param.name === 'payload') {
          serviceArgs.push('req?.user as Payload');
        }
        // Handle userId parameter - DEPRECATED, services should accept user: Payload instead
        else if (param.name === 'userId') {
          console.warn(`Warning: Service method ${method.name} uses userId parameter. Consider using user: Payload instead.`);
          serviceArgs.push('(req?.user as Payload)?.id');
        }
        // Handle req: Request parameter (for @request tag)
        else if (param.name === 'req' && param.type === 'Request') {
          serviceArgs.push('req');
        }
        // Handle file parameter
        else if (param.name === 'file' && param.type.includes('Express.Multer.File')) {
          serviceArgs.push(method.fileName || 'file');
        }
        // Handle route parameters first (highest priority)
        else if (method.paramParams.some(p => {
          // Updated regex to handle ParseIntPipe and other parsers
          const match = p.match(/@Param\('([^']+)'(?:,\s*[^)]+)?\)\s+(\w+)/);
          return match && match[2] === param.name;
        })) {
          // Find the matching route parameter
          const routeParamMatch = method.paramParams.find(p => {
            // Updated regex to handle ParseIntPipe and other parsers
            const match = p.match(/@Param\('([^']+)'(?:,\s*[^)]+)?\)\s+(\w+)/);
            return match && match[2] === param.name;
          });

          if (routeParamMatch) {
            // Updated regex to handle ParseIntPipe and other parsers
            const match = routeParamMatch.match(/@Param\('([^']+)'(?:,\s*[^)]+)?\)\s+(\w+)/);
            const varName = match ? match[2] : param.name;

            // Check if ParseIntPipe is used (number type is already converted)
            const hasParsePipe = routeParamMatch.includes('ParseIntPipe') ||
                               routeParamMatch.includes('ParseBoolPipe') ||
                               routeParamMatch.includes('ParseEnumPipe');

            if (param.type === 'number' && !hasParsePipe) {
              // Only convert if no parse pipe is used
              serviceArgs.push(`+${varName}`);
            } else {
              // If parse pipe is used, the value is already converted
              serviceArgs.push(varName);
            }
          }
        }
        // Handle DTO/body parameters
        else if (param.type.includes('Dto') || param.name.includes('dto') || param.name.includes('Dto') ||
                 method.bodyParam?.includes(param.name)) {
          // If there's a bodyParam, use it
          if (method.bodyParam) {
            const bodyParamName = extractBodyParamName(method.bodyParam) || param.name;
            serviceArgs.push(bodyParamName);
          } else if (method.queryParams.length > 0) {
            // Build DTO object from query params (for GET requests with @query)
            const queryProps = method.queryParams.map(q => {
              const match = q.match(/@Query\('([^']+)'/);
              if (match) {
                const propName = match[1];
                // Check original JSDoc query type to determine if we need conversion
                const jsDocQueryEntry = method.jsDocQueryTypes?.find(jq => {
                  const [name] = jq.split(':').map(s => s.trim().replace('?', ''));
                  return name === propName;
                });

                if (jsDocQueryEntry) {
                  const isOptional = jsDocQueryEntry.includes('?');
                  const [, jsDocType] = jsDocQueryEntry.split(':').map(s => s.trim().replace('?', ''));

                  // If original JSDoc type is number but we receive as string (optional), convert
                  if (jsDocType === 'number' && isOptional && q.includes('?: string')) {
                    return `${propName}: ${propName} ? parseInt(${propName}, 10) : undefined`;
                  }
                }
                return propName;
              }
              return '';
            }).filter(p => p);
            serviceArgs.push(`{ ${queryProps.join(', ')} }`);
          } else {
            serviceArgs.push(param.name);
          }
        }
        // Handle individual query parameters
        else if (method.queryParams.some(q => q.includes(param.name))) {
          serviceArgs.push(param.name);
        }
      });
    }
  } else {
    // Fallback for methods without serviceParams
    if (method.bodyParam) {
      // Methods with DTO body parameter
      serviceArgs.push(extractBodyParamName(method.bodyParam));
    } else if (method.queryParams.length > 0 && !method.paramParams.length) {
      // Methods with only query parameters - build object
      const queryArgs = method.queryParams.map(q => {
        // Extract parameter name from "@Query('name'[, pipe]) varName: type"
        const match = q.match(/@Query\('([^']+)'/);
        const paramName = match ? match[1] : '';
        if (q.includes('Date')) {
          return `${paramName}: ${paramName} ? new Date(${paramName}) : undefined`;
        }
        return paramName;
      }).filter(name => name);

      const objContent = queryArgs.join(', ');
      if (method.hasUser) {
        serviceArgs.push(`{ ${objContent} }`);
        serviceArgs.push('req?.user as Payload');
      } else {
        serviceArgs.push(`{ ${objContent} }`);
      }
    } else if (method.paramParams.length > 0) {
      // Methods with path parameters
      method.paramParams.forEach(p => {
        if (p.includes("'id'")) {
          serviceArgs.push('+id');
        } else {
          const paramName = p.split(':')[0].split(' ').pop() || '';
          serviceArgs.push(paramName);
        }
      });
    }
  }


  // If serviceArgs is empty or incorrect, build from controller parameters
  if ((serviceArgs.length === 0 || serviceArgs.length === 1) && method.queryParams.length > 0) {
    // Build service call from controller parameters
    const controllerParams: string[] = [];

    // Check if service method expects an object parameter
    const hasObjectParam = method.serviceParams.length === 1 &&
                          method.serviceParams[0].type.includes('{');

    if (hasObjectParam || method.name.includes('find')) {
      // Build object from query parameters
      const objectProps: string[] = [];

      // Add route parameters first
      method.paramParams.forEach(p => {
        const match = p.match(/@Param\('([^']+)'(?:,\s*[^)]+)?\)\s+(\w+)/);
        if (match) {
          const [, paramKey, varName] = match;
          objectProps.push(varName);
        }
      });

      // Add query parameters
      method.queryParams.forEach(q => {
        const match = q.match(/@Query\('([^']+)'/);
        if (match) {
          const paramName = match[1];

          objectProps.push(paramName);
        }
      });

      // Add user if needed
      if (method.hasUser) {
        objectProps.push('user: req?.user as Payload');
      }

      serviceArgs = [`{ ${objectProps.join(', ')} }`];
    } else if (method.bodyParam) {
      // Methods with body parameter
      serviceArgs = [extractBodyParamName(method.bodyParam)];
    }
  }

  const serviceCall = `this.${serviceName.replace(/-/g, '')}Service.${method.name}(${serviceArgs.join(', ')})`;

  // Handle array response types for Swagger
  let responseTypeDeclaration = method.responseType || (method.name.includes('delete') || method.name.includes('cancel') ? 'SingleMessageDto' : 'any');

  // Convert array notation from Type[] to [Type] for Swagger
  const convertArrayNotation = (type: string): string => {
    if (!type) return type;

    // Handle array types - just convert notation, don't change type names
    if (type.endsWith('[]')) {
      const baseType = type.slice(0, -2);
      return `[${baseType}]`;
    }

    // Handle CommonResponse<Type[]> pattern
    const commonResponseMatch = type.match(/^CommonResponse<(.+)\[\]>$/);
    if (commonResponseMatch) {
      const innerType = commonResponseMatch[1];
      return `CommonResponse<[${innerType}]>`;
    }

    return type;
  };

  responseTypeDeclaration = convertArrayNotation(responseTypeDeclaration);

  const controllerParams = allParams.filter(param =>
    param !== '@Req() req: Request' || /\breq\b/.test(serviceCall),
  );

  const mobileExcludeMarker = method.mobileExclude
    ? '/** @mobile-exclude */\n  '
    : '';

  return `
  ${mobileExcludeMarker}${decorators.join('\n  ')}
  ${httpDecorator}
  @ApiOperation({
    summary: '${summary}',
    description: '${description.replace(/\n/g, ' ').replace(/'/g, "\\'").trim()}',
  })
  @ApiResponse({ type: ${responseTypeDeclaration} })
  ${method.name}(${controllerParams.join(', ')}) {
    return ${serviceCall};
  }`;
}

async function generateController(servicePath: string): Promise<string> {
  const serviceName = extractServiceName(path.basename(servicePath));
  const { methods, serviceImports } = await parseServiceFile(servicePath);

  // Check if any method has @auth tag
  const authTag = methods.find(m => {
    const jsDocInfo = parseJsDoc(m.jsDoc);
    return jsDocInfo.auth;
  });

  const authValue = authTag ? parseJsDoc(authTag.jsDoc).auth : undefined;
  const controllerClassName = generateControllerName(serviceName);

  // Filter out methods with empty routes
  const validMethods = methods.filter(method => method.route && method.route.trim() !== '');

  const imports = new Set([
    "import {",
    "  Controller,",
    "  Get,",
    "  Post,",
    "  Body,",
    "  Patch,",
    "  Param,",
    "  Delete,",
    "  Query,",
    "  Req,",
    "  UseGuards,"
  ]);

  // Add ValidationPipe and UsePipes if any method has whitelist
  const hasWhitelist = validMethods.some(m => m.whitelist);
  if (hasWhitelist) {
    imports.add("  ValidationPipe,");
    imports.add("  UsePipes,");
  }

  // Check if any method has file upload
  const hasFileUpload = validMethods.some(m => m.hasFile);
  if (hasFileUpload) {
    imports.add("  UploadedFile,");
    imports.add("  UseInterceptors,");
  }

  // Add parse pipes if needed - check both query and param decorators
  const hasPutMethod = validMethods.some(m => m.httpMethod.toUpperCase() === 'PUT');
  if (hasPutMethod) imports.add("  Put,");

  const hasIntPipe = validMethods.some(m =>
    m.queryParams.some(q => q.includes('ParseIntPipe')) ||
    m.paramParams.some(p => p.includes('ParseIntPipe'))
  );
  const hasBoolPipe = validMethods.some(m =>
    m.queryParams.some(q => q.includes('ParseBoolPipe')) ||
    m.paramParams.some(p => p.includes('ParseBoolPipe'))
  );
  const hasEnumPipe = validMethods.some(m =>
    m.queryParams.some(q => q.includes('ParseEnumPipe')) ||
    m.paramParams.some(p => p.includes('ParseEnumPipe'))
  );
  const hasSingleOrArrayBodyPipe = validMethods.some(m => m.bodyParam?.includes('ParseSingleOrArrayPipe'));

  if (hasIntPipe) imports.add("  ParseIntPipe,");
  if (hasBoolPipe) imports.add("  ParseBoolPipe,");
  if (hasEnumPipe) imports.add("  ParseEnumPipe,");

  // auth 컨트롤러는 Apple callback에서 Res가 필요함
  if (serviceName === 'auth') {
    imports.add("  Res,");
  }

  const nestImports = Array.from(imports).join('\n') + "\n} from '@nestjs/common';";

  // Track imports by module path to merge duplicates
  const importsByPath = new Map<string, Set<string>>();
  const singleImports: string[] = [nestImports];

  // Always use the service name to generate service class name
  const serviceClassName = serviceName.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('') + 'Service';
  singleImports.push(`import { ${serviceClassName} } from './${serviceName}.service';`);

  // Helper function to parse import statement and add to map
  const addToImportsMap = (importStatement: string) => {
    const match = importStatement.match(/import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const [, namedImports, defaultImport, path] = match;

      if (namedImports) {
        const importNames = namedImports.split(',').map(i => i.trim()).filter(i => i.length > 0);

        if (!importsByPath.has(path)) {
          importsByPath.set(path, new Set());
        }

        importNames.forEach(name => {
          if (name) {  // Skip empty names
            importsByPath.get(path)!.add(name);
          }
        });
      } else if (defaultImport) {
        // Handle default imports (though not common in this context)
        if (!importsByPath.has(path)) {
          importsByPath.set(path, new Set());
        }
        importsByPath.get(path)!.add(defaultImport);
      }
    }
  };

  singleImports.push("import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';");

  if (hasFileUpload) {
    singleImports.push("import { FileInterceptor } from '@nestjs/platform-express';");
  }

  if (hasSingleOrArrayBodyPipe) {
    addToImportsMap("import { ParseSingleOrArrayPipe } from '@/common/pipe/parse-single-or-array.pipe';");
  }

  const hasRbac = validMethods.some(m => m.rbacRole);
  const hasPublic = validMethods.some(m => m.decorators.includes('@Public()'));
  const hasGuards = validMethods.some(m => m.guards && m.guards.length > 0);

  // Collect all enum types used in query parameters
  const enumTypes = new Set<string>();
  validMethods.forEach(m => {
    [...m.queryParams, ...m.paramParams].forEach(q => {
      // Match the first ParseEnumPipe argument even when options are passed.
      const enumMatch = q.match(/ParseEnumPipe\(\s*([^,\s)]+)/);
      if (enumMatch) {
        enumTypes.add(enumMatch[1]);
      }
    });
  });

  // Add UserRole if RBAC is used
  if (hasRbac) {
    enumTypes.add('UserRole');
  }

  // Collect all Prisma model types from response types
  const prismaModelTypes = new Set<string>();
  const dtoTypes = new Set<string>();

  // Get Prisma models once
  const prismaModels = await config.getPrismaModels();

  validMethods.forEach(m => {
    // Check if any DTO imports might be Prisma models
    m.dtoImports.forEach(dtoImport => {
      if (prismaModels.includes(dtoImport)) {
        prismaModelTypes.add(dtoImport);
      } else if (dtoImport.includes('Dto') || dtoImport.endsWith('Type')) {
        // It's a DTO or custom type alias from req.dto.ts, not a Prisma model
        dtoTypes.add(dtoImport);
      }
    });
  });

  // Add service imports (from /dto/ or @prisma/client)
  serviceImports.forEach(importStatement => {
    // Check if this import contains any of the DTOs we need
    let shouldAddImport = false;

    // Check if import contains any DTO types we're using
    dtoTypes.forEach(dtoType => {
      if (importStatement.includes(dtoType)) {
        shouldAddImport = true;
      }
    });

    // Always include DTO imports from /dto/ paths that contain 'dto' or 'Dto'
    if ((importStatement.includes('/dto/') || importStatement.includes('.dto')) &&
        (importStatement.includes('Dto') || importStatement.includes('dto'))) {
      shouldAddImport = true;
    }

    // Check for enum/model imports from @prisma/client - but skip if we'll add them later
    if (importStatement.includes('@prisma/client')) {
      // Parse what's being imported from this statement
      const match = importStatement.match(/import\s+{([^}]+)}/);
      if (match) {
        const importedNames = match[1].split(',').map(i => i.trim());

        // Only add if it contains types we're using AND not already tracked
        importedNames.forEach(name => {
          if (enumTypes.has(name) || prismaModelTypes.has(name)) {
            shouldAddImport = true;
          }
        });
      }
    }

    if (shouldAddImport) {
      addToImportsMap(importStatement);
    }
  });

  // Ensure types ending with "Type" are imported from './dto/req.dto'
  dtoTypes.forEach(dtoType => {
    if (dtoType.endsWith('Type')) {
      // Check if already imported
      const alreadyImported = Array.from(importsByPath.values()).some(imports => imports.has(dtoType));
      if (!alreadyImported) {
        if (!importsByPath.has('./dto/req.dto')) {
          importsByPath.set('./dto/req.dto', new Set());
        }
        importsByPath.get('./dto/req.dto')!.add(dtoType);
      }
    }
  });

  // Get all enum names from Prisma schema
  const prismaEnums = await config.getEnums();
  const allPrismaEnumNames = Object.keys(prismaEnums);

  // Filter enumTypes to only include actual Prisma enums
  const actualPrismaEnums = new Set<string>();
  enumTypes.forEach(enumType => {
    if (allPrismaEnumNames.includes(enumType.replace('UserRole', 'UserRole'))) {
      actualPrismaEnums.add(enumType);
    }
  });

  // Always ensure required enums and models are imported from @prisma/client
  if (actualPrismaEnums.size > 0 || prismaModelTypes.size > 0) {
    if (!importsByPath.has('@prisma/client')) {
      importsByPath.set('@prisma/client', new Set());
    }
    actualPrismaEnums.forEach(enumType => {
      importsByPath.get('@prisma/client')!.add(enumType);
    });
    prismaModelTypes.forEach(modelType => {
      importsByPath.get('@prisma/client')!.add(modelType);
    });
  }

  if (hasRbac) {
    singleImports.push("import { RBAC } from '@/auth/decorator/rbac.decorator';");
  }

  if (hasPublic) {
    addToImportsMap("import { Public } from '@/auth/decorator/public.decorator';");
  }

  // Always import Payload if any method has user parameter or requires authentication
  const needsPayload = validMethods.some(m =>
    m.hasUser ||
    m.serviceParams.some(p => p.name === 'user' || p.name === 'payload' || p.name === 'userId') ||
    m.rbacRole ||
    !m.decorators.includes('@Public()')
  );

  if (needsPayload) {
    addToImportsMap("import { Payload } from '@/auth/utils/types';");
  }

  if (hasGuards) {
    addToImportsMap("import { AdminOrSelfGuard } from '@/auth/guard/admin-or-self.guard';");
  }

  addToImportsMap("import { Request } from 'express';");

  if (hasGuards) {
    addToImportsMap("import { AdminOrSelf } from '@/auth/decorator/adminOrSelf';");
  }


  // Import CommonResponse and SingleMessageDto if not already imported
  const commonDtoPath = '@/common/dto/res.dto';
  const srcCommonDtoPath = 'src/common/dto/res.dto';

  // Check if CommonResponse is needed and not already imported
  const needsCommonResponse = validMethods.some(m => m.responseType && m.responseType.includes('CommonResponse'));
  const alreadyHasCommonResponse = importsByPath.has(commonDtoPath) && importsByPath.get(commonDtoPath)!.has('CommonResponse') ||
                                   importsByPath.has(srcCommonDtoPath) && importsByPath.get(srcCommonDtoPath)!.has('CommonResponse');

  if (needsCommonResponse && !alreadyHasCommonResponse) {
    if (!importsByPath.has(commonDtoPath)) {
      importsByPath.set(commonDtoPath, new Set());
    }
    importsByPath.get(commonDtoPath)!.add('CommonResponse');
    importsByPath.get(commonDtoPath)!.add('SingleMessageDto');
  }

  const methodsCode = validMethods.map(m => generateControllerMethod(m, serviceName)).join('\n');

  // Generate final import statements from the map
  const finalImports: string[] = [];
  importsByPath.forEach((names, path) => {
    if (names.size > 0) {
      const sortedNames = Array.from(names).sort();
      if (sortedNames.length === 1) {
        finalImports.push(`import { ${sortedNames[0]} } from '${path}';`);
      } else {
        finalImports.push(`import {\n  ${sortedNames.join(',\n  ')},\n} from '${path}';`);
      }
    }
  });

  // Combine single imports and consolidated imports
  const allFinalImports = [...singleImports, ...finalImports];

  const controllerPath = serviceName;
  const apiTagName = `${serviceName} - ${serviceName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} API`;

  return `${allFinalImports.join('\n')}

@ApiTags('${apiTagName}')
@Controller('${controllerPath}')
export class ${controllerClassName} {
  constructor(private readonly ${serviceName.replace(/-/g, '')}Service: ${serviceClassName}) {}
${methodsCode}
}
`;
}

// Apple OAuth Callback 코드 생성 (auth.controller.ts에 추가)
function generateAppleCallbackCode(): string {

  return `

  /**
   * Apple OAuth Callback (Android용)
   * Apple에서 form_post로 전송한 authorization code를 받아 앱으로 redirect
   */
  @Public()
  @Post('apple/callback')
  @ApiOperation({
    summary: 'Apple OAuth Callback',
    description: 'Apple OAuth callback - authorization code를 앱으로 전달',
  })
  appleCallback(
    @Body() body: { code?: string; state?: string; error?: string },
    @Res() res: Response,
  ) {
    const { code, error, state } = body;

    const appScheme = process.env.APP_SCHEME;
    if (!appScheme || !/^[a-z][a-z0-9+.-]*$/i.test(appScheme) || /^(https?|javascript|data|file)$/i.test(appScheme)) {
      return res.status(503).json({
        message: 'Apple 로그인 설정 오류: APP_SCHEME에 유효한 앱 전용 URL 스킴을 설정하세요.',
      });
    }
    const encodedState = encodeURIComponent(state || '');

    if (error) {
      return res.redirect(\`\${appScheme}://apple-auth?error=\${encodeURIComponent(error)}&state=\${encodedState}\`);
    }

    if (code) {
      return res.redirect(\`\${appScheme}://apple-auth?code=\${encodeURIComponent(code)}&state=\${encodedState}\`);
    }

    return res.redirect(\`\${appScheme}://apple-auth?error=no_code&state=\${encodedState}\`);
  }`;
}

// auth.controller.ts에 Apple callback과 필요한 import 추가
function addAppleCallbackToAuthController(controllerContent: string): string {
  // 이미 appleCallback이 있으면 추가하지 않음
  if (controllerContent.includes('appleCallback')) {
    return controllerContent;
  }

  // Res import 추가 (@nestjs/common)
  // Res가 이미 import되어 있는지 확인 (Res, 또는 Res} 또는 Res 로 끝나는 경우)
  const hasResImport = /\bRes\b/.test(controllerContent.match(/import\s*\{([^}]+)\}\s*from\s*'@nestjs\/common'/s)?.[1] || '');

  if (!hasResImport) {
    // @nestjs/common import 블록 찾기
    const nestImportMatch = controllerContent.match(/import\s*\{([^}]+)\}\s*from\s*'@nestjs\/common'/s);
    if (nestImportMatch) {
      const currentImports = nestImportMatch[1].trim();
      // import 항목들을 파싱해서 Res 추가
      const importItems = currentImports.split(',').map(item => item.trim()).filter(item => item);
      importItems.push('Res');
      const newImports = importItems.join(',\n  ');
      controllerContent = controllerContent.replace(
        nestImportMatch[0],
        `import {\n  ${newImports}} from '@nestjs/common'`
      );
    }
  }

  // Response import 추가 (express)
  // Response가 이미 import되어 있는지 확인
  const hasResponseImport = /\bResponse\b/.test(controllerContent);

  if (!hasResponseImport) {
    // express import가 있는지 확인
    const expressImportMatch = controllerContent.match(/import\s*\{\s*([^}]+)\s*\}\s*from\s*'express'\s*;?/);
    if (expressImportMatch) {
      const currentImports = expressImportMatch[1].trim();
      const importItems = currentImports.split(',').map(item => item.trim()).filter(item => item);
      importItems.push('Response');
      const newImports = importItems.join(', ');
      controllerContent = controllerContent.replace(
        expressImportMatch[0],
        `import { ${newImports} } from 'express';`
      );
    } else {
      // express import가 없으면 추가
      const lastImportMatch = controllerContent.match(/import[^;]+;/g);
      if (lastImportMatch) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        const lastImportIndex = controllerContent.lastIndexOf(lastImport);
        const insertPosition = lastImportIndex + lastImport.length;
        controllerContent = controllerContent.slice(0, insertPosition) +
          "\nimport { Response } from 'express';" +
          controllerContent.slice(insertPosition);
      }
    }
  }

  // 클래스 마지막 } 앞에 Apple callback 추가
  const lastBraceIndex = controllerContent.lastIndexOf('}');
  const appleCallbackCode = generateAppleCallbackCode();

  controllerContent = controllerContent.slice(0, lastBraceIndex) + appleCallbackCode + '\n}\n';

  return controllerContent;
}

// TypeScript가 실제 참조를 판별하므로 decorator·타입·별칭 import도 보존한다.
function removeUnusedControllerImports(content: string, fileName: string): string {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    noResolve: true,
    noLib: true,
  };
  const service = ts.createLanguageService({
    getCompilationSettings: () => options,
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => '0',
    getScriptSnapshot: name => name === fileName ? ts.ScriptSnapshot.fromString(content) : undefined,
    getCurrentDirectory: () => path.dirname(fileName),
    getDefaultLibFileName: () => '',
    fileExists: name => name === fileName,
    readFile: name => name === fileName ? content : undefined,
  });
  try {
    const changes = service.organizeImports({
      type: 'file', fileName, mode: ts.OrganizeImportsMode.RemoveUnused,
    }, {}, {});
    const edits = changes.flatMap(change => change.textChanges).sort((a, b) => b.span.start - a.span.start);
    for (const edit of edits) {
      content = content.slice(0, edit.span.start) + edit.newText + content.slice(edit.span.start + edit.span.length);
    }
    return content;
  } finally {
    service.dispose();
  }
}

async function formatController(content: string, fileName: string): Promise<string> {
  // scaffold에서도 backend가 소유한 Prettier와 플러그인을 그대로 사용한다.
  const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
  const prettier = backendRequire('prettier');
  const formatOptions = await prettier.resolveConfig(path.resolve(__dirname, '../backend/package.json'));
  const plugins = (formatOptions?.plugins || []).map((plugin: string | object) =>
    typeof plugin === 'string' ? backendRequire.resolve(plugin) : plugin,
  );
  return prettier.format(removeUnusedControllerImports(content, fileName), {
    ...formatOptions, plugins, filepath: fileName, parser: 'typescript',
  });
}

async function main() {
  const servicesDir = config.backend.src;

  // Get all service files
  const serviceFiles: string[] = [];

  function findServiceFiles(dir: string) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        findServiceFiles(filePath);
      } else if (file.endsWith('.service.ts')) {
        serviceFiles.push(filePath);
      }
    });
  }

  findServiceFiles(servicesDir);

  // Filter out some services that shouldn't have controllers
  const skipServices = config.excludedServices;
  const filteredServices = serviceFiles.filter(f => !skipServices.some(skip => f.endsWith(skip)));

  console.log(`Found ${filteredServices.length} service files to process`);

  for (const servicePath of filteredServices) {
    try {
      const serviceName = extractServiceName(path.basename(servicePath));
      const serviceDir = path.dirname(servicePath);
      const controllerPath = path.join(serviceDir, `${serviceName}.controller.ts`);

      // Parse the service file to check if it has any methods with routes
      const { methods } = await parseServiceFile(servicePath);

      // Skip service files that do not define any API routes.
      const hasValidRoutes = methods.some(method => method.route && method.route.trim() !== '');


      if (!hasValidRoutes) {
        console.log(`Skipping controller generation for ${serviceName} - no routes found`);

        // If controller already exists, delete it
        if (fs.existsSync(controllerPath)) {
          fs.unlinkSync(controllerPath);
          console.log(`Deleted existing controller for ${serviceName}`);
        }
        continue;
      }

      // Always overwrite existing controllers
      if (fs.existsSync(controllerPath)) {
        console.log(`Overwriting existing controller for ${serviceName}...`);
      }

      let controllerContent = await generateController(servicePath);

      // auth.controller.ts인 경우 Apple callback 추가
      if (serviceName === 'auth') {
        controllerContent = addAppleCallbackToAuthController(controllerContent);
        console.log(`Added Apple OAuth callback to auth controller`);
      }

      fs.writeFileSync(controllerPath, await formatController(controllerContent, controllerPath));
      console.log(`Generated controller for ${serviceName}`);
    } catch (error) {
      console.error(`Error processing ${servicePath}:`, error);
      process.exitCode = 1;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
