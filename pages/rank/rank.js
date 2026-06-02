// rank.js - 实时排行榜页面逻辑
const app = getApp()
const tableFee = require('../../utils/tableFee.js')
const { aggregatePlayersInGames } = require('../../utils/personalWind.js')
const { calculateRankLists } = require('../../utils/personalRank.js')
const { ensureActiveSeason, formatSeasonRange, rolloverSeason } = require('../../utils/personalSeason.js')
const { fetchAllPages } = require('../../utils/dbClient.js')

const PRIMARY_GAMES_COLLECTION = 'games'
const FALLBACK_GAMES_COLLECTION = 'games_backup'
const WX_DB_CLIENT_PAGE_SIZE = 20

Page({
  data: {
    players: [],
    connected: false,
    watcher: null,
    currentTab: 'total',
    rate1List: [],
    avoid4List: [],
    maxScoreList: [],
    minScoreList: [],
    avgPositionList: [],
    todaySlotTitle: '',
    todayHasGames: false,
    todayRankList: [],
    activeSeasonName: '',
    activeSeasonRange: '',
    rollingOver: false
  },

  onLoad() {
    this.db = app.db
    Promise.all([
      this.loadActiveSeason(),
      this.refreshAllPlayers(),
      this.refreshTodayRank()
    ]).finally(() => {
      this.initWatcher()
    })
  },

  onShow() {
    this.loadActiveSeason().catch(() => {})
  },

  onUnload() {
    if (this.data.watcher) {
      this.data.watcher.close()
    }
  },

  async loadActiveSeason() {
    try {
      const season = await ensureActiveSeason(this.db)
      this.setData({
        activeSeasonName: season.name || '当前赛季',
        activeSeasonRange: formatSeasonRange(season)
      })
    } catch (e) {
      console.error('加载赛季信息失败:', e)
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    if (tab === 'today') {
      this.refreshTodayRank().catch(() => {})
    }
  },

  calculateRankLists(players) {
    return calculateRankLists(players)
  },

  manualRefresh() {
    Promise.all([
      this.loadActiveSeason(),
      this.refreshAllPlayers(),
      this.refreshTodayRank()
    ]).catch(err => {
      console.error('手动刷新失败:', err)
    })
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

  async fetchSlotGames(slotStart, slotEnd) {
    const gameCollection = await this.resolveGameCollection()
    const _ = this.db.command
    const pageSz = WX_DB_CLIENT_PAGE_SIZE
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
      if (all.length >= 5000) break
    }
    return all
  },

  async refreshTodayRank() {
    const slotStart = tableFee.getAccountingSlotStart(Date.now())
    const slotEnd = tableFee.getAccountingSlotEnd(slotStart)
    const slotTitle = tableFee.formatAccountingSlotTitle(slotStart)

    try {
      const slotGames = await this.fetchSlotGames(slotStart, slotEnd)
      const todayHasGames = slotGames.length > 0
      const todayRankList = todayHasGames
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

      this.setData({
        todaySlotTitle: slotTitle,
        todayHasGames,
        todayRankList
      })
    } catch (e) {
      console.error('加载今日排行榜失败:', e)
      this.setData({
        todaySlotTitle: slotTitle,
        todayHasGames: false,
        todayRankList: []
      })
    }
  },

  async fetchAllPlayers(orderByField = 'total_score', orderDir = 'desc') {
    return fetchAllPages((offset, limit) =>
      this.db.collection('players')
        .orderBy(orderByField, orderDir)
        .skip(offset)
        .limit(limit)
        .get()
    )
  },

  async refreshAllPlayers() {
    const players = await this.fetchAllPlayers('total_score', 'desc')
    if (!players || players.length === 0) {
      this.setData({
        players: [],
        connected: true,
        rate1List: [],
        avoid4List: [],
        maxScoreList: [],
        minScoreList: [],
        avgPositionList: []
      })
      return
    }
    players.sort((a, b) => b.total_score - a.total_score)
    const rankLists = this.calculateRankLists(players)
    this.setData({
      players: rankLists.formattedPlayers,
      connected: true,
      rate1List: rankLists.rate1List,
      avoid4List: rankLists.avoid4List,
      maxScoreList: rankLists.maxScoreList,
      minScoreList: rankLists.minScoreList,
      avgPositionList: rankLists.avgPositionList
    })
  },

  initWatcher() {
    const that = this

    const watcher = this.db.collection('players')
      .orderBy('total_score', 'desc')
      .limit(100)
      .watch({
        onChange: function (snapshot) {
          if (snapshot.docs && snapshot.docs.length > 0) {
            const players = [...snapshot.docs]
            players.sort((a, b) => b.total_score - a.total_score)
            const rankLists = that.calculateRankLists(players)
            that.setData({
              players: rankLists.formattedPlayers,
              connected: true,
              rate1List: rankLists.rate1List,
              avoid4List: rankLists.avoid4List,
              maxScoreList: rankLists.maxScoreList,
              minScoreList: rankLists.minScoreList,
              avgPositionList: rankLists.avgPositionList
            })
          } else if (snapshot.docs && snapshot.docs.length === 0) {
            that.setData({
              players: [],
              connected: true,
              rate1List: [],
              avoid4List: [],
              maxScoreList: [],
              minScoreList: [],
              avgPositionList: []
            })
          }
        },
        onError: function (err) {
          console.error('监听错误:', err)
          that.setData({ connected: false })
          setTimeout(() => {
            that.initWatcher()
          }, 3000)
        }
      })

    this.setData({ watcher })
  },

  async refreshData() {
    try {
      await this.loadActiveSeason()
      await this.refreshAllPlayers()
      await this.refreshTodayRank()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    }
  },

  startNewSeason() {
    if (this.data.rollingOver) return
    wx.showModal({
      title: '开启新赛季',
      content: '将封存当前赛季的全部排行数据并重置玩家统计。对局记录不会删除，可在「记录」页继续查看。确定继续？',
      confirmText: '开启',
      confirmColor: '#1AAD19',
      success: (res) => {
        if (res.confirm) {
          this.promptNewSeasonName()
        }
      }
    })
  },

  promptNewSeasonName() {
    wx.showModal({
      title: '新赛季名称',
      content: '留空则自动命名（如「第2赛季」）',
      editable: true,
      placeholderText: '可选，如：2026春季赛',
      confirmText: '确认开启',
      success: (res) => {
        if (res.confirm) {
          this.doStartNewSeason(res.content || '')
        }
      }
    })
  },

  async doStartNewSeason(newSeasonName) {
    this.setData({ rollingOver: true })
    wx.showLoading({ title: '封存中...' })
    try {
      const result = await rolloverSeason(this.db, newSeasonName.trim())
      wx.hideLoading()
      if (!result || !result.ok) {
        throw new Error('赛季更替失败')
      }
      await this.loadActiveSeason()
      await this.refreshAllPlayers()
      wx.showModal({
        title: '新赛季已开启',
        content: `「${result.archivedSeasonName}」已封存，当前为「${result.newSeasonName}」。`,
        showCancel: false
      })
    } catch (err) {
      wx.hideLoading()
      console.error('开启新赛季失败:', err)
      const msg = (err && (err.errMsg || err.message)) || '操作失败'
      wx.showToast({ title: msg.length > 20 ? '操作失败，请查看控制台' : msg, icon: 'none', duration: 3000 })
    } finally {
      this.setData({ rollingOver: false })
    }
  },

  goToSeasonList() {
    wx.navigateTo({ url: '/pages/season-list/season-list' })
  },

  goToPlayerPage(e) {
    const name = e.currentTarget.dataset.name
    wx.navigateTo({
      url: '/pages/player/player?name=' + encodeURIComponent(name || '')
    })
  }
})
