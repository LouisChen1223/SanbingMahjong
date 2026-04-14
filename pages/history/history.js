// history.js - 对局记录页面
const app = getApp()

Page({
  data: {
    games: [],
    loading: true,
    editingGame: null,
    editPlayers: []
  },

  onLoad() {
    this.db = app.db
    this.loadGames()
  },

  onShow() {
    this.loadGames()
  },

  // 加载对局记录
  async loadGames() {
    this.setData({ loading: true })
    try {
      const { data } = await this.db.collection('games')
        .orderBy('create_time', 'desc')
        .limit(50)
        .get()

      const games = data.map(g => ({
        ...g,
        timeStr: this.formatTime(g.create_time)
      }))

      this.setData({ games, loading: false })
    } catch (err) {
      console.error('加载对局记录失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  },

  // 点击修改按钮
  onEditGame(e) {
    const gameId = e.currentTarget.dataset.id
    const game = this.data.games.find(g => g._id === gameId)
    if (!game) return

    this.setData({
      editingGame: game,
      editPlayers: game.players.map(p => {
        const rawScore = Math.floor((p.scoreNum || 0) / 100)
        return {
          ...p,
          score: Math.abs(rawScore), // 数字框始终显示正数
          isNegative: rawScore < 0 // 如果原分数是负数，按钮显示-
        }
      })
    })
  },

  // 切换正负号
  toggleEditNegative(e) {
    const index = e.currentTarget.dataset.index
    const editPlayers = this.data.editPlayers
    editPlayers[index].isNegative = !editPlayers[index].isNegative
    this.setData({ editPlayers })
  },

  // 修改玩家姓名
  onEditName(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    this.setData({
      [`editPlayers[${index}].name`]: value
    })
  },

  // 修改得点
  onEditScore(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    this.setData({
      [`editPlayers[${index}].score`]: value
    })
  },

  // 取消修改
  onCancelEdit() {
    this.setData({ editingGame: null, editPlayers: [] })
  },

  // 删除对局
  onDeleteGame(e) {
    const gameId = e.currentTarget.dataset.id
    const game = this.data.games.find(g => g._id === gameId)
    if (!game) return

    wx.showModal({
      title: '确认删除',
      content: '删除后将撤销该对局的所有玩家数据，确定要删除吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          try {
            // 检查对局记录是否存在
            const gameRes = await this.db.collection('games').doc(gameId).get()
            if (!gameRes.data) {
              throw new Error('对局记录不存在，无法删除')
            }

            // 撤销玩家数据
            await this.revertGameData(game)
            // 删除对局记录
            await this.db.collection('games').doc(gameId).remove()

            // 立即从本地数组中移除该记录，防止重复点击
            const updatedGames = this.data.games.filter(g => g._id !== gameId)
            this.setData({ games: updatedGames })

            wx.hideLoading()
            wx.showToast({ title: '删除成功', icon: 'success' })

            // 刷新排行榜页面
            const pages = getCurrentPages()
            const rankPage = pages.find(p => p.route === 'pages/rank/rank')
            if (rankPage && rankPage.manualRefresh) {
              rankPage.manualRefresh()
            }
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败:', err)
            wx.showToast({ title: '删除失败: ' + (err.message || '未知错误'), icon: 'none' })
          }
        }
      }
    })
  },

  // 确认修改
  async onConfirmEdit() {
    const { editingGame, editPlayers } = this.data

    let totalScore = 0
    for (let p of editPlayers) {
      if (!p.name.trim()) {
        wx.showToast({ title: '请填写所有玩家姓名', icon: 'none' })
        return
      }
      if (p.score === '' || isNaN(parseInt(p.score))) {
        wx.showToast({ title: '得点必须是数字', icon: 'none' })
        return
      }
      // 考虑isNegative计算实际分数
      const actualScore = p.isNegative ? -parseInt(p.score) : parseInt(p.score)
      totalScore += actualScore
    }
    if (totalScore !== 1000) {
      wx.showToast({ title: '总点数应为1000', icon: 'none' })
      return
    }

    wx.showLoading({ title: '修改中...' })

    try {
      await this.revertGameData(editingGame)
      const newResult = this.calculateScores(editPlayers)
      await this.updatePlayerScores(newResult)

      // 从newResult中获取finalScore和rank信息
      const playerResults = {}
      newResult.forEach(r => {
        playerResults[r.name] = { finalScore: r.finalScore, rank: r.rank }
      })

      await this.db.collection('games').doc(editingGame._id).update({
        data: {
          players: editPlayers.map(p => ({
            name: p.name,
            score: p.score,
            scoreNum: (parseInt(p.score) || 0) * 100,
            finalScore: playerResults[p.name]?.finalScore || 0,
            rank: playerResults[p.name]?.rank || 0
          })),
          result: newResult,
          update_time: this.db.serverDate()
        }
      })

      wx.hideLoading()
      wx.showToast({ title: '修改成功', icon: 'success' })

      this.setData({ editingGame: null, editPlayers: [] })
      this.loadGames()

      const pages = getCurrentPages()
      const rankPage = pages.find(p => p.route === 'pages/rank/rank')
      if (rankPage && rankPage.manualRefresh) {
        rankPage.manualRefresh()
      }
    } catch (err) {
      wx.hideLoading()
      console.error('修改失败:', err)
      wx.showToast({ title: '修改失败', icon: 'none' })
    }
  },

  // 撤销原对局数据
  async revertGameData(game) {
    const playersCollection = this.db.collection('players')
    const _ = this.db.command

    // 使用game.players而不是game.result（因为saveGameRecord只保存players）
    for (let p of game.players) {
      try {
        const playerDoc = playersCollection.doc(p.name)
        const { data: existingData } = await playerDoc.get().catch(() => ({ data: null }))

        if (existingData) {
          const updateData = {
            total_score: _.inc(-p.finalScore),
            games_played: _.inc(-1),
            update_time: this.db.serverDate()
          }

          // 根据顺位更新对应的字段
          if (p.rank === 1) {
            updateData.first_place = _.inc(-1)
          } else if (p.rank === 2) {
            updateData.second_place = _.inc(-1)
          } else if (p.rank === 3) {
            updateData.third_place = _.inc(-1)
          } else if (p.rank === 4) {
            updateData.fourth_place = _.inc(-1)
          }

          await playerDoc.update({ data: updateData })
        }
      } catch (err) {
        console.error(`撤销玩家 ${p.name} 数据失败:`, err)
      }
    }
  },

  // 计算得分
  calculateScores(players) {
    const START_POINT = 25000
    const HORSE_POINTS = [50, 10, -20, -40]

    let rankedPlayers = players.map((p, originalIndex) => {
      // 考虑isNegative计算实际分数
      const baseScore = parseInt(p.score) || 0
      const actualScore = p.isNegative ? -baseScore : baseScore
      return {
        ...p,
        originalIndex,
        scoreNum: actualScore * 100,
        rawScore: 0,
        horsePoint: 0,
        finalScore: 0
      }
    })

    rankedPlayers.sort((a, b) => b.scoreNum - a.scoreNum)
    rankedPlayers.forEach(p => {
      p.rawScore = (p.scoreNum - START_POINT) / 1000
    })

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

    // 同分顺位共享
    i = 0
    while (i < rankedPlayers.length) {
      let j = i + 1
      while (j < rankedPlayers.length && rankedPlayers[j].scoreNum === rankedPlayers[i].scoreNum) {
        j++
      }
      for (let k = i; k < j; k++) {
        rankedPlayers[k].rank = i + 1
      }
      i = j
    }

    return rankedPlayers
  },

  // 更新玩家数据
  async updatePlayerScores(result) {
    const playersCollection = this.db.collection('players')
    const _ = this.db.command

    for (let p of result) {
      try {
        const playerDoc = playersCollection.doc(p.name)
        const { data: existingData } = await playerDoc.get().catch(() => ({ data: null }))

        if (!existingData) {
          await playerDoc.set({
            data: {
              name: p.name,
              total_score: p.finalScore,
              games_played: 1,
              first_place: p.rank === 1 ? 1 : 0,
              second_place: p.rank === 2 ? 1 : 0,
              third_place: p.rank === 3 ? 1 : 0,
              fourth_place: p.rank === 4 ? 1 : 0,
              max_score: p.scoreNum,
              min_score: p.scoreNum,
              create_time: this.db.serverDate(),
              update_time: this.db.serverDate()
            }
          })
        } else {
          const updateData = {
            total_score: _.inc(p.finalScore),
            games_played: _.inc(1),
            update_time: this.db.serverDate()
          }

          // 根据顺位更新对应的字段
          if (p.rank === 1) {
            updateData.first_place = _.inc(1)
          } else if (p.rank === 2) {
            updateData.second_place = _.inc(1)
          } else if (p.rank === 3) {
            updateData.third_place = _.inc(1)
          } else if (p.rank === 4) {
            updateData.fourth_place = _.inc(1)
          }

          if (p.scoreNum > (existingData.max_score || 0)) updateData.max_score = p.scoreNum
          if (p.scoreNum < (existingData.min_score || 999999)) updateData.min_score = p.scoreNum

          await playerDoc.update({ data: updateData })
        }
      } catch (err) {
        console.error(`更新玩家 ${p.name} 失败:`, err)
      }
    }
  }
})