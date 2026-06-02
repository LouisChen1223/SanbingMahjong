/**
 * 桌费与「统计日」：统计日为每天中午12:00 为界（周一=周一12:00～周二12:00，类推）。
 * 单价（每人）：周六全天 + 周日 0:00～23:00 为 12 元/小时；周日 23:00 起至周五 24:00 为 6 元/小时。
 * 使用本机时区（建议在中国境内使用）。
 */

const MS_MIN = 60 * 1000
const MS_HOUR = 60 * MS_MIN
const MS_DAY = 24 * MS_HOUR

/** 对局开始时间所在「统计日」的起点（当日或昨日 12:00） */
function getAccountingSlotStart(ts) {
  const d = new Date(ts)
  const noon = new Date(d)
  noon.setHours(12, 0, 0, 0)
  if (d.getTime() < noon.getTime()) {
    noon.setDate(noon.getDate() - 1)
  }
  return noon
}

function getAccountingSlotEnd(slotStart) {
  return new Date(slotStart.getTime() + MS_DAY)
}

/** 某时刻桌费单价（元/人·小时） */
function tableRateYuanPerHourAt(date) {
  const day = date.getDay() // 0 周日 … 6 周六
  const sod =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()

  if (day === 6) return 12 // 周六全天
  if (day === 0) {
    // 周日 23:00 前 12 元，23:00（含）起 6 元
    if (sod < 23 * 3600) return 12
    return 6
  }
  if (day >= 1 && day <= 5) return 6 // 周一至周五
  return 6
}

/**
 * 按分钟步进拆分半庄时段，累计桌费（每人该半庄应付，与同桌其他人相同时长同价）
 */
function computePersonSessionFeeYuan(startMs, durationMinutes) {
  const dm = Number(durationMinutes)
  if (!dm || dm <= 0 || !Number.isFinite(startMs)) return 0
  const endMs = startMs + dm * MS_MIN
  let fee = 0
  let t = startMs
  const step = MS_MIN
  while (t < endMs) {
    const next = Math.min(t + step, endMs)
    const hours = (next - t) / MS_HOUR
    fee += hours * tableRateYuanPerHourAt(new Date(t))
    t = next
  }
  return Math.round(fee * 100) / 100
}

function formatAccountingSlotTitle(slotStart) {
  const m = slotStart.getMonth() + 1
  const d = slotStart.getDate()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][slotStart.getDay()]
  return `${m}月${d}日12:00起（周${wd}场）`
}

/** 生成最近若干统计日起点，供选择（从新到旧） */
function listRecentSlotStarts(count) {
  const now = Date.now()
  let cur = getAccountingSlotStart(now)
  const list = []
  for (let i = 0; i < count; i++) {
    list.push(new Date(cur.getTime()))
    cur = new Date(cur.getTime() - MS_DAY)
  }
  return list
}

function gameStartMs(game) {
  const t = game && game.create_time
  if (!t) return NaN
  const ms = new Date(t).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

module.exports = {
  getAccountingSlotStart,
  getAccountingSlotEnd,
  tableRateYuanPerHourAt,
  computePersonSessionFeeYuan,
  formatAccountingSlotTitle,
  listRecentSlotStarts,
  gameStartMs,
  MS_DAY
}
