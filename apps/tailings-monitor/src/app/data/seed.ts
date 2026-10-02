import type { TailingsDataset } from '../domain'

export const seedDataset: TailingsDataset = {
  points: [
    { id: 'P-D01', name: '主坝顶部位移点 D01', zone: '主坝', type: '位移', longitude: 112.832, latitude: 40.116, status: '异常', currentValue: 18.7, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:20:00' },
    { id: 'P-D02', name: '主坝下游位移点 D02', zone: '主坝', type: '位移', longitude: 112.837, latitude: 40.111, status: '预警', currentValue: 12.4, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:10:00' },
    { id: 'P-W01', name: '库内水位计 W01', zone: '库区', type: '水位', longitude: 112.846, latitude: 40.121, status: '预警', currentValue: 873.4, unit: 'm', thresholdId: 'T-W', lastInspectionAt: '2026-09-29T07:55:00' },
    { id: 'P-S01', name: '主坝渗流计 S01', zone: '主坝', type: '渗流', longitude: 112.827, latitude: 40.106, status: '正常', currentValue: 1.8, unit: 'L/s', thresholdId: 'T-S', lastInspectionAt: '2026-09-29T07:40:00' },
    { id: 'P-R01', name: '库区雨量站 R01', zone: '库区', type: '降雨', longitude: 112.861, latitude: 40.132, status: '异常', currentValue: 58.2, unit: 'mm/h', thresholdId: 'T-R', lastInspectionAt: '2026-09-29T05:40:00' }
  ],
  thresholds: [
    { id: 'T-D', type: '位移', warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', enabled: true, version: 4 },
    { id: 'T-W', type: '水位', warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', enabled: true, version: 3 },
    { id: 'T-S', type: '渗流', warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', enabled: true, version: 5 },
    { id: 'T-R', type: '降雨', warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', enabled: true, version: 2 }
  ],
  readings: [
    { id: 'RD-1', pointId: 'P-D01', value: 18.7, unit: 'mm', capturedAt: '2026-09-29T08:20:00', deviceId: 'GNSS-D01', quality: '有效', origin: '实时', supersedesId: '' },
    { id: 'RD-2', pointId: 'P-D01', value: 16.2, unit: 'mm', capturedAt: '2026-09-29T07:20:00', deviceId: 'GNSS-D01', quality: '有效', origin: '实时', supersedesId: '' },
    { id: 'RD-3', pointId: 'P-D01', value: 13.8, unit: 'mm', capturedAt: '2026-09-29T06:20:00', deviceId: 'GNSS-D01', quality: '有效', origin: '实时', supersedesId: '' },
    { id: 'RD-4', pointId: 'P-W01', value: 873.4, unit: 'm', capturedAt: '2026-09-29T07:55:00', deviceId: 'WL-W01', quality: '有效', origin: '实时', supersedesId: '' },
    { id: 'RD-5', pointId: 'P-R01', value: 58.2, unit: 'mm/h', capturedAt: '2026-09-29T05:40:00', deviceId: 'RF-R01', quality: '有效', origin: '实时', supersedesId: '' },
    { id: 'RD-6', pointId: 'P-D02', value: 17.4, unit: 'mm', capturedAt: '2026-09-29T08:40:00', deviceId: 'GNSS-D02', quality: '有效', origin: '实时', supersedesId: '' },
    { id: 'RD-7', pointId: 'P-W01', value: 873.6, unit: 'm', capturedAt: '2026-09-29T09:30:00', deviceId: 'WL-W01', quality: '可疑', origin: '回补', supersedesId: 'RD-4' }
  ],
  anomalies: [
    {
      id: 'AN-260929-01', pointId: 'P-D01', title: '主坝D01累计位移超过报警阈值', severity: '重大', status: '待负责人审批', openedAt: '2026-09-29T08:25:00', owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '18.7 mm，昨日变化4.2 mm/d', version: 7, closedAt: '',
      category: '设备波动', determination: '主坝顶部位移点D01读数18.7mm触达报警值16mm（阈值V4），不在停用窗口与分区静默范围内，判定设备波动异常', conclusion: '原判定生效，处置方案待负责人审批', invalidated: false,
      fieldReviews: [{ id: 'FR-1', inspector: '宋立', arrivedAt: '2026-09-29T09:10:00', observed: '坝顶排水沟未见明显开裂，D01附近无新增裂缝，基准点稳定。', evidence: 'D01近景照片、基准点复核记录、GNSS原始观测文件', reassessment: '读数有效，位移趋势仍上升，建议立即降低库水位并加密监测。', version: 2 }],
      opinions: [
        { id: 'OP-1', specialist: '周岩', discipline: '岩土', content: '近三日位移速率持续高于阈值，需结合孔隙水压力分析潜在滑面。', conclusion: '支持结论', createdAt: '2026-09-29T10:20:00' },
        { id: 'OP-2', specialist: '许洁', discipline: '水文', content: '库水位仍接近警戒线，建议优先降低库水位并核对上游来水。', conclusion: '补充证据', createdAt: '2026-09-29T10:45:00' }
      ],
      plan: { id: 'PL-1', action: '降低库水位', owner: '库区调度班', deadline: '2026-09-29T18:00:00', conditions: '每2小时复测D01、D02和W01；位移速率恢复至3mm/d以下并稳定12小时后，负责人可关闭异常。', emergencyLinked: true, approvedBy: '', approvedAt: '' }
    },
    {
      id: 'AN-260929-02', pointId: 'P-W01', title: '库水位短时上升速率超预警值', severity: '较高', status: '原因调查中', openedAt: '2026-09-29T08:00:00', owner: '库区调度班', triggerReadingId: 'RD-4', observedValue: '873.4 m，1小时上升0.6 m', version: 4, closedAt: '',
      category: '安全阈值', determination: '库内水位计W01读数873.4m触达报警值873m（阈值V3），安全类报警不受停用与静默抑制', conclusion: '原判定生效，原因调查中', invalidated: false,
      fieldReviews: [], opinions: [{ id: 'OP-3', specialist: '许洁', discipline: '水文', content: '上游降雨汇流导致入湖量增加，需核实泄洪闸状态。', conclusion: '支持结论', createdAt: '2026-09-29T09:00:00' }],
      plan: { id: 'PL-2', action: '加密监测', owner: '库区调度班', deadline: '2026-09-29T14:00:00', conditions: '每小时记录水位与入库流量，达到874.0m时启动应急联动。', emergencyLinked: false, approvedBy: '', approvedAt: '' }
    },
    {
      id: 'AN-260929-03', pointId: 'P-R01', title: '库区降雨触达报警值（静默期间放行）', severity: '重大', status: '应急联动', openedAt: '2026-09-29T05:45:00', owner: '库区调度班', triggerReadingId: 'RD-5', observedValue: '58.2 mm/h，报警值 50 mm/h', version: 1, closedAt: '',
      category: '安全阈值', determination: '库区雨量站R01读数58.2mm/h触达报警值50mm/h（阈值V2），分区静默SL-1不抑制安全类报警', conclusion: '原判定生效，已联动应急值班', invalidated: false,
      fieldReviews: [], opinions: [],
      plan: { id: 'PL-3', action: '应急撤离准备', owner: '库区调度班', deadline: '2026-09-29T12:00:00', conditions: '降雨回落至预警值30mm/h以下且库水位稳定2小时后，解除应急联动。', emergencyLinked: true, approvedBy: '', approvedAt: '' }
    }
  ],
  outageWindows: [
    { id: 'OW-1', pointId: 'P-D02', reason: 'GNSS接收机检修', startedAt: '2026-09-29T06:00:00', endedAt: '', createdBy: '监测班 王工' }
  ],
  silenceRules: [
    { id: 'SL-1', zone: '库区', reason: '泄洪洞检修作业期间屏蔽设备波动', submittedBy: '库区调度班', authorizedBy: '值班长 林海', status: '生效', createdAt: '2026-09-28T20:00:00' },
    { id: 'SL-2', zone: '主坝', reason: '坝顶机械作业静默申请', submittedBy: '监测班 王工', authorizedBy: '监测班 王工', status: '已拒绝', createdAt: '2026-09-29T07:30:00' }
  ],
  decisions: [
    { id: 'DC-1', pointId: 'P-D01', readingId: 'RD-1', category: '设备波动', decision: '放行', reason: '不在停用窗口与分区静默范围内，设备波动报警放行，生成异常', anomalyId: 'AN-260929-01', createdAt: '2026-09-29T08:25:00' },
    { id: 'DC-2', pointId: 'P-W01', readingId: 'RD-4', category: '安全阈值', decision: '放行', reason: '水位触达报警值，安全类报警不受停用与静默抑制，放行生成异常并进入应急联动', anomalyId: 'AN-260929-02', createdAt: '2026-09-29T08:00:00' },
    { id: 'DC-3', pointId: 'P-R01', readingId: 'RD-5', category: '安全阈值', decision: '放行', reason: '降雨触达报警值，安全类报警不受分区静默SL-1抑制，放行生成异常并进入应急联动', anomalyId: 'AN-260929-03', createdAt: '2026-09-29T05:45:00' },
    { id: 'DC-4', pointId: 'P-D02', readingId: 'RD-6', category: '设备波动', decision: '抑制', reason: '测点停用窗口OW-1（GNSS接收机检修）内，停用窗口只抑制设备波动报警，不生成异常', anomalyId: '', createdAt: '2026-09-29T08:40:00' }
  ],
  recalcTasks: [
    { id: 'RT-1', anomalyId: 'AN-260929-02', readingId: 'RD-7', status: '重算失败', attempts: 1, keptConclusion: '原判定生效，原因调查中', note: '回补读数RD-7质量为可疑，无法完成失效重算，保留前一结论，可修正后重试', updatedAt: '2026-09-29T09:35:00' }
  ],
  audit: [
    { id: 'A-1', entityId: 'P-D01', action: '生成异常', operator: '阈值引擎', detail: '累计位移18.7mm超过报警阈值16mm', createdAt: '2026-09-29T08:25:00' },
    { id: 'A-2', entityId: 'AN-260929-01', action: '提交现场复核', operator: '宋立', detail: '原始读数有效，位移趋势仍上升', createdAt: '2026-09-29T09:25:00' },
    { id: 'A-3', entityId: 'AN-260929-01', action: '补充专业意见', operator: '周岩', detail: '建议结合孔隙水压力分析潜在滑面', createdAt: '2026-09-29T10:20:00' },
    { id: 'A-4', entityId: 'P-R01', action: '生成异常并进入应急联动', operator: '阈值引擎', detail: '降雨58.2mm/h触达报警值50mm/h，分区静默SL-1不抑制安全类报警', createdAt: '2026-09-29T05:45:00' },
    { id: 'A-5', entityId: 'P-D02', action: '抑制设备波动报警', operator: '阈值引擎', detail: '停用窗口OW-1内读数17.4mm被抑制，不生成异常', createdAt: '2026-09-29T08:40:00' },
    { id: 'A-6', entityId: 'SL-2', action: '越权提交静默被拒绝', operator: '监测班 王工', detail: '分区静默须值班长授权，提交人未获值班长授权，规则已拒绝并留痕', createdAt: '2026-09-29T07:30:00' },
    { id: 'A-7', entityId: 'AN-260929-02', action: '失效重算失败', operator: '重算服务', detail: '回补读数RD-7质量为可疑，保留前一结论，可修正后重试', createdAt: '2026-09-29T09:35:00' }
  ]
}
