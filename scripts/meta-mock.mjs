import http from 'node:http';

const PORT = parseInt(process.env.META_MOCK_PORT || '4200', 10);
const WEBHOOK_URL = process.env.META_WEBHOOK_URL || 'http://localhost:3000/api/whatsapp/webhook';
const PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || '1227269900473334';

const mensagens = [];
const medias = new Map();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function registrarMensagem(m) {
  mensagens.push(m);
  return m;
}

async function entregarWebhook(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 300) };
  } catch (err) {
    return { status: 0, body: `erro de rede: ${err.message}` };
  }
}

function payloadMeta({ from, name, phoneNumberId, message }) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'MOCK_WABA_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000000',
                phone_number_id: phoneNumberId,
              },
              contacts: [{ profile: { name: name || 'Cliente Teste' }, wa_id: from }],
              messages: [message],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

function parseUrl(url) {
  return new URL(url, `http://localhost:${PORT}`);
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = parseUrl(req.url || '/');
  const parts = u.pathname.split('/').filter(Boolean);
  const method = req.method;

  // ---- Chamadas de saida do backend para o Graph API ----
  // POST /v22.0/:phoneNumberId/messages
  if (method === 'POST' && parts.length === 3 && parts[2] === 'messages') {
    const body = await lerBody(req);
    if (body.status === 'read') {
      json(res, 200, { success: true });
      return;
    }
    const msgId = 'wamid.MOCK.' + Date.now();
    if (body.type === 'text' && body.text) {
      registrarMensagem({ id: msgId, direction: 'out', phone: body.to, type: 'text', body: body.text.body, ts: Date.now() });
      log(`[META] --> BOT enviou para ${body.to}: "${body.text.body}"`);
    } else if (body.type === 'image') {
      const legenda = body.image?.caption || '';
      const link = body.image?.link || body.image?.id || '';
      registrarMensagem({ id: msgId, direction: 'out', phone: body.to, type: 'image', body: `[IMAGEM] ${link}${legenda ? ` | legenda: "${legenda}"` : ''}`, ts: Date.now() });
      log(`[META] --> BOT enviou IMAGEM para ${body.to}: ${link}${legenda ? ` | legenda: "${legenda}"` : ''}`);
    } else if (body.type === 'interactive') {
      const botoes = (body.interactive?.action?.buttons || [])
        .map((b) => b.reply?.title)
        .filter(Boolean)
        .join(' | ');
      const texto = body.interactive?.body?.text || '';
      registrarMensagem({ id: msgId, direction: 'out', phone: body.to, type: 'interactive', body: botoes ? `${texto} [${botoes}]` : texto, ts: Date.now() });
      log(`[META] --> BOT enviou interativo para ${body.to}: ${texto}`);
    } else {
      log(`[META] --> BOT enviou tipo nao tratado: ${body.type}`);
    }
    json(res, 200, { messaging_product: 'whatsapp', messages: [{ id: msgId }] });
    return;
  }

  // POST /v22.0/:phoneNumberId/whatsapp_business_profile
  if (method === 'POST' && parts.length === 3 && parts[2] === 'whatsapp_business_profile') {
    await lerBody(req);
    json(res, 200, { success: true });
    return;
  }

  // ---- Simulacao: cliente envia mensagem para o bot ----
  // POST /simulate/send { from, name?, text? | type:'interactive', interactive }
  if (method === 'POST' && parts[0] === 'simulate' && parts[1] === 'send') {
    const body = await lerBody(req);
    const from = body.from || '5511999999999';
    const phoneNumberId = body.phoneNumberId || PHONE_NUMBER_ID;
    const ts = String(Date.now());
    const id = 'wamid.MOCK.' + ts;

    let message;
    if (body.type === 'interactive') {
      message = { from, id, timestamp: ts, type: 'interactive', interactive: body.interactive };
    } else if (body.type === 'audio') {
      const mediaId = 'wamid.MEDIA.' + ts;
      medias.set(mediaId, { data: body.audioBase64 || '', mimeType: body.mimeType || 'audio/mp3' });
      message = { from, id, timestamp: ts, type: 'audio', audio: { id: mediaId, mime_type: body.mimeType || 'audio/mp3' } };
    } else {
      message = { from, id, timestamp: ts, type: 'text', text: { body: body.text || '' } };
    }

    const textoExibido = body.type === 'audio'
      ? '[audio]'
      : (body.text || body.interactive?.button_reply?.title || body.interactive?.list_reply?.title || '');
    registrarMensagem({ id, direction: 'in', phone: from, type: message.type, body: textoExibido, ts: Date.now() });
    log(`[META] <-- CLIENTE ${from} enviou: "${textoExibido}"`);

    const result = await entregarWebhook(payloadMeta({ from, name: body.name, phoneNumberId, message }));
    log(`[META] webhook do backend respondeu ${result.status}`);
    json(res, 200, { entregue: true, webhook: result });
    return;
  }

  // ---- Simulacao: Meta verifica o webhook (GET) ----
  // GET /simulate/verify
  if (method === 'GET' && parts[0] === 'simulate' && parts[1] === 'verify') {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'api-walker-salgados';
    const challenge = 'CHALLENGE_' + Date.now();
    const url = `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`;
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      json(res, 200, { esperado: challenge, retornado: text, match: text === challenge, status: resp.status });
    } catch (err) {
      json(res, 500, { erro: err.message });
    }
    return;
  }

  // GET /conversations  |  GET /conversations/:phone
  if (method === 'GET' && parts[0] === 'conversations') {
    const phone = parts[1];
    const lista = phone ? mensagens.filter((m) => m.phone === phone) : mensagens;
    json(res, 200, lista);
    return;
  }

  // DELETE /conversations
  if (method === 'DELETE' && parts[0] === 'conversations') {
    mensagens.length = 0;
    json(res, 200, { ok: true });
    return;
  }

  // ---- Midias (audio) simuladas ----
  // GET /v22.0/:mediaId -> info da media (o backend chama para descobrir a URL)
  if (method === 'GET' && parts.length === 2 && parts[0] === 'v22.0' && parts[1].startsWith('wamid.MEDIA')) {
    const mediaId = parts[1];
    const m = medias.get(mediaId);
    if (!m) {
      json(res, 404, { error: `media nao encontrada: ${mediaId}` });
      return;
    }
    json(res, 200, { url: `http://localhost:${PORT}/media/${mediaId}`, mime_type: m.mimeType });
    return;
  }

  // GET /media/:mediaId -> bytes da media (o backend baixa aqui)
  if (method === 'GET' && parts.length === 2 && parts[0] === 'media') {
    const mediaId = parts[1];
    const m = medias.get(mediaId);
    if (!m) {
      json(res, 404, { error: `media nao encontrada: ${mediaId}` });
      return;
    }
    const buf = Buffer.from(m.data, 'base64');
    log(`[META] servindo media ${mediaId} (${buf.length} bytes, ${m.mimeType})`);
    res.writeHead(200, { 'Content-Type': m.mimeType });
    res.end(buf);
    return;
  }

  json(res, 404, { erro: `rota nao encontrada: ${method} ${req.url}` });
});

server.listen(PORT, () => {
  log(`[MOCK-META] ouvindo em http://localhost:${PORT}`);
  log(`[MOCK-META] webhook do backend: ${WEBHOOK_URL}`);
  log(`[MOCK-META] phoneNumberId padrao: ${PHONE_NUMBER_ID}`);
  log(`[MOCK-META] POST /simulate/send     -> simula cliente enviando mensagem`);
  log(`[MOCK-META] GET  /simulate/verify   -> testa a verificacao do webhook`);
  log(`[MOCK-META] GET  /conversations     -> lista mensagens gravadas`);
  log(`[MOCK-META] DELETE /conversations   -> limpa o historico`);
});
