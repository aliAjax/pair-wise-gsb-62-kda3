import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatSelectModule } from '@angular/material/select'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatToolbarModule } from '@angular/material/toolbar'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import type { Operator, UserRole } from './domain'
import { TailingsActions } from './store/tailings.actions'
import { selectCurrentOperator, selectNotice } from './store/tailings.selectors'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatButtonModule, MatIconModule, MatSelectModule],
  template: `
    <mat-sidenav-container class="app-shell">
      <mat-sidenav mode="side" opened class="side-nav">
        <div class="brand"><strong>尾</strong><div><b>尾矿库安全审阅台</b><span>监测、异常与应急联动</span></div></div>
        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><span>监测总览</span><small>地图与阈值</small></a>
          <a routerLink="/monitoring" routerLinkActive="active"><span>测点/停用/回补</span><small>读数·静默·重算</small></a>
          <a routerLink="/anomalies" routerLinkActive="active"><span>异常处置</span><small>复核与会签</small></a>
          <a routerLink="/audit" routerLinkActive="active"><span>审计与审阅包</span><small>抑制/放行说明</small></a>
        </nav>
        <div class="identity">
          <label>当前身份（演示越权拒绝）</label>
          <mat-select [(value)]="role" (selectionChange)="switchRole($event.value)" panelClass="role-panel">
            <mat-option value="值班长">值班长 关磊（可授权静默）</mat-option>
            <mat-option value="监测员">监测员 高阳（静默将被拒绝）</mat-option>
            <mat-option value="负责人">负责人 何清（审批与关闭）</mat-option>
          </mat-select>
          <small>当前：{{ (operator$ | async)?.role }} {{ (operator$ | async)?.name }}</small>
        </div>
        <div class="side-state"><span>原始读数保护</span><b>只追加不可覆盖</b><small>停用仅抑制设备波动，安全触达必入应急</small></div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="topbar"><div><span>矿山安全运营中心 / 尾矿库</span><h1>测点停用、原始读数、异常与审计闭环</h1></div><button mat-button (click)="reset()">恢复演示数据</button></mat-toolbar>
        <div class="notice" *ngIf="notice$ | async as notice" [class.error]="notice.tone === 'error'" [class.success]="notice.tone === 'success'">{{ notice.message }}</div>
        <main><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .app-shell { height: 100vh; background: #edf1f0; }
    .side-nav { width: 258px; border-radius: 0; background: #213a44; color: white; padding: 22px 16px; }
    .brand { display: flex; align-items: center; gap: 10px; padding-bottom: 18px; border-bottom: 1px solid #405b64; }
    .brand strong { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 4px; background: #d2a53f; color: #213a44; font-size: 19px; }
    .brand b, .brand span { display: block; } .brand b { font-size: 14px; } .brand span { color: #a1b6bd; font-size: 10px; margin-top: 4px; }
    nav { display: grid; gap: 6px; padding-top: 18px; }
    nav a { color: #a9bbc1; padding: 11px 12px; display: grid; gap: 3px; border-radius: 4px; text-decoration: none; }
    nav a.active { background: #304e59; color: white; border-left: 3px solid #d2a53f; }
    nav small { color: #7f9ba3; font-size: 10px; }
    .identity { margin-top: 24px; background: #1a3039; padding: 12px; display: grid; gap: 8px; } .identity label, .identity small { color: #87a2aa; font-size: 10px; } .identity ::ng-deep .mat-mdc-form-field-infix { min-height: 34px; } .identity ::ng-deep mat-select { color: #eaf1f3; font-size: 12px; }
    .side-state { margin-top: 16px; padding: 14px; background: #1a3039; display: grid; gap: 5px; }
    .side-state span, .side-state small { color: #87a2aa; font-size: 10px; } .side-state b { font-size: 12px; }
    .topbar { height: 78px; background: white; border-bottom: 1px solid #d9e1df; display: flex; justify-content: space-between; padding: 0 28px; }
    .topbar span { display: block; color: #74827f; font-size: 10px; } .topbar h1 { margin: 3px 0 0; font-size: 19px; }
    .notice { padding: 9px 28px; font-size: 13px; } .notice.error { background: #fae7e5; color: #a23b34; border-bottom: 1px solid #ecc9c5; } .notice.success { background: #e7f3ee; color: #2e765a; border-bottom: 1px solid #cfe5db; }
    main { min-height: calc(100vh - 78px); }
    :host ::ng-deep .mat-drawer-inner-container { overflow: hidden; }
  `]
})
export class AppComponent implements OnInit {
  private readonly store = inject(Store)
  readonly operator$ = this.store.select(selectCurrentOperator)
  readonly notice$ = this.store.select(selectNotice)
  role: UserRole = '值班长'
  private readonly roster: Record<UserRole, Operator> = {
    '值班长': { name: '值班长 关磊', role: '值班长' },
    '监测员': { name: '监测员 高阳', role: '监测员' },
    '负责人': { name: '负责人 何清', role: '负责人' }
  }
  ngOnInit(): void { this.store.dispatch(TailingsActions.loadDataset()) }
  switchRole(role: UserRole): void { this.store.dispatch(TailingsActions.switchOperator({ operator: this.roster[role] })) }
  reset(): void { this.store.dispatch(TailingsActions.resetDemo()) }
}
