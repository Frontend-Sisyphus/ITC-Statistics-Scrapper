/**
 * Browser SDK for itc-statistics-scrapper
 * Works via <script> tag or ESM import on any website.
 */
(function (root, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    var api = factory();
    root.ItcStatistics = api;
    root.initItcStatistics = api.initItcStatistics;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VISITOR_KEY = "itc_stats_visitor_id";

  function getVisitorId() {
    try {
      var existing = sessionStorage.getItem(VISITOR_KEY);
      if (existing) return existing;
      var id =
        "v_" +
        Math.random().toString(36).slice(2, 10) +
        "_" +
        Date.now().toString(36);
      sessionStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch (_) {
      return "anon";
    }
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function BrowserTelemetryClient(config) {
    if (!config || !config.projectId) {
      throw new Error("[itc-statistics-scrapper] параметр 'projectId' обязателен.");
    }

    this.projectId = config.projectId;
    this.dashboardUrl = String(config.dashboardUrl || "http://localhost:3000").replace(
      /\/+$/,
      ""
    );
    this.projectKey = config.projectKey || "";
    this.intervalMs = config.intervalMs || 15000;
    this.serviceType = config.serviceType || "web";
    this.environment = config.environment || "production";
    this.version = config.version || "1.0.0";
    this.autoCatchErrors = config.autoCatchErrors !== false;
    this.trackSpa = config.trackSpa !== false;
    this.wrapFetch = config.wrapFetch !== false;

    this.timer = null;
    this.requestCount = 0;
    this.responseTimes = [];
    this.apiCodes = { code2xx: 0, code3xx: 0, code4xx: 0, code5xx: 0 };
    this.todayVisits = 0;
    this.visitorId = getVisitorId();
    this._origFetch = null;
    this._historyWrapped = false;

    if (this.autoCatchErrors) {
      this.attachErrorListeners();
    }
    if (this.wrapFetch) {
      this.attachFetchProbe();
    }
    if (this.trackSpa) {
      this.attachSpaListeners();
    }

    this.trackPageView();
  }

  BrowserTelemetryClient.prototype.attachErrorListeners = function () {
    var self = this;

    window.addEventListener("error", function (event) {
      var message =
        (event && event.message) ||
        (event && event.error && event.error.message) ||
        "Browser error";
      var stack =
        (event && event.error && event.error.stack) ||
        (event && event.filename
          ? event.filename + ":" + event.lineno + ":" + event.colno
          : "");

      self.reportIncident({
        title: "Browser Error: " + message,
        severity: "critical",
        rootCause: String(stack || message).slice(0, 300),
      });
    });

    window.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      self.reportIncident({
        title: "Unhandled Promise Rejection: " + String(reason),
        severity: "warning",
        rootCause: "Необработанный Promise rejection в браузере",
      });
    });
  };

  BrowserTelemetryClient.prototype.attachFetchProbe = function () {
    if (typeof window.fetch !== "function" || this._origFetch) return;

    var self = this;
    this._origFetch = window.fetch.bind(window);

    window.fetch = function () {
      var started = Date.now();
      return self._origFetch.apply(window, arguments).then(
        function (res) {
          self.recordHttpSample(res && res.status, Date.now() - started);
          return res;
        },
        function (err) {
          self.recordHttpSample(0, Date.now() - started);
          throw err;
        }
      );
    };
  };

  BrowserTelemetryClient.prototype.attachSpaListeners = function () {
    if (this._historyWrapped || !window.history) return;
    this._historyWrapped = true;

    var self = this;
    var wrap = function (method) {
      var original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        self.trackPageView();
        return result;
      };
    };

    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", function () {
      self.trackPageView();
    });
  };

  BrowserTelemetryClient.prototype.recordHttpSample = function (status, durationMs) {
    this.requestCount += 1;
    if (typeof durationMs === "number" && durationMs >= 0) {
      this.responseTimes.push(durationMs);
      if (this.responseTimes.length > 500) this.responseTimes.shift();
    }

    var code = Number(status) || 0;
    if (code >= 500 || code === 0) this.apiCodes.code5xx += 1;
    else if (code >= 400) this.apiCodes.code4xx += 1;
    else if (code >= 300) this.apiCodes.code3xx += 1;
    else if (code >= 200) this.apiCodes.code2xx += 1;
  };

  BrowserTelemetryClient.prototype.trackPageView = function () {
    this.todayVisits += 1;
    this.requestCount += 1;

    var nav =
      (typeof performance !== "undefined" &&
        performance.getEntriesByType &&
        performance.getEntriesByType("navigation")[0]) ||
      null;

    if (nav && typeof nav.duration === "number" && nav.duration > 0) {
      this.responseTimes.push(Math.round(nav.duration));
      if (this.responseTimes.length > 500) this.responseTimes.shift();
      this.apiCodes.code2xx += 1;
    }
  };

  BrowserTelemetryClient.prototype.start = function () {
    if (this.timer) return;
    var self = this;
    this.sendTick().catch(function () {});
    this.timer = setInterval(function () {
      self.sendTick().catch(function () {});
    }, this.intervalMs);
  };

  BrowserTelemetryClient.prototype.stop = function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  BrowserTelemetryClient.prototype.reportIncident = function (incident) {
    var payload = {
      projectId: this.projectId,
      projectKey: this.projectKey,
      status: incident && incident.severity === "critical" ? "outage" : "degraded",
      incident: {
        title: (incident && incident.title) || "Browser incident",
        severity: (incident && incident.severity) || "warning",
        rootCause:
          (incident && incident.rootCause) || "Ручная фиксация через browser SDK",
        status: "investigating",
      },
    };

    return this.postPayload(payload).catch(function () {});
  };

  BrowserTelemetryClient.prototype.collectHardware = function () {
    var memoryUsedMb = 0;
    var memoryTotalMb = 0;
    var memoryPercent = 0;
    var cpuCores =
      (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 1;

    try {
      if (performance && performance.memory) {
        memoryUsedMb = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
        memoryTotalMb = Math.round(
          performance.memory.jsHeapSizeLimit / (1024 * 1024)
        );
        memoryPercent =
          memoryTotalMb > 0
            ? clamp(Math.round((memoryUsedMb / memoryTotalMb) * 100), 0, 100)
            : 0;
      }
    } catch (_) {}

    return {
      cpuPercent: 0,
      cpuCores: cpuCores,
      memoryUsedMb: memoryUsedMb,
      memoryTotalMb: memoryTotalMb,
      memoryPercent: memoryPercent,
    };
  };

  BrowserTelemetryClient.prototype.sendTick = function () {
    var elapsedSeconds = Math.max(1, this.intervalMs / 1000);
    var rps = +(this.requestCount / elapsedSeconds).toFixed(1);

    var latencyAvg = 0;
    var latencyP95 = 0;
    if (this.responseTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this.responseTimes.length; i++) sum += this.responseTimes[i];
      latencyAvg = Math.round(sum / this.responseTimes.length);
      var sorted = this.responseTimes.slice().sort(function (a, b) {
        return a - b;
      });
      var p95Idx = Math.floor(sorted.length * 0.95);
      latencyP95 = sorted[p95Idx] || latencyAvg;
    }

    var currentCodes = {
      code2xx: this.apiCodes.code2xx,
      code3xx: this.apiCodes.code3xx,
      code4xx: this.apiCodes.code4xx,
      code5xx: this.apiCodes.code5xx,
    };

    this.requestCount = 0;
    this.responseTimes = [];
    this.apiCodes = { code2xx: 0, code3xx: 0, code4xx: 0, code5xx: 0 };

    var payload = {
      projectId: this.projectId,
      projectKey: this.projectKey,
      serviceType: this.serviceType,
      version: this.version,
      environment: this.environment,
      timestamp: new Date().toISOString(),
      status: "operational",
      client: "browser",
      hardware: this.collectHardware(),
      performance: {
        rps: rps,
        latencyAvgMs: latencyAvg,
        latencyP95Ms: latencyP95,
        apiCodes: currentCodes,
      },
      users: {
        realtimeActiveUsers: 1,
        todayUniqueUsers: 1,
        todayVisits: this.todayVisits,
        visitorId: this.visitorId,
      },
      page: {
        url: typeof location !== "undefined" ? location.href : "",
        path: typeof location !== "undefined" ? location.pathname : "",
        referrer: typeof document !== "undefined" ? document.referrer : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      },
    };

    return this.postPayload(payload);
  };

  BrowserTelemetryClient.prototype.postPayload = function (payload) {
    var endpoint = this.dashboardUrl + "/api/monitoring/telemetry";

    if (typeof fetch === "function") {
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        mode: "cors",
        keepalive: true,
      }).then(function (res) {
        return res.json().catch(function () {
          return { ok: res.ok, status: res.status };
        });
      });
    }

    return new Promise(function (resolve, reject) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onload = function () {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (_) {
            resolve({ raw: xhr.responseText });
          }
        };
        xhr.onerror = function () {
          reject(new Error("XHR telemetry failed"));
        };
        xhr.send(JSON.stringify(payload));
      } catch (err) {
        reject(err);
      }
    });
  };

  function initItcStatistics(config) {
    var client = new BrowserTelemetryClient(config);
    client.start();
    return client;
  }

  // Alias for API parity with Node SDK naming in docs/examples
  function initGjallarhorn(config) {
    return initItcStatistics(config);
  }

  return {
    BrowserTelemetryClient: BrowserTelemetryClient,
    initItcStatistics: initItcStatistics,
    initGjallarhorn: initGjallarhorn,
  };
});
