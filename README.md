# ITC Statistics Scrapper (Node.js)

Легковесная библиотека без внешних зависимостей для мониторинга Node.js сайтов, Next.js и Express/Fastify сервисов в дашборде **ITC Dashboard (Gjallarhorn)**.

## Установка

```bash
npm install itc-statistics-scrapper
# или
yarn add itc-statistics-scrapper
# или
pnpm add itc-statistics-scrapper
```

## Быстрый старт

### 1. Подключение в Express / Fastify
```javascript
const express = require('express');
const { initGjallarhorn } = require('itc-statistics-scrapper');

const app = express();

// Инициализация телеметрии (запускает фоновый Heartbeat)
const gj = initGjallarhorn({
  projectId: 'fin-helper',
  dashboardUrl: 'http://localhost:3000', // Адрес ITC Dashboard
  intervalMs: 15000,                      // Отправка раз в 15 секунд
});

// Подключаем middleware для автоматического замера RPS, кодов ответа и Latency
app.use(gj.middleware());

app.get('/api/test', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000);
```

### 2. Ручная фиксация инцидента
```javascript
try {
  // критическая операция
} catch (error) {
  gj.reportIncident({
    title: 'Сбой интеграции с внешним API',
    severity: 'critical',
    rootCause: error.message
  });
}
```

## Что собирается автоматически
* **CPU & RAM**: текущая загрузка ядер процессора, занятая и свободная оперативная память хоста.
* **Uptime & Доступность**: отправка регулярных импульсов (heartbeat). Если сайт падает — статус в дашборде меняется на сбой.
* **Сетевой трафик**: RPS (запросов в секунду), распределение HTTP-кодов (2xx, 3xx, 4xx, 5xx), средняя задержка ответа.
* **Пользователи**: подсчет уникальных IP-адресов посетителей и суточного трафика.
* **Перехват сбоев**: автоматический перехват `uncaughtException` и `unhandledRejection`.

## Публикация в npm

```bash
cd my-app/sdk/itc-statistics-scrapper
npm login
npm publish --access public
```
