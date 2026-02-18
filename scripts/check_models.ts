
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually since dotenv might not be installed
const envPath = path.resolve(process.cwd(), '.env');
let envConfig: Record<string, string> = {};

if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            envConfig[key.trim()] = value.trim();
        }
    });
}

const apiKey = envConfig.VITE_GEMINI_API_KEY || envConfig.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("API KEY not found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).apiKey; // Dummy call to get instance? No, direct listModels exists on GoogleGenerativeAI instance? 
        // Checking SDK usage for list models.
        // Actually, the SDK might not expose listModels directly on the instance depending on version. 
        // Let's rely on the error message suggestion: "Call ListModels to see the list of available models"
        // But in the node SDK, it is usually likely `genAI.getGenerativeModel`... wait.
        // Let's try to fetch models list if possible, or just revert to a known safe model if list fails.
        // For now, I'll try to use a simple script that tries to generate content with a few likely candidates to see which one works.

        const candidates = [
            "gemini-2.0-flash",
            "gemini-2.0-pro-exp",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-3-pro-preview", // Retrying this one too
        ];

        console.log("Testing model availability...");

        for (const modelName of candidates) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                await model.generateContent("Hello");
                console.log(`✅ ${modelName} is AVAILABLE`);
            } catch (e: any) {
                console.log(`❌ ${modelName} failed: ${e.message.split('\n')[0]}`);
            }
        }

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
