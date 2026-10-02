import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { RawReading } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import {
  selectCurrentOperator,
  selectDataset,
  selectForceRecomputeFailure,
  selectPointsWithRuntime
} from '../store/tailings.selectors'

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="page-head">
        <div><h2>测点、停用窗口与原始读数</h2><p>检修停用窗口只抑制设备波动报警；水位、降雨触达报警值仍生成异常并进入应急。原始读数只追加、不可覆盖，回补读数触发失效重算。</p></div>
        <mat-form-field appearance="outline"><mat-label>搜索测点</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field>
      </div>

      <div class="split">
        <div class="stack">
          <table mat-table [dataSource]="filteredPoints$ | async" class="panel">
            <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>测点</th><td mat-cell *matCellDef="let row"><b>{{ row.name }}</b><small class="sub">{{ row.zone }} · {{ row.id }}</small></td></ng-container>
            <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
            <ng-container matColumnDef="value"><th mat-header-cell *matHeaderCellDef>当前值</th><td mat-cell *matCellDef="let row"><b>{{ row.currentValue }} {{ row.unit }}</b></td></ng-container>
            <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span class="status" [class.danger]="row.status === '异常'" [class.warning]="row.status === '预警'" [class.off]="row.status === '停用'">{{ row.status }}</span><small class="sub" *ngIf="row.deactivated">{{ row.deactivationReason }}</small></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="pointColumns"></tr><tr mat-row *matRowDef="let row; columns: pointColumns"></tr>
          </table>

          <div class="panel form-panel">
            <h3>登记检修停用窗口</h3>
            <p class="hint">窗口内位移/渗流等设备波动读数不再报异常；水位、降雨安全触达照常报警进入应急。</p>
            <div class="grid">
              <mat-form-field appearance="outline"><mat-label>测点</mat-label><mat-select [(ngModel)]="deactivationForm.pointId"><mat-option *ngFor="let point of points$ | async" [value]="point.id">{{ point.name }}</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>检修原因</mat-label><input matInput [(ngModel)]="deactivationForm.reason" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>开始</mat-label><input matInput type="datetime-local" [(ngModel)]="deactivationForm.startAt" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>结束</mat-label><input matInput type="datetime-local" [(ngModel)]="deactivationForm.endAt" /></mat-form-field>
            </div>
            <button mat-flat-button color="primary" (click)="registerDeactivation()">登记停用窗口</button>
          </div>

          <div class="panel form-panel" [class.denied]="(operator$ | async)?.role !== '值班长'">
            <h3>分区静默授权 <span class="role-tag">仅值班长</span></h3>
            <p class="hint" *ngIf="(operator$ | async) as operator">当前身份：<b>{{ operator.role }} {{ operator.name }}</b>。非值班长提交会被拒绝并写审计；静默不覆盖水位/降雨安全触达。</p>
            <div class="grid">
              <mat-form-field appearance="outline"><mat-label>分区</mat-label><mat-select [(ngModel)]="silenceForm.zone"><mat-option value="主坝">主坝</mat-option><mat-option value="库区">库区</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>静默事由</mat-label><input matInput [(ngModel)]="silenceForm.reason" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>开始</mat-label><input matInput type="datetime-local" [(ngModel)]="silenceForm.startAt" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>结束</mat-label><input matInput type="datetime-local" [(ngModel)]="silenceForm.endAt" /></mat-form-field>
            </div>
            <button mat-flat-button [color]="(operator$ | async)?.role === '值班长' ? 'primary' : 'warn'" (click)="requestSilence()">{{ (operator$ | async)?.role === '值班长' ? '值班长授权静默' : '越权提交（将被拒绝并留审计）' }}</button>
            <div class="silence-list" *ngIf="(dataset$ | async)?.silences.length">
              <article *ngFor="let silence of (dataset$ | async)?.silences" [class.inactive]="!silence.active">
                <div><b>{{ silence.zone }}</b><span [class.tag-active]="silence.active" class="tag">{{ silence.active ? '静默中' : '已撤销' }}</span></div>
                <p>{{ silence.reason }}</p>
                <small>{{ silence.startAt.replace('T',' ').slice(5,16) }} ~ {{ silence.endAt.replace('T',' ').slice(5,16) }} · 授权 {{ silence.authorizedBy }}</small>
                <button mat-button color="warn" *ngIf="silence.active" (click)="revokeSilence(silence.id)">值班长撤销</button>
              </article>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="panel readings">
            <h3>原始读数（只追加不可覆盖）</h3>
            <article *ngFor="let reading of (dataset$ | async)?.readings" [class.backfill]="reading.backfilled">
              <div><b>{{ reading.pointId }} · {{ reading.value }} {{ reading.unit }}</b><span [class.q-bad]="reading.quality !== '有效'">{{ reading.quality }}</span></div>
              <small>{{ reading.capturedAt.replace('T', ' ') }} · 设备{{ reading.deviceId }}<i *ngIf="reading.backfilled">回补</i></small>
            </article>
          </div>

          <div class="panel form-panel">
            <h3>接入 / 回补读数</h3>
            <div class="grid">
              <mat-form-field appearance="outline"><mat-label>测点</mat-label><mat-select [(ngModel)]="readingForm.pointId"><mat-option *ngFor="let point of points$ | async" [value]="point.id">{{ point.name }}</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>数值</mat-label><input matInput type="number" [(ngModel)]="readingForm.value" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>采集时间</mat-label><input matInput type="datetime-local" [(ngModel)]="readingForm.capturedAt" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>质量</mat-label><mat-select [(ngModel)]="readingForm.quality"><mat-option value="有效">有效</mat-option><mat-option value="可疑">可疑</mat-option><mat-option value="无效">无效</mat-option></mat-select></mat-form-field>
            </div>
            <label class="check"><mat-checkbox [(ngModel)]="readingForm.backfilled">检修后回补读数（写入后触发该测点失效重算）</mat-checkbox></label>
            <button mat-flat-button color="primary" (click)="ingestReading()">{{ readingForm.backfilled ? '写入回补并触发重算' : '接入读数' }}</button>
          </div>

          <div class="panel jobs">
            <h3>失效重算任务</h3>
            <p class="hint">回补读数更新后历史结论失效并重算；重算失败保留前一结论，可手动重试，成功前按前一结论处置。</p>
            <label class="check"><mat-checkbox [checked]="forceFail$ | async" (change)="setForceFail($event.checked)">演示：让下一次重算失败（验证保留前一结论与重试）</mat-checkbox></label>
            <article *ngFor="let job of (dataset$ | async)?.recomputeJobs" class="job" [class.pending]="job.status === '待重算'" [class.running]="job.status === '重算中'" [class.success]="job.status === '成功'" [class.failed]="job.status === '失败'">
              <div><b>{{ job.id }}</b><span class="tag">{{ job.status }} · 第{{ job.attempts }}次</span></div>
              <p>触发读数 {{ job.triggerReadingId }}（{{ job.pointId }}）</p>
              <small>前一结论：{{ job.previousConclusion }}</small>
              <small class="err" *ngIf="job.lastError">失败原因：{{ job.lastError }}</small>
              <button mat-flat-button color="primary" *ngIf="job.status === '失败'" (click)="retry(job.id)">重试重算</button>
              <small class="running" *ngIf="job.status === '重算中'">重算中，仍以前一结论处置…</small>
            </article>
            <p class="empty" *ngIf="!(dataset$ | async)?.recomputeJobs.length">暂无重算任务，写入一条回补读数即可触发。</p>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.page-head h2 { margin: 0 0 5px; font-size: 20px; }.page-head p { margin: 0; color: #72807d; font-size: 12px; max-width: 760px; }
    .split { display: grid; grid-template-columns: 1fr 380px; gap: 14px; align-items: start; }.stack { display: grid; gap: 14px; }
    .panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; } .sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }
    .status { padding: 3px 7px; background: #e7f3ee; color: #2e765a; border-radius: 3px; font-size: 11px; }.status.warning { background: #f8efd9; color: #936d20; }.status.danger { background: #fae8e6; color: #a43c35; }.status.off { background: #e7e9ee; color: #55606e; }
    .form-panel { padding: 15px; }.form-panel.denied { border-color: #e3b6b2; }.form-panel h3, .readings h3, .jobs h3 { font-size: 14px; margin: 0 0 6px; }.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.hint { color: #7a8784; font-size: 11px; margin: 0 0 10px; }.check { display: flex; align-items: center; margin: 4px 0 10px; font-size: 12px; color: #556060; }
    .role-tag { font-size: 10px; background: #fae8e6; color: #a43c35; padding: 2px 6px; border-radius: 3px; margin-left: 6px; }
    .silence-list { margin-top: 12px; display: grid; gap: 8px; }.silence-list article { border-left: 3px solid #c99f3d; background: #fbf6e8; padding: 8px 10px; display: grid; gap: 3px; }.silence-list article.inactive { opacity: .55; border-left-color: #9aa6a2; }.silence-list div { display: flex; justify-content: space-between; align-items: center; }.silence-list p { margin: 0; font-size: 12px; }.silence-list small { color: #7a8784; font-size: 10px; }.tag { font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #eef0f2; color: #5b6770; }.tag-active { background: #f6e7c6; color: #8e681d; }
    .readings { padding: 15px; }.readings article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; gap: 3px; }.readings article:last-child { border: 0; }.readings article div { display: flex; justify-content: space-between; color: #40504d; font-size: 12px; }.readings span { font-size: 10px; color: #2e765a; }.readings span.q-bad { color: #a43c35; }.readings small { color: #7a8784; font-size: 10px; }.readings i { font-style: normal; margin-left: 8px; background: #e6eefc; color: #2f5d9e; padding: 1px 5px; border-radius: 3px; }.readings article.backfill { background: #f6faff; }
    .jobs article { border-left: 3px solid #9aa6a2; background: #f6f8f7; padding: 9px 10px; margin-top: 8px; display: grid; gap: 4px; }.jobs article.pending, .jobs article.running { border-left-color: #315d6e; }.jobs article.success { border-left-color: #3e8a6b; }.jobs article.failed { border-left-color: #b84038; background: #fdf3f2; }.jobs article p { margin: 0; font-size: 12px; }.jobs small { color: #72807d; font-size: 10px; }.jobs .err { color: #a43c35; }.jobs .running { color: #315d6e; }.jobs .empty { color: #98a4a0; font-size: 11px; margin-top: 10px; }
  `]
})
export class MonitoringPageComponent {
  private readonly store = inject(Store)
  keyword = ''
  readonly dataset$ = this.store.select(selectDataset)
  readonly points$ = this.store.select(selectPointsWithRuntime)
  readonly operator$ = this.store.select(selectCurrentOperator)
  readonly forceFail$ = this.store.select(selectForceRecomputeFailure)
  readonly pointColumns = ['name', 'type', 'value', 'status']
  readonly filteredPoints$ = this.points$.pipe(map((points) => points.filter((point) => !this.keyword || `${point.name} ${point.zone} ${point.type} ${point.id}`.includes(this.keyword))))

  deactivationForm = { pointId: 'P-D02', reason: '', startAt: '2026-09-29T09:00', endAt: '2026-09-29T12:00' }
  silenceForm = { zone: '主坝', reason: '', startAt: '2026-09-29T11:00', endAt: '2026-09-29T13:00' }
  readingForm = { pointId: 'P-W01', value: 874.2, capturedAt: '2026-09-29T10:50', quality: '有效' as RawReading['quality'], backfilled: true }

  registerDeactivation(): void {
    const form = this.deactivationForm
    if (!form.reason.trim()) return
    this.store.dispatch(TailingsActions.registerDeactivation({
      window: { pointId: form.pointId, reason: form.reason, startAt: this.full(form.startAt), endAt: this.full(form.endAt) }
    }))
    this.deactivationForm = { ...form, reason: '' }
  }

  requestSilence(): void {
    const form = this.silenceForm
    if (!form.reason.trim()) return
    this.store.dispatch(TailingsActions.requestZoneSilence({
      silence: { zone: form.zone, reason: form.reason, startAt: this.full(form.startAt), endAt: this.full(form.endAt) }
    }))
    this.silenceForm = { ...form, reason: '' }
  }

  revokeSilence(id: string): void {
    this.store.dispatch(TailingsActions.revokeZoneSilence({ silenceId: id }))
  }

  ingestReading(): void {
    const form = this.readingForm
    if (form.value === null || Number.isNaN(Number(form.value))) return
    const stamp = Date.now().toString(36).slice(-4)
    const reading: RawReading = {
      id: `R-${form.pointId}-${stamp}`,
      pointId: form.pointId,
      value: Number(form.value),
      unit: this.unitFor(form.pointId),
      capturedAt: this.full(form.capturedAt),
      deviceId: `DEV-${form.pointId}`,
      quality: form.quality,
      backfilled: form.backfilled
    }
    this.store.dispatch(TailingsActions.ingestReading({ reading }))
  }

  setForceFail(force: boolean): void {
    this.store.dispatch(TailingsActions.setForceRecomputeFailure({ force }))
  }

  retry(jobId: string): void {
    this.store.dispatch(TailingsActions.retryRecompute({ jobId }))
  }

  private unitFor(pointId: string): string {
    let unit = ''
    this.points$.subscribe((points) => { unit = points.find((point) => point.id === pointId)?.unit ?? '' }).unsubscribe()
    return unit
  }

  private full(local: string): string {
    return `${local}:00`
  }
}
