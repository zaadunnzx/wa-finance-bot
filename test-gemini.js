require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

async function test() {
  console.log('🔑 API Key:', process.env.GEMINI_API_KEY?.substring(0, 15) + '...');
  console.log('🤖 Testing Gemini API (gemini-3.8-flash)...\n');

  try {
    const result = await model.generateContent('Jawab dengan satu kata: Halo');
    const text = result.response.text();
    console.log('✅ Gemini test 1 berhasil! Response:', text.trim());

    // Test parseTransaction
    const { parseTransaction } = require('./src/gemini');
    console.log('\n🧪 Testing parseTransaction("makan siang 25rb")...');
    const parsed = await parseTransaction('makan siang 25rb', '2026-10-22');
    console.log('✅ Parsed result:', JSON.stringify(parsed, null, 2));
  } catch (error) {
    console.error('❌ Gemini ERROR:', error.message);
    console.error('Detail:', error);
  }
}

test();
