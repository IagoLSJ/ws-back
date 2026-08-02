import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

const MOCK = process.env.META_MOCK_URL || 'http://localhost:4200';
const phone = process.argv[2] || '5511999999999';
const nome = process.argv[3] || 'Cliente Teste';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('=== Simulador de chat WhatsApp ===');
console.log(`cliente: ${phone} (${nome})`);
console.log(`mock:    ${MOCK}`);
console.log("digite uma mensagem e ENTER | 'sair' para encerrar | 'audio <caminho/arquivo>' para enviar audio");
console.log('');

const vistos = new Set();
let ativo = true;

async function enviar(payload) {
  try {
    const res = await fetch(`${MOCK}/simulate/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: phone, name: nome, ...payload }),
    });
    const data = await res.json();
    if (data?.webhook?.status && data.webhook.status >= 400) {
      console.log(`  !! webhook respondeu ${data.webhook.status}: ${data.webhook.body}`);
    }
  } catch (err) {
    console.log(`  !! erro ao enviar: ${err.message} (mock rodando? use: npm run mock:meta)`);
  }
}

async function poll() {
  if (!ativo) return;
  try {
    const res = await fetch(`${MOCK}/conversations/${phone}`);
    const msgs = await res.json();
    for (const m of msgs) {
      if (m.direction === 'out' && !vistos.has(m.id)) {
        vistos.add(m.id);
        console.log(`\nBOT: ${m.body}\n`);
      }
    }
  } catch {
    // mock indisponivel - tenta de novo
  }
}

setInterval(poll, 1000);

rl.on('line', async (line) => {
  const texto = line.trim();
  if (!texto) return;
  if (texto.toLowerCase() === 'sair') {
    ativo = false;
    console.log('encerrando...');
    rl.close();
    process.exit(0);
  }
  if (texto.toLowerCase().startsWith('audio ')) {
    const arquivo = texto.slice(6).trim();
    try {
      const data = fs.readFileSync(path.resolve(arquivo));
      const mime = arquivo.toLowerCase().endsWith('.ogg') ? 'audio/ogg' : arquivo.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mp3';
      console.log(`\nVOCE (${phone}): [audio ${arquivo} (${data.length} bytes)]`);
      await enviar({ type: 'audio', audioBase64: data.toString('base64'), mimeType: mime });
    } catch (err) {
      console.log(`  !! erro ao ler audio: ${err.message}`);
    }
    return;
  }
  console.log(`\nVOCE (${phone}): ${texto}`);
  await enviar({ text: texto });
});
