import { createReducer, on } from '@ngrx/store'
import type {
  Anomaly,
  AuditEntry,
  Operator,
  RecomputeJob,
  TailingsDataset,
  ThresholdEvaluation
} from '../domain'
import { admitAnomaly, evaluateReading } from '../domain'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
  currentOperator: Operator
  notice: { message: string; tone: 'error' | 'success' } | null
  /** 演示用：下一次重算强制失败，用于展示失败保留前一结论与重试 */
  forceRecomputeFailure: boolean
}

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部',
  currentOperator: { name: '值班长 关磊', role: '值班长' },
  notice: null,
  forceRecomputeFailure: false
}

let idSeed = 100
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${idSeed++}`
const auditEntry = (
  entityId: string,
  action: string,
  operator: string,
  operatorRole: string,
  detail: string,
  result: AuditEntry['result']
): AuditEntry => ({ id: nextId('AUD'), entityId, action, operator, operatorRole, detail, createdAt: new Date().toISOString(), result })

const findPoint = (dataset: TailingsDataset, pointId: string) => dataset.points.find((item) => item.id === pointId)
const findThreshold = (dataset: TailingsDataset, thresholdId: string) => dataset.thresholds.find((item) => item.id === thresholdId)

/** 对新读数执行阈值评估并落库（评估 + 异常准入 + 审计），返回变更后的 dataset */
function applyIngest(dataset: TailingsDataset, reading: TailingsDataset['readings'][number]): { dataset: TailingsDataset; job: RecomputeJob | null } {
  const point = findPoint(dataset, reading.pointId)
  const threshold = point ? findThreshold(dataset, point.thresholdId) : undefined
  if (!point || !threshold) return { dataset, job: null }

  const base = evaluateReading({ point, threshold, reading, deactivations: dataset.deactivations, silences: dataset.silences })
  const evaluation: ThresholdEvaluation = {
    ...base,
    id: nextId('EV'),
    revision: 1,
    active: true,
    relatedAnomalyId: '',
    evaluatedAt: new Date().toISOString()
  }
  dataset.evaluations.unshift(evaluation)
  dataset.readings.unshift(reading)

  let job: RecomputeJob | null = null

  if (evaluation.outcome === '抑制') {
    dataset.audit.unshift(auditEntry(
      point.id,
      '抑制设备波动报警',
      '阈值引擎',
      '系统',
      `${evaluation.suppressionBasis}抑制读数${reading.id}（${reading.value}${reading.unit}）：${evaluation.rationale}`,
      '系统'
    ))
  } else if (evaluation.level === '正常') {
    // 读数低于预警值：不生成异常，仅留评估记录
    dataset.audit.unshift(auditEntry(
      point.id,
      '正常读数评估',
      '阈值引擎',
      '系统',
      `读数${reading.id}（${reading.value}${reading.unit}）${evaluation.rationale}`,
      '系统'
    ))
  } else {
    const admitted = admitAnomaly({ evaluation, point, reading, existingAnomalies: dataset.anomalies })
    evaluation.relatedAnomalyId = admitted.targetAnomalyId
    if (admitted.anomaly) {
      dataset.anomalies.unshift(admitted.anomaly)
      dataset.audit.unshift(auditEntry(
        admitted.anomaly.id,
        evaluation.category === '安全触达' ? '安全触达放行' : '生成异常',
        '阈值引擎',
        '系统',
        evaluation.rationale,
        '系统'
      ))
    } else {
      dataset.audit.unshift(auditEntry(
        admitted.targetAnomalyId,
        '放行并入既有异常',
        '阈值引擎',
        '系统',
        `读数${reading.id}评估放行（${evaluation.category}），并入未关闭异常${admitted.targetAnomalyId}：${evaluation.rationale}`,
        '系统'
      ))
    }
  }

  if (reading.backfilled) {
    const prior = dataset.evaluations.find((item) => item.pointId === point.id && item.id !== evaluation.id && item.active)
    job = {
      id: nextId('RC'),
      pointId: point.id,
      triggerReadingId: reading.id,
      status: '待重算',
      attempts: 0,
      lastError: '',
      previousConclusion: prior ? `${prior.id}（${prior.outcome}/${prior.level}）→ 异常${prior.relatedAnomalyId || '无'}` : `${evaluation.id}（${evaluation.outcome}/${evaluation.level}）→ 异常${evaluation.relatedAnomalyId || '无'}`,
      requestedBy: '回补管道',
      requestedAt: new Date().toISOString(),
      finishedAt: ''
    }
    dataset.recomputeJobs.unshift(job)
    dataset.audit.unshift(auditEntry(
      point.id,
      '回补读数触发失效重算',
      '回补管道',
      '系统',
      `回补读数${reading.id}（${reading.value}${reading.unit}）写入，原始读数只追加不覆盖；标记${point.name}历史结论失效，发起重算${job.id}，失败时保留前一结论：${job.previousConclusion}`,
      '系统'
    ))
  }

  return { dataset, job }
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => ({ ...state, dataset, loading: false, selectedAnomalyId: dataset.anomalies[0]?.id ?? '', notice: null })),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(TailingsActions.switchOperator, (state, { operator }) => ({
    ...state,
    currentOperator: operator,
    notice: { message: `当前身份：${operator.role} ${operator.name}`, tone: 'success' as const },
    dataset: { ...state.dataset, audit: [auditEntry('会话', '切换身份', operator.name, operator.role, `后续授权操作按「${operator.role}」角色校验`, '系统'), ...state.dataset.audit] }
  })),
  on(TailingsActions.notice, (state, { message, tone }) => ({ ...state, notice: { message, tone } })),
  on(TailingsActions.clearNotice, (state) => ({ ...state, notice: null })),

  // 测点停用窗口登记：任何监测岗位均可登记，窗口只对设备波动生效
  on(TailingsActions.registerDeactivation, (state, { window }) => {
    if (!window.pointId || !window.reason || !window.startAt || !window.endAt) {
      return { ...state, notice: { message: '停用窗口信息不完整，未登记。', tone: 'error' as const } }
    }
    const point = findPoint(state.dataset, window.pointId)
    const dataset = structuredClone(state.dataset)
    const record = { ...window, id: nextId('DW'), createdBy: state.currentOperator.name }
    dataset.deactivations.unshift(record)
    dataset.audit.unshift(auditEntry(
      window.pointId,
      '登记测点停用窗口',
      state.currentOperator.name,
      state.currentOperator.role,
      `停用原因「${window.reason}」，${window.startAt.replace('T', ' ')} ~ ${window.endAt.replace('T', ' ')}；窗口仅抑制设备波动报警，水位/降雨安全触达仍生成异常并进入应急。`,
      '通过'
    ))
    return { ...state, dataset, notice: { message: `已登记${point?.name ?? window.pointId}停用窗口，仅抑制设备波动。`, tone: 'success' as const } }
  }),

  // 分区静默：仅值班长可授权，越权提交不改数据、写拒绝审计
  on(TailingsActions.requestZoneSilence, (state, { silence }) => {
    const operator = state.currentOperator
    if (operator.role !== '值班长') {
      const dataset = structuredClone(state.dataset)
      dataset.audit.unshift(auditEntry(
        silence.zone,
        '申请分区静默',
        operator.name,
        operator.role,
        `拒绝：${operator.role}无权授权分区静默（${silence.zone}，${silence.reason}），仅值班长可授权；本次提交未改变任何静默状态。`,
        '拒绝'
      ))
      return { ...state, dataset, notice: { message: `越权提交已拒绝：分区静默仅值班长可授权，并已留审计。`, tone: 'error' as const } }
    }
    if (!silence.zone || !silence.reason || !silence.startAt || !silence.endAt) {
      return { ...state, notice: { message: '静默申请信息不完整，未授权。', tone: 'error' as const } }
    }
    const dataset = structuredClone(state.dataset)
    const record = { ...silence, id: nextId('ZS'), authorizedBy: operator.name, authorizedAt: new Date().toISOString(), active: true }
    dataset.silences.unshift(record)
    dataset.audit.unshift(auditEntry(
      silence.zone,
      '授权分区静默',
      operator.name,
      operator.role,
      `值班长授权${silence.zone}分区静默（${silence.startAt.replace('T', ' ')} ~ ${silence.endAt.replace('T', ' ')}），原因：${silence.reason}；仅静默非安全报警，水位/降雨触达报警值仍生成异常并进入应急。`,
      '通过'
    ))
    return { ...state, dataset, notice: { message: `已授权${silence.zone}分区静默；安全触达不在静默范围。`, tone: 'success' as const } }
  }),
  on(TailingsActions.revokeZoneSilence, (state, { silenceId }) => {
    const operator = state.currentOperator
    const target = state.dataset.silences.find((item) => item.id === silenceId)
    if (!target) return state
    if (operator.role !== '值班长') {
      const dataset = structuredClone(state.dataset)
      dataset.audit.unshift(auditEntry(target.zone, '撤销分区静默', operator.name, operator.role, `拒绝：仅值班长可撤销分区静默（${silenceId}）。`, '拒绝'))
      return { ...state, dataset, notice: { message: '越权撤销已拒绝并留审计。', tone: 'error' as const } }
    }
    const dataset = structuredClone(state.dataset)
    const silence = dataset.silences.find((item) => item.id === silenceId)
    if (silence) silence.active = false
    dataset.audit.unshift(auditEntry(target.zone, '撤销分区静默', operator.name, operator.role, `值班长撤销${target.zone}分区静默${silenceId}，非安全报警恢复正常推送。`, '通过'))
    return { ...state, dataset, notice: { message: `已撤销${target.zone}分区静默。`, tone: 'success' as const } }
  }),

  // 读数接入/回补：原始读数只追加；回补同时建失效重算任务
  on(TailingsActions.ingestReading, (state, { reading }) => {
    if (state.dataset.readings.some((item) => item.id === reading.id)) {
      return { ...state, notice: { message: `读数${reading.id}已存在，原始读数不可覆盖。`, tone: 'error' as const } }
    }
    const dataset = structuredClone(state.dataset)
    const result = applyIngest(dataset, structuredClone(reading))
    const job = result.job
    return {
      ...state,
      dataset: result.dataset,
      notice: {
        message: job
          ? `回补读数${reading.id}已写入（原始数据只追加），失效重算${job.id}已发起。`
          : `读数${reading.id}已接入并完成阈值评估。`,
        tone: 'success' as const
      }
    }
  }),

  on(TailingsActions.requestRecompute, (state, { jobId }) => {
    const dataset = structuredClone(state.dataset)
    const job = dataset.recomputeJobs.find((item) => item.id === jobId)
    if (!job || job.status === '重算中') return state
    job.status = '重算中'
    job.attempts += 1
    job.lastError = ''
    dataset.audit.unshift(auditEntry(job.pointId, '执行失效重算', '阈值引擎', '系统', `重算${jobId}第${job.attempts}次执行，重算期间以前一结论为准：${job.previousConclusion}`, '系统'))
    return { ...state, dataset }
  }),
  on(TailingsActions.retryRecompute, (state, { jobId }) => {
    const dataset = structuredClone(state.dataset)
    const job = dataset.recomputeJobs.find((item) => item.id === jobId)
    if (!job) return state
    job.status = '重算中'
    job.attempts += 1
    job.lastError = ''
    dataset.audit.unshift(auditEntry(
      job.pointId,
      '重试失效重算',
      state.currentOperator.name,
      state.currentOperator.role,
      `第${job.attempts}次重试重算${jobId}；前一结论继续保留：${job.previousConclusion}`,
      '通过'
    ))
    return { ...state, dataset, forceRecomputeFailure: false, notice: { message: `重算${jobId}重试中，仍以前一结论处置。`, tone: 'success' as const } }
  }),
  on(TailingsActions.recomputeFailure, (state, { job }) => {
    const dataset = structuredClone(state.dataset)
    const target = dataset.recomputeJobs.find((item) => item.id === job.id)
    if (!target) return state
    target.status = '失败'
    target.lastError = job.lastError
    target.finishedAt = job.finishedAt
    // 关键：失败不产生新评估版本、不动既有异常，前一结论保持 active
    dataset.audit.unshift(auditEntry(
      target.pointId,
      '失效重算失败',
      '阈值引擎',
      '系统',
      `重算${target.id}第${target.attempts}次失败：${target.lastError}；未改写任何判定，继续保留前一结论（${target.previousConclusion}），可重试。`,
      '系统'
    ))
    return { ...state, dataset, notice: { message: `重算失败：${target.lastError}；已保留前一结论，可重试。`, tone: 'error' as const } }
  }),
  on(TailingsActions.recomputeSuccess, (state, { job }) => {
    const dataset = structuredClone(state.dataset)
    const target = dataset.recomputeJobs.find((item) => item.id === job.id)
    const point = target ? findPoint(dataset, target.pointId) : undefined
    const reading = target ? dataset.readings.find((item) => item.id === target.triggerReadingId) : undefined
    const threshold = point ? findThreshold(dataset, point.thresholdId) : undefined
    if (!target || !point || !reading || !threshold) return state

    const previous = dataset.evaluations.find((item) => item.readingId === reading.id && item.active)
    const fresh = evaluateReading({ point, threshold, reading, deactivations: dataset.deactivations, silences: dataset.silences })
    const revision: ThresholdEvaluation = {
      ...fresh,
      id: nextId('EV'),
      revision: (previous?.revision ?? 0) + 1,
      active: true,
      relatedAnomalyId: previous?.relatedAnomalyId ?? '',
      evaluatedAt: new Date().toISOString()
    }
    if (previous) previous.active = false
    dataset.evaluations.unshift(revision)

    // 失效重算针对的是该测点未关闭异常的冻结原判定：以异常源评估为基准判断结论是否变化
    const targetAnomaly = dataset.anomalies.find((item) => item.id === revision.relatedAnomalyId && item.status !== '已关闭')
      ?? dataset.anomalies.find((item) => item.pointId === point.id && item.status !== '已关闭')
    const frozenSource = targetAnomaly ? dataset.evaluations.find((item) => item.id === targetAnomaly.sourceEvaluationId) : undefined
    const changed = !!frozenSource && (frozenSource.outcome !== revision.outcome || frozenSource.level !== revision.level || frozenSource.suppressionBasis !== revision.suppressionBasis)
    if (changed && targetAnomaly) {
      revision.relatedAnomalyId = targetAnomaly.id
      // 只追加重算说明；源评估与原判定冻结，状态/级别维持流程内人工处置
      targetAnomaly.recomputeNote = `回补重算新结论 ${revision.id}（V${revision.revision}，${revision.outcome}/${revision.level}${revision.suppressionBasis ? `，${revision.suppressionBasis}` : ''}）与原判定${targetAnomaly.sourceEvaluationId}（${frozenSource?.outcome}/${frozenSource?.level}）不同；原判定冻结不改写，请负责人据新结论复核并走关闭流程。`
      targetAnomaly.version += 1
    }
    target.status = '成功'
    target.finishedAt = job.finishedAt || new Date().toISOString()
    target.lastError = ''
    dataset.audit.unshift(auditEntry(
      target.pointId,
      changed ? '失效重算结论变更' : '失效重算完成',
      '阈值引擎',
      '系统',
      `重算${target.id}第${target.attempts}次成功，新评估${revision.id}（V${revision.revision}）：${revision.rationale}${changed ? `；原判定${previous?.id ?? ''}保留且冻结，未被改写。` : '；维持前一结论。'}`,
      '系统'
    ))
    return { ...state, dataset, notice: { message: `重算成功：${changed ? '结论已更新，原判定冻结留存' : '维持前一结论'}。`, tone: 'success' as const } }
  }),

  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !review.observed || !review.evidence || !review.reassessment) return state
    anomaly.fieldReviews.unshift({ ...review, version: anomaly.fieldReviews.length + 1 })
    anomaly.status = '原因调查中'
    anomaly.version += 1
    dataset.audit.unshift(auditEntry(anomalyId, '提交现场复核', review.inspector, '监测员', review.reassessment, '通过'))
    return { ...state, dataset }
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !opinion.content) return state
    anomaly.opinions.unshift(opinion)
    anomaly.version += 1
    dataset.audit.unshift(auditEntry(anomalyId, '补充专业意见', opinion.specialist, '负责人', `${opinion.conclusion}：${opinion.content}`, '通过'))
    return { ...state, dataset }
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !plan.owner || !plan.deadline || !plan.conditions) return state
    anomaly.plan = { ...plan, approvedBy: '', approvedAt: '' }
    anomaly.status = '待负责人审批'
    anomaly.version += 1
    dataset.audit.unshift(auditEntry(anomalyId, '提交处置方案', state.currentOperator.name, state.currentOperator.role, `${plan.action}，责任方${plan.owner}`, '通过'))
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
    dataset.audit.unshift(auditEntry(anomalyId, '审批处置方案', approver, '负责人', note || '同意执行', '通过'))
    return { ...state, dataset }
  }),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !anomaly.plan.approvedBy || !note.trim()) return state
    // 设备波动类异常须有现场复核；安全触达应急异常凭值班负责人方案审批关闭
    if (anomaly.category !== '安全触达' && !anomaly.fieldReviews.length) return state
    const sourceBefore = dataset.evaluations.find((item) => item.id === anomaly.sourceEvaluationId)
    anomaly.status = '已关闭'
    anomaly.closedAt = new Date().toISOString()
    anomaly.version += 1
    // 关闭只记录处置事实：源评估、rationale、异常级别均不改写
    dataset.audit.unshift(auditEntry(
      anomalyId,
      '关闭异常',
      anomaly.plan.approvedBy,
      '负责人',
      `关闭说明：${note}；原判定（源评估${anomaly.sourceEvaluationId}：${sourceBefore?.outcome}/${sourceBefore?.level}）冻结保留，关闭动作不改写任何评估结论。`,
      '通过'
    ))
    return { ...state, dataset }
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    anomaly.plan.emergencyLinked = true
    anomaly.status = '应急联动'
    anomaly.version += 1
    dataset.audit.unshift(auditEntry(anomalyId, '启动应急联动', state.currentOperator.name, state.currentOperator.role, note, '通过'))
    return { ...state, dataset }
  }),
  on(TailingsActions.setForceRecomputeFailure, (state, { force }) => ({ ...state, forceRecomputeFailure: force })),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({ ...initialTailingsState, dataset: structuredClone(seedDataset), selectedAnomalyId: seedDataset.anomalies[0].id }))
)
