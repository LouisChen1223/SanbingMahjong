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
      this.setData({ memberId: options.memberId })
      this.loadPlayerData(options.memberId)
      this.loadRecentGames(options.memberId)
    }
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

        this.setData({
          player: player,
          rate1Str: rate1Str,
          avoid4Str: avoid4Str,
          avgPositionStr: avgPositionStr,
          maxScoreStr: maxScoreStr,
          minScoreStr: minScoreStr,
          avatarUrl: player.avatar_url || ''
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
              position: playerInGame.position
            })
          }
        }

        this.setData({ recentGames: recentGames })
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
      
      // 获取图片的临时链接
      const { fileList } = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      })
      
      const avatarUrl = fileList[0].tempFileURL

      // 更新玩家的头像
      await this.updatePlayerAvatar(avatarUrl)

      this.setData({ 
        avatarUrl: avatarUrl,
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

  // 更新玩家头像
  async updatePlayerAvatar(avatarUrl) {
    try {
      // 从team_members集合中获取选手数据
      const { data: members } = await this.db.collection('team_members')
        .where({ member_id: this.data.memberId })
        .get()

      if (members && members.length > 0) {
        const member = members[0]
        await this.db.collection('team_members').doc(member._id).update({
          data: {
            avatar_url: avatarUrl,
            update_time: this.db.serverDate()
          }
        })
      }
    } catch (err) {
      console.error('更新头像失败:', err)
      throw err
    }
  }
})
