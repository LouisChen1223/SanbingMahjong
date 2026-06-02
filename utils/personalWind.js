/**
 * 个人战方位：录入行顺序 东、南、西、北
 */
const WIND_ORDER_LIST = ['东', '南', '西', '北']
const WIND_INDEX = { 东: 0, 南: 1, 西: 2, 北: 3 }

function windForOriginalIndex(originalIndex) {
  const i = Number(originalIndex)
  if (!Number.isFinite(i) || i < 0 || i > 3) return '东'
  return WIND_ORDER_LIST[i]
}

function sortPlayersByWind(players) {
  if (!players || players.length === 0) return []
  const hasAllWind = players.every(
    p => p.wind && WIND_INDEX[p.wind] !== undefined
  )
  if (!hasAllWind) return players.slice()
  return players.slice().sort((a, b) => WIND_INDEX[a.wind] - WIND_INDEX[b.wind])
}

/** 四条均有 wind 且东南西北各出现一次 */
function gameHasFullWindData(game) {
  const players = game.players || []
  if (players.length !== 4) return false
  const winds = players.map(p => p.wind)
  if (winds.some(w => !w || WIND_INDEX[w] === undefined)) return false
  return new Set(winds).size === 4
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickFirstByNameLocale(arr) {
  if (!arr || arr.length === 0) return null
  return arr.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))[0]
}

/**
 * 从带 wind 的对局统计各方位吃一率、四位率；并生成「X起赢一半，Y起输一半」
 */
function computeWindStatsAndSlogan(games) {
  const qualified = games.filter(gameHasFullWindData)
  const bucket = {
    东: { n: 0, r1: 0, r4: 0 },
    南: { n: 0, r1: 0, r4: 0 },
    西: { n: 0, r1: 0, r4: 0 },
    北: { n: 0, r1: 0, r4: 0 }
  }

  for (const g of qualified) {
    for (const p of g.players) {
      const w = p.wind
      bucket[w].n += 1
      if (p.rank === 1) bucket[w].r1 += 1
      if (p.rank === 4) bucket[w].r4 += 1
    }
  }

  const rows = WIND_ORDER_LIST.map(w => {
    const b = bucket[w]
    const rate1 = b.n > 0 ? b.r1 / b.n : null
    const rate4 = b.n > 0 ? b.r4 / b.n : null
    return {
      wind: w,
      games: b.n,
      rate1Str: rate1 === null ? '—' : (rate1 * 100).toFixed(1) + '%',
      rate4Str: rate4 === null ? '—' : (rate4 * 100).toFixed(1) + '%',
      rate1,
      rate4
    }
  })

  let slogan = ''
  const withData = rows.filter(r => r.games > 0 && r.rate1 !== null)
  if (withData.length > 0) {
    // 规则：
    // - 一位率并列：优先选四位率更低的；仍并列：按 东/南/西/北 顺序固定
    // - 四位率并列：优先选一位率更低的；仍并列：按 东/南/西/北 顺序固定
    const maxR1 = Math.max(...withData.map(r => r.rate1))
    const r1Tied = withData.filter(r => r.rate1 === maxR1)
    const minR4AmongR1 = Math.min(...r1Tied.map(r => (r.rate4 ?? 0)))
    const r1r4Tied = r1Tied.filter(r => (r.rate4 ?? 0) === minR4AmongR1)
    const winPick = WIND_ORDER_LIST.find(w => r1r4Tied.some(r => r.wind === w))

    const maxR4 = Math.max(...withData.map(r => r.rate4))
    const r4Tied = withData.filter(r => r.rate4 === maxR4)
    const minR1AmongR4 = Math.min(...r4Tied.map(r => (r.rate1 ?? 0)))
    const r4r1Tied = r4Tied.filter(r => (r.rate1 ?? 0) === minR1AmongR4)
    const losePick = WIND_ORDER_LIST.find(w => r4r1Tied.some(r => r.wind === w))

    if (winPick && losePick) slogan = `${winPick}起赢一半，${losePick}起输一半`
  }

  return { windRows: rows, slogan, qualifiedCount: qualified.length }
}

function aggregatePlayersInGames(games) {
  const map = {}
  for (const g of games) {
    for (const p of g.players || []) {
      const name = (p.name || '').trim()
      if (!name) continue
      if (!map[name]) {
        map[name] = { name, ptSum: 0, r1: 0, r4: 0, games: 0 }
      }
      const pt = Number(p.finalScore)
      map[name].ptSum += Number.isFinite(pt) ? pt : 0
      map[name].games += 1
      if (p.rank === 1) map[name].r1 += 1
      if (p.rank === 4) map[name].r4 += 1
    }
  }
  return Object.values(map)
}

function pickTitleWinners(players, key, mode /* 'max' | 'min' */, useRandom = true) {
  if (!players.length) return { names: [], display: '暂无' }
  const vals = players.map(p => p[key])
  const best = mode === 'max' ? Math.max(...vals) : Math.min(...vals)
  const tied = players.filter(p => p[key] === best)
  const pick = useRandom ? pickRandom(tied) : pickFirstByNameLocale(tied)
  return { names: tied.map(t => t.name), display: pick ? pick.name : '暂无' }
}

function pickTitleWinnerWithGamesTieBreak(players, key, mode /* 'max' | 'min' */, useRandom = true) {
  if (!players.length) return { names: [], winner: null, display: '暂无' }
  const vals = players.map(p => p[key])
  const best = mode === 'max' ? Math.max(...vals) : Math.min(...vals)
  const tied = players.filter(p => p[key] === best)
  const bestGames = Math.min(...tied.map(p => p.games || 0))
  const tied2 = tied.filter(p => (p.games || 0) === bestGames)
  const pick = useRandom ? pickRandom(tied2) : pickFirstByNameLocale(tied2)
  return { names: tied.map(t => t.name), winner: pick || null, display: pick ? pick.name : '暂无' }
}

function formatTitleSideInfo(p, kind) {
  if (!p) return ''
  const games = p.games || 0
  const pt = Number.isFinite(p.ptSum) ? p.ptSum : 0
  const ptStr = (pt >= 0 ? '+' : '') + pt.toFixed(1) + 'PT'
  if (kind === 'pt') return `${ptStr} / ${games}局`
  if (kind === 'gou') return `吃一 ${p.r1 || 0} / ${games}局`
  if (kind === 'ye') return `吃四 ${p.r4 || 0} / ${games}局`
  return `${games}局`
}

/**
 * 当日称号：雀王(统计日内累计 PT / finalScore 最高)、发王(累计 PT 最低)、苟王(一位最多)、野猪王(四位最多)
 */
function computeDailyTitles(gamesInSlot) {
  const list = aggregatePlayersInGames(gamesInSlot)
  if (!list.length) {
    return {
      queWang: { name: '暂无', side: '' },
      faWang: { name: '暂无', side: '' },
      gouWang: { name: '暂无', side: '' },
      yeZhuWang: { name: '暂无', side: '' }
    }
  }

  const qPick = pickTitleWinners(list, 'ptSum', 'max', true)
  const fPick = pickTitleWinners(list, 'ptSum', 'min', true)
  const gPick = pickTitleWinnerWithGamesTieBreak(list, 'r1', 'max', true)
  const yPick = pickTitleWinnerWithGamesTieBreak(list, 'r4', 'max', true)

  const qWinner = list.find(p => p.name === qPick.display) || null
  const fWinner = list.find(p => p.name === fPick.display) || null

  return {
    queWang: { name: qPick.display, side: formatTitleSideInfo(qWinner, 'pt') },
    faWang: { name: fPick.display, side: formatTitleSideInfo(fWinner, 'pt') },
    gouWang: { name: gPick.display, side: formatTitleSideInfo(gPick.winner, 'gou') },
    yeZhuWang: { name: yPick.display, side: formatTitleSideInfo(yPick.winner, 'ye') }
  }
}

/**
 * 与 computeDailyTitles 相同规则，并列时按昵称字典序固定一人（用于历史展示，避免每次刷新变化）
 */
function computeDailyTitlesDeterministic(gamesInSlot) {
  const list = aggregatePlayersInGames(gamesInSlot)
  if (!list.length) {
    return {
      queWang: '暂无',
      faWang: '暂无',
      gouWang: '暂无',
      yeZhuWang: '暂无'
    }
  }

  const q = pickTitleWinners(list, 'ptSum', 'max', false)
  const f = pickTitleWinners(list, 'ptSum', 'min', false)
  const g = pickTitleWinnerWithGamesTieBreak(list, 'r1', 'max', false)
  const y = pickTitleWinnerWithGamesTieBreak(list, 'r4', 'max', false)

  return {
    queWang: q.display,
    faWang: f.display,
    gouWang: g.display,
    yeZhuWang: y.display
  }
}

module.exports = {
  WIND_ORDER_LIST,
  WIND_INDEX,
  windForOriginalIndex,
  sortPlayersByWind,
  gameHasFullWindData,
  computeWindStatsAndSlogan,
  computeDailyTitles,
  computeDailyTitlesDeterministic,
  aggregatePlayersInGames
}
