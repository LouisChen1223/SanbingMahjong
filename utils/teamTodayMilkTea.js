/**
 * 团队赛「今日奶茶位」：与桌费统计一致，按「每天 12:00 换日」的统计日
 * 查询该统计日内 team_games，按每人累计 PT（finalScore）求和，最高者（可并列）为奶茶位。
 */

const { getAccountingSlotStart, getAccountingSlotEnd } = require('./tableFee.js')

// 小程序端直连云库单次最多 20 条；须按 20 分页累加，否则会只统计到当日的前 20 场团队对局
const PAGE = 20

/** 当前时刻所在的统计日区间 [dayStart, dayEnd) */
function getAccountingSlotWindowForNow(now = new Date()) {
  const dayStart = getAccountingSlotStart(now.getTime())
  const dayEnd = getAccountingSlotEnd(dayStart)
  return { dayStart, dayEnd }
}

function computeMilkTeaFromGames(games) {
  const sums = {}
  for (const g of games) {
    const players = g.players || []
    for (const p of players) {
      const name = (p.name || '').trim()
      if (!name) continue
      const pt = Number(p.finalScore)
      sums[name] = (sums[name] || 0) + (Number.isFinite(pt) ? pt : 0)
    }
  }
  const entries = Object.entries(sums).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    return {
      empty: true,
      winnerNames: [],
      ptTotalStr: '',
      gameCount: games.length
    }
  }
  const top = entries[0][1]
  const winnerNames = entries.filter(([, v]) => v === top).map(([n]) => n)
  const ptRounded = Math.round(top * 10) / 10
  return {
    empty: false,
    winnerNames,
    totalPt: top,
    ptTotalStr: Number.isFinite(ptRounded) ? ptRounded.toFixed(1) : '0.0',
    gameCount: games.length
  }
}

async function fetchTeamGamesBetween(db, dayStart, dayEnd) {
  const _ = db.command
  let skip = 0
  const all = []
  while (true) {
    const { data } = await db
      .collection('team_games')
      .where({
        create_time: _.gte(dayStart).and(_.lt(dayEnd))
      })
      .orderBy('create_time', 'desc')
      .skip(skip)
      .limit(PAGE)
      .get()
    if (data && data.length) all.push(...data)
    if (!data || data.length < PAGE) break
    skip += data.length
    if (skip > 5000) break
  }
  return all
}

module.exports = {
  getAccountingSlotWindowForNow,
  computeMilkTeaFromGames,
  fetchTeamGamesBetween
}
