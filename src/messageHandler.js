const dayjs = require('dayjs');
require('dayjs/locale/id');
dayjs.locale('id');

const {
  parseTransaction,
  generateConfirmationReply,
  answerFinanceQuery,
  isFinanceQuery
} = require('./gemini');

const {
  initializeSheet,
  addTransaction,
  getTransactions,
  calculateSummary,
  getDailySummaryText
} = require('./sheets');

// Inisialisasi sheet saat pertama kali modul dimuat
let isSheetInitialized = false;
async function ensureSheetInitialized() {
  if (!isSheetInitialized) {
    isSheetInitialized = await initializeSheet();
  }
}

// ===== Slash Commands Handler =====
const COMMANDS = {
  '/help': handleHelp,
  '/laporan': handleLaporan,
  '/hari': handleHari,
  '/minggu': handleMinggu,
  '/bulan': handleBulan,
  '/kategori': handleKategori,
};

/**
 * Handler utama untuk semua pesan masuk dari WhatsApp.
 * 
 * @param {string} from - Nomor WA pengirim (format: whatsapp:+62xxx)
 * @param {string} message - Isi pesan
 * @returns {string} - Pesan balasan
 */
async function handleIncomingMessage(from, message) {
  await ensureSheetInitialized();

  if (!message || message.length === 0) {
    return '❓ Halo! Kirim pesan untuk mencatat transaksi atau ketik /help untuk bantuan.';
  }

  // Cek slash commands
  const commandKey = Object.keys(COMMANDS).find(cmd =>
    message.toLowerCase().startsWith(cmd)
  );

  if (commandKey) {
    return await COMMANDS[commandKey](from, message);
  }

  // Cek apakah ini query keuangan (pertanyaan tentang keuangan)
  const isQuery = await isFinanceQuery(message);
  if (isQuery) {
    return await handleFinanceQuery(from, message);
  }

  // Coba parse sebagai transaksi
  return await handleTransactionInput(from, message);
}

// ===== Transaction Handler =====
async function handleTransactionInput(from, message) {
  const today = dayjs().format('YYYY-MM-DD');

  // Parse pesan dengan AI
  const parsed = await parseTransaction(message, today);

  if (!parsed || parsed.is_transaction === false) {
    // Bukan transaksi - coba jawab sebagai percakapan umum
    return await handleGeneralChat(message);
  }

  // Simpan ke Google Sheets
  const saved = await addTransaction(parsed, from);

  if (!saved) {
    return '❌ Gagal menyimpan ke Google Sheets. Pastikan konfigurasi sudah benar. Coba lagi ya!';
  }

  // Dapatkan ringkasan hari ini
  const summaryText = await getDailySummaryText(from);

  // Generate balasan konfirmasi yang personal
  const reply = await generateConfirmationReply(parsed, summaryText);

  return reply;
}

// ===== Finance Query Handler =====
async function handleFinanceQuery(from, message) {
  const lowerMsg = message.toLowerCase();

  // Tentukan range waktu dari pesan
  let filterDate = 'today';
  if (lowerMsg.includes('minggu ini') || lowerMsg.includes('seminggu')) {
    filterDate = 'week';
  } else if (lowerMsg.includes('bulan ini') || lowerMsg.includes('sebulan')) {
    filterDate = 'month';
  } else if (lowerMsg.includes('kemarin')) {
    filterDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  }

  const transactions = await getTransactions(filterDate, from);
  const reply = await answerFinanceQuery(message, transactions);
  return reply;
}

// ===== General Chat Handler =====
async function handleGeneralChat(message) {
  const greetings = ['halo', 'hai', 'hi', 'hello', 'hei', 'oi', 'hey'];
  const lowerMsg = message.toLowerCase().trim();

  if (greetings.some(g => lowerMsg === g || lowerMsg.startsWith(g + ' '))) {
    return `Halo! 👋 Aku asisten keuangan kamu di WA!\n\n` +
      `💡 Kamu bisa langsung cerita pengeluaran atau pemasukan, contoh:\n` +
      `• "makan siang 25rb"\n` +
      `• "gaji masuk 5jt"\n` +
      `• "bensin 50k"\n\n` +
      `Ketik /help untuk lihat semua perintah ya! 😊`;
  }

  return `🤔 Aku kurang ngerti maksudnya.\n\n` +
    `Kalau mau catat transaksi, contohnya:\n` +
    `• "makan siang 25rb"\n` +
    `• "transfer ke teman 100k"\n\n` +
    `Atau ketik /help untuk bantuan lebih lanjut!`;
}

// ===== Slash Command Handlers =====
async function handleHelp(from, message) {
  return `🤖 *WA Finance Bot* - Panduan Penggunaan\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📝 CATAT TRANSAKSI\n` +
    `Langsung ketik aja, contoh:\n` +
    `• "makan siang 25rb"\n` +
    `• "gaji masuk 5jt"\n` +
    `• "beli bensin 50k"\n` +
    `• "bayar listrik 200ribu"\n` +
    `• "dapat bonus 1jt"\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📊 PERINTAH\n` +
    `• /hari - Laporan hari ini\n` +
    `• /minggu - Laporan minggu ini\n` +
    `• /bulan - Laporan bulan ini\n` +
    `• /kategori - Pengeluaran per kategori\n` +
    `• /laporan - Ringkasan lengkap\n` +
    `• /help - Tampilkan bantuan ini\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `💬 TANYA AI\n` +
    `• "pengeluaran hari ini berapa?"\n` +
    `• "kategori apa yang paling banyak?"\n` +
    `• "sisa saldo bulan ini?"\n\n` +
    `Semua data tersimpan otomatis di Google Sheets! 📈`;
}

async function handleHari(from, message) {
  const transactions = await getTransactions('today', from);
  return formatDailyReport(transactions, 'Hari Ini');
}

async function handleMinggu(from, message) {
  const transactions = await getTransactions('week', from);
  return formatPeriodReport(transactions, 'Minggu Ini (7 Hari Terakhir)');
}

async function handleBulan(from, message) {
  const transactions = await getTransactions('month', from);
  const monthName = dayjs().format('MMMM YYYY');
  return formatPeriodReport(transactions, `Bulan ${monthName}`);
}

async function handleKategori(from, message) {
  const transactions = await getTransactions('month', from);
  const summary = calculateSummary(transactions);

  if (Object.keys(summary.byCategory).length === 0) {
    return '📂 Belum ada data kategori bulan ini.\n\nMulai catat pengeluaranmu ya!';
  }

  // Urutkan kategori dari terbesar
  const sortedCategories = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1]);

  let reply = `📂 Pengeluaran per Kategori (Bulan Ini)\n`;
  reply += `━━━━━━━━━━━━━━━\n`;

  sortedCategories.forEach(([category, amount], index) => {
    const percentage = ((amount / summary.totalPengeluaran) * 100).toFixed(1);
    const emoji = getCategoryEmoji(category);
    reply += `${index + 1}. ${emoji} ${category}\n`;
    reply += `   Rp ${amount.toLocaleString('id-ID')} (${percentage}%)\n`;
  });

  reply += `━━━━━━━━━━━━━━━\n`;
  reply += `💸 Total: Rp ${summary.totalPengeluaran.toLocaleString('id-ID')}`;

  return reply;
}

async function handleLaporan(from, message) {
  const [todayTx, weekTx, monthTx] = await Promise.all([
    getTransactions('today', from),
    getTransactions('week', from),
    getTransactions('month', from)
  ]);

  const today = calculateSummary(todayTx);
  const month = calculateSummary(monthTx);
  const monthName = dayjs().format('MMMM YYYY');

  let reply = `📊 *Laporan Keuangan Lengkap*\n`;
  reply += `━━━━━━━━━━━━━━━\n\n`;

  reply += `🗓️ *HARI INI*\n`;
  reply += `💰 Masuk: Rp ${today.totalPemasukan.toLocaleString('id-ID')}\n`;
  reply += `💸 Keluar: Rp ${today.totalPengeluaran.toLocaleString('id-ID')}\n`;
  reply += `📝 Transaksi: ${today.count} item\n\n`;

  reply += `📅 *${monthName.toUpperCase()}*\n`;
  reply += `💰 Masuk: Rp ${month.totalPemasukan.toLocaleString('id-ID')}\n`;
  reply += `💸 Keluar: Rp ${month.totalPengeluaran.toLocaleString('id-ID')}\n`;
  reply += `💼 Saldo: Rp ${month.saldo.toLocaleString('id-ID')}\n`;
  reply += `📝 Transaksi: ${month.count} item\n\n`;

  if (Object.keys(month.byCategory).length > 0) {
    const topCategory = Object.entries(month.byCategory)
      .sort((a, b) => b[1] - a[1])[0];
    reply += `🏆 Pengeluaran terbesar: ${topCategory[0]}\n`;
    reply += `   Rp ${topCategory[1].toLocaleString('id-ID')}\n\n`;
  }

  reply += `━━━━━━━━━━━━━━━\n`;
  reply += `📈 Detail lengkap ada di Google Sheets!`;

  return reply;
}

// ===== Helper Functions =====
function formatDailyReport(transactions, title) {
  if (transactions.length === 0) {
    return `📊 ${title}\n\nBelum ada transaksi. Mulai catat ya!\n\nContoh: "makan siang 25rb"`;
  }

  const summary = calculateSummary(transactions);

  let reply = `📊 *${title}*\n`;
  reply += `━━━━━━━━━━━━━━━\n`;
  reply += `💰 Masuk: Rp ${summary.totalPemasukan.toLocaleString('id-ID')}\n`;
  reply += `💸 Keluar: Rp ${summary.totalPengeluaran.toLocaleString('id-ID')}\n`;
  reply += `💼 Saldo: Rp ${summary.saldo.toLocaleString('id-ID')}\n`;
  reply += `━━━━━━━━━━━━━━━\n`;

  // Tampilkan transaksi terakhir (maks 5)
  const recent = transactions.slice(-5).reverse();
  reply += `📝 Transaksi Terakhir:\n`;
  recent.forEach(tx => {
    const emoji = tx.type === 'pengeluaran' ? '💸' : '💰';
    reply += `${emoji} ${tx.description}: Rp ${tx.amount.toLocaleString('id-ID')}\n`;
  });

  if (transactions.length > 5) {
    reply += `... dan ${transactions.length - 5} transaksi lainnya`;
  }

  return reply;
}

function formatPeriodReport(transactions, title) {
  if (transactions.length === 0) {
    return `📊 ${title}\n\nBelum ada transaksi di periode ini.`;
  }

  const summary = calculateSummary(transactions);

  let reply = `📊 *${title}*\n`;
  reply += `━━━━━━━━━━━━━━━\n`;
  reply += `💰 Total Masuk: Rp ${summary.totalPemasukan.toLocaleString('id-ID')}\n`;
  reply += `💸 Total Keluar: Rp ${summary.totalPengeluaran.toLocaleString('id-ID')}\n`;
  reply += `💼 Saldo: Rp ${summary.saldo.toLocaleString('id-ID')}\n`;
  reply += `📝 Total Transaksi: ${summary.count} item\n`;
  reply += `━━━━━━━━━━━━━━━\n`;

  // Top 3 pengeluaran kategori
  const topCategories = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topCategories.length > 0) {
    reply += `🏆 Top Pengeluaran:\n`;
    topCategories.forEach(([cat, amt], i) => {
      const emoji = getCategoryEmoji(cat);
      reply += `${i + 1}. ${emoji} ${cat}: Rp ${amt.toLocaleString('id-ID')}\n`;
    });
  }

  return reply;
}

function getCategoryEmoji(category) {
  const emojiMap = {
    'Makanan & Minuman': '🍜',
    'Transportasi': '🚗',
    'Belanja': '🛍️',
    'Hiburan': '🎮',
    'Kesehatan': '💊',
    'Tagihan & Utilitas': '⚡',
    'Gaji & Penghasilan': '💼',
    'Bisnis': '📈',
    'Transfer': '🔄',
    'Lainnya': '📌'
  };
  return emojiMap[category] || '💰';
}

module.exports = { handleIncomingMessage };
