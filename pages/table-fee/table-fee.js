const app = getApp()
const {
  getAccountingSlotStart,
  getAccountingSlotEnd,
  computePersonSessionFeeYuan,
  formatAccountingSlotTitle,
  listRecentSlotStarts,
  gameStartMs
} = require('../../utils/tableFee.js')

Page({
  data: {
    slotLabels: [],
    slotIndex: 0,
    loading: false,
    rows: [],
    totalFeeStr: '0.00'
  },

  onLoad() {
    const starts = listRecentSlotStarts(28)
    const labels = starts.map(formatAccountingSlotTitle)
    this._slotStarts = starts
    this.setData({
      slotLabels: labels,
      slotIndex: 0
    })
    this.reload()
  },

  onSlotChange(e) {
    const idx = parseInt(e.detail.value, 10) || 0
    this.setData({ slotIndex: idx })
    this.reload()
  },

  async fetchGamesInWindow(collection, slotStart, slotEnd) {
    const db = app.db
    const _ = db.command
    // 小程序端单次 get 最多 20 条；须用小页循环，否则第一次返回 20 条就会因 length < 100 误判结束
    const pageSize = 20
    let skip = 0
    const all = []
    while (true) {
      const { data } = await db
        .collection(collection)
        .where({
          create_time: _.gte(slotStart).and(_.lt(slotEnd))
        })
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
      if (data && data.length) all.push(...data)
      if (!data || data.length < pageSize) break
      skip += pageSize
      if (skip > 5000) break
    }
    return all
  },

  ingestGame(game, map, slotStartMs) {
    const dur = Number(game.half_round_duration_minutes)
    if (!dur || dur <= 0) return
    const startMs = gameStartMs(game)
    if (!Number.isFinite(startMs)) return
    if (getAccountingSlotStart(startMs).getTime() !== slotStartMs) return

    const fee = computePersonSessionFeeYuan(startMs, dur)
    const players = game.players || []
    for (const p of players) {
      const name = (p.name || '').trim()
      if (!name) continue
      if (!map[name]) {
        map[name] = { name, minutes: 0, feeYuan: 0 }
      }
      map[name].minutes += dur
      map[name].feeYuan += fee
    }
  },

  async reload() {
    const idx = this.data.slotIndex
    const slotStart = this._slotStarts[idx]
    if (!slotStart) return
    const slotEnd = getAccountingSlotEnd(slotStart)
    const slotStartMs = slotStart.getTime()

    this.setData({ loading: true })
    try {
      const [personal, team] = await Promise.all([
        this.fetchGamesInWindow('games', slotStart, slotEnd),
        this.fetchGamesInWindow('team_games', slotStart, slotEnd)
      ])

      const map = {}
      for (const g of personal) this.ingestGame(g, map, slotStartMs)
      for (const g of team) this.ingestGame(g, map, slotStartMs)

      const rows = Object.values(map)
        .map(r => {
          const fee = Math.round(r.feeYuan * 100) / 100
          return {
            name: r.name,
            minutes: r.minutes,
            feeNum: fee,
            feeStr: fee.toFixed(2)
          }
        })
        .sort((a, b) => b.feeNum - a.feeNum || a.name.localeCompare(b.name))

      const total = rows.reduce((s, r) => s + r.feeNum, 0)

      this.setData({
        rows: rows.map(({ name, minutes, feeStr }) => ({ name, minutes, feeStr })),
        totalFeeStr: (Math.round(total * 100) / 100).toFixed(2),
        loading: false
      })
    } catch (e) {
      console.error(e)
      this.setData({ loading: false, rows: [], totalFeeStr: '0.00' })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  }
})
