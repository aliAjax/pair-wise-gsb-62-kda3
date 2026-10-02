import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type {
  AuditEntry,
  DeactivationWindow,
  DispositionPlan,
  ExpertOpinion,
  FieldReview,
  Operator,
  RawReading,
  RecomputeJob,
  TailingsDataset,
  ZoneSilence
} from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),

    // 身份切换（值班长 / 监测员 / 负责人）：静默授权等动作按角色校验
    'Switch Operator': props<{ operator: Operator }>(),
    'Notice': props<{ message: string; tone: 'error' | 'success' }>(),
    'Clear Notice': emptyProps(),

    // 测点停用窗口
    'Register Deactivation': props<{ window: Omit<DeactivationWindow, 'id' | 'createdBy'> }>(),

    // 分区静默：仅值班长可授权；越权由 reducer 拒绝并留审计
    'Request Zone Silence': props<{ silence: Omit<ZoneSilence, 'id' | 'authorizedBy' | 'authorizedAt' | 'active'> }>(),
    'Revoke Zone Silence': props<{ silenceId: string }>(),

    // 读数接入 / 回补：回补读数写入后触发失效重算（原始读数只读，只追加）
    'Ingest Reading': props<{ reading: RawReading }>(),
    'Request Recompute': props<{ jobId: string }>(),
    'Recompute Success': props<{ job: RecomputeJob }>(),
    'Recompute Failure': props<{ job: RecomputeJob }>(),
    'Retry Recompute': props<{ jobId: string }>(),
    /** 演示用：使下一次失效重算失败，展示"失败保留前一结论 + 可重试" */
    'Set Force Recompute Failure': props<{ force: boolean }>(),

    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    // 关闭异常：只记录关闭事实，不回写源评估，不改写原判定
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Reset Demo': emptyProps()
  }
})
