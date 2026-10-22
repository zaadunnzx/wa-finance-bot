require('dotenv').config();
const { handleIncomingMessage } = require('./src/messageHandler');

async function test() {
  console.log('🚀 Testing incoming message: "makan siang 25rb"...');
  const res = await handleIncomingMessage('whatsapp:+6285940813783', 'makan siang 25rb');
  console.log('\n💬 Bot Reply:\n------------------');
  console.log(res);
  console.log('------------------');
}

test();
