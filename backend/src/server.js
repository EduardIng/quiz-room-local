/**
 * server.js - Головний сервер Quiz Room Auto
 *
 * Відповідає за:
 * - Ініціалізацію Express (HTTP сервер)
 * - Ініціалізацію Socket.IO (WebSocket сервер)
 * - Налаштування middleware (CORS, JSON, статичні файли)
 * - HTTP маршрути (API ендпоінти)
 * - Запуск та graceful shutdown
 *
 * Запуск:
 *   node backend/src/server.js
 *   або: npm start
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { loadConfig, log } = require('./utils');
const QuizRoomManager = require('./websocket-handler-auto');
const db = require('./db');
const { loadAllQuizzes, saveQuiz, deleteQuiz } = require('./quiz-storage');
const qrcode = require('qrcode');

class QuizServer {
  /**
   * Ініціалізує сервер
   * Завантажує конфігурацію та готує все до запуску
   */
  constructor() {
    // Завантажуємо конфігурацію з config.json (або defaults)
    this.config = loadConfig();

    // Ініціалізуємо Express
    this.app = express();

    // Створюємо HTTP сервер на основі Express
    // Socket.IO потребує сирий HTTP сервер (не Express напряму)
    this.httpServer = http.createServer(this.app);

    // Ініціалізуємо Socket.IO на HTTP сервері
    this.io = new SocketIOServer(this.httpServer, {
      // CORS для дозволу підключень з планшетів/телефонів в мережі
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Ініціалізуємо менеджер WebSocket кімнат
    this.roomManager = new QuizRoomManager(this.io, this.config);

    // Прапорець що сервер запущений
    this.isRunning = false;
  }

  /**
   * Налаштовує всі Express middleware
   *
   * Додає:
   * - Body parser для JSON (читання request body)
   * - CORS для доступу з інших пристроїв в мережі
   * - Static files для фронтенду
   * - Request logging
   *
   * Викликається один раз при старті сервера
   */
  setupMiddleware() {
    // Body parser - дозволяє читати JSON з request body
    this.app.use(express.json());

    // CORS - дозволяє планшетам і телефонам підключатись з інших IP в мережі
    this.app.use(cors());

    // Логування кожного HTTP запиту (для дебагу)
    this.app.use((req, res, next) => {
      log('HTTP', `${req.method} ${req.path}`);
      next();
    });

    // Статичні файли фронтенду
    // Спочатку шукаємо в build/ (production), потім в public/
    const buildPath = path.join(__dirname, '..', '..', 'frontend', 'build');
    const publicPath = path.join(__dirname, '..', '..', 'frontend', 'public');

    this.app.use(express.static(buildPath));
    this.app.use(express.static(publicPath));
  }

  /**
   * Налаштовує HTTP маршрути (REST API ендпоінти)
   *
   * Маршрути:
   * - GET /health - перевірка стану сервера
   * - GET /api/active-quizzes - список активних квіз-кімнат
   * - GET /* - відправляємо index.html для SPA фронтенду
   *
   * Викликається після setupMiddleware()
   */
  setupRoutes() {
    // Health check - перевірка чи сервер живий
    // Корисно для моніторингу та automated tests
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        activeSessions: this.roomManager.sessions.size,
        timestamp: new Date().toISOString()
      });
    });

    // API: поточна активна кімната (kiosk mode)
    // Планшети викликають цей ендпоінт при завантаженні щоб знайти активну гру
    // Повертає { roomCode: "XXXXXX" } або { roomCode: null } якщо немає гри
    this.app.get('/api/current-room', (req, res) => {
      const roomCode = this.roomManager.getCurrentRoom();
      res.json({ success: true, roomCode: roomCode || null });
    });

    // API: роздача локальних медіафайлів (зображення, аудіо для офлайн квізів)
    // Захищено від path traversal через path.basename()
    // defaultMediaPath використовується лише у production; тести перевизначають через TEST_MEDIA_DIR
    const defaultMediaPath = path.join(__dirname, '..', '..', 'media');
    const getMediaPath = () => process.env.TEST_MEDIA_DIR || defaultMediaPath;

    // API: список медіафайлів у папці media/ (зображення)
    // GET /api/media — повертає масив об'єктів { filename, url, size }
    // ВАЖЛИВО: цей маршрут має бути до GET /api/media/:filename,
    //          інакше Express сприйме "media" як параметр :filename
    this.app.get('/api/media', (_req, res) => {
      try {
        const mediaPath = getMediaPath();
        if (!fs.existsSync(mediaPath)) return res.json({ files: [] });
        const files = fs.readdirSync(mediaPath)
          .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
          .map(f => ({
            filename: f,
            url: `/api/media/${f}`,
            size: fs.statSync(path.join(mediaPath, f)).size
          }));
        res.json({ files });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/media/:filename', (req, res) => {
      const mediaPath = getMediaPath();
      const filename = path.basename(req.params.filename);
      const filePath = path.join(mediaPath, filename);
      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(404).json({ success: false, error: 'Файл не знайдено' });
        }
      });
    });

    // API: список активних квіз-кімнат
    // Використовується адмін-панеллю для відображення активних ігор
    this.app.get('/api/active-quizzes', (req, res) => {
      const sessions = this.roomManager.getActiveSessions();
      res.json({ success: true, sessions });
    });

    // API: статистика завершених сесій (з SQLite)
    this.app.get('/api/stats', (req, res) => {
      const stats = db.getStats();
      res.json({ success: true, ...stats });
    });

    // API: результати конкретної сесії
    this.app.get('/api/stats/session/:id', (req, res) => {
      const results = db.getSessionResults(Number(req.params.id));
      res.json({ success: true, results });
    });

    // API: статистика питань для конкретної сесії
    this.app.get('/api/stats/session/:id/questions', (req, res) => {
      const questionStats = db.getQuestionStats(Number(req.params.id));
      res.json({ success: true, questionStats });
    });

    // API: список квізів з диску (папка quizzes/)
    this.app.get('/api/quizzes', (req, res) => {
      const quizzes = loadAllQuizzes();
      res.json({ success: true, quizzes });
    });

    // API: зберегти квіз у бібліотеку (папка quizzes/)
    this.app.post('/api/quizzes/save', (req, res) => {
      try {
        const quizData = req.body;
        if (!quizData || !quizData.title) {
          return res.status(400).json({ success: false, error: 'Missing quiz data or title' });
        }
        const result = saveQuiz(quizData);
        res.json({ success: true, id: result.id, filename: result.filename });
      } catch (err) {
        log('Server', `Помилка збереження квізу: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: видалити квіз з бібліотеки
    this.app.delete('/api/quizzes/:id', (req, res) => {
      const { id } = req.params;
      const deleted = deleteQuiz(id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: 'Quiz not found' });
      }
    });

    // API: QR-код для підключення до кімнати
    this.app.get('/api/qr/:roomCode', async (req, res) => {
      try {
        const { roomCode } = req.params;
        const localIP = this.getLocalIP();
        const port = this.config.server.port;
        const url = `http://${localIP}:${port}/?room=${roomCode.toUpperCase()}`;
        const buffer = await qrcode.toBuffer(url, { type: 'png', width: 256 });
        res.set('Content-Type', 'image/png');
        res.send(buffer);
      } catch (err) {
        res.status(500).json({ success: false, error: 'QR generation failed' });
      }
    });

    // GET /api/podium/status — повертає нікнейм і фазу гри для IP цього подіуму
    // SideMonitor (окремий Chromium на HDMI-2) опитує цей ендпоінт кожні 2с
    // podiumRegistry зберігається в roomManager — Map: IP → socketId
    this.app.get('/api/podium/status', (req, res) => {
      const ip = (req.ip || '').replace('::ffff:', '');
      const roomCode = this.roomManager.getCurrentRoom();

      if (!roomCode) {
        return res.json({ nickname: null, phase: 'WAITING' });
      }

      const session = this.roomManager.sessions.get(roomCode);
      if (!session) {
        return res.json({ nickname: null, phase: 'WAITING' });
      }

      // Знаходимо socket гравця за IP через podiumRegistry
      const playerSocketId = this.roomManager.podiumRegistry.get(ip);
      if (!playerSocketId) {
        return res.json({ nickname: null, phase: session.gameState });
      }

      const player = session.players.get(playerSocketId);
      res.json({
        nickname: player ? player.nickname : null,
        phase: session.gameState,
      });
    });

    // API: завантаження медіафайлу (зображення) від ведучого
    // Приймає multipart/form-data з полем `image`
    // Зберігає в media/ з унікальним іменем (timestamp + розширення)
    // Повертає { success, filename, url }
    const multerStorage = multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, getMediaPath()),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}${ext}`);
      }
    });

    const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

    const upload = multer({
      storage: multerStorage,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 МБ
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Недозволений тип файлу — тільки зображення (jpg, png, gif, webp)'));
        }
      }
    });

    this.app.post('/api/media/upload', (req, res) => {
      upload.single('image')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ success: false, error: err.message });
        }
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'Файл не отримано' });
        }

        // Обчислюємо MD5 нового файлу для перевірки дублікатів
        const currentMediaPath = getMediaPath();
        const newFilePath = req.file.path;
        const newHash = crypto.createHash('md5')
          .update(fs.readFileSync(newFilePath))
          .digest('hex');

        // Шукаємо серед існуючих файлів — чи є вже такий самий вміст
        let duplicate = null;
        try {
          for (const existing of fs.readdirSync(currentMediaPath)) {
            if (existing === req.file.filename) continue;
            const existingPath = path.join(currentMediaPath, existing);
            try {
              const existingHash = crypto.createHash('md5')
                .update(fs.readFileSync(existingPath))
                .digest('hex');
              if (existingHash === newHash) { duplicate = existing; break; }
            } catch (_) {}
          }
        } catch (_) {}

        if (duplicate) {
          // Видаляємо щойно завантажений — повертаємо існуючий
          try { fs.unlinkSync(newFilePath); } catch (_) {}
          return res.json({ success: true, filename: duplicate, url: `/api/media/${duplicate}` });
        }

        const filename = path.basename(req.file.filename);
        res.json({ success: true, filename, url: `/api/media/${filename}` });
      });
    });

    // Catch-all маршрут для SPA (Single Page Application)
    // Всі інші GET запити відправляємо index.html (React Router handles the rest)
    this.app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, '..', '..', 'frontend', 'build', 'index.html');
      const publicIndex = path.join(__dirname, '..', '..', 'frontend', 'public', 'index.html');

      // Спочатку шукаємо production build, потім public
      res.sendFile(indexPath, (err) => {
        if (err) {
          res.sendFile(publicIndex, (err2) => {
            if (err2) {
              // Якщо frontend ще не зібраний - показуємо статусну сторінку
              res.send(this._getStatusPage());
            }
          });
        }
      });
    });
  }

  /**
   * Ініціалізує WebSocket обробники через QuizRoomManager
   *
   * Викликається після setupRoutes()
   */
  setupWebSocket() {
    this.roomManager.init();
    log('Server', 'WebSocket обробники ініціалізовано');

    // Запускаємо очищення старих сесій з БД одразу при старті
    // і потім кожні 24 години (видаляємо сесії старіші 90 днів)
    db.cleanupOldSessions(90);
    setInterval(() => db.cleanupOldSessions(90), 24 * 60 * 60 * 1000);
  }

  /**
   * Запускає сервер на налаштованому порту та хості
   *
   * Виводить інформацію про IP адресу для підключення планшетів.
   * Реєструє обробники для graceful shutdown (SIGTERM, SIGINT).
   */
  start() {
    const { port, host } = this.config.server;

    // Налаштовуємо middleware та маршрути перед запуском
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();

    // Запускаємо HTTP сервер
    this.httpServer.listen(port, host, () => {
      this.isRunning = true;

      const localIP = this.getLocalIP();

      // Виводимо красивий банер зі URL для підключення
      console.log('');
      console.log('╔════════════════════════════════════════╗');
      console.log('║     Quiz Room Local - Запущено!        ║');
      console.log('╠════════════════════════════════════════╣');
      console.log(`║  Локально:  http://localhost:${port}     ║`);
      console.log(`║  Мережа:    http://${localIP}:${port}  ║`);
      console.log('║                                        ║');
      console.log('║  Планшети: підключаються автоматично   ║');
      console.log('╚════════════════════════════════════════╝');
      console.log('');

      log('Server', `Сервер запущено на ${host}:${port}`);
    });

    // Обробляємо сигнали завершення для graceful shutdown
    // SIGTERM - надсилається системою при зупинці (наприклад Docker)
    process.on('SIGTERM', () => this.stop('SIGTERM'));
    // SIGINT - Ctrl+C в терміналі
    process.on('SIGINT', () => this.stop('SIGINT'));
  }

  /**
   * Плавно зупиняє сервер (graceful shutdown)
   *
   * Що робить:
   * 1. Логує причину зупинки
   * 2. Закриває HTTP сервер (чекає завершення активних запитів)
   * 3. Відключає всі Socket.IO з'єднання
   * 4. Завершує процес
   *
   * @param {string} reason - Причина зупинки (для логу)
   */
  stop(reason = 'manual') {
    log('Server', `Зупинка сервера (${reason})...`);

    // Закриваємо Socket.IO (відключаємо всіх клієнтів)
    this.io.close();

    // Закриваємо HTTP сервер
    this.httpServer.close(() => {
      log('Server', 'Сервер зупинено');
      process.exit(0);
    });

    // Якщо сервер не зупинився за 5 секунд - примусово завершуємо
    setTimeout(() => {
      log('Server', 'Примусове завершення після 5 секунд');
      process.exit(1);
    }, 5000);
  }

  /**
   * Визначає локальну IP адресу машини в мережі
   *
   * Використовується щоб показати адресу для підключення планшетів.
   * Повертає першу не-localhost IPv4 адресу з мережевих інтерфейсів.
   *
   * @returns {string} IP адреса або 'localhost' якщо не знайдено
   */
  getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Шукаємо IPv4 адресу що не є localhost
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }

    return 'localhost';
  }

  /**
   * Генерує HTML сторінку статусу коли фронтенд ще не зібраний
   * Показується при GET / якщо frontend/build/index.html не існує
   *
   * @returns {string} HTML рядок
   * @private
   */
  _getStatusPage() {
    const sessions = this.roomManager.getActiveSessions();
    const localIP = this.getLocalIP();

    return `
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Quiz Room Local - Сервер</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    .status { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; }
    .info { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin-top: 15px; }
    code { background: #f8f9fa; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>🎮 Quiz Room Local</h1>
  <div class="status">
    <strong>✅ Сервер працює!</strong><br>
    Активних сесій: ${sessions.length}
  </div>
  <div class="info">
    <strong>Підключення для гравців:</strong><br>
    Локально: <code>http://localhost:${this.config.server.port}</code><br>
    Мережа: <code>http://${localIP}:${this.config.server.port}</code>
  </div>
  <p><em>Frontend ще не зібраний. Запустіть <code>npm run build:frontend</code></em></p>
</body>
</html>`;
  }
}

// Запускаємо сервер якщо файл запущений напряму (не імпортований)
if (require.main === module) {
  const server = new QuizServer();
  server.start();
}

// Експортуємо клас для тестування
module.exports = QuizServer;
