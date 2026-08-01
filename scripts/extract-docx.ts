import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import * as fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching Curriculum Configs...");
  const configsSnap = await getDocs(collection(db, "curriculum_configs"));
  const firestoreConfigs = configsSnap.docs.map(doc => doc.data());

  // Import fallback curriculum data
  const { INITIAL_CURRICULUM_DATA } = await import("../data/curriculum.ts");
  
  // Merge firestore configs into INITIAL_CURRICULUM_DATA if present
  for (const fc of firestoreConfigs) {
      if (fc.gradeGroup && INITIAL_CURRICULUM_DATA[fc.gradeGroup as keyof typeof INITIAL_CURRICULUM_DATA]) {
          INITIAL_CURRICULUM_DATA[fc.gradeGroup as keyof typeof INITIAL_CURRICULUM_DATA] = fc as any;
      }
  }

  const configs = Object.values(INITIAL_CURRICULUM_DATA);

  console.log("Fetching Assets...");
  const assetsSnap = await getDocs(collection(db, "assets"));
  const assets = assetsSnap.docs.map(doc => doc.data());

  const groupedAssets: Record<string, any[]> = {};
  for (const asset of assets) {
    if (!groupedAssets[asset.gradeGroup]) {
      groupedAssets[asset.gradeGroup] = [];
    }
    groupedAssets[asset.gradeGroup].push(asset);
  }

  const children: any[] = [];

  children.push(new Paragraph({
    text: "가치인 문해력 - 데이터베이스 추출 자료",
    heading: HeadingLevel.HEADING_1,
  }));

  for (const config of configs) {
    const gradeGroup = config.gradeGroup as string;
    
    children.push(new Paragraph({
      text: `[수준: ${gradeGroup}]`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 }
    }));

    children.push(new Paragraph({
      text: "문제 생성 프롬프트 (설정):",
      heading: HeadingLevel.HEADING_3,
    }));
    
    children.push(new Paragraph({
      children: [
        new TextRun({ text: "주제: " + (config.topics || []).join(", "), break: 1 }),
        new TextRun({ text: "지문 글자수: " + config.config?.charCount, break: 1 }),
        new TextRun({ text: "문체: " + config.config?.style, break: 1 }),
        new TextRun({ text: "추가 지침: " + (config.config?.instruction || "없음"), break: 1 }),
        new TextRun({ text: "기본 프롬프트:", break: 1 }),
      ]
    }));
    
    if (config.config?.basePrompt) {
      children.push(new Paragraph({
        text: config.config.basePrompt,
      }));
    } else {
      children.push(new Paragraph({ text: "(설정된 기본 프롬프트 없음)" }));
    }

    children.push(new Paragraph({
      text: "등록된 지문 및 문제:",
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 300, after: 100 }
    }));

    const gradeAssets = groupedAssets[gradeGroup as string] || [];
    if (gradeAssets.length === 0) {
      children.push(new Paragraph({ text: "등록된 지문이 없습니다." }));
    }

    for (let i = 0; i < gradeAssets.length; i++) {
      const asset = gradeAssets[i];
      children.push(new Paragraph({
        text: `지문 ${i + 1}: ${asset.title} (과목: ${asset.subject}, 난이도: ${asset.difficulty})`,
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 200, after: 100 }
      }));
      
      const contentLines = asset.content?.split('\n') || [];
      for (const line of contentLines) {
        if (line.trim() !== '') {
          children.push(new Paragraph({ text: line }));
        }
      }

      children.push(new Paragraph({
        text: "<문제 목록>",
        heading: HeadingLevel.HEADING_5,
        spacing: { before: 100, after: 100 }
      }));

      const questions = asset.questions || [];
      for (let j = 0; j < questions.length; j++) {
        const q = questions[j];
        children.push(new Paragraph({
          text: `Q${j + 1} (${q.category}): ${q.question}`,
          spacing: { before: 100 }
        }));
        
        if (q.context && q.context.content) {
          children.push(new Paragraph({
            text: `[보기] ${q.context.content}`
          }));
        }

        const options = q.options || [];
        for (let k = 0; k < options.length; k++) {
            children.push(new Paragraph({
                text: `${k + 1}. ${options[k]}`
            }));
        }
        
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `정답: ${q.answer}`, bold: true, break: 1 }),
            new TextRun({ text: `해설: ${q.rationale || "없음"}`, break: 1 })
          ]
        }));
      }
      
      children.push(new Paragraph({
        text: "--------------------------------------------------------",
        spacing: { before: 200 }
      }));
    }
  }

  const doc = new Document({
    sections: [
      {
        children: children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("extracted_data_v2.docx", buffer);
  console.log("extracted_data_v2.docx created successfully!");
  process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
