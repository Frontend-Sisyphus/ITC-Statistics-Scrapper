# ITC Statistics Scrapper

Лёгкий SDK телеметрии для **ITC Dashboard**: работает на **Node.js** и в **браузере на любом сайте**.

## Установка

```bash
npm install itc-statistics-scrapper
```

Или через CDN (без сборки):

```html
<script src="https://unpkg.com/itc-statistics-scrapper/browser.js"></script>
```

Общий конфиг:

```js
{
  projectId: 'my-site',                 // обязательно
  dashboardUrl: 'https://dashboard...', // ITC Dashboard
  projectKey: '',                       // опционально
  intervalMs: 15000,                    // интервал heartbeat
  environment: 'production',
  autoCatchErrors: true,
}
```

> Для браузерных интеграций дашборд должен разрешать **CORS** на `POST /api/monitoring/telemetry`.

---

## Подключение по стекам

### 1. Vanilla HTML

Самый простой вариант — CDN перед `</body>`:

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Мой сайт</title>
  </head>
  <body>
    <h1>Hello</h1>

    <script src="https://unpkg.com/itc-statistics-scrapper/browser.js"></script>
    <script>
      const stats = ItcStatistics.initItcStatistics({
        projectId: 'my-site',
        dashboardUrl: 'https://dashboard.example.com',
        intervalMs: 15000,
      });

      // опционально: ручной инцидент
      // stats.reportIncident({ title: 'Ошибка формы', severity: 'warning' });
    </script>
  </body>
</html>
```

Локальный файл из `node_modules`:

```html
<script src="./node_modules/itc-statistics-scrapper/browser.js"></script>
```

---

### 2. React.js

```bash
npm install itc-statistics-scrapper
```

Инициализируйте один раз в корне приложения:

```jsx
// src/main.jsx или src/index.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initItcStatistics } from 'itc-statistics-scrapper/browser';
import App from './App';

initItcStatistics({
  projectId: 'my-react-app',
  dashboardUrl: import.meta.env.VITE_ITC_DASHBOARD_URL || 'http://localhost:3000',
  environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Через хук (если нужен доступ к клиенту в компонентах):

```jsx
// src/hooks/useItcStatistics.js
import { useEffect, useRef } from 'react';
import { initItcStatistics } from 'itc-statistics-scrapper/browser';

let sharedClient = null;

export function useItcStatistics(config) {
  const clientRef = useRef(null);

  useEffect(() => {
    if (!sharedClient) {
      sharedClient = initItcStatistics(config);
    }
    clientRef.current = sharedClient;
    return () => {
      // обычно не останавливаем — клиент живёт всё время приложения
    };
  }, []);

  return clientRef;
}
```

SPA-роутинг (React Router) учитывается автоматически через `history` API.

---

### 3. Vue.js

```bash
npm install itc-statistics-scrapper
```

**Vue 3 — `main.js`:**

```js
import { createApp } from 'vue';
import { initItcStatistics } from 'itc-statistics-scrapper/browser';
import App from './App.vue';

const stats = initItcStatistics({
  projectId: 'my-vue-app',
  dashboardUrl: import.meta.env.VITE_ITC_DASHBOARD_URL || 'http://localhost:3000',
});

const app = createApp(App);
app.config.globalProperties.$itc = stats;
app.mount('#app');
```

**Плагин (опционально):**

```js
// plugins/itcStatistics.js
import { initItcStatistics } from 'itc-statistics-scrapper/browser';

export default {
  install(app, options) {
    const client = initItcStatistics(options);
    app.config.globalProperties.$itc = client;
    app.provide('itc', client);
  },
};
```

```js
// main.js
import { createApp } from 'vue';
import App from './App.vue';
import itcStatistics from './plugins/itcStatistics';

createApp(App)
  .use(itcStatistics, {
    projectId: 'my-vue-app',
    dashboardUrl: 'http://localhost:3000',
  })
  .mount('#app');
```

В компоненте:

```vue
<script setup>
import { inject } from 'vue';
const itc = inject('itc');

function onError(err) {
  itc?.reportIncident({
    title: err.message,
    severity: 'warning',
    rootCause: String(err.stack || err),
  });
}
</script>
```

---

### 4. Angular

```bash
npm install itc-statistics-scrapper
```

Сервис:

```ts
// src/app/itc-statistics.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import {
  initItcStatistics,
  BrowserTelemetryClient,
} from 'itc-statistics-scrapper/browser';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ItcStatisticsService implements OnDestroy {
  readonly client: BrowserTelemetryClient;

  constructor() {
    this.client = initItcStatistics({
      projectId: environment.itcProjectId || 'my-angular-app',
      dashboardUrl: environment.itcDashboardUrl || 'http://localhost:3000',
      environment: environment.production ? 'production' : 'development',
    });
  }

  reportIncident(title: string, rootCause?: string) {
    return this.client.reportIncident({
      title,
      severity: 'warning',
      rootCause,
    });
  }

  ngOnDestroy() {
    this.client.stop();
  }
}
```

Запуск при старте приложения (`app.config.ts` / `APP_INITIALIZER` или просто инъекция в `AppComponent`):

```ts
// app.component.ts
import { Component, inject } from '@angular/core';
import { ItcStatisticsService } from './itc-statistics.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
})
export class AppComponent {
  private readonly itc = inject(ItcStatisticsService);
}
```

В `tsconfig` при необходимости убедитесь, что резолвятся `package.json` `exports` (Angular 15+ обычно ок).

---

### 5. Svelte

```bash
npm install itc-statistics-scrapper
```

**SvelteKit / Vite — `src/routes/+layout.svelte` или `main.js`:**

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from 'svelte';
  import { initItcStatistics } from 'itc-statistics-scrapper/browser';
  import { browser } from '$app/environment';

  onMount(() => {
    if (!browser) return;
    initItcStatistics({
      projectId: 'my-svelte-app',
      dashboardUrl: import.meta.env.VITE_ITC_DASHBOARD_URL || 'http://localhost:3000',
    });
  });
</script>

<slot />
```

Чистый Svelte (без Kit) — в `main.js`:

```js
import App from './App.svelte';
import { initItcStatistics } from 'itc-statistics-scrapper/browser';

initItcStatistics({
  projectId: 'my-svelte-app',
  dashboardUrl: 'http://localhost:3000',
});

const app = new App({ target: document.getElementById('app') });
export default app;
```

---

### 6. Nuxt.js

```bash
npm install itc-statistics-scrapper
```

Клиентский плагин (только в браузере):

```js
// plugins/itc-statistics.client.js
import { initItcStatistics } from 'itc-statistics-scrapper/browser';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  const client = initItcStatistics({
    projectId: config.public.itcProjectId || 'my-nuxt-app',
    dashboardUrl: config.public.itcDashboardUrl || 'http://localhost:3000',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });

  return {
    provide: {
      itc: client,
    },
  };
});
```

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      itcProjectId: 'my-nuxt-app',
      itcDashboardUrl: process.env.NUXT_PUBLIC_ITC_DASHBOARD_URL || 'http://localhost:3000',
    },
  },
});
```

В компоненте:

```vue
<script setup>
const { $itc } = useNuxtApp();

function report(err) {
  $itc.reportIncident({
    title: err.message,
    severity: 'critical',
  });
}
</script>
```

Суффикс `.client.js` важен: плагин не должен выполняться на сервере Nuxt.

---

### 7. Next.js

Два уровня: **браузер** (страницы) и опционально **сервер** (Node middleware / instrumentation).

#### 7.1. Browser (App Router)

```bash
npm install itc-statistics-scrapper
```

```tsx
// app/providers.tsx
'use client';

import { useEffect } from 'react';
import { initItcStatistics } from 'itc-statistics-scrapper/browser';

let started = false;

export function ItcProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (started) return;
    started = true;

    initItcStatistics({
      projectId: process.env.NEXT_PUBLIC_ITC_PROJECT_ID || 'my-next-app',
      dashboardUrl:
        process.env.NEXT_PUBLIC_ITC_DASHBOARD_URL || 'http://localhost:3000',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    });
  }, []);

  return <>{children}</>;
}
```

```tsx
// app/layout.tsx
import { ItcProviders } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <ItcProviders>{children}</ItcProviders>
      </body>
    </html>
  );
}
```

`.env.local`:

```env
NEXT_PUBLIC_ITC_PROJECT_ID=my-next-app
NEXT_PUBLIC_ITC_DASHBOARD_URL=http://localhost:3000
```

#### 7.2. Server (Node) — CPU/RAM хоста

Для серверной телеметрии используйте основной entry (не `/browser`):

```js
// instrumentation.js (Next.js 13.2+)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initItcStatistics } = await import('itc-statistics-scrapper');
    initItcStatistics({
      projectId: process.env.ITC_PROJECT_ID || 'my-next-app',
      dashboardUrl: process.env.ITC_DASHBOARD_URL || 'http://localhost:3000',
      serviceType: 'web',
    });
  }
}
```

Или в кастомном Express/server-обёртке через `.middleware()`.

---

## Express / Fastify (чистый Node)

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

Алиасы: `initGjallarhorn` / `GjallarhornClient`.

---

## API (кратко)

### Browser (`itc-statistics-scrapper/browser`)

| Метод | Описание |
|---|---|
| `initItcStatistics(config)` | Создаёт клиент и запускает heartbeat |
| `client.trackPageView()` | Учесть просмотр (SPA делает это сама) |
| `client.reportIncident({ title, severity?, rootCause? })` | Ручной инцидент |
| `client.stop()` | Остановить таймер |

Опции: `autoCatchErrors`, `trackSpa`, `wrapFetch` (все по умолчанию `true`).

### Node (`itc-statistics-scrapper`)

| Метод | Описание |
|---|---|
| `initItcStatistics(config)` | Heartbeat + метрики хоста |
| `client.middleware()` | Express/Connect middleware для RPS/latency/кодов |
| `client.reportIncident(...)` | Инцидент |
| `client.stop()` | Остановить таймер |

---

## Что собирается

| Метрика | Node | Browser |
|---|---|---|
| Heartbeat | ✅ | ✅ |
| CPU & RAM хоста | ✅ | ≈ JS heap (если доступен) |
| RPS / latency / HTTP-коды | ✅ middleware | ✅ page views + `fetch` |
| Инциденты | ✅ | ✅ |
| Посетители | IP | session visitor id |

---

## Публикация в npm

```bash
npm login
npm publish --access public
```
