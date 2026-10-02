import type {
  AlarmCategory,
  Anomaly,
  AnomalyStatus,
  DeactivationWindow,
  MonitoringPoint,
  MonitoringType,
  RawReading,
  Severity,
  SuppressionBasis,
  Threshold,
  ThresholdEvaluation,
  ZoneSilence
} from './models'

export interface EvaluationInput {
  point: MonitoringPoint
  threshold: Threshold
  reading: RawReading
  deactivations: DeactivationWindow[]
  silences: ZoneSilence[]
}

export interface AdmissionInput {
  evaluation: ThresholdEvaluation
  point: MonitoringPoint
  reading: RawReading
  existingAnomalies: Anomaly[]
}

/** 安全触达类型：水位、降雨达到报警值必须进入应急，任何静默/停用都不能抑制 */
const SAFETY_TYPES: MonitoringType[] = ['水位', '降雨']

export function isWithinWindow(at: string, startAt: string, endAt: string): boolean {
  const t = new Date(at).getTime()
  return t >= new Date(startAt).getTime() && t <= new Date(endAt).getTime()
}

/** 报警类别：水位/降雨的报警值触达为安全触达；位移/渗流（含速率类）为设备波动 */
export type EvaluationLevel = '正常' | '预警' | '报警'
export function classifyCategory(type: MonitoringType, level: EvaluationLevel): AlarmCategory {
  return SAFETY_TYPES.includes(type) && level === '报警' ? '安全触达' : '设备波动'
}

export function evaluateReading(input: EvaluationInput, evaluatedAt = new Date().toISOString()): Omit<ThresholdEvaluation, 'id' | 'revision' | 'active' | 'relatedAnomalyId' | 'evaluatedAt'> {
  const { point, threshold, reading, deactivations, silences } = input
  const level: EvaluationLevel = reading.value >= threshold.alarm ? '报警' : reading.value >= threshold.warning ? '预警' : '正常'
  const category = classifyCategory(point.type, level)

  // 读数未达预警值：不报警、不生成异常（正常读数也不因停用/静默产生任何抑制记录）
  if (level === '正常') {
    return {
      readingId: reading.id, pointId: point.id, value: reading.value, level, category,
      outcome: '放行', suppressionBasis: '',
      rationale: `${point.type}读数${reading.value}${reading.unit}低于预警值${threshold.warning}${threshold.unit}，未触发报警，不生成异常。`
    }
  }

  // 安全触达（水位、降雨达报警值）：停用窗口与分区静默都不得抑制，直接放行进入应急
  if (category === '安全触达') {
    return {
      readingId: reading.id, pointId: point.id, value: reading.value, level, category,
      outcome: '放行', suppressionBasis: '',
      rationale: `${point.type}读数${reading.value}${reading.unit}达到报警值${threshold.alarm}${threshold.unit}，属安全触达；停用窗口/分区静默均不得抑制，直接生成重大异常并进入应急联动。`
    }
  }

  const window = deactivations.find((item) => item.pointId === point.id && isWithinWindow(reading.capturedAt, item.startAt, item.endAt))
  if (window) {
    return {
      readingId: reading.id, pointId: point.id, value: reading.value, level, category,
      outcome: '抑制', suppressionBasis: '停用窗口',
      rationale: `${point.type}${level === '报警' ? '超报警' : '超预警'}读数${reading.value}${reading.unit}属设备波动；测点处于检修停用窗口（${window.reason}，${window.startAt.replace('T', ' ')} ~ ${window.endAt.replace('T', ' ')}），仅抑制设备波动报警，不生成异常；水位/降雨安全触达不受此窗口影响。`
    }
  }

  const silence = silences.find((item) => item.zone === point.zone && item.active && isWithinWindow(reading.capturedAt, item.startAt, item.endAt))
  if (silence) {
    return {
      readingId: reading.id, pointId: point.id, value: reading.value, level, category,
      outcome: '抑制', suppressionBasis: '分区静默',
      rationale: `${point.zone}分区处于值班长授权静默期（${silence.reason}，${silence.startAt.replace('T', ' ')} ~ ${silence.endAt.replace('T', ' ')}，授权人${silence.authorizedBy}）；${point.type}${level === '报警' ? '超报警' : '超预警'}读数${reading.value}${reading.unit}为非安全报警予以静默；安全触达异常不在静默范围。`
    }
  }

  return {
    readingId: reading.id, pointId: point.id, value: reading.value, level, category,
    outcome: '放行', suppressionBasis: '',
    rationale: `${point.type}读数${reading.value}${reading.unit}${level === '报警' ? `达到报警值${threshold.alarm}` : `达到预警值${threshold.warning}`}${threshold.unit}，测点未停用、分区未静默，放行并生成异常。`
  }
}

export function severityFor(category: AlarmCategory, level: EvaluationLevel): Severity {
  if (category === '安全触达') return '重大'
  return level === '报警' ? '较高' : '关注'
}

export function statusFor(category: AlarmCategory, level: EvaluationLevel): AnomalyStatus {
  // 安全触达直接进入应急联动；其余报警走待现场复核流程
  return category === '安全触达' ? '应急联动' : level === '报警' ? '原因调查中' : '待现场复核'
}

/** 安全触达默认应急处置方案 */
export function emergencyPlanFor(pointId: string): Anomaly['plan'] {
  return {
    id: `PL-${pointId}-SAFE`,
    action: '应急撤离准备',
    owner: '应急值班室',
    deadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16),
    conditions: '每15分钟复测；安全触达期间下游预警与撤离准备持续，恢复报警值以下并稳定2小时后由负责人关闭。',
    emergencyLinked: true,
    approvedBy: '值班负责人',
    approvedAt: new Date().toISOString()
  }
}

/**
 * 放行后的异常准入：同一测点已有未关闭异常则并入（不重复生成）；
 * 已关闭异常之后出现的新安全触达/报警则开新单。返回 null 表示并入既有异常。
 */
export function admitAnomaly(input: AdmissionInput, now = new Date().toISOString()): { anomaly: Anomaly | null; targetAnomalyId: string; merged: boolean } {
  const { evaluation, point, reading, existingAnomalies } = input
  const open = existingAnomalies.find((item) => item.pointId === point.id && item.status !== '已关闭')
  if (open) {
    return { anomaly: null, targetAnomalyId: open.id, merged: true }
  }
  const anomalyId = `AN-${reading.capturedAt.slice(2, 10).replace(/-/g, '')}-${point.id}`
  const severity = severityFor(evaluation.category, evaluation.level)
  const anomaly: Anomaly = {
    id: anomalyId,
    pointId: point.id,
    title: evaluation.category === '安全触达'
      ? `${point.name}${point.type}触达报警值，启动应急联动`
      : `${point.name}${point.type}${evaluation.level === '报警' ? '超报警' : '超预警'}阈值`,
    severity,
    status: statusFor(evaluation.category, evaluation.level),
    openedAt: now,
    owner: evaluation.category === '安全触达' ? '应急值班室' : '坝体安全组',
    triggerReadingId: reading.id,
    observedValue: `${reading.value} ${reading.unit}（${reading.capturedAt.replace('T', ' ')}）${evaluation.category === '安全触达' ? '，安全触达报警值' : ''}`,
    fieldReviews: [],
    opinions: [],
    plan: evaluation.category === '安全触达'
      ? emergencyPlanFor(point.id)
      : { id: `PL-${anomalyId}`, action: '加密监测', owner: '库区调度班', deadline: '', conditions: '', emergencyLinked: false, approvedBy: '', approvedAt: '' },
    closedAt: '',
    version: 1,
    sourceEvaluationId: evaluation.id,
    category: evaluation.category,
    recomputeNote: ''
  }
  return { anomaly, targetAnomalyId: anomalyId, merged: false }
}
