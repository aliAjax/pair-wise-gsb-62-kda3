import type { TailingsDataset } from '../domain'

const W = '2026-09-29'

export const seedDataset: TailingsDataset = {
  points: [
    { id: 'P-D01', name: '主坝顶部位移点 D01', zone: '主坝', type: '位移', longitude: 112.832, latitude: 40.116, status: '异常', currentValue: 18.7, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: `${W}T08:20:00` },
    { id: 'P-D02', name: '主坝下游位移点 D02', zone: '主坝', type: '位移', longitude: 112.837, latitude: 40.111, status: '正常', currentValue: 10.2, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: `${W}T08:10:00` },
    { id: 'P-W01', name: '库内水位计 W01', zone: '库区', type: '水位', longitude: 112.846, latitude: 40.121, status: '异常', currentValue: 873.6, unit: 'm', thresholdId: 'T-W', lastInspectionAt: `${W}T10:30:00` },
    { id: 'P-S01', name: '主坝渗流计 S01', zone: '主坝', type: '渗流', longitude: 112.827, latitude: 40.106, status: '正常', currentValue: 1.8, unit: 'L/s', thresholdId: 'T-S', lastInspectionAt: `${W}T07:40:00` },
    { id: 'P-R01', name: '库区雨量站 R01', zone: '库区', type: '降雨', longitude: 112.861, latitude: 40.132, status: '异常', currentValue: 56.2, unit: 'mm/h', thresholdId: 'T-R', lastInspectionAt: `${W}T10:35:00` }
  ],
  thresholds: [
    { id: 'T-D', type: '位移', warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', enabled: true, version: 4 },
    { id: 'T-W', type: '水位', warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', enabled: true, version: 3 },
    { id: 'T-S', type: '渗流', warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', enabled: true, version: 5 },
    { id: 'T-R', type: '降雨', warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', enabled: true, version: 2 }
  ],
  readings: [
    { id: 'RD-1', pointId: 'P-D01', value: 18.7, unit: 'mm', capturedAt: `${W}T08:20:00`, deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-2', pointId: 'P-D01', value: 16.2, unit: 'mm', capturedAt: `${W}T07:20:00`, deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-3', pointId: 'P-D01', value: 13.8, unit: 'mm', capturedAt: `${W}T06:20:00`, deviceId: 'GNSS-D01', quality: '有效' },
    // 检修停用窗口内的位移超报警读数：设备波动，应被停用窗口抑制
    { id: 'RD-4', pointId: 'P-D02', value: 16.8, unit: 'mm', capturedAt: `${W}T10:10:00`, deviceId: 'GNSS-D02', quality: '可疑' },
    // 库区分区静默窗口内的水位安全触达读数：安全异常，必须放行并进入应急
    { id: 'RD-5', pointId: 'P-W01', value: 873.6, unit: 'm', capturedAt: `${W}T10:30:00`, deviceId: 'WL-W01', quality: '有效' },
    { id: 'RD-6', pointId: 'P-W01', value: 873.4, unit: 'm', capturedAt: `${W}T07:55:00`, deviceId: 'WL-W01', quality: '有效' },
    // 雨量站检修停用窗口内的降雨安全触达读数：安全异常，停用窗口不得抑制
    { id: 'RD-7', pointId: 'P-R01', value: 56.2, unit: 'mm/h', capturedAt: `${W}T10:35:00`, deviceId: 'RG-R01', quality: '有效' }
  ],
  deactivations: [
    // D02 检修停用：窗口内设备波动报警抑制
    { id: 'DW-1', pointId: 'P-D02', reason: 'GNSS天线检修与基准点复核', startAt: `${W}T09:00:00`, endAt: `${W}T12:00:00`, createdBy: '监测员 高阳' },
    // R01 雨量站检修：验证停用窗口不影响降雨安全触达
    { id: 'DW-2', pointId: 'P-R01', reason: '雨量计清淤检修', startAt: `${W}T10:00:00`, endAt: `${W}T11:30:00`, createdBy: '监测员 高阳' }
  ],
  silences: [
    // 库区静默（值班长授权）：只静默非安全报警
    { id: 'ZS-1', zone: '库区', reason: '库区排水改造施工，减少非安全打扰', startAt: `${W}T06:00:00`, endAt: `${W}T20:00:00`, authorizedBy: '值班长 关磊', authorizedAt: `${W}T05:50:00`, active: true }
  ],
  evaluations: [
    {
      id: 'EV-1', readingId: 'RD-1', pointId: 'P-D01', value: 18.7, level: '报警', category: '设备波动', outcome: '放行', suppressionBasis: '',
      rationale: '位移读数18.7mm达到报警值16mm，测点未停用、分区未静默，放行并生成异常。', relatedAnomalyId: 'AN-260929-01', revision: 1, active: true, evaluatedAt: `${W}T08:25:00`
    },
    {
      id: 'EV-2', readingId: 'RD-6', pointId: 'P-W01', value: 873.4, level: '报警', category: '安全触达', outcome: '放行', suppressionBasis: '',
      rationale: '水位读数873.4m达到报警值873m，属安全触达；停用窗口/分区静默均不得抑制，直接生成重大异常并进入应急联动。', relatedAnomalyId: 'AN-260929-02', revision: 1, active: true, evaluatedAt: `${W}T08:00:00`
    },
    {
      id: 'EV-3', readingId: 'RD-4', pointId: 'P-D02', value: 16.8, level: '报警', category: '设备波动', outcome: '抑制', suppressionBasis: '停用窗口',
      rationale: '位移超报警读数16.8mm属设备波动；测点处于检修停用窗口（GNSS天线检修与基准点复核），仅抑制设备波动报警，不生成异常；水位/降雨安全触达不受此窗口影响。', relatedAnomalyId: '', revision: 1, active: true, evaluatedAt: `${W}T10:12:00`
    },
    {
      id: 'EV-4', readingId: 'RD-5', pointId: 'P-W01', value: 873.6, level: '报警', category: '安全触达', outcome: '放行', suppressionBasis: '',
      rationale: '水位读数873.6m达到报警值873m，属安全触达；尽管库区处于值班长授权静默期，安全触达异常不在静默范围，照常并入既有安全异常并保持应急联动。', relatedAnomalyId: 'AN-260929-02', revision: 1, active: true, evaluatedAt: `${W}T10:31:00`
    },
    {
      id: 'EV-5', readingId: 'RD-7', pointId: 'P-R01', value: 56.2, level: '报警', category: '安全触达', outcome: '放行', suppressionBasis: '',
      rationale: '降雨读数56.2mm/h达到报警值50mm/h，属安全触达；尽管雨量站处于检修停用窗口且库区静默，安全触达不得抑制，直接生成重大异常并进入应急联动。', relatedAnomalyId: 'AN-260929-03', revision: 1, active: true, evaluatedAt: `${W}T10:36:00`
    }
  ],
  anomalies: [
    {
      id: 'AN-260929-01', pointId: 'P-D01', title: '主坝D01累计位移超过报警阈值', severity: '重大', status: '待负责人审批', openedAt: `${W}T08:25:00`, owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '18.7 mm，昨日变化4.2 mm/d', version: 7, closedAt: '',
      sourceEvaluationId: 'EV-1', category: '设备波动', recomputeNote: '',
      fieldReviews: [{ id: 'FR-1', inspector: '宋立', arrivedAt: `${W}T09:10:00`, observed: '坝顶排水沟未见明显开裂，D01附近无新增裂缝，基准点稳定。', evidence: 'D01近景照片、基准点复核记录、GNSS原始观测文件', reassessment: '读数有效，位移趋势仍上升，建议立即降低库水位并加密监测。', version: 2 }],
      opinions: [
        { id: 'OP-1', specialist: '周岩', discipline: '岩土', content: '近三日位移速率持续高于阈值，需结合孔隙水压力分析潜在滑面。', conclusion: '支持结论', createdAt: `${W}T10:20:00` },
        { id: 'OP-2', specialist: '许洁', discipline: '水文', content: '库水位仍接近警戒线，建议优先降低库水位并核对上游来水。', conclusion: '补充证据', createdAt: `${W}T10:45:00` }
      ],
      plan: { id: 'PL-1', action: '降低库水位', owner: '库区调度班', deadline: `${W}T18:00:00`, conditions: '每2小时复测D01、D02和W01；位移速率恢复至3mm/d以下并稳定12小时后，负责人可关闭异常。', emergencyLinked: true, approvedBy: '', approvedAt: '' }
    },
    {
      id: 'AN-260929-02', pointId: 'P-W01', title: '库水位W01触达报警值，启动应急联动', severity: '重大', status: '应急联动', openedAt: `${W}T08:00:00`, owner: '应急值班室', triggerReadingId: 'RD-6', observedValue: '873.6 m（库区静默期内最新读数873.6m，初读873.4m）', version: 5, closedAt: '',
      sourceEvaluationId: 'EV-2', category: '安全触达', recomputeNote: '静默期内873.6m安全触达已并入本异常（EV-4），应急联动不中断。',
      fieldReviews: [],
      opinions: [{ id: 'OP-3', specialist: '许洁', discipline: '水文', content: '上游降雨汇流导致入库量增加，需核实泄洪闸状态；安全触达不受库区静默影响。', conclusion: '支持结论', createdAt: `${W}T09:00:00` }],
      plan: { id: 'PL-2', action: '应急撤离准备', owner: '应急值班室', deadline: `${W}T12:30:00`, conditions: '每15分钟复测水位；维持下游预警与撤离准备，水位回落至873.0m以下并稳定2小时后负责人可关闭。', emergencyLinked: true, approvedBy: '值班负责人', approvedAt: `${W}T08:05:00` }
    },
    {
      id: 'AN-260929-03', pointId: 'P-R01', title: '库区雨量站R01降雨触达报警值，启动应急联动', severity: '重大', status: '应急联动', openedAt: `${W}T10:36:00`, owner: '应急值班室', triggerReadingId: 'RD-7', observedValue: '56.2 mm/h（雨量站检修停用窗口内采集，安全触达照常报警）', version: 1, closedAt: '',
      sourceEvaluationId: 'EV-5', category: '安全触达', recomputeNote: '',
      fieldReviews: [],
      opinions: [],
      plan: { id: 'PL-R01-SAFE', action: '应急撤离准备', owner: '应急值班室', deadline: `${W}T12:35:00`, conditions: '每15分钟复测降雨与库水位；检修停用窗口不抑制降雨安全触达，雨强降至50mm/h以下并稳定2小时后负责人可关闭。', emergencyLinked: true, approvedBy: '值班负责人', approvedAt: `${W}T10:37:00` }
    }
  ],
  recomputeJobs: [],
  audit: [
    { id: 'A-1', entityId: 'P-D01', action: '生成异常', operator: '阈值引擎', operatorRole: '系统', detail: '累计位移18.7mm超过报警阈值16mm', createdAt: `${W}T08:25:00`, result: '系统' },
    { id: 'A-2', entityId: 'AN-260929-01', action: '提交现场复核', operator: '宋立', operatorRole: '监测员', detail: '原始读数有效，位移趋势仍上升', createdAt: `${W}T09:25:00`, result: '通过' },
    { id: 'A-3', entityId: 'AN-260929-01', action: '补充专业意见', operator: '周岩', operatorRole: '负责人', detail: '建议结合孔隙水压力分析潜在滑面', createdAt: `${W}T10:20:00`, result: '通过' },
    { id: 'A-4', entityId: 'P-D02', action: '抑制设备波动报警', operator: '阈值引擎', operatorRole: '系统', detail: '停用窗口DW-1（GNSS天线检修）抑制16.8mm设备波动报警（EV-3），不生成异常；安全触达不受影响', createdAt: `${W}T10:12:00`, result: '系统' },
    { id: 'A-5', entityId: 'ZS-1', action: '申请分区静默', operator: '值班长 关磊', operatorRole: '值班长', detail: '授权库区分区静默06:00~20:00，仅静默非安全报警，安全触达照常进入应急', createdAt: `${W}T05:50:00`, result: '通过' },
    { id: 'A-6', entityId: '库区', action: '申请分区静默', operator: '监测员 高阳', operatorRole: '监测员', detail: '尝试授权主坝分区静默1小时：仅值班长可授权分区静默', createdAt: `${W}T05:40:00`, result: '拒绝' },
    { id: 'A-7', entityId: 'AN-260929-02', action: '安全触达放行', operator: '阈值引擎', operatorRole: '系统', detail: '库区静默期内水位873.6m触达报警值，安全异常不静默（EV-4），并入既有应急异常', createdAt: `${W}T10:31:00`, result: '系统' },
    { id: 'A-8', entityId: 'AN-260929-03', action: '安全触达放行', operator: '阈值引擎', operatorRole: '系统', detail: 'R01检修停用窗口内降雨56.2mm/h触达报警值，停用不抑制安全触达（EV-5），生成重大异常并进入应急联动', createdAt: `${W}T10:36:00`, result: '系统' }
  ]
}
