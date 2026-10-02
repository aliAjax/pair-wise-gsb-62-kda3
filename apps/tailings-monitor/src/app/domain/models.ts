export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常' | '停用'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'

/** 报警类别：设备波动（可被停用窗口抑制） vs 安全触达（水位/降雨达报警值，不可抑制） */
export type AlarmCategory = '设备波动' | '安全触达'
/** 引擎评估结论：放行生成异常，或抑制 */
export type EvaluationOutcome = '放行' | '抑制'
/** 抑制依据：测点停用窗口 / 分区静默；放行时为空 */
export type SuppressionBasis = '停用窗口' | '分区静默' | ''
export type RecomputeStatus = '待重算' | '重算中' | '成功' | '失败'

export type UserRole = '值班长' | '监测员' | '负责人'

export interface Operator {
  name: string
  role: UserRole
}

/** 检修测点停用窗口：只抑制窗口内的设备波动报警 */
export interface DeactivationWindow {
  id: string
  pointId: string
  reason: string
  startAt: string
  endAt: string
  createdBy: string
}

/** 分区静默：仅值班长可授权；只静默非安全报警，水位/降雨安全异常照常进入应急 */
export interface ZoneSilence {
  id: string
  zone: string
  reason: string
  startAt: string
  endAt: string
  authorizedBy: string
  authorizedAt: string
  active: boolean
}

export interface MonitoringPoint {
  id: string
  name: string
  zone: string
  type: MonitoringType
  longitude: number
  latitude: number
  status: PointStatus
  currentValue: number
  unit: string
  thresholdId: string
  lastInspectionAt: string
}

export interface Threshold {
  id: string
  type: MonitoringType
  warning: number
  alarm: number
  changeRate: number
  unit: string
  enabled: boolean
  version: number
}

/** 回补标记：backfilled=true 表示为检修后回补读数，触发该测点失效重算 */
export interface RawReading {
  id: string
  pointId: string
  value: number
  unit: string
  capturedAt: string
  deviceId: string
  quality: '有效' | '可疑' | '无效'
  backfilled?: boolean
}

export interface ExpertOpinion {
  id: string
  specialist: string
  discipline: '坝体' | '水文' | '岩土' | '应急'
  content: string
  conclusion: '支持结论' | '提出异议' | '补充证据'
  createdAt: string
}

export interface FieldReview {
  id: string
  inspector: string
  arrivedAt: string
  observed: string
  evidence: string
  reassessment: string
  version: number
}

export interface DispositionPlan {
  id: string
  action: '加密监测' | '降低库水位' | '疏通排水' | '应急撤离准备' | '工程加固'
  owner: string
  deadline: string
  conditions: string
  emergencyLinked: boolean
  approvedBy: string
  approvedAt: string
}

export interface Anomaly {
  id: string
  pointId: string
  title: string
  severity: Severity
  status: AnomalyStatus
  openedAt: string
  owner: string
  triggerReadingId: string
  observedValue: string
  fieldReviews: FieldReview[]
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
  /** 触发本条异常的引擎评估（保留原始判定，关闭/重算均不改写） */
  sourceEvaluationId: string
  category: AlarmCategory
  /** 回补重算关联的结论说明；关闭异常不回写这里，原判定冻结 */
  recomputeNote: string
}

/** 阈值引擎对单条读数的评估：同时回答"是否报警、哪类、抑制还是放行、为什么" */
export interface ThresholdEvaluation {
  id: string
  readingId: string
  pointId: string
  value: number
  level: '正常' | '预警' | '报警'
  category: AlarmCategory
  outcome: EvaluationOutcome
  suppressionBasis: SuppressionBasis
  /** 放行或抑制的判定依据，审阅包逐条引用 */
  rationale: string
  relatedAnomalyId: string
  revision: number
  active: boolean
  evaluatedAt: string
}

/** 回补读数触发的失效重算任务；失败保留前一结论，可重试 */
export interface RecomputeJob {
  id: string
  pointId: string
  triggerReadingId: string
  status: RecomputeStatus
  attempts: number
  lastError: string
  /** 重算失败时冻结的前一结论（评估/异常ID列表），成功前以该结论为准 */
  previousConclusion: string
  requestedBy: string
  requestedAt: string
  finishedAt: string
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  operatorRole: string
  detail: string
  createdAt: string
  result: '通过' | '拒绝' | '系统'
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholds: Threshold[]
  readings: RawReading[]
  anomalies: Anomaly[]
  audit: AuditEntry[]
  deactivations: DeactivationWindow[]
  silences: ZoneSilence[]
  evaluations: ThresholdEvaluation[]
  recomputeJobs: RecomputeJob[]
}
