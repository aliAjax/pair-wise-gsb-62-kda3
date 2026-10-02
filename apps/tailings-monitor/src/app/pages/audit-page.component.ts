import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import { TailingsApiService } from '../services/tailings-api.service'
import { selectDataset, selectReviewLines, selectReviewPackage } from '../store/tailings.selectors'

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>审计追溯与审阅包</h2><p>每条异常/读数评估均说明为何<b>抑制</b>（停用窗口/分区静默）或<b>放行</b>（含安全触达强制进入应急）；越权静默、回补重算、关闭冻结全部留痕。</p></div><button mat-flat-button color="primary" (click)="exportPackage()">导出审阅包 JSON</button></div>

      <div class="summary" *ngIf="reviewPackage$ | async as pkg">
        <article><span>放行评估</span><strong>{{ pkg.summary.admitted }}</strong></article>
        <article><span>抑制评估</span><strong>{{ pkg.summary.suppressed }}</strong></article>
        <article><span>未关闭安全触达</span><strong class="danger">{{ pkg.summary.openSafetyAnomalies }}</strong></article>
        <article><span>重算任务</span><strong>{{ pkg.summary.recomputeJobs }}</strong><small>失败 {{ pkg.summary.recomputeFailed }}（保留前一结论）</small></article>
      </div>

      <h3>逐条评估：抑制或放行的原因</h3>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索测点、结论、依据</mat-label><input matInput [(ngModel)]="evaluationKeyword" /></mat-form-field><span>共{{ (filteredLines$ | async)?.length }}条评估</span></div>
      <div class="review-list">
        <article *ngFor="let line of filteredLines$ | async" [class.suppressed]="line.evaluation.outcome === '抑制'" [class.safety]="line.evaluation.category === '安全触达' && line.evaluation.outcome === '放行'">
          <div class="line-head">
            <b>{{ line.pointName }}</b>
            <span class="pill" [class.pill-supp]="line.evaluation.outcome === '抑制'" [class.pill-safe]="line.evaluation.category === '安全触达'">
              {{ line.evaluation.outcome === '抑制' ? '抑制 · ' + line.evaluation.suppressionBasis : '放行' + (line.evaluation.category === '安全触达' ? ' · 安全触达进入应急' : '') }}
            </span>
          </div>
          <p>{{ line.decisionText }}</p>
          <small>{{ line.readingAt }} 读数 {{ line.readingValue }}（{{ line.evaluation.level }}）<i *ngIf="line.backfilled">回补</i> → <b>{{ line.relatedAnomalyId || '不生成异常' }}</b> · 评估 {{ line.evaluation.id }} V{{ line.evaluation.revision }}</small>
        </article>
      </div>

      <h3>失效重算任务（失败保留前一结论，可重试）</h3>
      <table mat-table [dataSource]="(dataset$ | async)?.recomputeJobs ?? []" class="panel">
        <ng-container matColumnDef="id"><th mat-header-cell *matHeaderCellDef>任务</th><td mat-cell *matCellDef="let row">{{ row.id }}</td></ng-container>
        <ng-container matColumnDef="point"><th mat-header-cell *matHeaderCellDef>测点/读数</th><td mat-cell *matCellDef="let row">{{ row.pointId }} · {{ row.triggerReadingId }}</td></ng-container>
        <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span [class.danger]="row.status === '失败'">{{ row.status }}（第{{ row.attempts }}次）</span></td></ng-container>
        <ng-container matColumnDef="previous"><th mat-header-cell *matHeaderCellDef>保留的前一结论</th><td mat-cell *matCellDef="let row">{{ row.previousConclusion }}</td></ng-container>
        <ng-container matColumnDef="error"><th mat-header-cell *matHeaderCellDef>失败原因</th><td mat-cell *matCellDef="let row">{{ row.lastError || '—' }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="jobColumns"></tr><tr mat-row *matRowDef="let row; columns: jobColumns"></tr>
      </table>

      <h3>操作审计（含越权拒绝）</h3>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row">{{ row.action }}</td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}<small class="role">{{ row.operatorRole }}</small></td></ng-container>
        <ng-container matColumnDef="result"><th mat-header-cell *matHeaderCellDef>结果</th><td mat-cell *matCellDef="let row"><span class="result" [class.denied]="row.result === '拒绝'">{{ row.result }}</span></td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.denied-row]="row.result === '拒绝'"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; max-width: 780px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 16px; }.summary article { padding: 14px 16px; border-right: 1px solid #e2e7e6; }.summary article:last-child { border: 0; }.summary span, .summary strong, .summary small { display: block; }.summary span { font-size: 11px; color: #72807d; }.summary strong { font-size: 24px; color: #245060; margin: 4px 0; }.summary strong.danger { color: #a23b34; }.summary small { font-size: 10px; color: #98a4a0; }
    h3 { font-size: 15px; margin: 18px 0 8px; }.toolbar { display: flex; align-items: center; gap: 12px; }.toolbar span { color: #74827d; font-size: 11px; }.panel { width: 100%; background: white; border: 1px solid #d9e1df; }
    .review-list { display: grid; gap: 8px; margin-bottom: 6px; }.review-list article { background: white; border: 1px solid #d9e1df; border-left: 4px solid #3e8a6b; padding: 10px 12px; display: grid; gap: 5px; }.review-list article.suppressed { border-left-color: #9aa6a2; background: #f7f8f8; }.review-list article.safety { border-left-color: #b84038; background: #fdf6f5; }.line-head { display: flex; justify-content: space-between; align-items: center; }.line-head b { font-size: 13px; }.review-list p { margin: 0; font-size: 12px; color: #41504d; }.review-list small { color: #7a8784; font-size: 10px; }.review-list small i { font-style: normal; background: #e6eefc; color: #2f5d9e; padding: 1px 5px; border-radius: 3px; margin: 0 4px; }
    .pill { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: #e7f3ee; color: #2e765a; }.pill-supp { background: #eceff1; color: #5b6770; }.pill-safe { background: #fae7e5; color: #a23b34; }
    .role { display: inline-block; margin-left: 6px; color: #98a4a0; font-size: 10px; }.result { color: #2e765a; font-size: 11px; }.result.denied { color: #a23b34; font-weight: bold; }.denied-row { background: #fdf3f2; } .danger { color: #a23b34; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  evaluationKeyword = ''
  readonly columns = ['time', 'entity', 'action', 'operator', 'result', 'detail']
  readonly jobColumns = ['id', 'point', 'status', 'previous', 'error']
  readonly dataset$ = this.store.select(selectDataset)
  readonly reviewLines$ = this.store.select(selectReviewLines)
  readonly reviewPackage$ = this.store.select(selectReviewPackage)
  readonly filtered$ = this.dataset$.pipe(map((dataset) => dataset.audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail} ${item.result}`.includes(this.keyword))))
  readonly filteredLines$ = this.reviewLines$.pipe(map((lines) => lines.filter((line) => !this.evaluationKeyword || `${line.pointName} ${line.pointZone} ${line.decisionText} ${line.evaluation.outcome} ${line.evaluation.suppressionBasis}`.includes(this.evaluationKeyword))))
  exportPackage(): void {
    this.store.select(selectReviewPackage).subscribe((pkg) => {
      this.api.exportPackage(pkg).subscribe((blob) => {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = '尾矿库监测审阅包.json'; anchor.click(); URL.revokeObjectURL(url)
      })
    }).unsubscribe()
  }
}
