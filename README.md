# ITC Statistics Scrapper

Лёгкий SDK телеметрии для **ITC Dashboard**: работает и на **Node.js-сервере**, и в **браузере на любом сайте**.

## Установка

```bash
npm install itc-statistics-scrapper
```

Или без сборки — через CDN:

```html
<script src="https://unpkg.com/itc-statistics-scrapper/browser.js"></script>
```

Лендинг: [`docs/index.html`](./docs/index.html) (`npm run docs`).

---

## 1. Любой сайт (браузер)

Подходит для статики, React/Vue/Svelte SPA, Tilda-подобных страниц и любых HTML-сайтов.

```html
<script src="https://unpkg.com/itc-statistics-scrapper/browser.js"></script>
<script>
  const stats = ItcStatistics.initItcStatistics({
    projectId: 'my-site',
    dashboardUrl: 'https://dashboard.example.com',
    intervalMs: 15000,
  });
</script>
```

Через npm / bundler:

```js
import { initItcStatistics } from 'itc-statistics-scrapper/browser';

const stats = initItcStatistics({
  projectId: 'my-site',
  dashboardUrl: 'https://dashboard.example.com',
});
```

Что делает browser-клиент:
- heartbeat на дашборд;
- page views (+ SPA `history` / `popstate`);
- обёртка `fetch` → RPS, latency, HTTP-коды;
- перехват JS-ошибок и `unhandledrejection`;
- `reportIncident(...)` вручную.

```js
stats.reportIncident({
  title: 'Сбой оплаты',
  severity: 'critical',
  rootCause: 'timeout',
});
```

> Для браузера ITC Dashboard должен отдавать CORS на `POST /api/monitoring/telemetry`.

---

## 2. Node.js (Express / Fastify / Next.js)

```js
const express = require('express');
const { initItcStatistics } = require('itc-statistics-scrapper');

const app = express();
const stats = initItcStatistics({
  projectId: 'fin-helper',
  dashboardUrl: 'http://localhost:3000',
  intervalMs: 15000,
});

app.use(stats.middleware());
```

На сервере дополнительно собираются CPU/RAM хоста и uptime-процесс через heartbeat.

Алиас совместимости: `initGjallarhorn` / `GjallarhornClient`.

---

## Что собирается

| Метрика | Node | Browser |
|---|---|---|
| Heartbeat / uptime-сигнал | ✅ | ✅ |
| CPU & RAM хоста | ✅ | ≈ JS heap (если доступен) |
| RPS / latency / HTTP-коды | ✅ middleware | ✅ page views + `fetch` |
| Инциденты | ✅ | ✅ |
| Уникальные посетители | IP | session visitor id |

---

## Публикация в npm

```bash
npm login
npm publish --access public
```
