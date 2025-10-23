/**
 * Performance Monitoring Middleware
 * Tracks API response times, database queries, and system metrics
 */

const onFinished = require('on-finished');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byEndpoint: {},
        byMethod: {},
        byStatus: {}
      },
      responseTimes: {
        all: [],
        byEndpoint: {}
      },
      likes: {
        total: 0,
        successful: 0,
        failed: 0,
        avgResponseTime: 0,
        responseTimes: []
      },
      database: {
        queries: 0,
        slowQueries: [],
        avgQueryTime: 0
      },
      websockets: {
        connections: 0,
        messages: 0,
        errors: 0
      },
      system: {
        startTime: Date.now(),
        uptime: 0,
        memory: {},
        cpu: {}
      }
    };

    // Update system metrics every 30 seconds
    setInterval(() => this.updateSystemMetrics(), 30000);
  }

  /**
   * Middleware function to track request performance
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const { method, path } = req;

      // Track request start
      this.metrics.requests.total++;

      // Initialize endpoint metrics if needed
      if (!this.metrics.requests.byEndpoint[path]) {
        this.metrics.requests.byEndpoint[path] = {
          count: 0,
          responseTimes: [],
          errors: 0
        };
      }

      if (!this.metrics.requests.byMethod[method]) {
        this.metrics.requests.byMethod[method] = 0;
      }

      // Track when response finishes
      onFinished(res, () => {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;
        const statusClass = `${Math.floor(statusCode / 100)}xx`;

        // Update general metrics
        this.metrics.requests.byMethod[method]++;
        this.metrics.requests.byStatus[statusClass] =
          (this.metrics.requests.byStatus[statusClass] || 0) + 1;

        // Update endpoint metrics
        const endpointMetrics = this.metrics.requests.byEndpoint[path];
        endpointMetrics.count++;
        endpointMetrics.responseTimes.push(responseTime);

        if (statusCode >= 400) {
          endpointMetrics.errors++;
        }

        // Keep only last 100 response times to avoid memory issues
        if (endpointMetrics.responseTimes.length > 100) {
          endpointMetrics.responseTimes.shift();
        }

        // Track response times
        this.metrics.responseTimes.all.push(responseTime);
        if (this.metrics.responseTimes.all.length > 1000) {
          this.metrics.responseTimes.all.shift();
        }

        // Special tracking for like operations
        if (path && path.includes('/like')) {
          this.trackLikeOperation(responseTime, statusCode);
        }

        // Log slow requests (> 1 second)
        if (responseTime > 1000) {
          console.warn(`⚠️ Slow request detected: ${method} ${path} took ${responseTime}ms`);
          this.logSlowRequest({
            method,
            path,
            responseTime,
            statusCode,
            timestamp: new Date()
          });
        }

        // Log the metrics periodically (every 100 requests)
        if (this.metrics.requests.total % 100 === 0) {
          this.logMetricsSummary();
        }
      });

      next();
    };
  }

  /**
   * Track like operation performance
   */
  trackLikeOperation(responseTime, statusCode) {
    this.metrics.likes.total++;

    if (statusCode < 400) {
      this.metrics.likes.successful++;
    } else {
      this.metrics.likes.failed++;
    }

    this.metrics.likes.responseTimes.push(responseTime);

    // Keep only last 100 like response times
    if (this.metrics.likes.responseTimes.length > 100) {
      this.metrics.likes.responseTimes.shift();
    }

    // Calculate average
    this.metrics.likes.avgResponseTime =
      this.metrics.likes.responseTimes.reduce((a, b) => a + b, 0) /
      this.metrics.likes.responseTimes.length;
  }

  /**
   * Track database query performance
   */
  trackDatabaseQuery(query, duration) {
    this.metrics.database.queries++;

    if (duration > 100) { // Slow query threshold: 100ms
      this.metrics.database.slowQueries.push({
        query: query.substring(0, 100), // Truncate for storage
        duration,
        timestamp: new Date()
      });

      // Keep only last 50 slow queries
      if (this.metrics.database.slowQueries.length > 50) {
        this.metrics.database.slowQueries.shift();
      }
    }
  }

  /**
   * Track WebSocket metrics
   */
  trackWebSocketConnection() {
    this.metrics.websockets.connections++;
  }

  trackWebSocketMessage() {
    this.metrics.websockets.messages++;
  }

  trackWebSocketError() {
    this.metrics.websockets.errors++;
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    const memUsage = process.memoryUsage();
    this.metrics.system.memory = {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    this.metrics.system.uptime = process.uptime();

    const cpuUsage = process.cpuUsage();
    this.metrics.system.cpu = {
      user: Math.round(cpuUsage.user / 1000), // Convert to ms
      system: Math.round(cpuUsage.system / 1000)
    };
  }

  /**
   * Log slow request details
   */
  logSlowRequest(details) {
    // In production, this could send to external monitoring service
    console.log('📊 Slow Request:', {
      ...details,
      avgResponseTime: this.getAverageResponseTime()
    });
  }

  /**
   * Calculate average response time
   */
  getAverageResponseTime() {
    const times = this.metrics.responseTimes.all;
    if (times.length === 0) {
      return 0;
    }
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  }

  /**
   * Calculate percentile response time
   */
  getPercentileResponseTime(percentile) {
    const times = [...this.metrics.responseTimes.all].sort((a, b) => a - b);
    if (times.length === 0) {
      return 0;
    }

    const index = Math.ceil((percentile / 100) * times.length) - 1;
    return times[index];
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary() {
    return {
      requests: {
        total: this.metrics.requests.total,
        byMethod: this.metrics.requests.byMethod,
        byStatus: this.metrics.requests.byStatus,
        errorRate: this.calculateErrorRate()
      },
      performance: {
        avgResponseTime: this.getAverageResponseTime(),
        p50: this.getPercentileResponseTime(50),
        p95: this.getPercentileResponseTime(95),
        p99: this.getPercentileResponseTime(99)
      },
      likes: {
        total: this.metrics.likes.total,
        successRate: this.metrics.likes.total > 0
          ? (this.metrics.likes.successful / this.metrics.likes.total * 100).toFixed(2) + '%'
          : '0%',
        avgResponseTime: Math.round(this.metrics.likes.avgResponseTime)
      },
      database: {
        totalQueries: this.metrics.database.queries,
        slowQueries: this.metrics.database.slowQueries.length
      },
      websockets: {
        connections: this.metrics.websockets.connections,
        messages: this.metrics.websockets.messages,
        errors: this.metrics.websockets.errors
      },
      system: this.metrics.system
    };
  }

  /**
   * Calculate error rate
   */
  calculateErrorRate() {
    const total = this.metrics.requests.total;
    if (total === 0) {
      return '0%';
    }

    const errors = (this.metrics.requests.byStatus['4xx'] || 0) +
                   (this.metrics.requests.byStatus['5xx'] || 0);

    return ((errors / total) * 100).toFixed(2) + '%';
  }

  /**
   * Log metrics summary
   */
  logMetricsSummary() {
    console.log('📊 Performance Metrics Summary:', this.getMetricsSummary());
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics() {
    this.metrics.requests.total = 0;
    this.metrics.requests.byEndpoint = {};
    this.metrics.requests.byMethod = {};
    this.metrics.requests.byStatus = {};
    this.metrics.responseTimes.all = [];
    this.metrics.likes = {
      total: 0,
      successful: 0,
      failed: 0,
      avgResponseTime: 0,
      responseTimes: []
    };
  }

  /**
   * Express route to expose metrics
   */
  metricsRoute() {
    return (req, res) => {
      res.json({
        success: true,
        data: this.getMetricsSummary(),
        timestamp: new Date()
      });
    };
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;
