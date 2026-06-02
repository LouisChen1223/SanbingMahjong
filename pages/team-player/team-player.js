// pages/team-player/team-player.js - 选手个人主页
const app = getApp()

Page({
  data: {
    player: null,
    teamName: '',
    rate1Str: '0.0%',
    avoid4Str: '0.0%',
    avgPositionStr: '0.00',
    maxScoreStr: '0',
    minScoreStr: '0',
    recentGames: [],
    memberId: '',
    avatarUrl: '',
    loadingAvatar: false
  },

  onLoad(options) {
    this.db = app.db
    if (options.memberId) {
      let mid = options.memberId
      try {
        mid = decodeURIComponent(mid)
      } catch (e) {
        /* keep raw */
      }
      this._avatarErrorRetried = false
      this.setData({ memberId: mid })
      this.loadPlayerData(mid)
      this.loadRecentGames(mid)
    }
  },

  async resolveAvatarDisplayUrl(stored) {
    if (!stored || typeof stored !== 'string') return ''
    const s = stored.trim()
    if (!s) return ''
    if (s.indexOf('cloud://') === 0) {
      try {
        const { fileList } = await wx.cloud.getTempFileURL({ fileList: [s] })
        const item = fileList && fileList[0]
        if (!item || item.status !== 0 || !item.tempFileURL) {
          console.warn('头像临时链接失败', item && item.errMsg)
          return ''
        }
        return item.tempFileURL
      } catch (e) {
        console.error('resolveAvatarDisplayUrl', e)
        return ''
      }
    }
    return s
  },

  async refreshAvatarDisplay() {
    const raw = this.data.player && this.data.player.avatar_url
    if (!raw) return
    const url = await this.resolveAvatarDisplayUrl(raw)
    if (url) this.setData({ avatarUrl: url })
  },

  onAvatarImageError() {
    if (this._avatarErrorRetried) return
    this._avatarErrorRetried = true
    this.refreshAvatarDisplay()
  },

  // 加载选手数据
  async loadPlayerData(memberId) {
    try {
      // 从team_members集合中获取选手数据
      const { data: members } = await this.db.collection('team_members')
        .where({ member_id: memberId })
        .get()

      if (members && members.length > 0) {
        const player = members[0]
        
        // 获取选手所属队伍名称
        if (player.team_id) {
          const { data: team } = await this.db.collection('teams').doc(player.team_id).get()
          if (team) {
            this.setData({ teamName: team.team_name || player.team_id })
          }
        }

        // 计算吃一率、避四率和平均顺位
        const gamesPlayed = player.games_played || 0
        const firstPlace = player.first_place || 0
        const secondPlace = player.second_place || 0
        const thirdPlace = player.third_place || 0
        const fourthPlace = player.fourth_place || 0

        let rate1Str = '0.0%'
        let avoid4Str = '0.0%'
        let avgPositionStr = '0.00'

        if (gamesPlayed > 0) {
          rate1Str = ((firstPlace / gamesPlayed) * 100).toFixed(1) + '%'
          avoid4Str = ((1 - (fourthPlace / gamesPlayed)) * 100).toFixed(1) + '%'
          const avgPosition = (firstPlace * 1 + secondPlace * 2 + thirdPlace * 3 + fourthPlace * 4) / gamesPlayed
          avgPositionStr = avgPosition.toFixed(2)
        }

        // 预先格式化最高打点和最低打点
        const maxScoreStr = this.formatInteger(player.max_score)
        const minScoreStr = this.formatInteger(player.min_score)
        const avatarUrl = await this.resolveAvatarDisplayUrl(player.avatar_url)

        this.setData({
          player: player,
          rate1Str: rate1Str,
          avoid4Str: avoid4Str,
          avgPositionStr: avgPositionStr,
          maxScoreStr: maxScoreStr,
          minScoreStr: minScoreStr,
          avatarUrl
        })
      }
    } catch (err) {
      console.error('加载选手数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 加载选手最近十场的顺位
  async loadRecentGames(memberId) {
    try {
      // 从team_games集合中获取包含该选手的所有对局记录
      const { data: allGames } = await this.db.collection('team_games')
        .orderBy('create_time', 'desc')
        .limit(100)
        .get()

      if (allGames && allGames.length > 0) {
        // 筛选出包含该选手的对局，并提取该选手的顺位
        const recentGames = []
        for (let i = 0; i < allGames.length && recentGames.length < 10; i++) {
          const game = allGames[i]
          const playerInGame = game.players.find(p => p.name === memberId)
          if (playerInGame) {
            recentGames.push({
              position: playerInGame.position || playerInGame.rank
            })
          }
        }
        recentGames.reverse()

        this.setData({ recentGames: recentGames }, () => {
          // 数据加载完成后绘制折线图
          this.drawPositionChart()
        })
      }
    } catch (err) {
      console.error('加载最近对局失败:', err)
    }
  },

  // 格式化整数
  formatInteger(score) {
    if (score === null || score === undefined) return '0'
    return Math.round(Number(score)).toString()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({
      delta: 1
    })
  },

  // 跳转到个人历史记录页面
  goToHistory() {
    wx.navigateTo({
      url: '/pages/team-history/team-history?memberId=' + this.data.memberId
    })
  },

  // 选择头像
  chooseAvatar() {
    const that = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0]
        that.uploadAvatar(tempFilePath)
      }
    })
  },

  // 上传头像
  async uploadAvatar(filePath) {
    try {
      this.setData({ loadingAvatar: true })
      wx.showLoading({ title: '上传中...' })

      const memberId = this.data.memberId
      const cloudPath = `avatars/${memberId}_${Date.now()}.jpg`
      
      // 上传图片到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      const fileID = uploadResult.fileID
      await this.updatePlayerAvatar(fileID)

      const displayUrl = await this.resolveAvatarDisplayUrl(fileID)
      const mergedPlayer = this.data.player
        ? { ...this.data.player, avatar_url: fileID }
        : { member_id: memberId, avatar_url: fileID }
      this._avatarErrorRetried = false
      this.setData({
        player: mergedPlayer,
        avatarUrl: displayUrl,
        loadingAvatar: false
      })

      wx.showToast({ title: '头像上传成功', icon: 'success' })
    } catch (err) {
      console.error('上传头像失败:', err)
      wx.showToast({ title: '上传失败: ' + (err.message || '未知错误'), icon: 'none' })
      this.setData({ loadingAvatar: false })
    } finally {
      wx.hideLoading()
    }
  },

  async updatePlayerAvatar(avatarFileId) {
    try {
      const { data: members } = await this.db.collection('team_members')
        .where({ member_id: this.data.memberId })
        .get()

      if (members && members.length > 0) {
        const member = members[0]
        await this.db.collection('team_members').doc(member._id).update({
          data: {
            avatar_url: avatarFileId,
            update_time: this.db.serverDate()
          }
        })
      }
    } catch (err) {
      console.error('更新头像失败:', err)
      throw err
    }
  },

  // 绘制顺位折线图
  drawPositionChart() {
    const recentGames = this.data.recentGames
    if (recentGames.length === 0) return

    const ctx = wx.createCanvasContext('positionChart')
    const canvasWidth = 340 // 画布宽度（根据实际情况调整）
    const canvasHeight = 300 // 画布高度（根据实际情况调整）
    const padding = 40 // 边距
    const dataLength = recentGames.length
    const xStep = dataLength <= 1 ? 0 : (canvasWidth - 2 * padding) / (dataLength - 1)
    const yStep = (canvasHeight - 2 * padding) / 3 // 4个顺位，所以分为3段

    // 绘制网格
    ctx.setStrokeStyle('#e0e0e0')
    ctx.setLineWidth(1)
    for (let i = 0; i <= 4; i++) {
      const y = padding + i * yStep
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      ctx.fillStyle = '#666'
      ctx.font = '12px Arial'
      ctx.textAlign = 'right'
      ctx.fillText((i + 1).toString() + '位', padding - 10, y + 5)
    }

    // 绘制折线
    ctx.setStrokeStyle('#1AAD19')
    ctx.setLineWidth(2)
    ctx.beginPath()
    for (let i = 0; i < dataLength; i++) {
      const x = padding + i * xStep
      const y = padding + (recentGames[i].position - 1) * yStep
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // 绘制数据点
    ctx.setFillStyle('#1AAD19')
    for (let i = 0; i < dataLength; i++) {
      const x = padding + i * xStep
      const y = padding + (recentGames[i].position - 1) * yStep
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, 2 * Math.PI)
      ctx.fill()
    }

    // 绘制x轴标签
    ctx.fillStyle = '#666'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    for (let i = 0; i < dataLength; i++) {
      const x = padding + i * xStep
      ctx.fillText((i + 1).toString(), x, canvasHeight - padding + 15)
    }

    ctx.draw()
  },

  // 画布加载完成
  onCanvasLoad() {
    this.drawPositionChart()
  },

  onShow() {
    this.refreshAvatarDisplay()
    this.drawPositionChart()
  }
})
