// rank.js - 排行榜页面逻辑
// 包含三个Tab：个人榜、战队榜、组队成员榜

Page({
  data: {
    currentTab: 0,           // 当前选中的Tab索引
    tabs: ['个人榜', '战队榜', '组队成员榜'],
    loading: true,           // 加载状态
    
    // 三个榜单数据
    personalList: [],        // 个人榜数据
    teamList: [],            // 战队榜数据
    memberList: [],          // 组队成员榜数据
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadAllRankData()
  },

  /**
   * 加载所有排行榜数据
   */
  async loadAllRankData() {
    this.setData({ loading: true })
    
    try {
      // 并行加载三个榜单
      await Promise.all([
        this.loadPersonalRank(),
        this.loadTeamRank(),
        this.loadMemberRank()
      ])
    } catch (err) {
      console.error('加载排行榜数据失败:', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载个人排行榜
   * 从games集合聚合每个玩家的总积分
   */
  async loadPersonalRank() {
    const db = wx.cloud.database()
    
    try {
      // 获取所有对局记录
      const { data: games } = await db.collection('games').get()
      
      // 聚合每个玩家的数据
      const playerMap = {}
      
      games.forEach(game => {
        const players = game.players || []
        players.forEach(p => {
          if (!playerMap[p.name]) {
            playerMap[p.name] = {
              name: p.name,
              totalScore: 0,
              gameCount: 0,
              firstCount: 0,      // 一位次数
              fourthCount: 0      // 四位次数
            }
          }
          playerMap[p.name].totalScore += p.score || 0
          playerMap[p.name].gameCount += 1
          // 统计一位和四位次数
          if (p.rank === 1) playerMap[p.name].firstCount += 1
          if (p.rank === 4) playerMap[p.name].fourthCount += 1
        })
      })
      
      // 转换为数组并排序
      const personalList = Object.values(playerMap)
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          avgScore: item.gameCount > 0 ? (item.totalScore / item.gameCount).toFixed(1) : 0,
          firstRate: item.gameCount > 0 ? ((item.firstCount / item.gameCount) * 100).toFixed(1) : 0
        }))
      
      this.setData({ personalList })
    } catch (err) {
      console.error('加载个人榜失败:', err)
    }
  },

  /**
   * 加载战队排行榜
   * 从team_games集合聚合每个战队的总积分
   */
  async loadTeamRank() {
    const db = wx.cloud.database()
    
    try {
      // 获取所有组队对局记录
      const { data: teamGames } = await db.collection('team_games').get()
      
      // 聚合每个战队的数据
      const teamMap = {}
      
      teamGames.forEach(game => {
        const teams = game.teams || []
        teams.forEach(t => {
          if (!teamMap[t.teamId]) {
            teamMap[t.teamId] = {
              teamId: t.teamId,
              teamName: t.teamName,
              totalScore: 0,
              gameCount: 0,
              firstCount: 0,
              fourthCount: 0
            }
          }
          teamMap[t.teamId].totalScore += t.score || 0
          teamMap[t.teamId].gameCount += 1
          if (t.rank === 1) teamMap[t.teamId].firstCount += 1
          if (t.rank === 4) teamMap[t.teamId].fourthCount += 1
        })
      })
      
      // 转换为数组并排序
      const teamList = Object.values(teamMap)
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          avgScore: item.gameCount > 0 ? (item.totalScore / item.gameCount).toFixed(1) : 0,
          firstRate: item.gameCount > 0 ? ((item.firstCount / item.gameCount) * 100).toFixed(1) : 0,
          avoidFourthRate: item.gameCount > 0 ? (((item.gameCount - item.fourthCount) / item.gameCount) * 100).toFixed(1) : 0
        }))
      
      this.setData({ teamList })
    } catch (err) {
      console.error('加载战队榜失败:', err)
    }
  },

  /**
   * 加载组队成员排行榜
   * 从team_games集合聚合每个成员的总积分
   */
  async loadMemberRank() {
    const db = wx.cloud.database()
    
    try {
      // 获取所有组队对局记录
      const { data: teamGames } = await db.collection('team_games').get()
      
      // 聚合每个成员的数据
      const memberMap = {}
      
      teamGames.forEach(game => {
        const teams = game.teams || []
        teams.forEach(team => {
          const players = team.players || []
          players.forEach(p => {
            if (!memberMap[p.name]) {
              memberMap[p.name] = {
                name: p.name,
                teamId: team.teamId,
                teamName: team.teamName,
                totalScore: 0,
                gameCount: 0
              }
            }
            memberMap[p.name].totalScore += p.score || 0
            memberMap[p.name].gameCount += 1
          })
        })
      })
      
      // 转换为数组并排序
      const memberList = Object.values(memberMap)
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          avgScore: item.gameCount > 0 ? (item.totalScore / item.gameCount).toFixed(1) : 0
        }))
      
      this.setData({ memberList })
    } catch (err) {
      console.error('加载成员榜失败:', err)
    }
  },

  /**
   * Tab切换事件
   */
  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ currentTab: index })
  },

  /**
   * Swiper滑动事件
   */
  onSwiperChange(e) {
    const index = e.detail.current
    this.setData({ currentTab: index })
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await this.loadAllRankData()
    wx.stopPullDownRefresh()
  },

  /**
   * 获取排名样式类名
   */
  getRankClass(rank) {
    if (rank === 1) return 'top-1'
    if (rank === 2) return 'top-2'
    if (rank === 3) return 'top-3'
    return ''
  }
})