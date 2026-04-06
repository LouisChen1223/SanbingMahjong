// pages/team-manage/team-manage.js
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    teams: []
  },

  onLoad(options) {
    this.loadTeams()
  },

  // 加载队伍数据
  async loadTeams() {
    try {
      console.log('开始加载队伍数据')

      // 检查云开发是否初始化
      if (!wx.cloud) {
        console.error('云开发未初始化')
        wx.showToast({ title: '云开发未初始化', icon: 'none' })
        return
      }

      // 获取所有队伍，添加过滤条件避免全量查询告警
      console.log('开始查询队伍')
      const teamsRes = await db.collection('teams')
        .where({
          _id: _.exists(true)
        })
        .get()
      console.log('队伍查询结果:', teamsRes)

      // 获取队伍ID列表
      const teamIds = teamsRes.data.map(t => t._id)
      console.log('队伍ID列表:', teamIds)

      // 按队伍ID查询队员，避免全量查询
      let membersMap = {}
      if (teamIds.length > 0) {
        console.log('开始查询队员')
        const membersRes = await db.collection('team_members')
          .where({
            team_id: _.in(teamIds)
          })
          .get()
        console.log('队员查询结果:', membersRes)

        // 按队伍分组队员
        membersRes.data.forEach(m => {
          if (!membersMap[m.team_id]) {
            membersMap[m.team_id] = []
          }
          membersMap[m.team_id].push(m.member_id)
        })
        console.log('队员分组结果:', membersMap)
      }

      // 组装队伍数据
      const teams = teamsRes.data.map(t => ({
        ...t,
        members: membersMap[t._id] || [],
        newMemberId: ''
      }))
      console.log('组装后的队伍数据:', teams)

      // 按A-E排序
      teams.sort((a, b) => (a._id || '').localeCompare(b._id || ''))
      console.log('排序后的队伍数据:', teams)

      this.setData({ teams })
      console.log('数据设置完成')
    } catch (err) {
      console.error('加载队伍失败:', err)
      wx.showToast({ title: '加载失败: ' + (err.message || '未知错误'), icon: 'error' })
    }
  },

  // 队名输入
  onTeamNameInput(e) {
    const teamId = e.currentTarget.dataset.teamId
    const value = e.detail.value
    const teams = this.data.teams
    const team = teams.find(t => t._id === teamId)
    if (team) {
      team.team_name = value
      this.setData({ teams })
    }
  },

  // 更新队名到数据库
  async updateTeamName(e) {
    const teamId = e.currentTarget.dataset.teamId
    const value = e.detail.value
    const teams = this.data.teams
    const team = teams.find(t => t._id === teamId)
    if (!team) return

    try {
      await db.collection('teams').doc(teamId).update({
        data: { team_name: value }
      })
      // 更新本地数据
      team.team_name = value
      this.setData({ teams })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      console.error('更新队名失败:', err)
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
  },

  // 新队员ID输入
  onNewMemberInput(e) {
    const teamId = e.currentTarget.dataset.teamId
    const value = e.detail.value
    const teams = this.data.teams
    const team = teams.find(t => t._id === teamId)
    if (team) {
      team.newMemberId = value
      this.setData({ teams })
    }
  },

  // 新增组员
  async addMember(e) {
    const teamId = e.currentTarget.dataset.teamId
    const team = this.data.teams.find(t => t._id === teamId)
    if (!team || !team.newMemberId) {
      wx.showToast({ title: '请输入队员ID', icon: 'none' })
      return
    }

    const newMemberId = team.newMemberId.trim()
    if (!newMemberId) {
      wx.showToast({ title: '请输入队员ID', icon: 'none' })
      return
    }

    // 检查是否已存在
    if (team.members && team.members.includes(newMemberId)) {
      wx.showToast({ title: '该队员已存在', icon: 'none' })
      return
    }

    try {
      // 添加到team_members集合
      await db.collection('team_members').add({
        data: {
          team_id: teamId,
          member_id: newMemberId
        }
      })

      // 更新本地数据
      team.members = team.members || []
      team.members.push(newMemberId)
      team.newMemberId = ''
      this.setData({ teams })

      wx.showToast({ title: '添加成功', icon: 'success' })
    } catch (err) {
      console.error('添加队员失败:', err)
      wx.showToast({ title: '添加失败', icon: 'error' })
    }
  },

  // 初始化数据
  async initData() {
    try {
      wx.showLoading({ title: '初始化数据中...' })

      // 初始化队伍数据
      const teams = [
        { _id: 'A', team_name: '' },
        { _id: 'B', team_name: '' },
        { _id: 'C', team_name: '' },
        { _id: 'D', team_name: '' },
        { _id: 'E', team_name: '' }
      ]

      // 初始化队员数据
      const members = [
        { team_id: 'A', member_id: 'czh' },
        { team_id: 'A', member_id: 'fxy' },
        { team_id: 'A', member_id: 'lzy' },
        { team_id: 'A', member_id: 'zyh' },
        { team_id: 'B', member_id: 'zzy' },
        { team_id: 'B', member_id: 'zle' },
        { team_id: 'B', member_id: 'cy' },
        { team_id: 'B', member_id: 'mm' },
        { team_id: 'C', member_id: 'wlx' },
        { team_id: 'C', member_id: 'zxy' },
        { team_id: 'C', member_id: 'zyt' },
        { team_id: 'C', member_id: 'wls' },
        { team_id: 'D', member_id: 'cjy' },
        { team_id: 'D', member_id: 'hq' },
        { team_id: 'D', member_id: 'qj' },
        { team_id: 'E', member_id: 'ly' },
        { team_id: 'E', member_id: 'gwh' },
        { team_id: 'E', member_id: 'lm' }
      ]

      // 清空并重新插入teams
      const existingTeams = await db.collection('teams').get()
      for (const t of existingTeams.data) {
        await db.collection('teams').doc(t._id).remove()
      }
      for (const team of teams) {
        await db.collection('teams').add({ data: team })
      }

      // 清空并重新插入team_members
      const existingMembers = await db.collection('team_members').get()
      for (const m of existingMembers.data) {
        await db.collection('team_members').doc(m._id).remove()
      }
      for (const member of members) {
        await db.collection('team_members').add({ data: member })
      }

      wx.showToast({ title: '初始化成功', icon: 'success' })
      // 重新加载队伍数据
      this.loadTeams()
    } catch (err) {
      console.error('初始化数据失败:', err)
      wx.showToast({ title: '初始化失败: ' + (err.message || '未知错误'), icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 清空所有数据
  clearAllData() {
    wx.showModal({
      title: '清空数据',
      content: '确定要清空所有队伍和成员的对局数据吗？此操作不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '清空数据中...' })

            // 清空队伍数据
            const teamsRes = await db.collection('teams').get()
            for (const team of teamsRes.data) {
              await db.collection('teams').doc(team._id).update({
                data: {
                  total_score: 0,
                  games_played: 0,
                  first_place: 0,
                  second_place: 0,
                  third_place: 0,
                  fourth_place: 0
                }
              })
            }

            // 清空团队赛对局记录（如果存在）
            try {
              const gamesRes = await db.collection('team_games').get()
              for (const game of gamesRes.data) {
                await db.collection('team_games').doc(game._id).remove()
              }
            } catch (err) {
              console.log('team_games 集合不存在，跳过清空')
            }

            wx.showToast({ title: '数据清空成功', icon: 'success' })
            // 重新加载队伍数据
            this.loadTeams()
          } catch (err) {
            console.error('清空数据失败:', err)
            wx.showToast({ title: '清空失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  }
})