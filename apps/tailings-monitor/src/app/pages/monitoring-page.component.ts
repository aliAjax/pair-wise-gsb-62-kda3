import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import { DUTY_CHIEF, latestInChain, nextEngineId } from '../domain'
import type { MonitoringPoint, RawReading } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectDataset } from '../store/tailings.selectors'

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="page-head"><div><h2>测点与原始读数</h2><p>原始读数只读展示，回补形成新版本并触发失效重算。</p></div><mat-form-field appearance="outline"><mat-label>搜索测点</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field></div>
      <div class="split">
        <table mat-table [dataSource]="filteredPoints$ | async" class="panel">
          <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>测点</th><td mat-cell *matCellDef="let row">{{ row.name }}</td></ng-container>
          <ng-container matColumnDef="zone"><th mat-header-cell *matHeaderCellDef>分区</th><td mat-cell *matCellDef="let row">{{ row.zone }}</td></ng-container>
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
          <ng-container matColumnDef="value"><th mat-header-cell *matHeaderCellDef>当前值</th><td mat-cell *matCellDef="let row"><b>{{ row.currentValue }} {{ row.unit }}</b></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span class="status" [class.danger]="row.status === '异常'" [class.warning]="row.status === '预警'">{{ row.status }}</span><span class="status outage" *ngIf="isOutage(row.id)">停用中</span></td></ng-container>
          <ng-container matColumnDef="ops"><th mat-header-cell *matHeaderCellDef>停用</th><td mat-cell *matCellDef="let row"><button mat-button *ngIf="!isOutage(row.id)" (click)="openOutage(row.id)">停用</button><button mat-button *ngIf="isOutage(row.id)" (click)="closeOutage(row.id)">恢复</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="pointColumns"></tr><tr mat-row *matRowDef="let row; columns: pointColumns"></tr>
        </table>
        <div class="panel readings">
          <h3>最近原始读数</h3>
          <article *ngFor="let reading of (dataset$ | async)?.readings">
            <div><b>{{ reading.pointId }} · {{ reading.id }}</b><span [class.backfilled]="reading.origin === '回补'">{{ reading.origin }} · {{ reading.quality }}</span></div>
            <strong>{{ reading.value }} {{ reading.unit }}</strong>
            <small>{{ reading.capturedAt.replace('T', ' ').slice(0, 16) }} · 设备{{ reading.deviceId }}<ng-container *ngIf="reading.supersedesId"> · 回补自{{ reading.supersedesId }}</ng-container></small>
          </article>
          <p>设备读数写入后不可修改；回补读数形成新版本，原始读数保留不覆盖。</p>
          <h3>写入实时读数</h3>
          <div class="ingest"><mat-form-field appearance="outline"><mat-label>测点</mat-label><mat-select [(ngModel)]="ingestForm.pointId"><mat-option *ngFor="let point of (dataset$ | async)?.points" [value]="point.id">{{ point.id }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>读数</mat-label><input matInput type="number" [(ngModel)]="ingestForm.value" /></mat-form-field><button mat-flat-button color="primary" (click)="submitIngest()">写入</button></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel block">
          <h3>测点停用窗口</h3>
          <p class="hint">检修期间开启停用窗口；窗口只抑制设备波动报警，水位、降雨触达报警值仍生成异常并进入应急。</p>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>测点</mat-label><mat-select [(ngModel)]="outageForm.pointId"><mat-option *ngFor="let point of (dataset$ | async)?.points" [value]="point.id">{{ point.name }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>停用原因</mat-label><input matInput [(ngModel)]="outageForm.reason" /></mat-form-field><button mat-flat-button color="primary" (click)="submitOutage()">开启停用</button></div>
          <div class="records" *ngFor="let window of (dataset$ | async)?.outageWindows"><b>{{ window.pointId }} · {{ window.id }}</b><span>{{ window.reason }} · {{ window.startedAt.replace('T', ' ').slice(0, 16) }} 起 · {{ window.endedAt ? ('已于' + window.endedAt.replace('T', ' ').slice(0, 16) + '恢复') : '停用中' }} · {{ window.createdBy }}</span></div>
        </div>
        <div class="panel block">
          <h3>分区静默（值班长授权）</h3>
          <p class="hint">静默须{{ dutyChief }}授权，越权提交将被拒绝并留审计；静默不抑制水位、降雨安全报警。</p>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>分区</mat-label><mat-select [(ngModel)]="silenceForm.zone"><mat-option *ngFor="let zone of zones$ | async" [value]="zone">{{ zone }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>授权人</mat-label><mat-select [(ngModel)]="silenceForm.authorizedBy"><mat-option *ngFor="let person of authorizers" [value]="person">{{ person }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>静默原因</mat-label><input matInput [(ngModel)]="silenceForm.reason" /></mat-form-field><button mat-flat-button color="primary" (click)="submitSilence()">提交静默</button></div>
          <div class="records" *ngFor="let rule of (dataset$ | async)?.silenceRules"><b>{{ rule.zone }} · {{ rule.id }} <span class="tag" [class.rejected]="rule.status === '已拒绝'" [class.lifted]="rule.status === '已解除'">{{ rule.status }}</span></b><span>{{ rule.reason }} · 授权人{{ rule.authorizedBy || '无' }} · 提交人{{ rule.submittedBy }}</span><button mat-button *ngIf="rule.status === '生效'" (click)="liftSilence(rule.id)">解除静默</button></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel block">
          <h3>回补读数</h3>
          <p class="hint">回补不覆盖原始读数，形成新版本；回补更新后自动对关联异常触发失效重算。</p>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>原始读数</mat-label><mat-select [(ngModel)]="backfillForm.readingId"><mat-option *ngFor="let reading of (dataset$ | async)?.readings" [value]="reading.id">{{ reading.id }} · {{ reading.pointId }} · {{ reading.value }}{{ reading.unit }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>回补值</mat-label><input matInput type="number" [(ngModel)]="backfillForm.value" /></mat-form-field><mat-form-field appearance="outline"><mat-label>质量</mat-label><mat-select [(ngModel)]="backfillForm.quality"><mat-option value="有效">有效</mat-option><mat-option value="可疑">可疑</mat-option><mat-option value="无效">无效</mat-option></mat-select></mat-form-field><button mat-flat-button color="primary" (click)="submitBackfill()">提交回补</button></div>
        </div>
        <div class="panel block">
          <h3>失效重算</h3>
          <p class="hint">重算失败保留前一结论，可修正回补读数后重试；关闭异常不改写原判定。</p>
          <div class="records" *ngFor="let task of (dataset$ | async)?.recalcTasks"><b>{{ task.anomalyId }} · {{ task.id }} <span class="tag" [class.rejected]="task.status === '重算失败'">{{ task.status }}</span></b><span>{{ task.note }} · 已重试{{ task.attempts }}次 · 保留结论：{{ task.keptConclusion }}</span><button mat-button *ngIf="task.status === '重算失败'" (click)="retryRecalc(task.id)">重试重算</button></div>
          <p class="hint" *ngIf="!(dataset$ | async)?.recalcTasks?.length">暂无重算任务，提交回补读数后自动生成。</p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.page-head h2 { margin: 0 0 5px; font-size: 20px; }.page-head p { margin: 0; color: #72807d; font-size: 12px; }
    .split { display: grid; grid-template-columns: 1fr 330px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }
    .readings { padding: 15px; } .readings h3 { font-size: 14px; margin: 0 0 12px; } .readings article { border-bottom: 1px solid #e2e7e6; padding: 10px 0; display: grid; gap: 4px; }.readings article div { display: flex; justify-content: space-between; color: #667572; font-size: 11px; }.readings small, .readings p { color: #7a8784; font-size: 10px; }.backfilled { color: #8e681d; }
    .status { padding: 3px 7px; background: #e7f3ee; color: #2e765a; border-radius: 3px; font-size: 11px; margin-right: 4px; }.status.warning { background: #f8efd9; color: #936d20; }.status.danger { background: #fae8e6; color: #a43c35; }.status.outage { background: #e8ebf0; color: #5a6a78; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; align-items: start; }.block { padding: 15px; }.block h3 { font-size: 14px; margin: 0 0 8px; }.hint { color: #7a8784; font-size: 10px; margin: 0 0 10px; }
    .form-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }.form-row mat-form-field { width: 180px; }
    .ingest { display: flex; gap: 8px; align-items: center; }.ingest mat-form-field { width: 110px; }
    .records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records b { font-size: 12px; }.records span { color: #72807d; font-size: 10px; }.records button { justify-self: start; }
    .tag { padding: 2px 6px; border-radius: 3px; background: #e7f3ee; color: #2e765a; font-size: 10px; }.tag.rejected { background: #fae8e6; color: #a43c35; }.tag.lifted { background: #e8ebf0; color: #5a6a78; }
  `]
})
export class MonitoringPageComponent {
  private readonly store = inject(Store)
  keyword = ''
  readonly pointColumns = ['name', 'zone', 'type', 'value', 'status', 'ops']
  readonly dataset$ = this.store.select(selectDataset)
  readonly filteredPoints$ = this.dataset$.pipe(map((dataset) => dataset.points.filter((point) => !this.keyword || `${point.name} ${point.zone} ${point.type} ${point.id}`.includes(this.keyword))))
  readonly zones$ = this.dataset$.pipe(map((dataset) => [...new Set(dataset.points.map((point) => point.zone))]))
  readonly dutyChief = DUTY_CHIEF
  readonly authorizers = [DUTY_CHIEF, '监测班 王工', '库区调度班 赵工']
  outageForm = { pointId: 'P-D02', reason: '' }
  silenceForm = { zone: '主坝', authorizedBy: DUTY_CHIEF, reason: '' }
  backfillForm = { readingId: 'RD-4', value: 0, quality: '有效' as '有效' | '可疑' | '无效' }
  ingestForm = { pointId: 'P-W01', value: 0 }
  private activeOutages: string[] = []
  constructor() { this.dataset$.pipe(takeUntilDestroyed()).subscribe((dataset) => { this.activeOutages = dataset.outageWindows.filter((window) => !window.endedAt).map((window) => window.pointId) }) }
  isOutage(pointId: string): boolean { return this.activeOutages.includes(pointId) }
  openOutage(pointId: string): void {
    this.store.dispatch(TailingsActions.openOutage({ window: { id: nextEngineId('OW'), pointId, reason: this.outageForm.reason || '检修停用', startedAt: new Date().toISOString(), endedAt: '', createdBy: '当前用户' } }))
    this.outageForm.reason = ''
  }
  closeOutage(pointId: string): void { this.store.dispatch(TailingsActions.closeOutage({ pointId })) }
  submitOutage(): void {
    this.store.dispatch(TailingsActions.openOutage({ window: { id: nextEngineId('OW'), pointId: this.outageForm.pointId, reason: this.outageForm.reason, startedAt: new Date().toISOString(), endedAt: '', createdBy: '当前用户' } }))
    this.outageForm.reason = ''
  }
  submitSilence(): void {
    this.store.dispatch(TailingsActions.submitSilence({ rule: { id: nextEngineId('SL'), zone: this.silenceForm.zone, reason: this.silenceForm.reason, submittedBy: '当前用户', authorizedBy: this.silenceForm.authorizedBy, status: '生效', createdAt: new Date().toISOString() } }))
    this.silenceForm.reason = ''
  }
  liftSilence(ruleId: string): void { this.store.dispatch(TailingsActions.liftSilence({ ruleId })) }
  submitBackfill(): void {
    let latest: RawReading | undefined
    this.dataset$.subscribe((dataset) => {
      const source = dataset.readings.find((reading) => reading.id === this.backfillForm.readingId)
      if (source) latest = latestInChain(dataset.readings, source.id)
    }).unsubscribe()
    if (!latest) return
    this.store.dispatch(TailingsActions.backfillReading({ reading: { id: nextEngineId('RD'), pointId: latest.pointId, value: Number(this.backfillForm.value), unit: latest.unit, capturedAt: new Date().toISOString(), deviceId: latest.deviceId, quality: this.backfillForm.quality, origin: '回补', supersedesId: latest.id } }))
  }
  retryRecalc(taskId: string): void { this.store.dispatch(TailingsActions.retryRecalc({ taskId })) }
  submitIngest(): void {
    let point: MonitoringPoint | undefined
    this.dataset$.subscribe((dataset) => { point = dataset.points.find((item) => item.id === this.ingestForm.pointId) }).unsubscribe()
    if (!point) return
    this.store.dispatch(TailingsActions.ingestReading({ reading: { id: nextEngineId('RD'), pointId: point.id, value: Number(this.ingestForm.value), unit: point.unit, capturedAt: new Date().toISOString(), deviceId: `DEV-${point.id}`, quality: '有效', origin: '实时', supersedesId: '' } }))
  }
}
