import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Environment Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Simple .env parser since we might not have dotenv installed
const loadEnv = () => {
    try {
        const envPath = path.join(rootDir, '.env');
        let envContent = fs.readFileSync(envPath, 'utf-8');

        // Remove BOM if present
        if (envContent.charCodeAt(0) === 0xFEFF) {
            envContent = envContent.slice(1);
        }

        envContent.split(/\r?\n/).forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;

            const equalsIdx = line.indexOf('=');
            if (equalsIdx > 0) {
                const key = line.substring(0, equalsIdx).trim();
                const value = line.substring(equalsIdx + 1).trim();
                process.env[key] = value;
            }
        });
        console.log("✅ Loaded .env file");
        // Debug: print loaded keys (masked values)
        console.log("Loaded keys:", Object.keys(process.env).filter(k => k.startsWith('VITE_')));
    } catch (e) {
        console.warn("⚠️ Could not load .env file", e);
    }
};

loadEnv();

const API_KEY = process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ VITE_GEMINI_API_KEY not found in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- Types & Constants (Copied from GenerateTab.tsx for standalone execution) ---
type GradeGroupType = '초등 저학년' | '초등 중학년' | '초등 고학년' | '중등';

const forbiddenVocabulary: Record<GradeGroupType, string[]> = {
    '초등 저학년': ['분석', '추론', '비판', '논증', '함의', '맥락', '관점', '구조', '전개', '서술'],
    '초등 중학년': ['함의', '논증', '비평', '추상', '관념', '서사', '수사', '은유', '상징', '역설'],
    '초등 고학년': ['담론', '텍스트성', '상호텍스트', '메타인지', '변증법', '해체', '구조주의', '기호학', '현상학', '존재론'],
    '중등': ['해석학', '구조주의', '포스트모더니즘', '탈구조', '기표', '기의', '에피스테메', '담지체', '계보학', '존재론적']
};

const sentenceLengthGuide: Record<GradeGroupType, { min: number; max: number; avg: string }> = {
    '초등 저학년': { min: 8, max: 20, avg: '10~15자' },
    '초등 중학년': { min: 12, max: 30, avg: '15~25자' },
    '초등 고학년': { min: 15, max: 40, avg: '20~30자' },
    '중등': { min: 20, max: 50, avg: '25~35자' }
};

const getDifficultyInstructions = (difficulty: '하' | '중' | '상', grade: GradeGroupType): string => {
    const guide = sentenceLengthGuide[grade];
    const instructions: Record<'하' | '중' | '상', string> = {
        '하': `[난이도: 하 (기초)]\n📖 지문 기준:\n- 문장 길이: 평균 ${guide.avg}, 최대 ${guide.max}자\n- 어휘: 해당 학년 기본 교과서 수준`,
        '중': `[난이도: 중 (표준)]\n📖 지문 기준:\n- 문장 길이: 평균 ${guide.avg}, 최대 ${guide.max + 5}자\n- 어휘: 학년 교과서 수준 + 유추 가능 어휘`,
        '상': `[난이도: 상 (심화)]\n📖 지문 기준:\n- 문장 길이: 평균 ${guide.avg}, 복문 비율 높음\n- 어휘: 주제 관련 전문 용어 사용 (단, 금지 어휘 제외)`
    };
    return instructions[difficulty];
};

const sanitizeJSON = (jsonStr: string): string => {
    // Remove markdown code blocks if present
    let cleaned = jsonStr.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    // Remove trailing commas before ] or }
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    return cleaned;
};

// --- Test Logic ---

async function generateAndVerify(grade: GradeGroupType, difficulty: '하' | '중' | '상', topic: string) {
    console.log(`\n🧪 Testing: ${grade} / ${difficulty} / ${topic}`);

    const config = { charCount: '300자', style: '설명문' }; // Simplified config
    const forbidden = forbiddenVocabulary[grade];
    const forbiddenWarning = `⚠️ 어휘 제한: 다음 어휘는 사용하지 마세요: ${forbidden.join(', ')}`;

    const prompt = `당신은 ${grade} 학생을 위한 문해력 지문 생성 전문가입니다.

[주제]: ${topic}
[글자 수]: 약 ${config.charCount}
[문체]: ${config.style}
[문장 길이]: 평균 ${sentenceLengthGuide[grade].avg}, 최대 ${sentenceLengthGuide[grade].max}자
${forbiddenWarning}
${getDifficultyInstructions(difficulty, grade)}

위 조건에 맞는 교육적 지문을 생성하세요.
반드시 JSON 형식으로 응답하세요: {"title": "제목", "content": "지문 내용"}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: 'application/json' }
        });

        // Debug: Log raw response keys
        // console.log("Response Keys:", Object.keys(response || {}));

        const text = response.text || "{}";
        let result;
        try {
            result = JSON.parse(sanitizeJSON(text));
        } catch (e) {
            console.error("⚠️ JSON Parse Error. Raw text:", text);
            return;
        }

        // Handle array response (Gemini sometimes returns an array)
        if (Array.isArray(result)) {
            result = result[0];
        }

        const content = result.content || "";

        console.log(`📄 Generated Length: ${content.length} chars`);

        // Verification 1: Forbidden Words
        const foundForbidden = forbidden.filter(word => content.includes(word));
        if (foundForbidden.length > 0) {
            console.error(`❌ FAILED: Forbidden words found: ${foundForbidden.join(', ')}`);
        } else {
            console.log(`✅ PASSED: No forbidden words.`);
        }

        // Verification 2: Sentence Length (Approximate)
        const sentences = content.split(/[.?!]+/).filter((s: string) => s.trim().length > 0);
        const avgLength = sentences.reduce((sum: number, s: string) => sum + s.length, 0) / sentences.length;
        console.log(`📏 Avg Sentence Length: ${avgLength.toFixed(1)} chars (Target: ${sentenceLengthGuide[grade].avg})`);

    } catch (e: any) {
        console.error("❌ Error generating content:", e.message);
    }
}

async function runTests() {
    console.log("🚀 Starting Generation Quality Test...");

    // Test Case 1: 초등 저학년 - 하 (쉬워야 함)
    await generateAndVerify('초등 저학년', '하', '학교 가는 길');

    // Test Case 2: 초등 고학년 - 상 (어려워야 함, 금지어 테스트)
    await generateAndVerify('초등 고학년', '상', '민주주의의 의미');

    // Test Case 3: 중등 - 중 (적당해야 함)
    await generateAndVerify('중등', '중', '인공지능의 윤리');
}

runTests();
