const express = require('express');
const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch');
const { fetchWithCustomReferer } = require('./fetchWithCustomReferer');
const { rewritePlaylistUrls } = require('./rewritePlaylistUrls');
const NodeCache = require('node-cache');
const morgan = require('morgan');
const helmet = require('helmet');
const { cleanEnv, str, num } = require('envalid');

// ==========================================
// ENVIRONMENT VARIABLES (PRIMEIRO!)
// ==========================================
const env = cleanEnv(process.env, {
  PORT: num({ default: 3000 }),
  ALLOWED_ORIGINS: str({ default: "*" }),
REFERER_URL: str({ default: "https://aniwatch.to" })
});

// ==========================================
// CRIAR APP (SEGUNDO!)
// ==========================================
const app = express();
const PORT = env.PORT;

// Initialize cache with a TTL of 10 minutes (600 seconds)
const cache = new NodeCache({ stdTTL: 600 });

// ==========================================
// CORS MIDDLEWARE (TERCEIRO!)
// ==========================================
app.use((req, res, next) => {
  // ✅ CORS SIMPLES E FUNCIONAL
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, Accept, Origin, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// ==========================================
// OUTROS MIDDLEWARES
// ==========================================

// Logging middleware
app.use(morgan('dev'));

// ✅ Security headers - CSP DESABILITADO PARA COMPATIBILIDADE
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Desabilitar CSP que bloqueia scripts
}));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '../public')));
// ==========================================
// HOME PAGE
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>YayaAnimes Proxy</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          text-align: center;
          max-width: 600px;
        }
        h1 { margin: 0 0 20px 0; font-size: 36px; }
        p { margin: 10px 0; opacity: 0.9; }
        code {
          background: rgba(0, 0, 0, 0.3);
          padding: 4px 8px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
        }
        .status {
          display: inline-block;
          background: #4ade80;
          color: #000;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎬 YayaAnimes Proxy</h1>
        <p><span class="status">✅ ONLINE</span></p>
        <p>Proxy de streaming M3U8 para <strong>YayaAnimes</strong></p>
        <p>Endpoint: <code>/api/v1/streamingProxy?url=YOUR_M3U8_URL</code></p>
        <p style="margin-top: 30px; font-size: 12px; opacity: 0.7;">
          Desenvolvido para bypass de CORS e otimização de streaming
        </p>
      </div>
    </body>
    </html>
  `);
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cacheStats: cache.getStats()
  });
});

// ==========================================
// PROXY ENDPOINT
// ==========================================
app.get('/api/v1/streamingProxy', async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    
    if (!url) {
      return res.status(400).json({ 
        error: "URL parameter is required",
        usage: "/api/v1/streamingProxy?url=YOUR_M3U8_URL"
      });
    }

    // Validar URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    // Check cache
    const cachedResponse = cache.get(url);
    if (cachedResponse) {
      console.log(`✅ Cache HIT: ${url.substring(0, 80)}...`);
      
      const isM3U8 = url.endsWith(".m3u8");
      res.set({
        "Content-Type": isM3U8 ? "application/vnd.apple.mpegurl" : "video/mp2t",
        "Cache-Control": isM3U8 ? "public, max-age=600" : "public, max-age=31536000",
        "X-Cache": "HIT"
      });
      
      return res.status(200).send(cachedResponse);
    }

    console.log(`📡 Fetching: ${url.substring(0, 80)}...`);
    const response = await fetchWithCustomReferer(url, env.REFERER_URL);
    const isM3U8 = url.endsWith(".m3u8");

    if (!response.ok) {
      console.error(`❌ Fetch failed: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: response.statusText,
        status: response.status,
        url: url.substring(0, 100)
      });
    }

    if (isM3U8) {
      const playlistText = await response.text();
      const modifiedPlaylist = rewritePlaylistUrls(playlistText, url);

      cache.set(url, modifiedPlaylist);
      console.log(`💾 Cached M3U8: ${url.substring(0, 80)}...`);

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=600",
        "X-Cache": "MISS"
      });
      return res.send(modifiedPlaylist);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      cache.set(url, buffer);
      console.log(`💾 Cached TS segment: ${url.substring(0, 80)}...`);

      res.set({
        "Content-Type": "video/mp2t",
        "Cache-Control": "public, max-age=31536000",
        "X-Cache": "MISS"
      });
      return res.send(buffer);
    }
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    return res.status(500).json({ 
      error: "Failed to fetch data",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================
// CACHE STATS
// ==========================================
app.get('/api/v1/cache/stats', (req, res) => {
  res.json({
    stats: cache.getStats(),
    keys: cache.keys().length
  });
});

// ==========================================
// CLEAR CACHE
// ==========================================
app.get('/api/v1/cache/clear', (req, res) => {
  cache.flushAll();
  res.json({ 
    success: true, 
    message: 'Cache cleared',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ 
    error: "Something went wrong!",
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    availableEndpoints: [
      '/',
      '/health',
      '/api/v1/streamingProxy?url=YOUR_URL',
      '/api/v1/cache/stats',
      '/api/v1/cache/clear'
    ]
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log('==========================================');
  console.log(`🚀 YayaAnimes Proxy Server`);
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`🌐 Allowed origins: *`);
  console.log(`🔗 Proxy endpoint: /api/v1/streamingProxy?url=YOUR_URL`);
  console.log('==========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  cache.flushAll();
  process.exit(0);
});
