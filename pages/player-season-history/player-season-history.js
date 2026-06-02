const app = getApp()
const { buildSeasonHistoryItem } = require('../../utils/playerStats.js')
const {
  fetchPlayerSeasonSnapshots,
  fetchSeasonsByIds
} = require('../../utils/personalSeason.js')

Page({
  data: {
    playerName: '',
    seasons: [],
    loading: true
  },

  onLoad(options) {
    this.db = app.db
    const raw = options.name || ''
    let name = raw
    try {
      name = raw ? decodeURIComponent(raw) : ''
    } catch (e) {
      name = raw
    }
    this.setData({ playerName: name })
    wx.setNavigationBarTitle({ title: (name || '选手') + ' · 历史赛季' })
    if (name) this.loadData(name)
    else this.setData({ loading: false })
  },

  async loadData(playerName) {
    this.setData({ loading: true })
    try {
      const snapshots = await fetchPlayerSeasonSnapshots(this.db, playerName)
      if (!snapshots.length) {
        this.setData({ seasons: [], loading: false })
        return
      }

      const seasonIds = snapshots.map(s => s.season_id)
      const seasonMap = await fetchSeasonsByIds(this.db, seasonIds)

      const seasons = snapshots
        .map(s => buildSeasonHistoryItem(s, seasonMap[s.season_id]))
        .sort((a, b) => {
          const ta = a.endTime ? new Date(a.endTime).getTime() : 0
          const tb = b.endTime ? new Date(b.endTime).getTime() : 0
          return tb - ta
        })

      this.setData({ seasons, loading: false })
    } catch (e) {
      console.error('加载历史赛季失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goToSeasonDetail(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    if (!id) return
    wx.navigateTo({
      url: '/pages/season-detail/season-detail?id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(name)
    })
  }
})
