require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const candidateModels = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

async function checkModels() {
  for (const m of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const t0 = Date.now();
      const res = await model.generateContent('halo');
      const dt = Date.now() - t0;
      console.log(`✅ Model ${m} SUCCESS in ${dt}ms`);
    } catch (e) {
      console.log(`❌ Model ${m} FAILED: ${e.message.slice(0, 120)}`);
    }
  }
}
checkModels();
