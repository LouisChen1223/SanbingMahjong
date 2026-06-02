// history.js - 对局记录页面
const app = getApp()
const { sortPlayersByWind } = require('../../utils/personalWind.js')
const { writeGamesCsvFile, presentExportedFile } = require('../../utils/exportGames.js')
const { fetchOfficialNameMap } = require('../../utils/displayName.js')

const WIND_ROW_LABELS = ['东', '南', '西', '北']
const PRIMARY_GAMES_COLLECTION = 'games'
const FALLBACK_GAMES_COLLECTION = 'games_backup'
const PERSONAL_MIN_RETENTION_DAYS = 31
const PERSONAL_FETCH_HARD_LIMIT = 20000
// 小程序端直连云数据库时，单次 get 实际最多只返回 20 条，设更大的 .limit() 也会被截断。
// hasMore 必须与「本页是否满 20 条」对齐，否则会误判没有更多、无法加载下一页。
const WX_DB_CLIENT_PAGE_SIZE = 20

Page({
  data: {
    windRowLabels: WIND_ROW_LABELS,
    games: [],
    loading: true,
    loadingMore: false,
    hasMoreGlobal: false,
    editingGame: null,
    editPlayers: [],
    name: '',
    isPersonalHistory: false,
    exporting: false,
    exportingXlsx: false
  },

  getPersonalRetentionCutoffMs() {
    return Date.now() - PERSONAL_MIN_RETENTION_DAYS * 24 * 60 * 60 * 1000
  },

  getGameTimeMs(game) {
    if (!game || !game.create_time) return NaN
    const ms = new Date(game.create_time).getTime()
    return Number.isFinite(ms) ? ms : NaN
  },

  onLoad(options) {
    this.db = app.db
    const raw = options.name || ''
    let decoded = raw
    try {
      decoded = raw ? decodeURIComponent(raw) : ''
    } catch (e) {
      decoded = raw
    }
    // 仅保存路由参数；实际拉数在 onShow（因「记录」是 tabBar 页，switchTab 不会带 query，需配合 globalData）
    this._routeHistoryName = decoded || null
  },

  async resolveGameCollection() {
    if (this._gameCollectionName) return this._gameCollectionName
    try {
      const { data } = await this.db
        .collection(PRIMARY_GAMES_COLLECTION)
        .limit(1)
        .get()
      this._gameCollectionName =
        data && data.length > 0 ? PRIMARY_GAMES_COLLECTION : FALLBACK_GAMES_COLLECTION
    } catch (e) {
      this._gameCollectionName = FALLBACK_GAMES_COLLECTION
    }
    return this._gameCollectionName
  },

  getMirrorCollectionName(sourceCollection) {
    return sourceCollection === PRIMARY_GAMES_COLLECTION
      ? FALLBACK_GAMES_COLLECTION
      : PRIMARY_GAMES_COLLECTION
  },

  onShow() {
    const g = getApp().globalData
    if (g.pendingPersonalHistoryName) {
      const name = g.pendingPersonalHistoryName
      g.pendingPersonalHistoryName = null
      this.setData(
        {
          name,
          isPersonalHistory: true
        },
        () => this.loadGames()
      )
      return
    }
    if (this._routeHistoryName) {
      const name = this._routeHistoryName
      this._routeHistoryName = null
      this.setData(
        {
          name,
          isPersonalHistory: true
        },
        () => this.loadGames()
      )
      return
    }
    this.loadGames()
  },

  // 按玩家拉取对局（先按 players 条件查库，避免「只看全局最近 N 局」导致老玩家记录被挤掉）
  async fetchGamesContainingPlayer(name, maxTotal = PERSONAL_FETCH_HARD_LIMIT) {
    const gameCollection = await this.resolveGameCollection()
    const _ = this.db.command
    const cutoffMs = this.getPersonalRetentionCutoffMs()
    try {
      const all = []
      let cursorTime = null
      const pageSz = WX_DB_CLIENT_PAGE_SIZE
      while (all.length < maxTotal) {
        const whereData = {
          players: _.elemMatch({
            name: _.eq(name)
          })
        }
        if (cursorTime) {
          whereData.create_time = _.lt(cursorTime)
        }
        const { data: batch } = await this.db.collection(gameCollection)
          .where(whereData)
          .orderBy('create_time', 'desc')
          .limit(pageSz)
          .get()
        if (!batch || !batch.length) break
        all.push(...batch)
        cursorTime = batch[batch.length - 1].create_time
        if (batch.length < pageSz) break
        const oldestMs = this.getGameTimeMs(batch[batch.length - 1])
        if (Number.isFinite(oldestMs) && oldestMs < cutoffMs && all.length >= pageSz) {
          // 已覆盖至少一个月，且已有一批以上数据，可提前结束
          break
        }
      }
      return all
    } catch (err) {
      console.warn('按玩家查询对局失败（可能缺少联合索引），回退为全表分批扫描:', err)
      return this.scanGamesForPlayerFallback(name, maxTotal, gameCollection)
    }
  },

  async scanGamesForPlayerFallback(name, maxTotal, gameCollection = FALLBACK_GAMES_COLLECTION) {
    const _ = this.db.command
    const cutoffMs = this.getPersonalRetentionCutoffMs()
    const pageSz = WX_DB_CLIENT_PAGE_SIZE
    const all = []
    let cursorTime = null
    while (all.length < maxTotal) {
      let query = this.db.collection(gameCollection)
      if (cursorTime) {
        query = query.where({
          create_time: _.lt(cursorTime)
        })
      }
      const { data: batch } = await query
        .orderBy('create_time', 'desc')
        .limit(pageSz)
        .get()
      if (!batch || !batch.length) break
      for (const g of batch) {
        if (g.players && g.players.some(p => p.name === name)) {
          all.push(g)
          if (all.length >= maxTotal) return all
        }
      }
      cursorTime = batch[batch.length - 1].create_time
      if (batch.length < pageSz) break
      const oldestMs = this.getGameTimeMs(batch[batch.length - 1])
      if (Number.isFinite(oldestMs) && oldestMs < cutoffMs && all.length >= pageSz) {
        break
      }
    }
    return all
  },

  // 加载对局记录；全局列表支持 append 分页（个人模式仍一次拉齐，见 fetchGamesContainingPlayer）
  async loadGames(options = {}) {
    const append = options.append === true
    const pageSize = WX_DB_CLIENT_PAGE_SIZE

    if (append) {
      if (this.data.isPersonalHistory) return
      if (!this.data.hasMoreGlobal || this.data.loadingMore || this.data.loading) return
      if (this._globalLoadMoreBusy) return
      this._globalLoadMoreBusy = true
      this.setData({ loadingMore: true })
    } else {
      this.setData({ loading: true, loadingMore: false })
    }

    try {
      const gameCollection = await this.resolveGameCollection()
      const personalName = this.data.isPersonalHistory ? this.data.name : ''
      let rawGames = []
      let nextHasMoreGlobal = false

      if (personalName) {
        rawGames = await this.fetchGamesContainingPlayer(personalName, 500)
        nextHasMoreGlobal = false
      } else {
        const _ = this.db.command
        if (!append) this._globalCursorTime = null
        let query = this.db.collection(gameCollection)
        if (append && this._globalCursorTime) {
          query = query.where({
            create_time: _.lt(this._globalCursorTime)
          })
        }
        const { data } = await query
          .orderBy('create_time', 'desc')
          .limit(pageSize)
          .get()
        rawGames = data || []
        nextHasMoreGlobal = rawGames.length === pageSize
        if (rawGames.length > 0) {
          this._globalCursorTime = rawGames[rawGames.length - 1].create_time
        }
      }

      const mapped = rawGames.map(g => ({
        ...g,
        _sourceCollection: gameCollection,
        timeStr: this.formatTime(g.create_time),
        playersDisplay: sortPlayersByWind(g.players || [])
      }))

      const games = append ? this.data.games.concat(mapped) : mapped

      this.setData({
        games,
        hasMoreGlobal: personalName ? false : nextHasMoreGlobal,
        loading: false,
        loadingMore: false
      })
    } catch (err) {
      console.error('加载对局记录失败:', err)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (append) this._globalLoadMoreBusy = false
    }
  },

  onLoadMoreGames() {
    if (this.data.isPersonalHistory || this.data.loadingMore || !this.data.hasMoreGlobal) return
    this.loadGames({ append: true })
  },

  mapGamesForDisplay(rawGames, gameCollection) {
    return rawGames.map(g => ({
      ...g,
      _sourceCollection: gameCollection,
      timeStr: this.formatTime(g.create_time),
      playersDisplay: sortPlayersByWind(g.players || [])
    }))
  },

  async fetchAllGamesForExport() {
    const gameCollection = await this.resolveGameCollection()
    const personalName = this.data.isPersonalHistory ? this.data.name : ''

    if (personalName) {
      const raw = await this.fetchGamesContainingPlayer(personalName, PERSONAL_FETCH_HARD_LIMIT)
      return this.mapGamesForDisplay(raw, gameCollection)
    }

    const _ = this.db.command
    const pageSz = WX_DB_CLIENT_PAGE_SIZE
    const all = []
    let cursorTime = null

    while (all.length < PERSONAL_FETCH_HARD_LIMIT) {
      let query = this.db.collection(gameCollection)
      if (cursorTime) {
        query = query.where({ create_time: _.lt(cursorTime) })
      }
      const { data: batch } = await query
        .orderBy('create_time', 'desc')
        .limit(pageSz)
        .get()
      if (!batch || !batch.length) break
      all.push(...batch)
      cursorTime = batch[batch.length - 1].create_time
      if (batch.length < pageSz) break
    }

    return this.mapGamesForDisplay(all, gameCollection)
  },

  async onExportExcel() {
    if (this.data.exporting || this.data.editingGame) return

    this.setData({ exporting: true })
    wx.showLoading({ title: '导出中...', mask: true })

    try {
      const games = await this.fetchAllGamesForExport()
      if (!games.length) {
        wx.showToast({ title: '暂无对局可导出', icon: 'none' })
        return
      }

      const prefix = this.data.isPersonalHistory
        ? `${this.data.name || '个人'}_对局记录`
        : '对局记录'
      const nameMap = await fetchOfficialNameMap(this.db)
      const fileInfo = await writeGamesCsvFile(games, { fileNamePrefix: prefix, nameMap })
      wx.hideLoading()
      presentExportedFile(fileInfo)
    } catch (err) {
      console.error('导出对局记录失败:', err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ exporting: false })
    }
  },

  async onExportPersonalXlsx() {
    if (!this.data.isPersonalHistory) return
    if (this.data.exportingXlsx || this.data.editingGame) return

    const playerName = (this.data.name || '').trim()
    if (!playerName) {
      wx.showToast({ title: '缺少玩家姓名', icon: 'none' })
      return
    }

    this.setData({ exportingXlsx: true })
    wx.showLoading({ title: '生成Excel中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'exportPersonalExcel',
        data: { playerName }
      })
      const data = res && res.result
      if (!data || !data.ok) {
        wx.showToast({ title: (data && data.error) || '导出失败', icon: 'none' })
        return
      }

      wx.showLoading({ title: '下载中...', mask: true })
      const dl = await wx.cloud.downloadFile({ fileID: data.fileID })
      const filePath = dl && dl.tempFilePath
      if (!filePath) {
        wx.showToast({ title: '下载失败', icon: 'none' })
        return
      }

      wx.openDocument({
        filePath,
        showMenu: true,
        fileType: 'xlsx',
        fail: () => {
          // 部分机型 openDocument 对 xlsx 支持不佳；至少提示已生成可通过分享打开
          wx.showModal({
            title: '已生成Excel',
            content: '已生成并下载 Excel 文件。若未能自动打开，请在右上角菜单中转发文件到聊天后，用 Excel 打开。',
            showCancel: false
          })
        }
      })
    } catch (err) {
      console.error('导出个人指定Excel失败:', err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ exportingXlsx: false })
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
      editPlayers: game.players.map((p, idx) => {
        const rawScore = Math.floor((p.scoreNum || 0) / 100)
        return {
          ...p,
          wind: p.wind || WIND_ROW_LABELS[idx],
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
            const sourceCollection = game._sourceCollection || (await this.resolveGameCollection())
            const mirrorCollection = this.getMirrorCollectionName(sourceCollection)
            // 检查对局记录是否存在
            const gameRes = await this.db.collection(sourceCollection).doc(gameId).get()
            if (!gameRes.data) {
              throw new Error('对局记录不存在，无法删除')
            }

            // 撤销玩家数据
            await this.revertGameData(game)
            // 删除对局记录
            await this.db.collection(sourceCollection).doc(gameId).remove()
            if (game.game_uid) {
              const _ = this.db.command
              const { data: mirrors } = await this.db.collection(mirrorCollection)
                .where({ game_uid: _.eq(game.game_uid) })
                .limit(1)
                .get()
              if (mirrors && mirrors.length > 0) {
                await this.db.collection(mirrorCollection).doc(mirrors[0]._id).remove()
              }
            }

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

      const playerResults = {}
      newResult.forEach(r => {
        playerResults[r.name.trim()] = { finalScore: r.finalScore, rank: r.rank }
      })

      const sourceCollection = editingGame._sourceCollection || (await this.resolveGameCollection())
      const mirrorCollection = this.getMirrorCollectionName(sourceCollection)
      const updateData = {
        players: editPlayers.map((p, idx) => ({
          name: p.name.trim(),
          score: p.score,
          scoreNum:
            (parseInt(p.score) || 0) * 100 * (p.isNegative ? -1 : 1),
          finalScore: playerResults[p.name.trim()]?.finalScore || 0,
          rank: playerResults[p.name.trim()]?.rank || 0,
          wind: p.wind || WIND_ROW_LABELS[idx]
        })),
        result: newResult,
        update_time: this.db.serverDate()
      }

      await this.db.collection(sourceCollection).doc(editingGame._id).update({
        data: updateData
      })
      if (editingGame.game_uid) {
        const _ = this.db.command
        const { data: mirrors } = await this.db.collection(mirrorCollection)
          .where({ game_uid: _.eq(editingGame.game_uid) })
          .limit(1)
          .get()
        if (mirrors && mirrors.length > 0) {
          await this.db.collection(mirrorCollection).doc(mirrors[0]._id).update({
            data: updateData
          })
        }
      }

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