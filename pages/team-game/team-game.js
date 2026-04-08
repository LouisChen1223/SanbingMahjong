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
      // 直接获取所有队伍
      const { data: teams } = await db.collection('teams')
        .where({
          _id: _.exists(true)
        })
        .get()

      // 为所有队伍添加isCaptain属性（暂时默认为false）
      const teamsWithRole = teams.map(t => ({
        ...t,
        isCaptain: false
      }))

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
      const db = app.db
      const _ = db.command

      // 计算分数
      const rankedPlayers = this.calculateScores(players)

      // 检查玩家是否属于队伍
      const teamMap = new Map()
      const { data: teams } = await db.collection('teams').get()
      teams.forEach(team => teamMap.set(team._id, team))

      const { data: members } = await db.collection('team_members').get()
      const memberMap = new Map()
      members.forEach(member => memberMap.set(member.member_id, member))

      // 检查是否有非队伍成员
      const nonTeamMembers = rankedPlayers.filter(p => !memberMap.has(p.name))
      if (nonTeamMembers.length > 0) {
        wx.showToast({ title: '存在非队伍成员: ' + nonTeamMembers.map(p => p.name).join(', '), icon: 'none' })
        this.setData({ loading: false })
        return
      }

      // 检查是否有同队成员
      const teamMembers = new Map()
      for (const p of rankedPlayers) {
        const member = memberMap.get(p.name)
        if (member) {
          const teamId = member.team_id
          if (!teamMembers.has(teamId)) {
            teamMembers.set(teamId, [])
          }
          teamMembers.get(teamId).push(p.name)
        }
      }

      const sameTeamMembers = []
      teamMembers.forEach((members, teamId) => {
        if (members.length > 1) {
          sameTeamMembers.push({ teamId, members })
        }
      })

      if (sameTeamMembers.length > 0) {
        wx.showToast({ title: '存在同队成员', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      // 计算每个队伍的得分、顺位总和、各顺位次数
      const teamScores = {}
      const teamPositionSums = {}
      const teamFirstPlaces = {}
      const teamSecondPlaces = {}
      const teamThirdPlaces = {}
      const teamFourthPlaces = {}

      rankedPlayers.forEach(p => {
        const member = memberMap.get(p.name)
        if (member) {
          const teamId = member.team_id
          if (!teamScores[teamId]) {
            teamScores[teamId] = 0
            teamPositionSums[teamId] = 0
            teamFirstPlaces[teamId] = 0
            teamSecondPlaces[teamId] = 0
            teamThirdPlaces[teamId] = 0
            teamFourthPlaces[teamId] = 0
          }
          teamScores[teamId] += p.finalScore
          teamPositionSums[teamId] += p.position
          if (p.position === 1) {
            teamFirstPlaces[teamId] += 1
          } else if (p.position === 2) {
            teamSecondPlaces[teamId] += 1
          } else if (p.position === 3) {
            teamThirdPlaces[teamId] += 1
          } else if (p.position === 4) {
            teamFourthPlaces[teamId] += 1
          }
        }
      })

      // 按得分排序队伍
      const teamRank = Object.entries(teamScores)
        .map(([teamId, score]) => ({ teamId, score }))
        .sort((a, b) => b.score - a.score)

      // 更新每个队伍的总分、队员顺位总和、各顺位次数
      for (let i = 0; i < teamRank.length; i++) {
        const { teamId, score } = teamRank[i]
        const updateData = {
          total_score: _.inc(score),
          games_played: _.inc(1),
          total_positions: _.inc(teamPositionSums[teamId]),
          first_place: _.inc(teamFirstPlaces[teamId]),
          second_place: _.inc(teamSecondPlaces[teamId]),
          third_place: _.inc(teamThirdPlaces[teamId]),
          fourth_place: _.inc(teamFourthPlaces[teamId]),
          update_time: db.serverDate()
        }

        const teamUpdateResult = await db.collection('teams').doc(teamId).update({
          data: updateData
        })

        if (!teamUpdateResult.stats || teamUpdateResult.stats.updated < 1) {
          throw new Error(`更新队伍 ${teamId} 数据失败`)
        }
      }

      // 更新队员个人分数、最高最低打点、各顺位次数
      for (const p of rankedPlayers) {
        const { data: memberDocs } = await db.collection('team_members')
          .where({ member_id: p.name })
          .get()

        if (memberDocs && memberDocs.length > 0) {
          const memberDoc = memberDocs[0]
          const member = memberDoc

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

          // 更新各顺位次数
          if (p.position === 1) {
            updateData.first_place = _.inc(1)
          } else if (p.position === 2) {
            updateData.second_place = _.inc(1)
          } else if (p.position === 3) {
            updateData.third_place = _.inc(1)
          } else if (p.position === 4) {
            updateData.fourth_place = _.inc(1)
          }

          const memberUpdateResult = await db.collection('team_members').doc(memberDoc._id).update({
            data: updateData
          })

          if (!memberUpdateResult.stats || memberUpdateResult.stats.updated < 1) {
            throw new Error(`更新玩家 ${p.name} 数据失败`)
          }
        }
      }

      // 保存对局记录
      const gameData = {
        players: rankedPlayers.map(p => ({
          name: p.name,
          score: p.score,
          isNegative: p.isNegative,
          scoreNum: p.scoreNum,
          finalScore: p.finalScore,
          position: p.position,
          team_id: memberMap.get(p.name) ? memberMap.get(p.name).team_id : ''
        })),
        create_time: db.serverDate()
      }

      await db.collection('team_games').add({
        data: gameData
      })

      this.setData({ result: rankedPlayers, loading: false })
      wx.showToast({ title: '结算成功', icon: 'success' })
    } catch (err) {
      console.error('结算失败:', err)
      wx.showToast({ title: '结算失败: ' + (err.message || '未知错误'), icon: 'none' })
      this.setData({ loading: false })
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