import { Injectable, inject } from '@angular/core'
import { Actions, createEffect, ofType } from '@ngrx/effects'
import { Store } from '@ngrx/store'
import { catchError, delay, map, of, switchMap, withLatestFrom } from 'rxjs'
import type { RecomputeJob } from '../domain'
import { TailingsApiService } from '../services/tailings-api.service'
import { TailingsActions } from './tailings.actions'
import { selectTailings } from './tailings.selectors'

@Injectable()
export class TailingsEffects {
  private readonly actions$ = inject(Actions)
  private readonly api = inject(TailingsApiService)
  private readonly store = inject(Store)

  loadDataset$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.loadDataset),
    switchMap(() => this.api.loadDataset().pipe(
      map((dataset) => TailingsActions.loadDatasetSuccess({ dataset })),
      catchError((error: Error) => of(TailingsActions.loadDatasetFailure({ error: error.message })))
    ))
  ))

  // 回补读数写入后自动触发失效重算
  backfillTriggersRecompute$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.ingestReading),
    withLatestFrom(this.store.select(selectTailings)),
    switchMap(([{ reading }, state]) => {
      if (!reading.backfilled) return of()
      const job = state.dataset.recomputeJobs.find((item) => item.triggerReadingId === reading.id)
      return job ? of(TailingsActions.requestRecompute({ jobId: job.id })) : of()
    })
  ))

  // 模拟引擎重算：800ms 后成功；演示开关可强制失败，以展示保留前一结论与重试
  runRecompute$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.requestRecompute),
    withLatestFrom(this.store.select(selectTailings)),
    switchMap(([{ jobId }, state]) => of(state.dataset.recomputeJobs.find((item) => item.id === jobId)).pipe(
      delay(800),
      map((job) => this.finish(job, state.forceRecomputeFailure))
    ))
  ))

  // 重试默认成功；失败与重试期间前一结论始终保留
  retryRecompute$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.retryRecompute),
    withLatestFrom(this.store.select(selectTailings)),
    switchMap(([{ jobId }, state]) => of(state.dataset.recomputeJobs.find((item) => item.id === jobId)).pipe(
      delay(800),
      map((job) => this.finish(job, false))
    ))
  ))

  clearNotice$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.notice),
    switchMap(() => of(TailingsActions.clearNotice()).pipe(delay(4000)))
  ))

  private finish(job: RecomputeJob | undefined, forceFail: boolean) {
    if (!job) {
      return TailingsActions.recomputeFailure({ job: { id: 'UNKNOWN', pointId: '', triggerReadingId: '', status: '失败', attempts: 1, lastError: '重算任务丢失', previousConclusion: '', requestedBy: '', requestedAt: '', finishedAt: new Date().toISOString() } })
    }
    return forceFail
      ? TailingsActions.recomputeFailure({ job: { ...job, status: '失败', lastError: '回补数据与基准库版本冲突，重算服务校验未通过', finishedAt: new Date().toISOString() } })
      : TailingsActions.recomputeSuccess({ job: { ...job, status: '成功', finishedAt: new Date().toISOString() } })
  }
}
