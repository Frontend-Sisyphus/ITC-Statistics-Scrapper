const os = require("os");
const process = require("process");

/**
 * Расчет процента загрузки CPU по ядрам
 */
function getCpuSnapshot() {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;

  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }

  const total = user + nice + sys + idle + irq;
  return { idle, total };
}

class GjallarhornClient {
  constructor(config) {
    if (!config || !config.projectId) {
      throw new Error("[Gjallarhorn] Ошибка: параметр 'projectId' обязателен.");
    }

    this.projectId = config.projectId;
    this.dashboardUrl = (config.dashboardUrl || "http://localhost:3000").replace(/\/+$/, "");
    this.projectKey = config.projectKey || "";
    this.intervalMs = config.intervalMs || 15000;
    this.serviceType = config.serviceType || "web";
    this.environment = config.environment || "production";
    this.version = config.version || "1.0.0";
    this.autoCatchErrors = config.autoCatchErrors !== false;

    this.timer = null;
    this.prevCpuSnapshot = getCpuSnapshot();

    // Метрики скользящего окна между тиками
    this.requestCount = 0;
    this.responseTimes = [];
    this.apiCodes = { code2xx: 0, code3xx: 0, code4xx: 0, code5xx: 0 };
    this.uniqueIps = new Set();
    this.todayVisits = 0;

    if (this.autoCatchErrors) {
      this.attachErrorListeners();
    }
  }

  /**
   * Подключение глобальных перехватчиков ошибок процесса
   */
  attachErrorListeners() {
    process.on("uncaughtException", (err) => {
      this.reportIncident({
        title: `Uncaught Exception: ${err.message || "Неизвестная ошибка"}`,
        severity: "critical",
        rootCause: err.stack ? err.stack.slice(0, 300) : String(err),
      });
    });

    process.on("unhandledRejection", (reason) => {
      this.reportIncident({
        title: `Unhandled Promise Rejection: ${String(reason)}`,
        severity: "warning",
        rootCause: "Необработанный Promise rejection",
      });
    });
  }

  /**
   * Запуск периодической отправки телеметрии
   */
  start() {
    if (this.timer) return;

    // Сразу отправляем первый heartbeat
    this.sendTick().catch(() => {});

    this.timer = setInterval(() => {
      this.sendTick().catch(() => {});
    }, this.intervalMs);

    // unref, чтобы таймер не блокировал завершение процесса при выходе
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /**
   * Остановка фонового цикла
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Middleware для замера RPS, latency и статус-кодов (Express, Fastify, Connect, http)
   */
  middleware() {
    return (req, res, next) => {
      const start = Date.now();
      this.requestCount++;
      this.todayVisits++;

      // Учет уникального IP клиента
      const ip =
        req.ip ||
        (req.headers && req.headers["x-forwarded-for"]) ||
        (req.connection && req.connection.remoteAddress);
      if (ip) {
        this.uniqueIps.add(String(ip));
      }

      // Перехват окончания ответа
      res.on("finish", () => {
        const duration = Date.now() - start;
        this.responseTimes.push(duration);
        if (this.responseTimes.length > 500) {
          this.responseTimes.shift();
        }

        const status = res.statusCode || 200;
        if (status >= 500) this.apiCodes.code5xx++;
        else if (status >= 400) this.apiCodes.code4xx++;
        else if (status >= 300) this.apiCodes.code3xx++;
        else this.apiCodes.code2xx++;
      });

      if (typeof next === "function") {
        next();
      }
    };
  }

  /**
   * Отправка мгновенного уведомления об инциденте
   */
  async reportIncident(incident) {
    try {
      await this.postPayload({
        projectId: this.projectId,
        projectKey: this.projectKey,
        status: incident.severity === "critical" ? "outage" : "degraded",
        incident: {
          title: incident.title,
          severity: incident.severity || "warning",
          rootCause: incident.rootCause || "Ручная фиксация через SDK",
          status: "investigating",
        },
      });
    } catch (_) {
      // Игнорируем ошибки отправки инцидента, чтобы не уронить приложение
    }
  }

  /**
   * Сбор метрик и отправка регулярного тика
   */
  async sendTick() {
    // 1. Расчет загрузки CPU
    const currCpu = getCpuSnapshot();
    const idleDiff = currCpu.idle - this.prevCpuSnapshot.idle;
    const totalDiff = currCpu.total - this.prevCpuSnapshot.total;
    const cpuUsagePercent = totalDiff > 0 ? Math.min(100, Math.max(0, Math.round((1 - idleDiff / totalDiff) * 100))) : 0;
    this.prevCpuSnapshot = currCpu;

    // 2. Расчет памяти хоста и процесса
    const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
    const usedMemMb = totalMemMb - freeMemMb;
    const memoryPercent = totalMemMb > 0 ? Math.round((usedMemMb / totalMemMb) * 100) : 0;

    // 3. Расчет RPS и Latency
    const elapsedSeconds = Math.max(1, this.intervalMs / 1000);
    const rps = +(this.requestCount / elapsedSeconds).toFixed(1);

    let latencyAvg = 20;
    let latencyP95 = 45;
    if (this.responseTimes.length > 0) {
      const sum = this.responseTimes.reduce((a, b) => a + b, 0);
      latencyAvg = Math.round(sum / this.responseTimes.length);

      const sorted = [...this.responseTimes].sort((a, b) => a - b);
      const p95Idx = Math.floor(sorted.length * 0.95);
      latencyP95 = sorted[p95Idx] || latencyAvg;
    }

    // Сохраняем и сбрасываем счетчики интервала
    const currentCodes = { ...this.apiCodes };
    this.requestCount = 0;
    this.responseTimes = [];

    // 4. Формирование пакета телеметрии
    const payload = {
      projectId: this.projectId,
      projectKey: this.projectKey,
      serviceType: this.serviceType,
      version: this.version,
      environment: this.environment,
      timestamp: new Date().toISOString(),
      status: "operational",
      hardware: {
        cpuPercent: cpuUsagePercent,
        cpuCores: os.cpus().length,
        memoryUsedMb: usedMemMb,
        memoryTotalMb: totalMemMb,
        memoryPercent: memoryPercent,
      },
      performance: {
        rps: rps,
        latencyAvgMs: latencyAvg,
        latencyP95Ms: latencyP95,
        apiCodes: currentCodes,
      },
      users: {
        realtimeActiveUsers: this.uniqueIps.size,
        todayUniqueUsers: this.uniqueIps.size,
        todayVisits: this.todayVisits,
      },
    };

    await this.postPayload(payload);
  }

  async postPayload(payload) {
    const endpoint = `${this.dashboardUrl}/api/monitoring/telemetry`;

    if (typeof fetch === "function") {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    }

    // Fallback для более старых версий Node без глобального fetch
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const httpModule = url.protocol === "https:" ? require("https") : require("http");

      const req = httpModule.request(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({ raw: data });
            }
          });
        }
      );

      req.on("error", reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }
}

/**
 * Быстрый фабричный метод для инициализации
 */
function initGjallarhorn(config) {
  const client = new GjallarhornClient(config);
  client.start();
  return client;
}

module.exports = {
  GjallarhornClient,
  initGjallarhorn,
};
