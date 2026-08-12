const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Storage en memoria (en producción sería una base de datos)
const cardDatabase = new Map();

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/card-data - Guardar datos de tarjeta
app.post('/api/card-data', (req, res) => {
  try {
    const data = req.body;
    const cardId = data.cardId || 'current-card';

    if (!data.cardNumber) {
      return res.status(400).json({ error: 'Card number is required' });
    }

    // Guardar en base de datos (en memoria)
    cardDatabase.set(cardId, {
      ...data,
      timestamp: new Date().toISOString(),
      updatedAt: Date.now(),
      server: 'backend'
    });

    console.log(`✅ Tarjeta guardada: ${cardId}`);
    res.json({
      success: true,
      message: 'Datos guardados en servidor',
      cardId
    });
  } catch (error) {
    console.error('❌ Error guardando:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/card-data - Obtener datos de tarjeta
app.get('/api/card-data', (req, res) => {
  try {
    const cardId = req.query.id || 'current-card';
    const data = cardDatabase.get(cardId);

    if (!data) {
      return res.status(404).json({ error: 'No data found' });
    }

    console.log(`✅ Tarjeta obtenida: ${cardId}`);
    res.json(data);
  } catch (error) {
    console.error('❌ Error obteniendo:', error);
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

// Keep-alive para Render (prevenir que se apague por inactividad)
// Hacer un self-ping cada 10 minutos para mantener el servidor activo
setInterval(() => {
  const url = `http://localhost:${PORT}/api/health`;

  fetch(url)
    .then(res => {
      if (res.ok) {
        console.log(`✅ [Keep-Alive] Ping exitoso - ${new Date().toISOString()}`);
      }
    })
    .catch(err => {
      console.error('❌ [Keep-Alive] Error:', err.message);
    });
}, 10 * 60 * 1000); // 10 minutos

console.log('⏰ Keep-alive activado cada 10 minutos');
