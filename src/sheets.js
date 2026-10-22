const { google } = require('googleapis');
const dayjs = require('dayjs');
require('dayjs/locale/id');
dayjs.locale('id');

// ===== Inisialisasi Google Sheets Auth =====
function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TRANSACTIONS_SHEET = 'Transaksi';  // Nama sheet untuk data transaksi
const SUMMARY_SHEET = 'Ringkasan';        // Nama sheet untuk ringkasan

/**
 * Inisialisasi struktur Google Sheets (header, formatting).
 * Dipanggil sekali saat pertama kali setup.
 */
async function initializeSheet() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Cek apakah sheet sudah ada
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetTitles = spreadsheet.data.sheets.map(s => s.properties.title);

    const requests = [];

    // Buat sheet Transaksi jika belum ada
    if (!sheetTitles.includes(TRANSACTIONS_SHEET)) {
      requests.push({
        addSheet: {
          properties: { title: TRANSACTIONS_SHEET, index: 0 }
        }
      });
    }

    // Buat sheet Ringkasan jika belum ada
    if (!sheetTitles.includes(SUMMARY_SHEET)) {
      requests.push({
        addSheet: {
          properties: { title: SUMMARY_SHEET, index: 1 }
        }
      });
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: { requests }
      });
    }

    // Set header untuk sheet Transaksi
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TRANSACTIONS_SHEET}!A1:G1`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          'Tanggal', 'Waktu', 'Tipe', 'Kategori', 'Deskripsi', 'Jumlah (Rp)', 'ID WhatsApp'
        ]]
      }
    });

    console.log('✅ Google Sheets berhasil diinisialisasi');
    return true;
  } catch (error) {
    console.error('❌ initializeSheet error:', error.message);
    return false;
  }
}

/**
 * Tambahkan transaksi baru ke Google Sheets.
 * 
 * @param {Object} transaction - Data transaksi
 * @param {string} whatsappId - ID pengirim WhatsApp
 * @returns {boolean} - Berhasil atau tidak
 */
async function addTransaction(transaction, whatsappId) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const now = dayjs();
    const row = [
      now.format('YYYY-MM-DD'),       // Tanggal
      now.format('HH:mm:ss'),          // Waktu
      transaction.type,                // Tipe (pengeluaran/pemasukan)
      transaction.category,            // Kategori
      transaction.description,         // Deskripsi
      transaction.amount,              // Jumlah (angka)
      whatsappId                       // ID WhatsApp pengirim
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TRANSACTIONS_SHEET}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [row] }
    });

    console.log(`✅ Transaksi berhasil dicatat: ${transaction.type} Rp${transaction.amount}`);
    return true;
  } catch (error) {
    console.error('❌ addTransaction error:', error.message);
    return false;
  }
}

/**
 * Ambil semua transaksi dari Google Sheets.
 * 
 * @param {string} filterDate - Filter tanggal opsional (YYYY-MM-DD), atau 'week', 'month'
 * @param {string} whatsappId - Filter berdasarkan ID pengirim
 * @returns {Array} - Array transaksi
 */
async function getTransactions(filterDate = null, whatsappId = null) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TRANSACTIONS_SHEET}!A:G`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Hanya header atau kosong

    // Skip header row (index 0)
    const transactions = rows.slice(1).map(row => ({
      date: row[0] || '',
      time: row[1] || '',
      type: row[2] || '',
      category: row[3] || '',
      description: row[4] || '',
      amount: Number(row[5]) || 0,
      whatsappId: row[6] || ''
    }));

    // Filter berdasarkan pengirim
    let filtered = whatsappId
      ? transactions.filter(tx => tx.whatsappId === whatsappId)
      : transactions;

    // Filter berdasarkan tanggal
    if (filterDate) {
      const today = dayjs().format('YYYY-MM-DD');
      if (filterDate === 'today') {
        filtered = filtered.filter(tx => tx.date === today);
      } else if (filterDate === 'week') {
        const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
        filtered = filtered.filter(tx => tx.date >= weekAgo);
      } else if (filterDate === 'month') {
        const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
        filtered = filtered.filter(tx => tx.date >= monthStart);
      } else {
        // Filter spesifik tanggal
        filtered = filtered.filter(tx => tx.date === filterDate);
      }
    }

    return filtered;
  } catch (error) {
    console.error('❌ getTransactions error:', error.message);
    return [];
  }
}

/**
 * Hitung ringkasan keuangan dari array transaksi.
 * 
 * @param {Array} transactions - Array transaksi
 * @returns {Object} - Ringkasan keuangan
 */
function calculateSummary(transactions) {
  const totalPemasukan = transactions
    .filter(tx => tx.type === 'pemasukan')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalPengeluaran = transactions
    .filter(tx => tx.type === 'pengeluaran')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const saldo = totalPemasukan - totalPengeluaran;

  // Grouping per kategori (pengeluaran saja)
  const byCategory = {};
  transactions
    .filter(tx => tx.type === 'pengeluaran')
    .forEach(tx => {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount;
    });

  return {
    totalPemasukan,
    totalPengeluaran,
    saldo,
    byCategory,
    count: transactions.length
  };
}

/**
 * Dapatkan ringkasan harian dalam format teks.
 * 
 * @param {string} whatsappId - ID pengirim WhatsApp
 * @returns {string} - Teks ringkasan
 */
async function getDailySummaryText(whatsappId) {
  const todayTransactions = await getTransactions('today', whatsappId);
  const summary = calculateSummary(todayTransactions);

  let text = `📊 Hari ini:\n`;
  text += `💰 Masuk: Rp ${summary.totalPemasukan.toLocaleString('id-ID')}\n`;
  text += `💸 Keluar: Rp ${summary.totalPengeluaran.toLocaleString('id-ID')}\n`;
  text += `💼 Saldo: Rp ${summary.saldo.toLocaleString('id-ID')}`;

  return text;
}

module.exports = {
  initializeSheet,
  addTransaction,
  getTransactions,
  calculateSummary,
  getDailySummaryText
};
