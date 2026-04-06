// pages/team-rank/team-rank.js - 团队赛排行榜页面
const app = getApp()

Page({
  data: {
    teams: [],
    teamPlayers: [],
    teamPlayersRate1: [],
    teamPlayersAvoid4: [],
    teamPlayersMaxScore: [],
    teamPlayersMinScore: [],
    connected: false,
    rankType: 'team', // team 或 personal
    currentTab: 'teamTotal',
    currentPersonalTab: 'total',
    teamRate1List: [],
    teamAvoid4List: []
  },

  onLoad() {
    this.db = app.db
    this.loadTeamData()
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  // 切换个人榜标签
  switchPersonalTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentPersonalTab: tab })
  },

  // 切换榜单项（团队榜/个人榜）
  switchRankType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ rankType: type })
  },

  // 格式化分数为一位小数（用于总分）
  formatScore(score) {
    if (score === null || score === undefined) return '0.0'
    return Number(score).toFixed(1)
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

  // 计算个人榜数据
  async calculatePlayerRankLists(membersData, teamsData) {
    // 创建队伍映射
    const teamMap = new Map()
    teamsData.forEach(team => {
      teamMap.set(team._id, team)
    })

    // 统计队员数据
    const playerStats = new Map()
    
    // 遍历所有队员
    membersData.forEach(member => {
      const name = member.member_id
      const teamId = member.team_id
      const team = teamMap.get(teamId)
      
      if (!playerStats.has(name)) {
        playerStats.set(name, {
          name: name,
          team: team ? (team.team_name || teamId) : '',
          totalScore: 0,
          firstPlace: 0,
          fourthPlace: 0,
          games: 0,
          maxScore: 0,
          minScore: 0
        })
      }
    })

    // 尝试从 players 集合中获取队员的详细数据
    try {
      const playersRes = await this.db.collection('players').get()
      playersRes.data.forEach(player => {
        if (playerStats.has(player.name)) {
          const stats = playerStats.get(player.name)
          stats.totalScore = player.total_score || 0
          stats.games = player.games_played || 0
          stats.maxScore = player.max_score || 0
          stats.minScore = player.min_score || 0
          playerStats.set(player.name, stats)
        }
      })
    } catch (err) {
      console.log('players 集合不存在，使用默认数据')
    }

    // 转换为数组并添加格式化字段
    const teamPlayers = Array.from(playerStats.values())
      .map(p => ({
        ...p,
        totalScoreStr: p.totalScore.toFixed(1)
      }))
      .sort((a, b) => b.totalScore - a.totalScore)

    // 一位率榜
    const teamPlayersRate1 = Array.from(playerStats.values())
      .filter(p => p.games > 0)
      .map(p => ({
        ...p,
        rate1Str: (p.firstPlace / p.games * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => (b.firstPlace / b.games) - (a.firstPlace / a.games))

    // 避四率榜
    const teamPlayersAvoid4 = Array.from(playerStats.values())
      .filter(p => p.games > 0)
      .map(p => ({
        ...p,
        avoid4Str: ((p.games - p.fourthPlace) / p.games * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => ((b.games - b.fourthPlace) / b.games) - ((a.games - a.fourthPlace) / a.games))

    // 最高打点榜
    const teamPlayersMaxScore = Array.from(playerStats.values())
      .map(p => ({
        ...p,
        maxScoreStr: p.maxScore ? p.maxScore.toFixed(1) : '0.0'
      }))
      .sort((a, b) => (b.maxScore || 0) - (a.maxScore || 0))

    // 最低打点榜
    const teamPlayersMinScore = Array.from(playerStats.values())
      .map(p => ({
        ...p,
        minScoreStr: p.minScore ? p.minScore.toFixed(1) : '0.0'
      }))
      .sort((a, b) => (a.minScore || 0) - (b.minScore || 0))

    return { teamPlayers, teamPlayersRate1, teamPlayersAvoid4, teamPlayersMaxScore, teamPlayersMinScore }
  },

  // 加载队伍数据
  async loadTeamData() {
    try {
      // 加载队伍数据
      const { data: teamsData } = await this.db.collection('teams')
        .orderBy('total_score', 'desc')
        .limit(100)
        .get()
      
      // 计算队伍排行榜数据
      const teamRankLists = this.calculateTeamRankLists(teamsData)
      
      // 加载队员数据
      const { data: membersData } = await this.db.collection('team_members')
        .get()
      
      // 计算个人榜数据（从队员数据和队伍数据中计算）
      const playerRankLists = await this.calculatePlayerRankLists(membersData, teamsData)
      
      this.setData({ 
        teams: teamRankLists.formattedTeams,
        teamRate1List: teamRankLists.teamRate1List,
        teamAvoid4List: teamRankLists.teamAvoid4List,
        teamPlayers: playerRankLists.teamPlayers,
        teamPlayersRate1: playerRankLists.teamPlayersRate1,
        teamPlayersAvoid4: playerRankLists.teamPlayersAvoid4,
        teamPlayersMaxScore: playerRankLists.teamPlayersMaxScore,
        teamPlayersMinScore: playerRankLists.teamPlayersMinScore,
        connected: true
      })
    } catch (err) {
      console.error('加载队伍数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 刷新数据
  async refreshData() {
    try {
      wx.showLoading({ title: '刷新中...' })
      await this.loadTeamData()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 确认退出
  confirmExit() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出团队赛排行榜页面吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack({
            delta: 1
          })
        }
      }
    })
  },

  // 跳转到团队赛
  goToTeamGame() {
    wx.navigateTo({
      url: '/pages/team-game/team-game'
    })
  },

  // 跳转到团队赛对局历史
  goToTeamHistory() {
    wx.navigateTo({
      url: '/pages/team-history/team-history'
    })
  },

  // 跳转到队伍管理
  goToTeamManage() {
    wx.navigateTo({
      url: '/pages/team-manage/team-manage'
    })
  }
})