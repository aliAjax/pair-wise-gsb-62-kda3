import { createReducer, on } from '@ngrx/store'
import type { Anomaly, AuditEntry, TailingsDataset } from '../domain'
import { DUTY_CHIEF, evaluateReading, latestInChain, nextEngineId, runRecalc } from '../domain'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
}

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部'
}

let idSeed = 50
const audit = (entityId: string, action: string, operator: string, detail: string): AuditEntry => ({
  id: `AUD-${Date.now()}-${idSeed++}`, entityId, action, operator, detail, createdAt: new Date().toISOString()
})

const refreshPointValue = (dataset: TailingsDataset, pointId: string): void => {
  const point = dataset.points.find((item) => item.id === pointId)
  if (!point) return
  const latest = dataset.readings.filter((reading) => reading.pointId === pointId).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
  if (latest) point.currentValue = latest.value
}

const recalcAndAudit = (dataset: TailingsDataset, anomalyId: string, readingId: string): void => {
  let task = dataset.recalcTasks.filter((item) => item.anomalyId === anomalyId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (!task || task.status === '重算通过') {
    task = { id: nextEngineId('RT'), anomalyId, readingId, status: '重算失败', attempts: 0, keptConclusion: '', note: '', updatedAt: '' }
    dataset.recalcTasks.unshift(task)
  } else {
    task.readingId = readingId
  }
  runRecalc(dataset, task)
  dataset.audit.unshift(audit(anomalyId, task.status === '重算通过' ? '失效重算通过' : '失效重算失败', '重算服务', `${task.note}（第${task.attempts}次）`))
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => ({ ...state, dataset, loading: false, selectedAnomalyId: dataset.anomalies[0]?.id ?? '' })),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !review.observed || !review.evidence || !review.reassessment) return state
    anomaly.fieldReviews.unshift({ ...review, version: anomaly.fieldReviews.length + 1 })
    anomaly.status = '原因调查中'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '提交现场复核', review.inspector, review.reassessment))
    return { ...state, dataset }
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !opinion.content) return state
    anomaly.opinions.unshift(opinion)
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '补充专业意见', opinion.specialist, `${opinion.conclusion}：${opinion.content}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !plan.owner || !plan.deadline || !plan.conditions) return state
    anomaly.plan = { ...plan, approvedBy: '', approvedAt: '' }
    anomaly.status = '待负责人审批'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '提交处置方案', '当前用户', `${plan.action}，责任方${plan.owner}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    if (anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) return state
    anomaly.plan.approvedBy = approver
    anomaly.plan.approvedAt = new Date().toISOString()
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '审批处置方案', approver, note || '同意执行'))
    return { ...state, dataset }
  }),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !anomaly.plan.approvedBy || !anomaly.fieldReviews.length || !note.trim()) return state
    anomaly.status = '已关闭'
    anomaly.closedAt = new Date().toISOString()
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '关闭异常', anomaly.plan.approvedBy, `${note}；原判定保留不改写`))
    return { ...state, dataset }
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    anomaly.plan.emergencyLinked = true
    anomaly.status = '应急联动'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '启动应急联动', '值班负责人', note))
    return { ...state, dataset }
  }),
  on(TailingsActions.openOutage, (state, { window }) => {
    const dataset = structuredClone(state.dataset)
    if (!window.pointId || !window.reason.trim()) return state
    if (dataset.outageWindows.some((item) => item.pointId === window.pointId && !item.endedAt)) return state
    dataset.outageWindows.unshift(window)
    dataset.audit.unshift(audit(window.pointId, '开启测点停用', window.createdBy, `${window.reason}；停用窗口只抑制设备波动报警，水位、降雨安全报警不受影响`))
    return { ...state, dataset }
  }),
  on(TailingsActions.closeOutage, (state, { pointId }) => {
    const dataset = structuredClone(state.dataset)
    const window = dataset.outageWindows.find((item) => item.pointId === pointId && !item.endedAt)
    if (!window) return state
    window.endedAt = new Date().toISOString()
    dataset.audit.unshift(audit(pointId, '恢复测点运行', '当前用户', `停用窗口${window.id}结束，报警判定恢复正常`))
    return { ...state, dataset }
  }),
  on(TailingsActions.submitSilence, (state, { rule }) => {
    const dataset = structuredClone(state.dataset)
    if (!rule.zone || !rule.reason.trim()) return state
    if (rule.authorizedBy !== DUTY_CHIEF) {
      dataset.silenceRules.unshift({ ...rule, status: '已拒绝' })
      dataset.audit.unshift(audit(rule.id, '越权提交静默被拒绝', rule.submittedBy, `分区静默须值班长授权，提交人未获值班长授权，${rule.zone}静默规则已拒绝并留痕`))
      return { ...state, dataset }
    }
    dataset.silenceRules.unshift({ ...rule, status: '生效' })
    dataset.audit.unshift(audit(rule.id, '分区静默生效', rule.authorizedBy, `${rule.zone}：${rule.reason}；静默只抑制设备波动报警，安全类报警仍放行`))
    return { ...state, dataset }
  }),
  on(TailingsActions.liftSilence, (state, { ruleId }) => {
    const dataset = structuredClone(state.dataset)
    const rule = dataset.silenceRules.find((item) => item.id === ruleId && item.status === '生效')
    if (!rule) return state
    rule.status = '已解除'
    dataset.audit.unshift(audit(rule.id, '解除分区静默', '当前用户', `${rule.zone}静默解除，报警判定恢复正常`))
    return { ...state, dataset }
  }),
  on(TailingsActions.ingestReading, (state, { reading }) => {
    const dataset = structuredClone(state.dataset)
    if (!reading.pointId || !reading.id) return state
    dataset.readings.unshift(reading)
    refreshPointValue(dataset, reading.pointId)
    dataset.audit.unshift(audit(reading.pointId, '写入读数', '采集网关', `${reading.value}${reading.unit}（${reading.quality}）`))
    const evaluation = evaluateReading(dataset, reading)
    if (evaluation) {
      if (evaluation.anomaly) {
        evaluation.decision.anomalyId = evaluation.anomaly.id
        dataset.anomalies.unshift(evaluation.anomaly)
        const point = dataset.points.find((item) => item.id === reading.pointId)
        if (point) point.status = '异常'
        dataset.audit.unshift(audit(reading.pointId, evaluation.anomaly.status === '应急联动' ? '生成异常并进入应急联动' : '生成异常', '阈值引擎', evaluation.decision.reason))
      } else {
        dataset.audit.unshift(audit(reading.pointId, '抑制设备波动报警', '阈值引擎', evaluation.decision.reason))
      }
      dataset.decisions.unshift(evaluation.decision)
    }
    return { ...state, dataset }
  }),
  on(TailingsActions.backfillReading, (state, { reading }) => {
    const dataset = structuredClone(state.dataset)
    if (!reading.pointId || !reading.id || !reading.supersedesId) return state
    dataset.readings.unshift(reading)
    refreshPointValue(dataset, reading.pointId)
    dataset.audit.unshift(audit(reading.pointId, '回补读数', '当前用户', `回补${reading.supersedesId}：${reading.value}${reading.unit}（${reading.quality}），原始读数保留不覆盖`))
    dataset.anomalies.filter((anomaly) => anomaly.status !== '已关闭' && latestInChain(dataset.readings, anomaly.triggerReadingId).id === reading.id)
      .forEach((anomaly) => recalcAndAudit(dataset, anomaly.id, reading.id))
    return { ...state, dataset }
  }),
  on(TailingsActions.retryRecalc, (state, { taskId }) => {
    const dataset = structuredClone(state.dataset)
    const task = dataset.recalcTasks.find((item) => item.id === taskId)
    if (!task || task.status !== '重算失败') return state
    const updated = runRecalc(dataset, task)
    dataset.audit.unshift(audit(updated.anomalyId, updated.status === '重算通过' ? '失效重算通过' : '失效重算失败', '重算服务', `重试：${updated.note}（第${updated.attempts}次）`))
    return { ...state, dataset }
  }),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({ ...initialTailingsState, dataset: structuredClone(seedDataset), selectedAnomalyId: seedDataset.anomalies[0].id }))
)
