// pages/team-game/team-game.js
const app = getApp()

// 常量配置
const START_POINT = 25000
const HORSE_POINTS = [50, 10, -20, -40]

Page({
  data: {
    windPositions: ['东', '南', '西', '北'],
    teams: [],
    selectedTeamIndex: -1,
    currentTeam: null,
    isCaptain: false,
    players: [
      { name: '', score: '', isNegative: false },
      { name: '', score: '', isNegative: false },
      { name: '', score: '', isNegative: false },
      { name: '', score: '', isNegative: false }
    ],
    result: [],
    loading: false
  },

  onLoad() {
    this.loadTeams()
  },

  onShow() {
    // 每次显示时重新加载队伍
    this.loadTeams()
  },

  // 加载用户的队伍列表
  async loadTeams() {
    const db = app.db
    const _ = db.command
    
    try {
      // 获取当前用户openid
      const userInfo = await wx.cloud.getWXContext()
      const openid = userInfo.openid
      
      // 查询用户所属的队伍
      const { data: memberRecords } = await db.collection('team_members')
        .where({
          user_id: openid
        })
        .get()
      
      if (memberRecords.length === 0) {
        this.setData({ teams: [], currentTeam: null })
        return
      }
      
      // 获取队伍详情
      const teamIds = memberRecords.map(m => m.team_id)
      const { data: teams } = await db.collection('teams')
        .where({
          _id: _.in(teamIds)
        })
        .get()
      
      // 标记队长身份
      const teamsWithRole = teams.map(t => {
        const memberRecord = memberRecords.find(m => m.team_id === t._id)
        return {
          ...t,
          isCaptain: memberRecord ? memberRecord.role === 'captain' : false
        }
      })
      
      this.setData({ teams: teamsWithRole })
    } catch (err) {
      console.error('加载队伍失败:', err)
      wx.showToast({ title: '加载队伍失败', icon: 'none' })
    }
  },

  // 选择队伍
  onTeamSelect(e) {
    const index = e.detail.value
    const team = this.data.teams[index]
    
    this.setData({
      selectedTeamIndex: index,
      currentTeam: team,
      isCaptain: team.isCaptain
    })
  },

  // 切换队伍
  switchTeam() {
    this.setData({
      selectedTeamIndex: -1,
      currentTeam: null,
      isCaptain: false,
      result: [],
      players: [
        { name: '', score: '', isNegative: false },
        { name: '', score: '', isNegative: false },
        { name: '', score: '', isNegative: false },
        { name: '', score: '', isNegative: false }
      ]
    })
  },

  // 跳转到创建队伍
  goToCreateTeam() {
    wx.navigateTo({
      url: '/pages/team-manage/team-manage'
    })
  },

  // 姓名输入
  onNameInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`players[${index}].name`]: e.detail.value
    })
  },

  // 得点输入
  onScoreInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`players[${index}].score`]: e.detail.value
    })
  },

  // 切换正负号
  toggleNegative(e) {
    const index = e.currentTarget.dataset.index
    const current = this.data.players[index].isNegative || false
    this.setData({
      [`players[${index}].isNegative`]: !current
    })
  },

  // 计算分数（同个人战逻辑）
  calculateScores(players) {
    let rankedPlayers = players.map((p, originalIndex) => ({
      ...p,
      originalIndex,
      scoreNum: (parseInt(p.score) || 0) * 100 * (p.isNegative ? -1 : 1),
      rawScore: 0,
      horsePoint: 0,
      finalScore: 0
    }))
    
    rankedPlayers.sort((a, b) => b.scoreNum - a.scoreNum)
    
    rankedPlayers.forEach(p => {
      p.rawScore = (p.scoreNum - START_POINT) / 1000
    })
    
    // 平分马点处理
    let i = 0
    while (i < rankedPlayers.length) {
      let j = i + 1
      while (j < rankedPlayers.length && rankedPlayers[j].scoreNum === rankedPlayers[i].scoreNum) {
        j++
      }
      let horseSum = 0
      for (let k = i; k < j; k++) {
        horseSum += HORSE_POINTS[k]
      }
      const avgHorse = horseSum / (j - i)
      for (let k = i; k < j; k++) {
        rankedPlayers[k].horsePoint = avgHorse
      }
      i = j
    }
    
    rankedPlayers.forEach(p => {
      p.finalScore = Math.round((p.rawScore + p.horsePoint) * 10) / 10
    })
    
    return rankedPlayers
  },

  // 结算
  async onSettle() {
    const { players, currentTeam } = this.data
    
    // 验证输入
    let totalScore = 0
    for (let p of players) {
      if (!p.name.trim()) {
        wx.showToast({ title: '请填写所有玩家姓名', icon: 'none' })
        return
      }
      if (p.score === '' || p.score === null) {
        wx.showToast({ title: '请填写所有玩家得点', icon: 'none' })
        return
      }
      let scoreValue = parseInt(p.score) || 0
      if (p.isNegative) scoreValue = -scoreValue
      totalScore += scoreValue
    }
    
    if (totalScore !== 1000) {
      wx.showToast({ title: '总点数应为1000(百位)，当前为' + totalScore, icon: 'none', duration: 2000 })
      return
    }
    
    this.setData({ loading: true })
    
    try {
      const result = this.calculateScores(players)
      await this.updateTeamScore(result)
      this.setData({ result, loading: false })
      wx.showToast({ title: '结算成功', icon: 'success' })
    } catch (err) {
      console.error('结算失败:', err)
      wx.showToast({ title: '结算失败: ' + err.message, icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 更新队伍分数
  async updateTeamScore(result) {
    const db = app.db
    const _ = db.command
    const { currentTeam } = this.data
    
    // 计算队伍总分变化
    let teamScoreChange = 0
    result.forEach(p => {
      teamScoreChange += p.finalScore
    })
    
    // 更新队伍总分
    await db.collection('teams').doc(currentTeam._id).update({
      data: {
        total_score: _.inc(teamScoreChange),
        games_played: _.inc(1),
        update_time: db.serverDate()
      }
    })
    
    // 更新队员个人分数（如果队员在players集合中）
    for (let p of result) {
      try {
        const playerDoc = db.collection('players').doc(p.name)
        const { data: existingData } = await playerDoc.get().catch(() => ({ data: null }))
        
        if (existingData) {
          await playerDoc.update({
            data: {
              total_score: _.inc(p.finalScore),
              games_played: _.inc(1),
              update_time: db.serverDate()
            }
          })
        }
      } catch (err) {
        console.log(`更新玩家 ${p.name} 分数失败，可能不存在于players集合`)
      }
    }
  },

  // 返回首页
  goHome() {
    wx.reLaunch({
      url: '/pages/home/home'
    })
  }
})