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
    // 延迟加载队伍，避免阻塞页面
    setTimeout(() => {
      this.loadTeams()
    }, 500)
  },

  onShow() {
    // 每次显示时重新加载队伍
    setTimeout(() => {
      this.loadTeams()
    }, 500)
  },

  // 加载用户的队伍列表
  async loadTeams() {
    const db = app.db
    const _ = db.command

    try {
      // 检查云开发是否初始化
      if (!wx.cloud) {
        console.error('云开发未初始化')
        wx.showToast({ title: '云开发未初始化', icon: 'none' })
        return
      }

      // 获取当前用户openid
      const { result: userInfo } = await wx.cloud.callFunction({
        name: 'getUserInfo'
      })

      if (!userInfo || !userInfo.openid) {
        console.error('获取用户信息失败:', userInfo)
        wx.showToast({ title: '获取用户信息失败', icon: 'none' })
        return
      }

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
      wx.showToast({ title: '加载队伍失败: ' + (err.message || '未知错误'), icon: 'none' })
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

  // 跳转到队伍管理
  goToTeamManage() {
    wx.navigateTo({
      url: '/pages/team-manage/team-manage'
    })
  },

  // 跳转到排行榜
  goToRank() {
    wx.navigateTo({
      url: '/pages/team-rank/team-rank'
    })
  },

  // 跳转到对局历史
  goToHistory() {
    wx.navigateTo({
      url: '/pages/team-history/team-history'
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
      name: p.name.trim(), // 去除姓名前后空格
      originalIndex,
      scoreNum: (parseInt(p.score) || 0) * 100 * (p.isNegative ? -1 : 1),
      rawScore: 0,
      horsePoint: 0,
      finalScore: 0,
      position: 0
    }))

    rankedPlayers.sort((a, b) => b.scoreNum - a.scoreNum)

    rankedPlayers.forEach(p => {
      p.rawScore = (p.scoreNum - START_POINT) / 1000
    })

    // 计算位次和马点（同分情况下共同获得较高位次）
    let i = 0
    while (i < rankedPlayers.length) {
      let j = i + 1
      while (j < rankedPlayers.length && rankedPlayers[j].scoreNum === rankedPlayers[i].scoreNum) {
        j++
      }
      // 计算位次（使用当前位置+1作为共同位次）
      const position = i + 1
      // 为所有同分玩家设置相同的位次
      for (let k = i; k < j; k++) {
        rankedPlayers[k].position = position
      }
      // 计算马点
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
    const { players } = this.data

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
      // 验证所有玩家是否属于某个队伍
      const playerTeams = await this.validatePlayers(players)
      if (!playerTeams) {
        this.setData({ loading: false })
        return
      }

      // 检查是否有同队队员
      if (this.hasSameTeamPlayers(playerTeams)) {
        wx.showToast({ title: '不允许同队队员出现在同一场对局', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      const result = this.calculateScores(players)
      await this.updateTeamScore(result, playerTeams)
      this.setData({ result, loading: false })
      wx.showToast({ title: '结算成功', icon: 'success' })
    } catch (err) {
      console.error('结算失败:', err)
      wx.showToast({ title: '结算失败: ' + err.message, icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 验证玩家是否属于某个队伍
  async validatePlayers(players) {
    const db = app.db
    const playerNames = players.map(p => p.name.trim())
    const playerTeams = {}

    try {
      // 查询所有队员信息
      const { data: members } = await db.collection('team_members').get()

      for (const name of playerNames) {
        const member = members.find(m => m.member_id === name)
        if (!member) {
          wx.showToast({ title: `${name} 不是任何队伍的队员，请先添加到队伍中`, icon: 'none' })
          return null
        }
        playerTeams[name] = member.team_id
      }

      return playerTeams
    } catch (err) {
      console.error('验证玩家失败:', err)
      wx.showToast({ title: '验证玩家失败', icon: 'none' })
      return null
    }
  },

  // 检查是否有同队队员
  hasSameTeamPlayers(playerTeams) {
    const teams = Object.values(playerTeams)
    const uniqueTeams = new Set(teams)
    return uniqueTeams.size < teams.length
  },

  // 更新队伍分数
  async updateTeamScore(result, playerTeams) {
    const db = app.db
    const _ = db.command

    // 计算每个队伍的总分变化和队员顺位总和
    const teamScoreChanges = {}
    const teamPositionSums = {}
    result.forEach(p => {
      const teamId = playerTeams[p.name]
      if (!teamScoreChanges[teamId]) {
        teamScoreChanges[teamId] = 0
        teamPositionSums[teamId] = 0
      }
      teamScoreChanges[teamId] += p.finalScore
      teamPositionSums[teamId] += p.position
    })

    // 计算队伍排名
    const teamRank = Object.entries(teamScoreChanges)
      .map(([teamId, score]) => ({ teamId, score }))
      .sort((a, b) => b.score - a.score)

    // 更新每个队伍的总分和队员顺位总和
    for (let i = 0; i < teamRank.length; i++) {
      const { teamId, score } = teamRank[i]
      const updateData = {
        total_score: _.inc(score),
        games_played: _.inc(1),
        total_positions: _.inc(teamPositionSums[teamId]),
        update_time: db.serverDate()
      }

      await db.collection('teams').doc(teamId).update({
        data: updateData
      })
    }

    // 更新队员个人分数（使用 team_members 集合）
    for (let p of result) {
      try {
        // 查找队员在 team_members 集合中的记录
        const playerName = p.name.trim()
        const { data: members } = await db.collection('team_members')
          .where({ member_id: playerName })
          .get()

        if (members && members.length > 0) {
          const member = members[0]
          const memberDoc = db.collection('team_members').doc(member._id)

          // 计算最高和最低打点
          const updateData = {
            total_score: _.inc(p.finalScore),
            games_played: _.inc(1),
            update_time: db.serverDate()
          }

          // 更新最高打点（使用局内得点）
          if (!member.max_score || p.scoreNum > member.max_score) {
            updateData.max_score = p.scoreNum
          }

          // 更新最低打点（使用局内得点）
          if (!member.min_score || p.scoreNum < member.min_score) {
            updateData.min_score = p.scoreNum
          }

          await memberDoc.update({
            data: updateData
          })
        } else {
          console.log(`玩家 ${p.name} 不在 team_members 集合中，跳过更新`)
        }
      } catch (err) {
        console.log(`更新团队赛玩家 ${p.name} 分数失败:`, err)
      }
    }

    // 保存对局记录
    await this.saveGameRecord(result, playerTeams)
  },

  // 保存对局记录
  async saveGameRecord(result, playerTeams) {
    const db = app.db

    try {
      await db.collection('team_games').add({
        data: {
          players: result.map((p) => {
            const playerName = p.name.trim()
            return {
              name: playerName,
              team_id: playerTeams[playerName],
              scoreNum: p.scoreNum,
              finalScore: p.finalScore,
              position: p.position // 记录个人顺位
            }
          }),
          create_time: db.serverDate()
        }
      })
      console.log('对局记录保存成功')

      // 通知rank页面刷新数据
      const pages = getCurrentPages()
      const rankPage = pages.find(p => p.route === 'pages/rank/rank')
      if (rankPage && rankPage.manualRefresh) {
        console.log('触发rank页面手动刷新')
        rankPage.manualRefresh()
      }
    } catch (err) {
      console.error('保存对局记录失败:', err)
    }
  },

  // 确认退出
  confirmExit() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出团队赛页面吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack({
            delta: 1
          })
        }
      }
    })
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})