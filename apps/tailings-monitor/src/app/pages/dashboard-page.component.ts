import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import { SpatialMapComponent } from '../components/spatial-map.component'
import { selectAnomalies, selectDataset, selectPointsWithRuntime } from '../store/tailings.selectors'

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatTableModule, SpatialMapComponent],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>监测点</span><strong>{{ pointCount$ | async }}</strong><small>位移、水位、渗流、降雨</small></article>
        <article><span>异常/停用点</span><strong>{{ abnormalCount$ | async }}</strong><small>含检修停用（不抑制安全触达）</small></article>
        <article><span>待审异常</span><strong>{{ openAnomalyCount$ | async }}</strong><small>未完成处置闭环</small></article>
        <article><span>安全触达应急</span><strong class="danger">{{ safetyCount$ | async }}</strong><small>水位/降雨报警，静默不停报</small></article>
      </div>
      <app-spatial-map [points]="(points$ | async) ?? []" />
      <div class="threshold-band">
        <div><h2>阈值与运行方式</h2><p>报警阈值、变化速率和监测频率按坝体分区执行。</p></div>
        <table mat-table [dataSource]="(dataset$ | async)?.thresholds ?? []">
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
          <ng-container matColumnDef="warning"><th mat-header-cell *matHeaderCellDef>预警</th><td mat-cell *matCellDef="let row">{{ row.warning }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="alarm"><th mat-header-cell *matHeaderCellDef>报警</th><td mat-cell *matCellDef="let row">{{ row.alarm }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="rate"><th mat-header-cell *matHeaderCellDef>变化率</th><td mat-cell *matCellDef="let row">{{ row.changeRate }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <tr mat-header-row *matHeaderRowDef="thresholdColumns"></tr><tr mat-row *matRowDef="let row; columns: thresholdColumns"></tr>
        </table>
      </div>
      <div class="rule-band">
        <h2>报警抑制与放行规则</h2>
        <ul>
          <li><b>检修停用窗口</b>：只抑制窗口内位移、渗流等设备波动报警，不生成异常；</li>
          <li><b>分区静默</b>：仅值班长可授权，只静默非安全报警，越权提交拒绝并留审计；</li>
          <li><b>安全触达不抑制</b>：水位、降雨读数触达报警值时，无论停用或静默都生成重大异常并进入应急联动；</li>
          <li><b>回补与关闭</b>：回补读数只追加、触发失效重算，重算失败保留前一结论可重试；关闭异常不改写原判定。</li>
        </ul>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 15px; }
    .metrics article { padding: 17px 19px; border-right: 1px solid #e2e8e6; } .metrics article:last-child { border: 0; }
    .metrics span, .metrics strong, .metrics small { display: block; } .metrics span { color: #72807d; font-size: 12px; } .metrics strong { font-size: 27px; color: #245060; margin: 6px 0; } .metrics strong.danger { color: #a23b34; } .metrics small { color: #98a4a0; font-size: 10px; }
    .threshold-band { background: white; border: 1px solid #d9e1df; margin-top: 15px; padding: 16px; } .threshold-band h2 { margin: 0 0 5px; font-size: 17px; } .threshold-band p { color: #72807d; font-size: 12px; margin: 0 0 12px; } table { width: 100%; }
    .rule-band { background: white; border: 1px solid #d9e1df; border-left: 4px solid #b84038; margin-top: 15px; padding: 14px 18px; } .rule-band h2 { margin: 0 0 8px; font-size: 15px; } .rule-band ul { margin: 0; padding-left: 18px; display: grid; gap: 5px; } .rule-band li { font-size: 12px; color: #4d5c59; }
  `]
})
export class DashboardPageComponent {
  private readonly store = inject(Store)
  readonly points$ = this.store.select(selectPointsWithRuntime)
  readonly anomalies$ = this.store.select(selectAnomalies)
  readonly dataset$ = this.store.select(selectDataset)
  readonly pointCount$ = this.points$.pipe(map((points) => points.length))
  readonly abnormalCount$ = this.points$.pipe(map((points) => points.filter((point) => point.status !== '正常').length))
  readonly openAnomalyCount$ = this.anomalies$.pipe(map((items) => items.filter((item) => item.status !== '已关闭').length))
  readonly safetyCount$ = this.anomalies$.pipe(map((items) => items.filter((item) => item.category === '安全触达' && item.status !== '已关闭').length))
  readonly thresholdColumns = ['type', 'warning', 'alarm', 'rate', 'version']
}
