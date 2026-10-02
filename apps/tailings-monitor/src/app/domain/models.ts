export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'
export type AlarmCategory = '设备波动' | '安全阈值'

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

export interface RawReading {
  id: string
  pointId: string
  value: number
  unit: string
  capturedAt: string
  deviceId: string
  quality: '有效' | '可疑' | '无效'
  origin: '实时' | '回补'
  supersedesId: string
}

export interface OutageWindow {
  id: string
  pointId: string
  reason: string
  startedAt: string
  endedAt: string
  createdBy: string
}

export interface SilenceRule {
  id: string
  zone: string
  reason: string
  submittedBy: string
  authorizedBy: string
  status: '生效' | '已拒绝' | '已解除'
  createdAt: string
}

export interface AlarmDecision {
  id: string
  pointId: string
  readingId: string
  category: AlarmCategory
  decision: '放行' | '抑制'
  reason: string
  anomalyId: string
  createdAt: string
}

export interface RecalcTask {
  id: string
  anomalyId: string
  readingId: string
  status: '重算通过' | '重算失败'
  attempts: number
  keptConclusion: string
  note: string
  updatedAt: string
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
  category: AlarmCategory
  determination: string
  conclusion: string
  invalidated: boolean
  fieldReviews: FieldReview[]
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholds: Threshold[]
  readings: RawReading[]
  anomalies: Anomaly[]
  outageWindows: OutageWindow[]
  silenceRules: SilenceRule[]
  decisions: AlarmDecision[]
  recalcTasks: RecalcTask[]
  audit: AuditEntry[]
}
