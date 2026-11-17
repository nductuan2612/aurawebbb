'use strict';
/**
 * Äiá»ƒm khá»Ÿi Ä‘á»™ng á»©ng dá»¥ng Express.
 *
 * Thá»© tá»± middleware (quan trá»ng):
 *   1. Báº£o máº­t HTTP header (Helmet + CSP cháº·t: khĂ´ng script/style ná»™i tuyáº¿n).
 *   2. File tÄ©nh (trÆ°á»›c phiĂªn vĂ  giá»›i háº¡n táº§n suáº¥t, Ä‘á»ƒ CSS/áº£nh khĂ´ng kĂ©o theo truy váº¥n CSDL).
 *   3. Webhook IPN cá»§a cá»•ng thanh toĂ¡n [UC06]: gáº¯n TRÆ¯á»C phiĂªn vĂ  CSRF vĂ¬ cá»•ng khĂ´ng cĂ³ cookie,
 *      má»—i thĂ´ng bĂ¡o Ä‘Æ°á»£c xĂ¡c thá»±c báº±ng chá»¯ kĂ½ (checksum).
 *   4. Giá»›i háº¡n táº§n suáº¥t, cookie, phiĂªn, náº¡p tĂ i khoáº£n vĂ  giá» hĂ ng, rá»“i CSRF.
 *   5. Route á»©ng dá»¥ng, 404, trĂ¬nh xá»­ lĂ½ lá»—i.
 * Máº¥t káº¿t ná»‘i CSDL khĂ´ng lĂ m server dá»«ng: cĂ¡c trang cáº§n CSDL bĂ¡o lá»—i 500, kĂ¨m hÆ°á»›ng dáº«n trong log.
 */
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const env = require('./config/env');
const shop = require('./config/shop');
const db = require('./config/db');
const logger = require('./utils/logger');
const S = require('./utils/orderStatus');
const { formatVnd, percentOff, maskName } = require('./utils/format');
const { formatDate, formatDateTime, toDateInput, toDateTimeLocal } = require('./utils/time');
const { discountState } = require('./utils/pricing');
const { safeJson } = require('./utils/security');
const { toQuery } = require('./utils/query');
const { globalLimiter } = require('./middleware/rateLimit');
const { attachUser } = require('./middleware/auth');
const { readGuest, attachCartCount } = require('./middleware/cartContext');
const { csrf } = require('./middleware/csrf');
const { notFound, handler: errorHandler } = require('./middleware/errorHandler');
const categoryModel = require('./models/categoryModel');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('query parser', 'simple'); // ?a[b]=1 khĂ´ng bá»‹ biáº¿n thĂ nh object lá»“ng nhau

  // Biáº¿n dĂ¹ng chung cho má»i view. GiĂ¡ trá»‹ theo tá»«ng request ghi Ä‘Ă¨ báº±ng res.locals á»Ÿ cĂ¡c middleware sau.
  // Äáº·t máº·c Ä‘á»‹nh á»Ÿ Ä‘Ă¢y Ä‘á»ƒ trang lá»—i váº«n hiá»ƒn thá»‹ Ä‘Æ°á»£c ká»ƒ cáº£ khi lá»—i xáº£y ra ráº¥t sá»›m.
  Object.assign(app.locals, {
    shop, S, safeJson, discountState, toQuery, percentOff, maskName,
    vnd: formatVnd, fmtDate: formatDate, fmtDateTime: formatDateTime, inputDate: toDateInput, inputDateTime: toDateTimeLocal,
    appBaseUrl: env.appBaseUrl, isProd: env.isProd,
    title: shop.name, user: null, cartCount: 0, csrfToken: '', navCategories: [], query: {}, currentPath: '/',
  });

  /* ---------- 1. Báº£o máº­t HTTP header ---------- */
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"], // khĂ´ng cĂ³ script ná»™i tuyáº¿n: chá»‘ng XSS ngay cáº£ khi lá»t dá»¯ liá»‡u Ä‘á»™c háº¡i vĂ o trang
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        // Sau khi gá»­i form Ä‘áº·t hĂ ng, trĂ¬nh duyá»‡t cĂ³ thá»ƒ bá»‹ chuyá»ƒn hÆ°á»›ng sang trang cá»§a cá»•ng thanh toĂ¡n (https).
        'form-action': ["'self'", 'https:'],
        // Máº·c Ä‘á»‹nh cá»§a helmet lĂ  nĂ¢ng cáº¥p má»i tĂ i nguyĂªn lĂªn https, lĂ m há»ng CSS/JS khi cháº¡y http://localhost.
        'upgrade-insecure-requests': env.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  /* ---------- 2. File tÄ©nh ---------- */
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: env.isProd ? '7d' : 0, index: false }));

  /* ---------- 3. [UC06] Webhook IPN: trÆ°á»›c phiĂªn, CSRF vĂ  giá»›i háº¡n táº§n suáº¥t ---------- */
  app.use(require('./routes/paymentHooks'));

  /* ---------- 4. PhiĂªn, ngÆ°á»i dĂ¹ng, giá» hĂ ng, CSRF ---------- */
  app.use((req, res, next) => {
    res.locals.query = req.query || {};
    res.locals.currentPath = req.path;
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(globalLimiter);
  app.use(cookieParser(env.sessionSecret));
  app.use(session({
    name: 'ivy.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 14 },
  }));
  app.use(attachUser);
  app.use(readGuest);
  app.use(attachCartCount);
  app.use(csrf);
  app.use(async (req, res, next) => {
    try {
      res.locals.navCategories = await categoryModel.tree();
    } catch (_) {
      /* giá»¯ máº·c Ä‘á»‹nh [], trang váº«n hiá»ƒn thá»‹ Ä‘Æ°á»£c */
    }
    next();
  });

  /* ---------- 5. Route á»©ng dá»¥ng ---------- */
  app.use('/', require('./routes/pages'));
  app.use('/', require('./routes/auth'));
  app.use('/', require('./routes/shop'));
  app.use('/admin', require('./routes/admin')); // guard requireAdmin náº±m trong routes/admin/index.js

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function start() {
  for (const w of env.warnings) logger.warn('[.env]', w);

  try {
    await db.getPool();
    logger.info(`Database connected: ${env.db.name} at ${env.db.host}:${env.db.port}`);
  } catch (err) {
    const info = db.describeConnectError(err);
    logger.error('KhĂ´ng káº¿t ná»‘i Ä‘Æ°á»£c CSDL:', info.message);
    for (const hint of info.hints) logger.error('  gá»£i Ă½:', hint);
    logger.warn('Server váº«n khá»Ÿi Ä‘á»™ng. CĂ¡c trang cáº§n CSDL sáº½ bĂ¡o lá»—i cho tá»›i khi káº¿t ná»‘i Ä‘Æ°á»£c. Sá»­a .env rá»“i cháº¡y láº¡i.');
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`${shop.name} Ä‘ang cháº¡y táº¡i http://localhost:${env.port} (${env.nodeEnv}, thanh toĂ¡n: ${env.payment.provider})`);
  });

  const shutdown = () => {
    logger.info('Äang táº¯t server...');
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('unhandledRejection', (reason) => logger.error('Promise bá»‹ tá»« chá»‘i mĂ  khĂ´ng Ä‘Æ°á»£c xá»­ lĂ½:', reason));

if (require.main === module) {
  start().catch((err) => {
    logger.error('Khá»Ÿi Ä‘á»™ng tháº¥t báº¡i:', err.stack || err);
    process.exit(1);
  });
}

module.exports = { createApp, start };
