/**
 * 桌费工具函数单元测试
 * 运行（需在 miniprogram 目录下）：node --test utils/tableFee.test.js
 * 或：npm test
 */
const { test, describe } = require('node:test')
const assert = require('node:assert').strict
const {
  getAccountingSlotStart,
  getAccountingSlotEnd,
  tableRateYuanPerHourAt,
  computePersonSessionFeeYuan,
  formatAccountingSlotTitle,
  gameStartMs,
  MS_DAY
} = require('./tableFee.js')

describe('getAccountingSlotStart', () => {
  test('周三 10:00 属于「周二 12:00」起的统计日', () => {
    const t = new Date('2026-04-22T10:00:00').getTime()
    const slot = getAccountingSlotStart(t)
    assert.equal(slot.getFullYear(), 2026)
    assert.equal(slot.getMonth(), 3)
    assert.equal(slot.getDate(), 21)
    assert.equal(slot.getHours(), 12)
    assert.equal(slot.getMinutes(), 0)
    assert.equal(slot.getDay(), 2)
  })

  test('周三 14:00 属于「周三 12:00」起的统计日', () => {
    const t = new Date('2026-04-22T14:00:00').getTime()
    const slot = getAccountingSlotStart(t)
    assert.equal(slot.getDate(), 22)
    assert.equal(slot.getHours(), 12)
    assert.equal(slot.getDay(), 3)
  })
})

describe('getAccountingSlotEnd', () => {
  test('统计日长度为 24 小时', () => {
    const start = new Date('2026-04-21T12:00:00')
    const end = getAccountingSlotEnd(start)
    assert.equal(end.getTime() - start.getTime(), MS_DAY)
  })
})

describe('tableRateYuanPerHourAt', () => {
  test('周六 15:00 为 12 元/小时', () => {
    assert.equal(tableRateYuanPerHourAt(new Date('2026-04-18T15:00:00')), 12)
  })

  test('周日 10:00 为 12 元/小时', () => {
    assert.equal(tableRateYuanPerHourAt(new Date('2026-04-19T10:00:00')), 12)
  })

  test('周日 23:00 起为 6 元/小时', () => {
    assert.equal(tableRateYuanPerHourAt(new Date('2026-04-19T23:00:00')), 6)
    assert.equal(tableRateYuanPerHourAt(new Date('2026-04-19T23:30:00')), 6)
  })

  test('周一 0:00 为 6 元/小时', () => {
    assert.equal(tableRateYuanPerHourAt(new Date('2026-04-20T00:00:00')), 6)
  })

  test('周五 12:00 为 6 元/小时', () => {
    assert.equal(tableRateYuanPerHourAt(new Date('2026-04-24T12:00:00')), 6)
  })
})

describe('computePersonSessionFeeYuan', () => {
  test('整点周一 60 分钟、单价 6 元/小时 → 6 元', () => {
    const start = new Date('2026-04-20T10:00:00').getTime()
    assert.equal(computePersonSessionFeeYuan(start, 60), 6)
  })

  test('整点周六 60 分钟、单价 12 元/小时 → 12 元', () => {
    const start = new Date('2026-04-18T14:00:00').getTime()
    assert.equal(computePersonSessionFeeYuan(start, 60), 12)
  })

  test('无效时长返回 0', () => {
    assert.equal(computePersonSessionFeeYuan(Date.now(), 0), 0)
    assert.equal(computePersonSessionFeeYuan(Date.now(), -1), 0)
    assert.equal(computePersonSessionFeeYuan(NaN, 60), 0)
  })

  test('跨周日 23:00：前 30 分钟 12 元/时，后 30 分钟 6 元/时 → 9 元', () => {
    const start = new Date('2026-04-19T22:30:00').getTime()
    assert.equal(computePersonSessionFeeYuan(start, 60), 9)
  })
})

describe('formatAccountingSlotTitle', () => {
  test('包含月日与周几', () => {
    const s = formatAccountingSlotTitle(new Date('2026-04-21T12:00:00'))
    assert.match(s, /4月21日12:00起/)
    assert.match(s, /周二/)
  })
})

describe('gameStartMs', () => {
  test('从对象读取 create_time', () => {
    const ms = new Date('2026-05-01T08:00:00').getTime()
    assert.equal(gameStartMs({ create_time: new Date(ms) }), ms)
  })

  test('缺失返回 NaN', () => {
    assert.ok(Number.isNaN(gameStartMs({})))
  })
})
