require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { handleIncomingMessage } = require('./messageHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse form-encoded body (Twilio sends this format)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WA Finance Bot is running! 💰',
    timestamp: new Date().toISOString()
  });
});

// Twilio WhatsApp webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const from = req.body.From;       // e.g., "whatsapp:+6281234567890"
    const body = req.body.Body || ''; // Pesan masuk dari user

    console.log(`[${new Date().toISOString()}] Pesan dari ${from}: ${body}`);

    // Proses pesan dan dapat balasan
    const replyMessage = await handleIncomingMessage(from, body.trim());

    // Kirim balasan via Twilio TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(replyMessage)}</Message>
</Response>`;

    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Webhook error:', error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Maaf, ada error teknis. Coba lagi ya! 🙏</Message>
</Response>`;
    res.type('text/xml').send(errorTwiml);
  }
});

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.listen(PORT, () => {
  console.log(`🚀 WA Finance Bot berjalan di port ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
});
