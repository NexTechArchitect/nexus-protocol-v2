const { execSync } = require('child_process');
require('dotenv').config();

const PRICE_KEEPER = '0x481EC593F7bD9aB4219a0d0A185C16F2687871C2';
const RPC = 'https://services.polkadothub-rpc.com/testnet';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function getPrices() {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
  const data = await res.json();
  return { btc: data.bitcoin.usd, eth: data.ethereum.usd };
}

function toWei18(price) {
  return BigInt(Math.round(price * 1e10)) * BigInt(1e8) + '';
}

async function update() {
  try {
    const { btc, eth } = await getPrices();
    console.log(`[${new Date().toISOString()}] BTC: $${btc} | ETH: $${eth}`);
    execSync(`cast send ${PRICE_KEEPER} "updateAllPrices(int256,int256)" ${toWei18(btc)} ${toWei18(eth)} --rpc-url ${RPC} --private-key ${PRIVATE_KEY} --legacy`, { stdio: 'inherit' });
    console.log('Prices updated!');
  } catch (e) {
    if (e.message.includes('Too frequent')) {
      console.log('Cooldown active, skipping...');
    } else {
      console.error('Error:', e.message.slice(0, 100));
    }
  }
}

console.log('Price keeper started — every 10 min');
update();
setInterval(update, 10 * 60 * 1000);
