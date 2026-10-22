require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const prompt = `Kamu adalah asisten pencatat keuangan yang menganalisis pesan berbahasa Indonesia informal.
Tanggal sekarang: 2026-10-22
Pesan user: "makan siang 25rb"
Tugasmu: tentukan apakah pesan ini adalah transaksi keuangan (pengeluaran atau pemasukan).
Jika YA, kembalikan JSON dengan format TEPAT ini (tanpa markdown, tanpa komentar):
{
  "is_transaction": true,
  "type": "pengeluaran",
  "amount": 25000,
  "description": "Makan siang",
  "category": "Makanan & Minuman"
}
Kembalikan HANYA JSON.`;

async function test(modelName) {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' }
    });
    const res = await model.generateContent(prompt);
    console.log(`✅ ${modelName} SUCCESS:`, res.response.text());
  } catch (e) {
    console.log(`❌ ${modelName} FAILED:`, e.message);
  }
}

async function run() {
  await test('gemini-flash-lite-latest');
  await test('gemini-3.5-flash-lite');
  await test('gemini-3.8-flash');
}
run();
