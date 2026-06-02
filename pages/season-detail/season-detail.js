const app = getApp()
const { calculateRankLists, snapshotsToPlayers } = require('../../utils/personalRank.js')
const { formatSeasonRange } = require('../../utils/personalSeason.js')
const { fetchAllPages } = require('../../utils/dbClient.js')

Page({
  data: {
    seasonId: '',
    seasonName: '',
    seasonRange: '',
    currentTab: 'total',
    players: [],
    rate1List: [],
    avoid4List: [],
    maxScoreList: [],
    minScoreList: [],
    loading: true
  },

  onLoad(options) {
    this.db = app.db
    const id = options.id ? decodeURIComponent(options.id) : ''
    const name = options.name ? decodeURIComponent(options.name) : '历史赛季'
    this.setData({ seasonId: id, seasonName: name })
    wx.setNavigationBarTitle({ title: name })
    this.loadSeasonDetail()
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab })
  },

  async loadSeasonDetail() {
    const { seasonId } = this.data
    if (!seasonId) {
      this.setData({ loading: false })
      return
    }

    this.setData({ loading: true })
    try {
      const { data: seasonDoc } = await this.db.collection('seasons').doc(seasonId).get()
      const season = seasonDoc || {}

      const snapshots = await this.fetchSnapshots(seasonId)
      const players = snapshotsToPlayers(snapshots)
      players.sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
      const rankLists = calculateRankLists(players)

      this.setData({
        seasonName: season.name || this.data.seasonName,
        seasonRange: formatSeasonRange(season),
        players: rankLists.formattedPlayers,
        rate1List: rankLists.rate1List,
        avoid4List: rankLists.avoid4List,
        maxScoreList: rankLists.maxScoreList,
        minScoreList: rankLists.minScoreList,
        loading: false
      })
      wx.setNavigationBarTitle({ title: season.name || this.data.seasonName })
    } catch (e) {
      console.error('加载赛季详情失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async fetchSnapshots(seasonId) {
    return fetchAllPages((offset, limit) =>
      this.db.collection('season_player_snapshots')
        .where({ season_id: seasonId })
        .orderBy('rank', 'asc')
        .skip(offset)
        .limit(limit)
        .get()
    )
  }
})
