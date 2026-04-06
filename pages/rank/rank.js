// rank.js - 实时排行榜页面逻辑
const app = getApp()
const db = app.db

Page({
  data: {
    players: [],
    teams: [],
    connected: false,
    watcher: null,
    teamWatcher: null,
    rankType: 'personal', // personal 或 team
    currentTab: 'total',
    currentTeamTab: 'teamTotal',
    rate1List: [],
    avoid4List: [],
    maxScoreList: [],
    minScoreList: [],
    teamRate1List: [],
    teamAvoid4List: []
  },

  onLoad() {
    this.db = app.db
    this.initWatcher()
    this.initTeamWatcher()
  },

  onUnload() {
    // 页面卸载时关闭监听
    if (this.data.watcher) {
      this.data.watcher.close()
    }
    if (this.data.teamWatcher) {
      this.data.teamWatcher.close()
    }
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  // 切换队伍标签
  switchTeamTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTeamTab: tab })
  },

  // 切换榜单项（个人榜/团队榜）
  switchRankType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ rankType: type })
  },

  // 格式化分数为一位小数（用于总分）
  formatScore(score) {
    if (score === null || score === undefined) return '0.0'
    return Number(score).toFixed(1)
  },

  // 格式化打点为整数（用于最高/最低打点）
  formatInteger(score) {
    if (score === null || score === undefined) return '0'
    return Math.round(Number(score)).toString()
  },

  // 计算各项排行榜数据
  calculateRankLists(players) {
    // 总分榜 - 添加格式化字段
    const formattedPlayers = players.map(p => ({
      ...p,
      totalScoreStr: this.formatScore(p.total_score)
    }))

    // 一位率榜
    const rate1List = players
      .filter(p => p.games_played > 0)
      .map(p => ({
        ...p,
        rate1: (p.rank_1_count || 0) / p.games_played,
        rate1Str: ((p.rank_1_count || 0) / p.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.rate1 - a.rate1)

    // 避四率榜
    const avoid4List = players
      .filter(p => p.games_played > 0)
      .map(p => ({
        ...p,
        avoid4: (p.games_played - (p.rank_4_count || 0)) / p.games_played,
        avoid4Str: ((p.games_played - (p.rank_4_count || 0)) / p.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.avoid4 - a.avoid4)

    // 最高打点榜 - 添加格式化字段
    const maxScoreList = players
      .filter(p => p.max_score && p.max_score > 0)
      .map(p => ({
        ...p,
        maxScoreStr: this.formatInteger(p.max_score)
      }))
      .sort((a, b) => (b.max_score || 0) - (a.max_score || 0))

    // 最低打点榜 - 添加格式化字段
    const minScoreList = players
      .filter(p => p.min_score && p.min_score > 0)
      .map(p => ({
        ...p,
        minScoreStr: this.formatInteger(p.min_score)
      }))
      .sort((a, b) => (a.min_score || 999999) - (b.min_score || 999999))

    return { formattedPlayers, rate1List, avoid4List, maxScoreList, minScoreList }
  },

  // 计算队伍排行榜数据
  calculateTeamRankLists(teams) {
    // 队伍总分榜 - 添加格式化字段
    const formattedTeams = teams.map(t => ({
      ...t,
      totalScoreStr: this.formatScore(t.total_score)
    }))

    // 队伍一位率榜
    const teamRate1List = teams
      .filter(t => t.games_played > 0)
      .map(t => ({
        ...t,
        rate1: (t.first_place || 0) / t.games_played,
        rate1Str: ((t.first_place || 0) / t.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.rate1 - a.rate1)

    // 队伍避四率榜
    const teamAvoid4List = teams
      .filter(t => t.games_played > 0)
      .map(t => ({
        ...t,
        avoid4: (t.games_played - (t.fourth_place || 0)) / t.games_played,
        avoid4Str: ((t.games_played - (t.fourth_place || 0)) / t.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.avoid4 - a.avoid4)

    return { formattedTeams, teamRate1List, teamAvoid4List }
  },

  // 手动刷新数据（结算完成后调用）
  manualRefresh() {
    console.log('手动刷新排行榜数据')
    const that = this

    // 刷新个人榜
    this.db.collection('players')
      .orderBy('total_score', 'desc')
      .limit(100)
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          const players = res.data
          players.sort((a, b) => b.total_score - a.total_score)
          const rankLists = that.calculateRankLists(players)
          that.setData({
            players: rankLists.formattedPlayers,
            connected: true,
            rate1List: rankLists.rate1List,
            avoid4List: rankLists.avoid4List,
            maxScoreList: rankLists.maxScoreList,
            minScoreList: rankLists.minScoreList
          })
          console.log('手动刷新完成，玩家数:', players.length)
        }
      })
      .catch(err => {
        console.error('手动刷新失败:', err)
      })

    // 刷新队伍榜
    this.db.collection('teams')
      .orderBy('total_score', 'desc')
      .limit(100)
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          const teams = res.data
          teams.sort((a, b) => b.total_score - a.total_score)
          const teamRankLists = that.calculateTeamRankLists(teams)
          that.setData({
            teams: teamRankLists.formattedTeams,
            teamRate1List: teamRankLists.teamRate1List,
            teamAvoid4List: teamRankLists.teamAvoid4List
          })
          console.log('手动刷新完成，队伍数:', teams.length)
        }
      })
      .catch(err => {
        console.error('手动刷新队伍榜失败:', err)
      })
  },

  // 初始化实时监听
  initWatcher() {
    const that = this

    // 使用 watch() 实现实时数据同步
    const watcher = this.db.collection('players')
      .orderBy('total_score', 'desc')
      .limit(100)
      .watch({
        onChange: function (snapshot) {
          console.log('数据变更:', snapshot)
          console.log('snapshot.docs数量:', snapshot.docs ? snapshot.docs.length : 0)
          if (snapshot.docs && snapshot.docs.length > 0) {
            // 打印每个玩家的数据
            snapshot.docs.forEach((p, i) => {
              console.log(`玩家${i + 1}:`, p.name, '对局:', p.games_played, '总分:', p.total_score)
            })
            // 创建数组副本，避免直接修改snapshot.docs
            const players = [...snapshot.docs]
            // 按总分排序（确保顺序正确）
            players.sort((a, b) => b.total_score - a.total_score)
            // 计算各项排行榜
            const rankLists = that.calculateRankLists(players)
            that.setData({
              players: rankLists.formattedPlayers,
              connected: true,
              rate1List: rankLists.rate1List,
              avoid4List: rankLists.avoid4List,
              maxScoreList: rankLists.maxScoreList,
              minScoreList: rankLists.minScoreList
            })
          } else if (snapshot.docs && snapshot.docs.length === 0) {
            // 空数据情况
            that.setData({
              players: [],
              connected: true,
              rate1List: [],
              avoid4List: [],
              maxScoreList: [],
              minScoreList: []
            })
          }
        },
        onError: function (err) {
          console.error('监听错误:', err)
          that.setData({ connected: false })

          // 尝试重新连接
          setTimeout(() => {
            that.initWatcher()
          }, 3000)
        }
      })

    this.setData({ watcher })
  },

  // 初始化队伍实时监听
  initTeamWatcher() {
    const that = this

    // 使用 watch() 实现实时数据同步
    const teamWatcher = this.db.collection('teams')
      .orderBy('total_score', 'desc')
      .limit(100)
      .watch({
        onChange: function (snapshot) {
          console.log('队伍数据变更:', snapshot)
          if (snapshot.docs && snapshot.docs.length > 0) {
            // 创建数组副本，避免直接修改snapshot.docs
            const teams = [...snapshot.docs]
            // 按总分排序（确保顺序正确）
            teams.sort((a, b) => b.total_score - a.total_score)
            // 计算队伍排行榜
            const teamRankLists = that.calculateTeamRankLists(teams)
            that.setData({
              teams: teamRankLists.formattedTeams,
              teamRate1List: teamRankLists.teamRate1List,
              teamAvoid4List: teamRankLists.teamAvoid4List
            })
          } else if (snapshot.docs && snapshot.docs.length === 0) {
            // 空数据情况
            that.setData({
              teams: [],
              teamRate1List: [],
              teamAvoid4List: []
            })
          }
        },
        onError: function (err) {
          console.error('队伍监听错误:', err)

          // 尝试重新连接
          setTimeout(() => {
            that.initTeamWatcher()
          }, 3000)
        }
      })

    this.setData({ teamWatcher })
  },

  // 手动刷新（备用）
  async refreshData() {
    try {
      // 刷新个人榜
      const { data: playersData } = await this.db.collection('players')
        .orderBy('total_score', 'desc')
        .limit(100)
        .get()

      const rankLists = this.calculateRankLists(playersData)

      // 刷新队伍榜
      const { data: teamsData } = await this.db.collection('teams')
        .orderBy('total_score', 'desc')
        .limit(100)
        .get()

      const teamRankLists = this.calculateTeamRankLists(teamsData)

      this.setData({
        players: rankLists.formattedPlayers,
        rate1List: rankLists.rate1List,
        avoid4List: rankLists.avoid4List,
        maxScoreList: rankLists.maxScoreList,
        minScoreList: rankLists.minScoreList,
        teams: teamRankLists.formattedTeams,
        teamRate1List: teamRankLists.teamRate1List,
        teamAvoid4List: teamRankLists.teamAvoid4List
      })

      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    }
  },

  // 清空所有历史记录
  clearAllData() {
    const that = this
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有排行榜数据吗？此操作不可恢复！',
      confirmText: '清空',
      confirmColor: '#ff4d4f',
      success(res) {
        if (res.confirm) {
          that.doClearAllData()
        }
      }
    })
  },

  // 执行清空操作
  async doClearAllData() {
    wx.showLoading({ title: '清空中...' })
    try {
      // 获取所有玩家
      const { data: players } = await this.db.collection('players').get()

      // 逐个删除
      const deletePromises = players.map(player =>
        this.db.collection('players').doc(player._id).remove()
      )

      await Promise.all(deletePromises)

      // 清空本地数据
      this.setData({
        players: [],
        rate1List: [],
        avoid4List: [],
        maxScoreList: [],
        minScoreList: []
      })

      wx.hideLoading()
      wx.showToast({ title: '已清空', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('清空失败:', err)
      wx.showToast({ title: '清空失败', icon: 'none' })
    }
  }
})