// pages/player/player.js - 个人赛选手个人主页
const app = getApp()
const { buildStatsDisplay, mergePlayerRecords } = require('../../utils/playerStats.js')
const {
  ensureActiveSeason,
  fetchPlayerSeasonSnapshots
} = require('../../utils/personalSeason.js')

Page({
  data: {
    player: null,
    seasonStats: null,
    totalStats: null,
    activeSeasonName: '',
    recentGames: [],
    playerName: '',
    officialName: '',
    avatarUrl: '',
    savingOfficialName: false,
    loadingAvatar: false,
    loadingStats: true
  },

  onLoad(options) {
    this.db = app.db
    const raw = options.name || ''
    let name = raw
    try {
      name = raw ? decodeURIComponent(raw) : ''
    } catch (e) {
      name = raw
    }
    if (name) {
      this._avatarErrorRetried = false
      this.setData({ playerName: name })
      this.loadAllData(name)
    }
  },

  async loadAllData(name) {
    this.setData({ loadingStats: true })
    try {
      const [activeSeason, playerRes, snapshots] = await Promise.all([
        ensureActiveSeason(this.db),
        this.db.collection('players').doc(name).get().catch(() => ({ data: null })),
        fetchPlayerSeasonSnapshots(this.db, name)
      ])
      const player = playerRes.data || null
      const totalRecord = mergePlayerRecords(player, snapshots)

      this.setData({
        player,
        activeSeasonName: activeSeason.name || '当前赛季',
        seasonStats: buildStatsDisplay(player),
        totalStats: buildStatsDisplay(totalRecord),
        officialName: (player && player.official_name) ? player.official_name : '',
        loadingStats: false
      })

      if (player && player.avatar_url) {
        const avatarUrl = await this.resolveAvatarDisplayUrl(player.avatar_url)
        if (avatarUrl) this.setData({ avatarUrl })
      }
    } catch (err) {
      console.error('加载选手数据失败:', err)
      this.setData({ loadingStats: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    this.loadRecentGames(name)
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

  async loadRecentGames(name) {
    try {
      const _ = this.db.command
      let allGames = []
      try {
        const res = await this.db.collection('games')
          .where({
            players: _.elemMatch({
              name: _.eq(name)
            })
          })
          .orderBy('create_time', 'desc')
          .limit(10)
          .get()
        allGames = res.data || []
      } catch (qErr) {
        console.warn('按玩家查询最近对局失败，回退为全表扫描:', qErr)
        allGames = await this.scanRecentGamesForPlayerFallback(name, 10)
      }

      if (allGames && allGames.length > 0) {
        const recentGames = allGames.map(game => {
          const playerInGame = game.players.find(p => p.name === name)
          return {
            position: playerInGame ? (playerInGame.rank || playerInGame.position) : 0
          }
        }).filter(item => item.position)
        recentGames.reverse()
        this.setData({ recentGames }, () => {
          this.drawPositionChart()
        })
      } else {
        this.setData({ recentGames: [] })
      }
    } catch (err) {
      console.error('加载最近对局失败:', err)
    }
  },

  async scanRecentGamesForPlayerFallback(name, need) {
    const BATCH = 100
    const found = []
    let skip = 0
    while (found.length < need) {
      const { data: batch } = await this.db.collection('games')
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(BATCH)
        .get()
      if (!batch || !batch.length) break
      for (const game of batch) {
        if (found.length >= need) break
        const playerInGame = game.players && game.players.find(p => p.name === name)
        if (playerInGame) {
          found.push(game)
        }
      }
      skip += batch.length
      if (batch.length < BATCH) break
      if (skip > 8000) break
    }
    return found
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goToHistory() {
    const app = getApp()
    app.globalData.pendingPersonalHistoryName = this.data.playerName || null
    wx.switchTab({ url: '/pages/history/history' })
  },

  goToSeasonHistory() {
    const name = this.data.playerName
    if (!name) return
    wx.navigateTo({
      url: '/pages/player-season-history/player-season-history?name=' + encodeURIComponent(name)
    })
  },

  onOfficialNameInput(e) {
    this.setData({ officialName: e.detail.value })
  },

  async saveOfficialName() {
    const name = (this.data.playerName || '').trim()
    if (!name) return
    if (this.data.savingOfficialName) return

    const officialName = (this.data.officialName || '').trim()
    this.setData({ savingOfficialName: true })
    wx.showLoading({ title: '保存中...' })

    try {
      const doc = this.db.collection('players').doc(name)
      const updateData = {
        official_name: officialName,
        update_time: this.db.serverDate()
      }
      try {
        await doc.update({ data: updateData })
      } catch (err) {
        await doc.set({
          data: {
            name,
            official_name: officialName,
            total_score: 0,
            games_played: 0,
            first_place: 0,
            second_place: 0,
            third_place: 0,
            fourth_place: 0,
            create_time: this.db.serverDate(),
            update_time: this.db.serverDate()
          }
        })
      }

      const mergedPlayer = this.data.player
        ? { ...this.data.player, official_name: officialName }
        : { name, official_name: officialName }
      this.setData({ player: mergedPlayer, officialName })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      console.error('保存公式战名失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ savingOfficialName: false })
    }
  },

  chooseAvatar() {
    const that = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        that.uploadAvatar(res.tempFilePaths[0])
      }
    })
  },

  async uploadAvatar(filePath) {
    try {
      this.setData({ loadingAvatar: true })
      wx.showLoading({ title: '上传中...' })

      const playerName = this.data.playerName
      const cloudPath = `players/avatars/${playerName}_${Date.now()}.jpg`
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      const fileID = uploadResult.fileID
      await this.updatePlayerAvatar(fileID)

      const displayUrl = await this.resolveAvatarDisplayUrl(fileID)
      const mergedPlayer = this.data.player
        ? { ...this.data.player, avatar_url: fileID }
        : { name: playerName, avatar_url: fileID }
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
    await this.db.collection('players').doc(this.data.playerName).update({
      data: {
        avatar_url: avatarFileId,
        update_time: this.db.serverDate()
      }
    })
  },

  drawPositionChart() {
    const recentGames = this.data.recentGames
    if (recentGames.length === 0) return

    const ctx = wx.createCanvasContext('positionChart')
    const canvasWidth = 340
    const canvasHeight = 300
    const padding = 40
    const dataLength = recentGames.length
    const xStep = dataLength <= 1 ? 0 : (canvasWidth - 2 * padding) / (dataLength - 1)
    const yStep = (canvasHeight - 2 * padding) / 3

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

    ctx.setStrokeStyle('#1AAD19')
    ctx.setLineWidth(2)
    ctx.beginPath()
    for (let i = 0; i < dataLength; i++) {
      const x = padding + i * xStep
      const y = padding + (recentGames[i].position - 1) * yStep
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    ctx.setFillStyle('#1AAD19')
    for (let i = 0; i < dataLength; i++) {
      const x = padding + i * xStep
      const y = padding + (recentGames[i].position - 1) * yStep
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, 2 * Math.PI)
      ctx.fill()
    }

    ctx.fillStyle = '#666'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    for (let i = 0; i < dataLength; i++) {
      const x = padding + i * xStep
      ctx.fillText((i + 1).toString(), x, canvasHeight - padding + 15)
    }

    ctx.draw()
  },

  onCanvasLoad() {
    this.drawPositionChart()
  },

  onShow() {
    this.refreshAvatarDisplay()
    this.drawPositionChart()
  }
})
