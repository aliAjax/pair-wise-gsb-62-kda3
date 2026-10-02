import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type { AuditEntry, DispositionPlan, ExpertOpinion, FieldReview, OutageWindow, RawReading, SilenceRule, TailingsDataset } from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),
    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Open Outage': props<{ window: OutageWindow }>(),
    'Close Outage': props<{ pointId: string }>(),
    'Submit Silence': props<{ rule: SilenceRule }>(),
    'Lift Silence': props<{ ruleId: string }>(),
    'Ingest Reading': props<{ reading: RawReading }>(),
    'Backfill Reading': props<{ reading: RawReading }>(),
    'Retry Recalc': props<{ taskId: string }>(),
    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Reset Demo': emptyProps()
  }
})
