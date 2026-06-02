const app = getApp()
const tableFee = require('../../utils/tableFee.js')
const {
  computeWindStatsAndSlogan,
  computeDailyTitles,
  computeDailyTitlesDeterministic,
  aggregatePlayersInGames
} = require('../../utils/personalWind.js')
const PRIMARY_GAMES_COLLECTION = 'games'
const FALLBACK_GAMES_COLLECTION = 'games_backup'
const PERSONAL_MIN_RETENTION_DAYS = 31
// 小程序端直连云库单次 get 最多 20 条
const WX_DB_CLIENT_PAGE_SIZE = 20

function gameInSlot(game, slotStart, slotEnd) {
  const ms = tableFee.gameStartMs(game)
  if (!Number.isFinite(ms)) return false
  return ms >= slotStart.getTime() && ms < slotEnd.getTime()
}

function buildKingHistory(recentGames, currentSlotKey) {
  const groupedBySlot = new Map()
  for (const game of recentGames) {
    const ms = tableFee.gameStartMs(game)
    if (!Number.isFinite(ms)) continue
    const slotStart = tableFee.getAccountingSlotStart(ms)
    const slotKey = slotStart.getTime()
    if (slotKey === currentSlotKey) continue
    if (!groupedBySlot.has(slotKey)) groupedBySlot.set(slotKey, [])
    groupedBySlot.get(slotKey).push(game)
  }

  const rows = []
  for (const [slotKey, slotGames] of groupedBySlot.entries()) {
    if (!slotGames.length) continue
    const titles = computeDailyTitlesDeterministic(slotGames)
    rows.push({
      slotKey,
      slotTitle: tableFee.formatAccountingSlotTitle(new Date(slotKey)),
      gameCount: slotGames.length,
      queWang: titles.queWang,
      faWang: titles.faWang,
      gouWang: titles.gouWang,
      yeZhuWang: titles.yeZhuWang
    })
  }

  return rows.sort((a, b) => b.slotKey - a.slotKey)
}

Page({
  data: {
    loading: false,
    windRows: [],
    windSlogan: '',
    windQualifiedGames: 0,
    slotTitle: '',
    currentSlotHasGames: false,
    queWang: { name: '暂无', side: '' },
    faWang: { name: '暂无', side: '' },
    gouWang: { name: '暂无', side: '' },
    yeZhuWang: { name: '暂无', side: '' },
    todayRankList: [],
    kingHistory: []
  },

  onLoad() {
    this.db = app.db
    this.loadAll()
  },

  getRetentionCutoffMs() {
    return Date.now() - PERSONAL_MIN_RETENTION_DAYS * 24 * 60 * 60 * 1000
  },

  async resolveGameCollection() {
    if (this._gameCollectionName) return this._gameCollectionName
    try {
      const { data } = await this.db
        .collection(PRIMARY_GAMES_COLLECTION)
        .limit(1)
        .get()
      this._gameCollectionName =
        data && data.length > 0 ? PRIMARY_GAMES_COLLECTION : FALLBACK_GAMES_COLLECTION
    } catch (e) {
      this._gameCollectionName = FALLBACK_GAMES_COLLECTION
    }
    return this._gameCollectionName
  },

  onRefresh() {
    this.loadAll()
  },

  async fetchBatches(maxBatches = 120) {
    const gameCollection = await this.resolveGameCollection()
    const _ = this.db.command
    const all = []
    let cursorTime = null
    const cutoffMs = this.getRetentionCutoffMs()
    const pageSz = WX_DB_CLIENT_PAGE_SIZE
    for (let b = 0; b < maxBatches; b++) {
      let query = this.db.collection(gameCollection)
      if (cursorTime) {
        query = query.where({
          create_time: _.lt(cursorTime)
        })
      }
      const { data } = await query
        .orderBy('create_time', 'desc')
        .limit(pageSz)
        .get()
      if (!data || !data.length) break
      all.push(...data)
      cursorTime = data[data.length - 1].create_time
      if (data.length < pageSz) break
      const oldestMs = tableFee.gameStartMs(data[data.length - 1])
      if (Number.isFinite(oldestMs) && oldestMs < cutoffMs && all.length >= pageSz) {
        break
      }
    }
    return all
  },

  async fetchSlotGames(slotStart, slotEnd) {
    const gameCollection = await this.resolveGameCollection()
    const _ = this.db.command
    const pageSz = WX_DB_CLIENT_PAGE_SIZE
    try {
      const all = []
      let cursorTime = null
      while (true) {
        const timeCond = cursorTime
          ? _.and(_.gte(slotStart).and(_.lt(slotEnd)), _.lt(cursorTime))
          : _.gte(slotStart).and(_.lt(slotEnd))
        const { data } = await this.db
          .collection(gameCollection)
          .where({ create_time: timeCond })
          .orderBy('create_time', 'desc')
          .limit(pageSz)
          .get()
        if (!data || !data.length) break
        all.push(...data)
        cursorTime = data[data.length - 1].create_time
        if (data.length < pageSz) break
      }
      return all
    } catch (e) {
      console.warn('统计日区间查询失败，改为扫描:', e)
      const recent = await this.fetchBatches()
      return recent.filter(g => gameInSlot(g, slotStart, slotEnd))
    }
  },

  async loadAll() {
    if (this._loadingBusy) return
    this._loadingBusy = true
    this.setData({ loading: true })
    try {
      const slotStart = tableFee.getAccountingSlotStart(Date.now())
      const slotEnd = tableFee.getAccountingSlotEnd(slotStart)
      const slotTitle = tableFee.formatAccountingSlotTitle(slotStart)
      const currentSlotKey = slotStart.getTime()

      const [recentGames, slotGames] = await Promise.all([
        this.fetchBatches(),
        this.fetchSlotGames(slotStart, slotEnd)
      ])

      const windPack = computeWindStatsAndSlogan(recentGames)
      const currentSlotHasGames = slotGames.length > 0
      const titles = currentSlotHasGames
        ? computeDailyTitles(slotGames)
        : {
          queWang: { name: '暂无', side: '' },
          faWang: { name: '暂无', side: '' },
          gouWang: { name: '暂无', side: '' },
          yeZhuWang: { name: '暂无', side: '' }
        }
      const todayRankList = currentSlotHasGames
        ? aggregatePlayersInGames(slotGames)
          .map(p => {
            const games = p.games || 0
            const pt = Number.isFinite(p.ptSum) ? p.ptSum : 0
            return {
              name: p.name,
              games,
              ptSum: pt,
              ptSumStr: (pt >= 0 ? '+' : '') + pt.toFixed(1),
              avgStr: games > 0 ? (pt / games).toFixed(2) : '0.00',
              r1: p.r1 || 0,
              r4: p.r4 || 0
            }
          })
          .sort((a, b) => b.ptSum - a.ptSum || a.games - b.games || a.name.localeCompare(b.name, 'zh-Hans-CN'))
          .map((p, idx) => ({ ...p, rank: idx + 1 }))
        : []
      const kingHistory = buildKingHistory(recentGames, currentSlotKey)

      this.setData({
        windRows: windPack.windRows,
        windSlogan: windPack.slogan,
        windQualifiedGames: windPack.qualifiedCount,
        slotTitle,
        currentSlotHasGames,
        queWang: titles.queWang,
        faWang: titles.faWang,
        gouWang: titles.gouWang,
        yeZhuWang: titles.yeZhuWang,
        todayRankList,
        kingHistory,
        loading: false
      })
    } catch (err) {
      console.error('个人战统计加载失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    } finally {
      this._loadingBusy = false
    }
  }
})
