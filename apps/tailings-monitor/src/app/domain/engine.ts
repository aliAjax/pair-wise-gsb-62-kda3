import type { AlarmCategory, AlarmDecision, Anomaly, MonitoringType, OutageWindow, RawReading, RecalcTask, SilenceRule, TailingsDataset } from './models'

export const DUTY_CHIEF = '值班长 林海'

let engineSeq = 100
export const nextEngineId = (prefix: string): string => `${prefix}-${Date.now()}-${engineSeq++}`

export function alarmCategory(type: MonitoringType): AlarmCategory {
  return type === '水位' || type === '降雨' ? '安全阈值' : '设备波动'
}

export function activeOutage(windows: OutageWindow[], pointId: string, at: string): OutageWindow | undefined {
  return windows.find((window) => window.pointId === pointId && window.startedAt <= at && (!window.endedAt || at <= window.endedAt))
}

export function activeSilence(rules: SilenceRule[], zone: string): SilenceRule | undefined {
  return rules.find((rule) => rule.zone === zone && rule.status === '生效')
}

export function latestInChain(readings: RawReading[], readingId: string): RawReading {
  let current = readings.find((reading) => reading.id === readingId)
  if (!current) throw new Error(`读数不存在：${readingId}`)
  for (;;) {
    const next = readings.filter((reading) => reading.supersedesId === current!.id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
    if (!next) return current
    current = next
  }
}

export interface Evaluation {
  decision: AlarmDecision
  anomaly?: Anomaly
}

export function evaluateReading(dataset: TailingsDataset, reading: RawReading): Evaluation | null {
  const point = dataset.points.find((item) => item.id === reading.pointId)
  const threshold = dataset.thresholds.find((item) => item.id === point?.thresholdId)
  if (!point || !threshold || !threshold.enabled || reading.quality === '无效' || reading.value < threshold.alarm) return null
  const category = alarmCategory(point.type)
  const base = { id: nextEngineId('DC'), pointId: point.id, readingId: reading.id, category, createdAt: new Date().toISOString() }
  if (category === '设备波动') {
    const outage = activeOutage(dataset.outageWindows, point.id, reading.capturedAt)
    if (outage) {
      return { decision: { ...base, decision: '抑制', anomalyId: '', reason: `测点停用窗口${outage.id}（${outage.reason}）内，停用窗口只抑制设备波动报警，不生成异常` } }
    }
    const silence = activeSilence(dataset.silenceRules, point.zone)
    if (silence) {
      return { decision: { ...base, decision: '抑制', anomalyId: '', reason: `分区静默${silence.id}生效中（${silence.authorizedBy}授权），设备波动报警被抑制，不生成异常` } }
    }
    return { decision: { ...base, decision: '放行', anomalyId: '', reason: '不在停用窗口与分区静默范围内，设备波动报警放行，生成异常' }, anomaly: buildAnomaly(dataset, point.id, reading, category, threshold.alarm, false) }
  }
  const outage = activeOutage(dataset.outageWindows, point.id, reading.capturedAt)
  const silence = activeSilence(dataset.silenceRules, point.zone)
  const bypass = [outage ? `停用窗口${outage.id}` : '', silence ? `分区静默${silence.id}` : ''].filter(Boolean).join('与')
  return {
    decision: { ...base, decision: '放行', anomalyId: '', reason: `${point.type}触达报警值，安全类报警不受${bypass || '停用与静默'}抑制，放行生成异常并进入应急联动` },
    anomaly: buildAnomaly(dataset, point.id, reading, category, threshold.alarm, true)
  }
}

function buildAnomaly(dataset: TailingsDataset, pointId: string, reading: RawReading, category: AlarmCategory, alarm: number, emergency: boolean): Anomaly {
  const point = dataset.points.find((item) => item.id === pointId)!
  const threshold = dataset.thresholds.find((item) => item.id === point.thresholdId)!
  const determination = `${point.name}读数${reading.value}${reading.unit}触达报警值${alarm}${threshold.unit}（阈值V${threshold.version}），判定${category}异常`
  return {
    id: nextEngineId('AN'), pointId, title: `${point.name}${point.type}触达报警值`, severity: emergency ? '重大' : '较高',
    status: emergency ? '应急联动' : '待现场复核', openedAt: new Date().toISOString(), owner: emergency ? '库区调度班' : '坝体安全组',
    triggerReadingId: reading.id, observedValue: `${reading.value} ${reading.unit}，报警值 ${alarm} ${threshold.unit}`,
    category, determination, conclusion: emergency ? '原判定生效，已联动应急值班' : '原判定生效，待现场复核', invalidated: false,
    fieldReviews: [], opinions: [],
    plan: { id: nextEngineId('PL'), action: emergency ? '应急撤离准备' : '加密监测', owner: emergency ? '库区调度班' : '坝体安全组', deadline: '', conditions: '', emergencyLinked: emergency, approvedBy: '', approvedAt: '' },
    closedAt: '', version: 1
  }
}

export function runRecalc(dataset: TailingsDataset, task: RecalcTask): RecalcTask {
  const anomaly = dataset.anomalies.find((item) => item.id === task.anomalyId)
  if (!anomaly) return task
  const point = dataset.points.find((item) => item.id === anomaly.pointId)
  const threshold = dataset.thresholds.find((item) => item.id === point?.thresholdId)
  if (!point || !threshold) return task
  task.attempts += 1
  task.updatedAt = new Date().toISOString()
  task.keptConclusion = anomaly.conclusion
  const latest = latestInChain(dataset.readings, anomaly.triggerReadingId)
  if (latest.quality !== '有效') {
    task.status = '重算失败'
    task.note = `回补读数${latest.id}质量为${latest.quality}，无法完成失效重算，保留前一结论，可修正后重试`
    return task
  }
  task.status = '重算通过'
  if (latest.value >= threshold.alarm) {
    anomaly.invalidated = false
    anomaly.conclusion = `回补读数${latest.id}为${latest.value}${latest.unit}，仍达报警值${threshold.alarm}${threshold.unit}，原判定维持`
    task.note = '重算通过，原判定维持'
  } else {
    anomaly.invalidated = true
    anomaly.conclusion = `回补读数${latest.id}为${latest.value}${latest.unit}，低于报警值${threshold.alarm}${threshold.unit}，原触发失效，原判定保留不改写`
    task.note = '重算通过，原触发失效'
  }
  anomaly.version += 1
  return task
}

export function buildReviewPackage(dataset: TailingsDataset): TailingsDataset & { exportedAt: string; reviewNotes: string[] } {
  return {
    ...dataset,
    exportedAt: new Date().toISOString(),
    reviewNotes: dataset.decisions.map((decision) => `${decision.decision} ${decision.pointId}/${decision.readingId}（${decision.category}）：${decision.reason}${decision.anomalyId ? `，关联异常${decision.anomalyId}` : ''}`)
  }
}
