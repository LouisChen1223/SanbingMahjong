// pages/team-history/team-history.js - 团队赛对局历史页面
const app = getApp()

Page({
  data: {
    games: [],
    connected: false,
    memberId: null,
    isPersonalHistory: false
  },

  onLoad(options) {
    this.db = app.db
    if (options.memberId) {
      this.setData({
        memberId: options.memberId,
        isPersonalHistory: true
      })
    }
    this.loadGames()
  },

  // 加载对局历史
  async loadGames() {
    try {
      // 获取所有队伍信息
      const { data: teamsData } = await this.db.collection('teams').get()
      const teamMap = new Map()
      teamsData.forEach(team => {
        teamMap.set(team._id, team.team_name || team._id)
      })

      const { data } = await this.db.collection('team_games')
        .orderBy('create_time', 'desc')
        .limit(100)
        .get()

      // 筛选包含该玩家的对局
      let filteredGames = data
      if (this.data.isPersonalHistory && this.data.memberId) {
        filteredGames = data.filter(game =>
          game.players.some(player => player.name === this.data.memberId)
        )
      }

      // 格式化日期并添加队伍名称和打点信息
      const formattedGames = filteredGames.map(game => {
        const playersWithTeam = game.players.map(player => ({
          ...player,
          team: teamMap.get(player.team_id) || '无队伍',
          scoreNum: player.scoreNum || 0 // 确保打点数据存在
        }))

        return {
          ...game,
          players: playersWithTeam,
          formattedDate: this.formatDate(game.create_time)
        }
      })

      this.setData({
        games: formattedGames,
        connected: true
      })
    } catch (err) {
      console.error('加载对局历史失败:', err)
      wx.showToast({ title: '加载失败: ' + (err.message || '未知错误'), icon: 'none' })
    }
  },

  // 格式化日期
  formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  },



  // 刷新数据
  async refreshData() {
    try {
      wx.showLoading({ title: '刷新中...' })
      await this.loadGames()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 删除对局记录
  async deleteGame(e) {
    const gameId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条对局记录吗？此操作会同时回滚相关的积分和顺位数据。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            // 校验对局记录是否存在
            const gameRes = await this.db.collection('team_games').doc(gameId).get()
            if (!gameRes.data) {
              throw new Error('对局记录不存在，无法删除')
            }
            const game = gameRes.data

            // 回滚玩家数据
            for (const player of game.players) {
              try {
                // 从 team_members 集合中获取玩家数据
                const { data: members } = await this.db.collection('team_members')
                  .where({ member_id: player.name })
                  .get()

                if (members && members.length > 0) {
                  const member = members[0]
                  // 计算需要回滚的数据
                  const updateData = {
                    total_score: this.db.command.inc(-player.finalScore),
                    games_played: this.db.command.inc(-1),
                    update_time: this.db.serverDate()
                  }

                  // 回滚各顺位次数
                  if (player.position === 1) {
                    updateData.first_place = this.db.command.inc(-1)
                  } else if (player.position === 2) {
                    updateData.second_place = this.db.command.inc(-1)
                  } else if (player.position === 3) {
                    updateData.third_place = this.db.command.inc(-1)
                  } else if (player.position === 4) {
                    updateData.fourth_place = this.db.command.inc(-1)
                  }

                  // 回滚玩家数据
                  const memberUpdateResult = await this.db.collection('team_members').doc(member._id).update({
                    data: updateData
                  })

                  if (!memberUpdateResult.stats || memberUpdateResult.stats.updated < 1) {
                    throw new Error(`回滚玩家 ${player.name} 数据失败`)
                  }
                }
              } catch (err) {
                console.log(`回滚玩家 ${player.name} 数据失败:`, err)
              }
            }

            // 回滚队伍数据
            const teamScores = {}
            const teamPositionSums = {}
            const teamFirstPlaces = {}
            const teamSecondPlaces = {}
            const teamThirdPlaces = {}
            const teamFourthPlaces = {}

            // 计算每个队伍的得分、顺位总和、各顺位次数
            game.players.forEach(player => {
              if (!teamScores[player.team_id]) {
                teamScores[player.team_id] = 0
                teamPositionSums[player.team_id] = 0
                teamFirstPlaces[player.team_id] = 0
                teamSecondPlaces[player.team_id] = 0
                teamThirdPlaces[player.team_id] = 0
                teamFourthPlaces[player.team_id] = 0
              }
              teamScores[player.team_id] += player.finalScore
              teamPositionSums[player.team_id] += player.position
              if (player.position === 1) {
                teamFirstPlaces[player.team_id] += 1
              } else if (player.position === 2) {
                teamSecondPlaces[player.team_id] += 1
              } else if (player.position === 3) {
                teamThirdPlaces[player.team_id] += 1
              } else if (player.position === 4) {
                teamFourthPlaces[player.team_id] += 1
              }
            })

            // 按得分排序队伍
            const sortedTeams = Object.entries(teamScores)
              .map(([teamId, score]) => ({ teamId, score }))
              .sort((a, b) => b.score - a.score)

            // 回滚队伍数据
            for (const { teamId, score } of sortedTeams) {
              try {
                // 从 teams 集合中获取队伍数据
                const teamRes = await this.db.collection('teams').doc(teamId).get()
                if (teamRes.data) {
                  // 计算需要回滚的数据
                  const updateData = {
                    total_score: this.db.command.inc(-score),
                    games_played: this.db.command.inc(-1),
                    total_positions: this.db.command.inc(-teamPositionSums[teamId]),
                    first_place: this.db.command.inc(-teamFirstPlaces[teamId]),
                    second_place: this.db.command.inc(-teamSecondPlaces[teamId]),
                    third_place: this.db.command.inc(-teamThirdPlaces[teamId]),
                    fourth_place: this.db.command.inc(-teamFourthPlaces[teamId]),
                    update_time: this.db.serverDate()
                  }

                  // 回滚队伍数据
                  const teamUpdateResult = await this.db.collection('teams').doc(teamId).update({
                    data: updateData
                  })

                  if (!teamUpdateResult.stats || teamUpdateResult.stats.updated < 1) {
                    throw new Error(`回滚队伍 ${teamId} 数据失败`)
                  }
                }
              } catch (err) {
                console.log(`回滚队伍 ${teamId} 数据失败:`, err)
              }
            }

            // 删除对局记录
            await this.db.collection('team_games').doc(gameId).remove()

            // 立即从本地数组中剔除被删除的记录，防止重复点击
            const updatedGames = this.data.games.filter(game => game._id !== gameId)
            this.setData({ games: updatedGames })

            wx.showToast({ title: '删除成功', icon: 'success' })
          } catch (err) {
            console.error('删除失败:', err)
            wx.showToast({ title: '删除失败: ' + (err.message || '未知错误'), icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  // 确认退出
  confirmExit() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出团队赛对局历史页面吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack({
            delta: 1
          })
        }
      }
    })
  }
})