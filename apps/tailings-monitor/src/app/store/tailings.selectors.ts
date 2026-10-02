import { createFeatureSelector, createSelector } from '@ngrx/store'
import type { AuditEntry, MonitoringPoint, PointStatus, TailingsDataset, ThresholdEvaluation } from '../domain'
import { isWithinWindow } from '../domain'
import type { TailingsState } from './tailings.reducer'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')
export const selectDataset = createSelector(selectTailings, (state) => state.dataset)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectCurrentOperator = createSelector(selectTailings, (state) => state.currentOperator)
export const selectNotice = createSelector(selectTailings, (state) => state.notice)
export const selectForceRecomputeFailure = createSelector(selectTailings, (state) => state.forceRecomputeFailure)

/** 演示数据的统一当前时刻（2026-09-29 11:00），窗口生效判断以此为基准 */
export const REFERENCE_NOW = '2026-09-29T11:00:00'

/** 测点当前是否处于停用窗口 */
export const selectDeactivationMap = createSelector(selectDataset, (dataset) => {
  const map = new Map<string, { window: TailingsDataset['deactivations'][number]; active: boolean }>()
  for (const point of dataset.points) {
    const window = dataset.deactivations
      .filter((item) => item.pointId === point.id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))[0]
    if (window) map.set(point.id, { window, active: isWithinWindow(REFERENCE_NOW, window.startAt, window.endAt) })
  }
  return map
})

/** 分区当前是否处于有效静默 */
export const selectSilenceMap = createSelector(selectDataset, (dataset) => {
  const map = new Map<string, TailingsDataset['silences'][number]>()
  for (const silence of dataset.silences) {
    if (silence.active && isWithinWindow(REFERENCE_NOW, silence.startAt, silence.endAt) && !map.has(silence.zone)) map.set(silence.zone, silence)
  }
  return map
})

/** 叠加停用状态后的测点（检修停用窗口内显示"停用"，但安全触达评估照常进行） */
export const selectPointsWithRuntime = createSelector(selectPoints, selectDeactivationMap, (points, deactivationMap) =>
  points.map((point): MonitoringPoint & { deactivated: boolean; deactivationReason: string } => {
    const info = deactivationMap.get(point.id)
    return { ...point, status: (info?.active ? '停用' : point.status) as PointStatus, deactivated: !!info?.active, deactivationReason: info?.window.reason ?? '' }
  })
)

export const selectSelectedAnomaly = createSelector(selectTailings, (state) => state.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? state.dataset.anomalies[0])
export const selectFilteredAnomalies = createSelector(selectTailings, (state) => state.dataset.anomalies.filter((item) => {
  const point = state.dataset.points.find((value) => value.id === item.pointId)
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))

export interface ReviewEvaluationLine {
  evaluation: ThresholdEvaluation
  pointName: string
  pointZone: string
  readingValue: string
  readingAt: string
  backfilled: boolean
  relatedAnomalyId: string
  decisionText: string
}

/** 审阅包核心：每条评估逐条说明为何抑制或放行 */
export const selectReviewLines = createSelector(selectDataset, (dataset): ReviewEvaluationLine[] =>
  dataset.evaluations
    .slice()
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))
    .map((evaluation) => {
      const point = dataset.points.find((item) => item.id === evaluation.pointId)
      const reading = dataset.readings.find((item) => item.id === evaluation.readingId)
      const decisionText = evaluation.outcome === '抑制'
        ? `【抑制｜${evaluation.suppressionBasis}】${evaluation.rationale}`
        : `【放行】${evaluation.rationale}`
      return {
        evaluation,
        pointName: point?.name ?? evaluation.pointId,
        pointZone: point?.zone ?? '',
        readingValue: `${evaluation.value}${reading?.unit ?? ''}`,
        readingAt: reading?.capturedAt.replace('T', ' ').slice(0, 16) ?? '',
        backfilled: !!reading?.backfilled,
        relatedAnomalyId: evaluation.relatedAnomalyId,
        decisionText
      }
    })
)

/** 按异常汇总的关闭/判定冻结说明 */
export const selectAnomalyReviewLines = createSelector(selectDataset, (dataset) =>
  dataset.anomalies.map((anomaly) => {
    const point = dataset.points.find((item) => item.id === anomaly.pointId)
    const source = dataset.evaluations.find((item) => item.id === anomaly.sourceEvaluationId)
    return {
      anomaly,
      pointName: point?.name ?? anomaly.pointId,
      source,
      frozenConclusion: source
        ? `${source.outcome}/${source.level}（${source.category}${source.suppressionBasis ? `，${source.suppressionBasis}` : ''}）— ${source.rationale}`
        : '源评估缺失',
      closureNote: anomaly.status === '已关闭'
        ? `已关闭（${anomaly.closedAt.replace('T', ' ').slice(0, 16)}）；关闭未改写原判定，源评估${anomaly.sourceEvaluationId}冻结。`
        : `处置中（${anomaly.status}）；原判定${anomaly.sourceEvaluationId}保持有效${anomaly.recomputeNote ? '；' + anomaly.recomputeNote : ''}`
    }
  })
)

export interface ReviewPackage {
  generatedAt: string
  summary: {
    points: number
    anomalies: number
    openSafetyAnomalies: number
    suppressed: number
    admitted: number
    recomputeJobs: number
    recomputeFailed: number
  }
  deactivationWindows: TailingsDataset['deactivations']
  zoneSilences: TailingsDataset['silences']
  evaluations: ReviewEvaluationLine[]
  anomalyConclusions: {
    anomalyId: string
    title: string
    status: string
    category: string
    frozenConclusion: string
    closureNote: string
  }[]
  recomputeJobs: TailingsDataset['recomputeJobs']
  audit: AuditEntry[]
}

export const selectReviewPackage = createSelector(selectDataset, selectReviewLines, selectAnomalyReviewLines, (dataset, lines, anomalyLines): ReviewPackage => ({
  generatedAt: new Date().toISOString(),
  summary: {
    points: dataset.points.length,
    anomalies: dataset.anomalies.length,
    openSafetyAnomalies: dataset.anomalies.filter((item) => item.category === '安全触达' && item.status !== '已关闭').length,
    suppressed: lines.filter((line) => line.evaluation.outcome === '抑制').length,
    admitted: lines.filter((line) => line.evaluation.outcome === '放行').length,
    recomputeJobs: dataset.recomputeJobs.length,
    recomputeFailed: dataset.recomputeJobs.filter((item) => item.status === '失败').length
  },
  deactivationWindows: dataset.deactivations,
  zoneSilences: dataset.silences,
  evaluations: lines,
  anomalyConclusions: anomalyLines.map((line) => ({
    anomalyId: line.anomaly.id,
    title: line.anomaly.title,
    status: line.anomaly.status,
    category: line.anomaly.category,
    frozenConclusion: line.frozenConclusion,
    closureNote: line.closureNote
  })),
  recomputeJobs: dataset.recomputeJobs,
  audit: dataset.audit
}))
