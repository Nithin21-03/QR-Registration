import app from './app.js';

const PORT = process.env.PORT || 5001;

// Start Server explicitly on 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ======================================================
  ⚡ ZYNTRA '26 PASS & FOOD SCANNER SERVER
  ======================================================
  🛰️  Local Port:      http://0.0.0.0:${PORT}
  📡  API Health:      http://localhost:${PORT}/api/health
  📊  Live Analytics:  http://localhost:${PORT}/api/stats
  📇  Database:        Supabase PostgreSQL
  🔒  Security Gate:   HMAC Token & Rate Limiting ACTIVE
  ======================================================
  `);
});
