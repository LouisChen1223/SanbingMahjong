const app = getApp()
const { fetchArchivedSeasons, formatSeasonRange } = require('../../utils/personalSeason.js')

Page({
  data: {
    seasons: [],
    loading: true
  },

  onLoad() {
    this.db = app.db
    this.loadSeasons()
  },

  onShow() {
    this.loadSeasons()
  },

  async loadSeasons() {
    this.setData({ loading: true })
    try {
      const raw = await fetchArchivedSeasons(this.db)
      const seasons = raw.map(s => ({
        ...s,
        rangeStr: formatSeasonRange(s),
        playerCountStr: (s.player_count != null ? s.player_count : '?') + ' 人'
      }))
      this.setData({ seasons, loading: false })
    } catch (e) {
      console.error('加载历史赛季失败:', e)
      this.setData({ seasons: [], loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    wx.navigateTo({
      url: '/pages/season-detail/season-detail?id=' + encodeURIComponent(id || '') + '&name=' + encodeURIComponent(name)
    })
  }
})
