// pages/team-history/team-history.js - 团队赛对局历史页面
const app = getApp()

Page({
  data: {
    games: [],
    connected: false
  },

  onLoad() {
    this.db = app.db
    this.loadGames()
  },

  // 加载对局历史
  async loadGames() {
    try {
      const { data } = await this.db.collection('team_games')
        .orderBy('created_at', 'desc')
        .limit(100)
        .get()
      
      // 格式化日期
      const formattedGames = data.map(game => ({
        ...game,
        formattedDate: this.formatDate(game.created_at)
      }))
      
      this.setData({ 
        games: formattedGames,
        connected: true
      })
    } catch (err) {
      console.error('加载对局历史失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
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
            
            // 获取对局记录
            const gameRes = await this.db.collection('team_games').doc(gameId).get()
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
                  
                  // 回滚玩家数据
                  await this.db.collection('team_members').doc(member._id).update({
                    data: updateData
                  })
                }
              } catch (err) {
                console.log(`回滚玩家 ${player.name} 数据失败:`, err)
              }
            }
            
            // 回滚队伍数据
            const teamScores = {}
            const teamRanks = {}
            
            // 计算每个队伍的得分和排名
            game.players.forEach((player, index) => {
              if (!teamScores[player.team_id]) {
                teamScores[player.team_id] = 0
              }
              teamScores[player.team_id] += player.finalScore
              teamRanks[player.team_id] = index + 1
            })
            
            // 按得分排序队伍
            const sortedTeams = Object.entries(teamScores)
              .map(([teamId, score]) => ({ teamId, score }))
              .sort((a, b) => b.score - a.score)
            
            // 回滚队伍数据
            for (let i = 0; i < sortedTeams.length; i++) {
              const { teamId, score } = sortedTeams[i]
              try {
                // 从 teams 集合中获取队伍数据
                const teamRes = await this.db.collection('teams').doc(teamId).get()
                if (teamRes.data) {
                  // 计算需要回滚的数据
                  const updateData = {
                    total_score: this.db.command.inc(-score),
                    games_played: this.db.command.inc(-1),
                    update_time: this.db.serverDate()
                  }
                  
                  // 回滚队伍排名数据
                  if (i === 0) {
                    updateData.first_place = this.db.command.inc(-1)
                  } else if (i === 1) {
                    updateData.second_place = this.db.command.inc(-1)
                  } else if (i === 2) {
                    updateData.third_place = this.db.command.inc(-1)
                  } else if (i === 3) {
                    updateData.fourth_place = this.db.command.inc(-1)
                  }
                  
                  // 回滚队伍数据
                  await this.db.collection('teams').doc(teamId).update({
                    data: updateData
                  })
                }
              } catch (err) {
                console.log(`回滚队伍 ${teamId} 数据失败:`, err)
              }
            }
            
            // 删除对局记录
            await this.db.collection('team_games').doc(gameId).remove()
            
            wx.showToast({ title: '删除成功', icon: 'success' })
            // 重新加载数据
            await this.loadGames()
          } catch (err) {
            console.error('删除失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
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