import type { HealthState, MonitorHealth, MonitorMetric } from '@/api/channelMonitorV2'

export function timelineHealthState(metrics: MonitorMetric, health: MonitorHealth): HealthState {
  // The backend checks sample sufficiency before redacting request counts for users.
  if (health.error_rate === 'unknown' || !Number.isFinite(metrics.error_rate)
    || metrics.error_rate < 0 || metrics.error_rate > 1) {
    return 'unknown'
  }

  const ttft = metrics.ttft.p50_ms
  const hasLatency = health.ttft !== 'unknown' && ttft != null && Number.isFinite(ttft) && ttft >= 0

  if (metrics.error_rate >= 0.30 || (hasLatency && ttft > 60_000)) return 'critical'
  if (metrics.error_rate >= 0.15 || (hasLatency && ttft > 20_000)) return 'warning'
  return 'healthy'
}
