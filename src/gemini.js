const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Daftar model prioritas jika salah satu sibuk/503
const MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash'
];

/**
 * Panggil Gemini dengan automatic fallback ke model cadangan jika terjadi error/503.
 */
async function callGeminiWithFallback(prompt, options = {}) {
  let lastError = null;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: options.generationConfig || {}
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      return { text, model: modelName };
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Model ${modelName} error (${err.message?.slice(0, 80)}), mencoba model berikutnya...`);
    }
  }

  throw lastError;
}

/**
 * Parse pesan natural language menjadi data transaksi terstruktur.
 * Contoh input: "makan siang 25rb", "gaji 5jt masuk", "bensin 50k"
 * 
 * @param {string} message - Pesan dari user
 * @param {string} currentDate - Tanggal sekarang dalam format YYYY-MM-DD
 * @returns {Object|null} - Data transaksi atau null jika bukan transaksi
 */
async function parseTransaction(message, currentDate) {
  const prompt = `Kamu adalah asisten pencatat keuangan yang menganalisis pesan berbahasa Indonesia informal.

Tanggal sekarang: ${currentDate}

Pesan user: "${message}"

Tugasmu: tentukan apakah pesan ini adalah transaksi keuangan (pengeluaran atau pemasukan).

Jika YA, kembalikan JSON dengan format:
{
  "is_transaction": true,
  "type": "pengeluaran" atau "pemasukan",
  "amount": angka bulat dalam rupiah (contoh: 25000, 5000000),
  "description": "deskripsi singkat transaksi",
  "category": salah satu dari ["Makanan & Minuman", "Transportasi", "Belanja", "Hiburan", "Kesehatan", "Tagihan & Utilitas", "Gaji & Penghasilan", "Bisnis", "Transfer", "Lainnya"]
}

Jika BUKAN transaksi keuangan, kembalikan:
{
  "is_transaction": false
}

Aturan konversi angka:
- "rb" atau "ribu" atau "k" = x1.000 (contoh: 25rb = 25000, 50k = 50000)
- "jt" atau "juta" = x1.000.000 (contoh: 5jt = 5000000)
- "m" atau "M" bisa = juta (tergantung konteks)

Kembalikan HANYA JSON.`;

  try {
    const { text, model } = await callGeminiWithFallback(prompt, {
      generationConfig: { responseMimeType: 'application/json' }
    });

    console.log(`🤖 Gemini [${model}] parsed transaction:`, text);
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('❌ Gemini parseTransaction error:', error.message);
    return null;
  }
}

/**
 * Generate balasan AI yang personal dan ramah untuk konfirmasi transaksi.
 * 
 * @param {Object} transaction - Data transaksi yang sudah di-parse
 * @param {string} summary - Ringkasan keuangan hari ini
 * @returns {string} - Pesan balasan
 */
async function generateConfirmationReply(transaction, summary) {
  const prompt = `Kamu adalah asisten keuangan pribadi yang ramah dan casual di WhatsApp.

Baru saja mencatat transaksi:
- Tipe: ${transaction.type}
- Jumlah: Rp ${transaction.amount.toLocaleString('id-ID')}
- Deskripsi: ${transaction.description}
- Kategori: ${transaction.category}

Ringkasan hari ini setelah transaksi ini:
${summary}

Buatkan balasan WhatsApp yang:
1. Konfirmasi transaksi sudah tercatat (gunakan emoji yang relevan)
2. Sebutkan ringkasan singkat hari ini (total pengeluaran/pemasukan)
3. Casual dan friendly, seperti teman ngobrol
4. Maksimal 5 baris
5. Bahasa Indonesia informal

Jangan gunakan format markdown asterisks berlebihan, cukup teks biasa dan emoji.`;

  try {
    const { text } = await callGeminiWithFallback(prompt);
    return text;
  } catch (error) {
    console.error('Gemini generateConfirmationReply error:', error.message);
    const emoji = transaction.type === 'pengeluaran' ? '💸' : '💰';
    return `${emoji} Oke! Sudah aku catat ya~\n\n` +
           `📝 ${transaction.type === 'pengeluaran' ? 'Keluar' : 'Masuk'}: Rp ${transaction.amount.toLocaleString('id-ID')}\n` +
           `🏷️ ${transaction.description} (${transaction.category})\n\n` +
           `${summary}`;
  }
}

/**
 * Generate jawaban untuk pertanyaan/query keuangan menggunakan AI.
 * 
 * @param {string} question - Pertanyaan user
 * @param {Array} transactions - Array transaksi dari Google Sheets
 * @returns {string} - Jawaban AI
 */
async function answerFinanceQuery(question, transactions) {
  const txData = transactions.map(tx =>
    `${tx.date} | ${tx.type} | ${tx.category} | ${tx.description} | Rp ${Number(tx.amount).toLocaleString('id-ID')}`
  ).join('\n');

  const prompt = `Kamu adalah asisten keuangan pribadi yang cerdas dan ramah.

User bertanya: "${question}"

Data transaksi yang tersedia:
${txData || '(belum ada transaksi)'}

Jawab pertanyaan user dengan:
1. Analisis data yang ada
2. Hitung total jika perlu
3. Berikan insight berguna jika relevan
4. Bahasa Indonesia informal dan friendly
5. Gunakan emoji yang sesuai
6. Maksimal 10 baris
7. Format sederhana

Jika data kosong, bilang belum ada catatan dan ajak user mulai mencatat.`;

  try {
    const { text } = await callGeminiWithFallback(prompt);
    return text;
  } catch (error) {
    console.error('Gemini answerFinanceQuery error:', error.message);
    return '😅 Maaf, AI lagi sibuk sebentar. Coba tanya lagi ya!';
  }
}

/**
 * Cek apakah pesan adalah pertanyaan/query keuangan.
 * 
 * @param {string} message - Pesan dari user
 * @returns {boolean}
 */
async function isFinanceQuery(message) {
  const keywords = [
    'berapa', 'total', 'laporan', 'ringkasan', 'rekap', 'summary',
    'hari ini', 'minggu ini', 'bulan ini', 'kemarin', 'pengeluaran',
    'pemasukan', 'sisa', 'tabungan', 'kategori', 'terbesar', 'terkecil',
    'rata-rata', 'riwayat', 'histori', 'transaksi'
  ];

  const lowerMsg = message.toLowerCase();
  return keywords.some(kw => lowerMsg.includes(kw)) || lowerMsg.startsWith('/');
}

module.exports = {
  parseTransaction,
  generateConfirmationReply,
  answerFinanceQuery,
  isFinanceQuery
};
