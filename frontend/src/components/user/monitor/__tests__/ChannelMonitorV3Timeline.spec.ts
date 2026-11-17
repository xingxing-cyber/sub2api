import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MonitorMatrixBucket, MonitorMatrixRow } from '@/api/channelMonitorV2'
import { timelineHealthState } from '@/features/channel-monitor-v2/timelineHealth'
import ChannelMonitorV3Timeline from '../ChannelMonitorV3Timeline.vue'
import ChannelMonitorV3Card from '../ChannelMonitorV3Card.vue'

vi.mock('vue-i18n', async importOriginal => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => values ? JSON.stringify(values) : key,
    locale: { value: 'zh-CN' },
  }),
}))

enableAutoUnmount(afterEach)

function bucket(errorRate = 0, ttft: number | null = 1000): MonitorMatrixBucket {
  return {
    bucket_start: '2026-10-15T00:00:00Z',
    metrics: {
      success_requests: 100, error_requests: 0, request_count: 100, token_count: 100,
      rpm: 100, tpm: 100, error_rate: errorRate, cache_rate: 0, cache_rate_warm: 0,
      cache_rate_numerator: 0, cache_rate_denominator: 100,
      ttft: { sample_count: 100, p50_ms: ttft, p95_ms: ttft, avg_ms: ttft },
      duration: { sample_count: 100, p50_ms: 1000, p95_ms: 1000, avg_ms: 1000 },
    },
    health: {
      overall: 'healthy', error_rate: 'healthy', ttft: 'healthy', cache: 'healthy', minimum_sample: 50,
    },
  }
}

describe('passive timeline thresholds', () => {
  it.each([
    [0, 20_000, 'healthy'],
    [0.1499, 20_000, 'healthy'],
    [0.15, 1000, 'warning'],
    [0.25, 1000, 'warning'],
    [0.2999, 1000, 'warning'],
    [0.30, 1000, 'critical'],
    [1, null, 'critical'],
    [0, 20_001, 'warning'],
    [0, 60_000, 'warning'],
    [0, 60_001, 'critical'],
    [0.15, 60_001, 'critical'],
    [0.30, 20_001, 'critical'],
    [0.15, null, 'warning'],
    [0, null, 'healthy'],
  ] as const)('error rate %s and TTFT %s yield %s', (errorRate, ttft, expected) => {
    const sample = bucket(errorRate, ttft)
    expect(timelineHealthState(sample.metrics, sample.health)).toBe(expected)
  })

  it.each([0, 0.15, 0.30])('preserves status for ordinary users with redacted counts (%s)', errorRate => {
    const sample = bucket(errorRate)
    const expected = timelineHealthState(sample.metrics, sample.health)
    sample.metrics.request_count = 0
    sample.metrics.ttft.sample_count = 0
    expect(timelineHealthState(sample.metrics, sample.health)).toBe(expected)
  })

  it('keeps no-data and insufficient samples gray, including apparent failures', () => {
    const sample = bucket(1, 70_000)
    sample.health.error_rate = 'unknown'
    expect(timelineHealthState(sample.metrics, sample.health)).toBe('unknown')
  })

  it('does not let cache health or the old weighted score set timeline color', () => {
    const sample = bucket()
    sample.health.overall = 'critical'
    sample.health.cache = 'critical'
    expect(timelineHealthState(sample.metrics, sample.health)).toBe('healthy')
  })

  it('ignores insufficient latency samples while still judging errors', () => {
    const sample = bucket(0.15, 70_000)
    sample.health.ttft = 'unknown'
    expect(timelineHealthState(sample.metrics, sample.health)).toBe('warning')
  })

  it.each([NaN, Infinity, -0.1, 1.1])('does not color invalid error rates green (%s)', errorRate => {
    const sample = bucket(errorRate)
    expect(timelineHealthState(sample.metrics, sample.health)).toBe('unknown')
  })
})

describe('passive timeline rendering', () => {
  it('renders green, yellow, red and gray at their agreed heights', () => {
    const samples = [bucket(), bucket(0.15), bucket(0, 60_001), bucket()]
    samples[3].health.error_rate = 'unknown'
    samples.forEach((sample, i) => { sample.bucket_start = `2026-10-15T00:0${i}:00Z` })
    const wrapper = mount(ChannelMonitorV3Timeline, { props: { buckets: samples, countdownSeconds: 60, length: 4 } })
    const bars = wrapper.findAll('.v3-soft-glass-bar')
    for (const [i, color, height] of [
      [0, 'bg-emerald-500', 100], [1, 'bg-amber-500', 65],
      [2, 'bg-red-500', 35], [3, 'bg-gray-300', 35],
    ] as const) {
      expect(bars[i].classes()).toContain(color)
      expect(bars[i].attributes('style')).toContain(`height: ${height}%`)
    }
    expect(wrapper.findAll('button')[1].attributes('aria-label')).toContain('15.0%')
    expect(wrapper.findAll('button')[2].attributes('aria-label')).toContain('60.0s')
    expect(wrapper.findAll('button')[3].attributes('aria-label')).toContain('channelMonitorV3.unknown')
    expect(wrapper.findAll('button')[3].attributes('aria-label')).not.toContain('0.00%')
  })

  it('renders redacted successful traffic in green and missing history in gray', () => {
    const sample = bucket()
    sample.metrics.request_count = 0
    sample.metrics.ttft.sample_count = 0
    const wrapper = mount(ChannelMonitorV3Timeline, { props: { buckets: [sample], countdownSeconds: 60, length: 2 } })
    const bars = wrapper.findAll('.v3-soft-glass-bar')
    expect(bars[0].classes()).toContain('bg-gray-300')
    expect(bars[0].attributes('style')).toContain('height: 35%')
    expect(bars[1].classes()).toContain('bg-emerald-500')
    expect(bars[1].attributes('style')).toContain('height: 100%')
  })
})

describe('passive card status', () => {
  it.each([
    [0, 20_000, 'operational'],
    [0.25, 1000, 'degraded'],
    [0, 60_001, 'failed'],
  ] as const)('matches the latest bar for error rate %s and TTFT %s', (errorRate, ttft, status) => {
    const latest = bucket(errorRate, ttft)
    latest.health.overall = 'critical'
    const aggregate = bucket(1, 70_000)
    const row: MonitorMatrixRow = {
      platform: 'anthropic', group_id: 7, group_name: 'Example',
      metrics: aggregate.metrics, health: aggregate.health, buckets: [latest],
    }
    const wrapper = mount(ChannelMonitorV3Card, {
      props: { row, countdownSeconds: 60, timelineLength: 18 },
      global: { stubs: { ProviderIcon: true, ChannelMonitorV3Timeline: true, IntelligenceUptime: true } },
    })
    expect(wrapper.get('header > span:last-child').text()).toBe(`monitorCommon.status.${status}`)
  })

  it('keeps a card with insufficient samples unknown', () => {
    const sample = bucket(1, 70_000)
    sample.health.error_rate = 'unknown'
    const row: MonitorMatrixRow = {
      platform: 'anthropic', group_id: 7, group_name: 'Example',
      metrics: sample.metrics, health: sample.health, buckets: [],
    }
    const wrapper = mount(ChannelMonitorV3Card, {
      props: { row, countdownSeconds: 60, timelineLength: 18 },
      global: { stubs: { ProviderIcon: true, ChannelMonitorV3Timeline: true, IntelligenceUptime: true } },
    })
    expect(wrapper.get('header > span:last-child').text()).toBe('channelMonitorV3.unknown')
  })
})
