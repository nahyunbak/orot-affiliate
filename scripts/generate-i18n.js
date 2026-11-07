/**
 * CSV → JSON 변환 스크립트
 *
 * CSV 파일을 읽어서 각 언어별 JSON 파일을 생성합니다.
 *
 * CSV 형식:
 * key,en,ko,ja,zh,es
 * welcome.title,Welcome,환영합니다,ようこそ,欢迎,Bienvenido
 *
 * 사용법:
 * node scripts/generate-i18n.js
 */

const fs = require("fs");
const path = require("path");

const PLACEHOLDER_REGEX = /\{\{\s*([\w.-]+)\s*\}\}/g;
const CORRUPTED_TOKEN_REGEX = /\[\[__TOK_\d+__\]\]|\[\[__TOK_|__TOK_/;

// 지원 언어 (20개국)
const SUPPORTED_LANGUAGES = [
  "ko",
  "en",
  "ja",
  "zh",
  "es",
  "de",
  "fr",
  "pt",
  "ru",
  "zh_Hant",
  "it",
  "ar",
  "id",
  "tr",
  "vi",
  "th",
  "hi",
  "nl",
  "pl",
  "sv",
];

// 경로 설정
const config = require("./config");
const CSV_PATH = [
  path.join(__dirname, "../mobile/i18n/translations.csv"),
  path.join(__dirname, "../web/src/i18n/translations.csv"),
].find((candidate) => fs.existsSync(candidate));
const OUTPUT_DIRS = Object.entries(config.clients)
  .filter(([, client]) => fs.existsSync(path.dirname(client.fetch)))
  .map(([name]) => path.join(__dirname, name === "web" ? "../web/src/i18n" : "../mobile/i18n"));

/**
 * CSV 파싱 (따옴표 내 쉼표 처리)
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 이스케이프된 따옴표
        current += '"';
        i++;
      } else {
        // 따옴표 토글
        inQuotes = !inQuotes;
      }
    } else if (
      char === "\\" &&
      (nextChar === "," || nextChar === '"' || nextChar === "\\")
    ) {
      current += nextChar;
      i++;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function extractPlaceholders(value) {
  return [...value.matchAll(PLACEHOLDER_REGEX)].map((match) => match[1]).sort();
}

function formatPlaceholderList(placeholders) {
  return placeholders.length > 0 ? placeholders.join(", ") : "(none)";
}

function validateTranslations(translations) {
  const errors = [];
  const sourceTranslations = translations.ko || translations.en || Object.values(translations)[0] || {};

  Object.entries(sourceTranslations).forEach(([key, sourceValue]) => {
    const expectedPlaceholders = extractPlaceholders(sourceValue);

    Object.keys(translations).forEach((lang) => {
      const value = translations[lang]?.[key] || "";

      if (CORRUPTED_TOKEN_REGEX.test(value)) {
        errors.push(
          `[${lang}] ${key}: corrupted token artifact detected -> ${value}`,
        );
      }

      const actualPlaceholders = extractPlaceholders(value);
      if (
        JSON.stringify(actualPlaceholders) !==
        JSON.stringify(expectedPlaceholders)
      ) {
        errors.push(
          `[${lang}] ${key}: placeholder mismatch (expected: ${formatPlaceholderList(expectedPlaceholders)}, actual: ${formatPlaceholderList(actualPlaceholders)})`,
        );
      }
    });
  });

  if (errors.length > 0) {
    console.error("❌ Translation validation failed.\n");
    errors.slice(0, 20).forEach((error) => console.error(`- ${error}`));

    if (errors.length > 20) {
      console.error(`- ...and ${errors.length - 20} more`);
    }

    process.exit(1);
  }
}

/**
 * CSV 파일 파싱
 */
function parseCSV(content) {
  const rows = [];
  let currentRow = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentRow += char;
    } else if (char === "\n" && !inQuotes) {
      if (currentRow.trim()) {
        rows.push(currentRow);
      }
      currentRow = "";
    } else if (char === "\r") {
      continue;
    } else {
      currentRow += char;
    }
  }

  if (currentRow.trim()) {
    rows.push(currentRow);
  }

  const headers = parseCSVLine(rows[0]);

  // 첫 번째 헤더는 'key'
  const languages = headers.slice(1);

  const translations = {};
  languages.forEach((lang) => {
    translations[lang] = {};
  });

  for (let i = 1; i < rows.length; i++) {
    const values = parseCSVLine(rows[i]);
    const key = (values[0] || "").trim();

    if (!key) continue;

    languages.forEach((lang, index) => {
      const value = (values[index + 1] || "").replace(/\\n/g, "\n");
      translations[lang][key] = value;
    });
  }

  return translations;
}

/**
 * JSON 파일 생성
 */
function generateJSONFiles(translations, outputDir) {
  const OUTPUT_DIR = path.join(outputDir, "locales");
  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  Object.entries(translations).forEach(([lang, data]) => {
    const filePath = path.join(OUTPUT_DIR, `${lang}.json`);
    const content = `${JSON.stringify(data, null, 2)}\n`;
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`✅ Generated: ${filePath}`);
  });
}

/**
 * TypeScript 타입 정의 생성
 */
function generateTypeDefinition(translations, outputDir) {
  const keys = Object.keys(translations.ko || translations.en || Object.values(translations)[0] || {});

  // Handle empty keys case with valid TypeScript syntax
  const keysType =
    keys.length > 0
      ? keys.map((key) => `  | '${key}'`).join("\n")
      : "  | string // Add translation keys to translations.csv";

  const typeContent = `// Auto-generated by generate-i18n.js
// Do not edit manually
// Note: Use LanguageEnum from '../fetch/types' for language codes

export type TranslationKey =
${keysType};
`;

  const typePath = path.join(outputDir, "types.ts");
  fs.writeFileSync(typePath, typeContent, "utf8");
  console.log(`✅ Generated: ${typePath}`);
}

/**
 * 메인 함수
 */
function main() {
  console.log("🌐 Generating i18n files from CSV...\n");

  // CSV 파일 존재 확인
  if (!CSV_PATH) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    console.log(
      "\nPlease create a translations.csv file in mobile/i18n/ directory.",
    );
    console.log("\nExample CSV format:");
    console.log("key,ko,en,ja,zh,es");
    console.log("welcome.title,환영합니다,Welcome,ようこそ,欢迎,Bienvenido");
    process.exit(1);
  }

  // CSV 파일 읽기
  const csvContent = fs.readFileSync(CSV_PATH, "utf8");

  // CSV 파싱
  const translations = parseCSV(csvContent);

  // 번역 무결성 검증
  validateTranslations(translations);

  // JSON 파일 생성
  for (const outputDir of OUTPUT_DIRS) {
    generateJSONFiles(translations, outputDir);
    generateTypeDefinition(translations, outputDir);
  }



  console.log("\n✨ i18n generation completed!");
  console.log(`\n📁 Output directory: ${OUTPUT_DIRS.join(", ")}`);
  console.log(`📝 Languages: ${Object.keys(translations).join(", ")}`);
}

if (require.main === module) main();
module.exports = { parseCSV, validateTranslations, generateJSONFiles, generateTypeDefinition };
