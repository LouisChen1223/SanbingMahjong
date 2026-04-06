// team-manage.js - 战队管理页面
// 功能：战队改名、添加成员

const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    // 五个战队信息
    teams: [],
    // 当前选中的战队索引
    currentTeamIndex: 0,
    // 当前战队的成员列表
    currentMembers: [],
    // 新成员姓名输入
    newMemberName: '',
    // 新战队名称输入
    newTeamName: '',
    // 是否显示改名弹窗
    showRenameModal: false,
    // 是否显示添加成员弹窗
    showAddMemberModal: false,
    // 加载状态
    loading: true
  },

  onLoad() {
    // 页面加载时获取所有战队数据
    this.loadTeams()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadTeams()
  },

  // 加载所有战队数据
  async loadTeams() {
    try {
      // 从teams集合获取所有战队
      const teamsRes = await db.collection('teams')
        .orderBy('team_id', 'asc')
        .get()
      
      // 从team_members集合获取所有成员
      const membersRes = await db.collection('team_members')
        .get()
      
      // 组装战队数据，包含成员列表
      const teams = teamsRes.data.map(team => {
        const members = membersRes.data.filter(m => m.team_id === team.team_id)
        return {
          ...team,
          members: members,
          memberCount: members.length
        }
      })
      
      this.setData({
        teams: teams,
        loading: false
      })
      
      // 如果有战队，加载第一个战队的成员
      if (teams.length > 0) {
        this.selectTeam({ currentTarget: { dataset: { index: 0 } } })
      }
      
    } catch (err) {
      console.error('加载战队数据失败:', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 选择战队
  selectTeam(e) {
    const index = e.currentTarget.dataset.index
    const team = this.data.teams[index]
    
    this.setData({
      currentTeamIndex: index,
      currentMembers: team.members || []
    })
  },

  // 显示改名弹窗
  showRename(e) {
    const index = e.currentTarget.dataset.index
    const team = this.data.teams[index]
    
    this.setData({
      currentTeamIndex: index,
      newTeamName: team.team_name,
      showRenameModal: true
    })
  },

  // 输入新战队名称
  onTeamNameInput(e) {
    this.setData({
      newTeamName: e.detail.value
    })
  },

  // 确认改名
  async confirmRename() {
    const newName = this.data.newTeamName.trim()
    
    // 校验名称
    if (!newName) {
      wx.showToast({
        title: '请输入战队名称',
        icon: 'none'
      })
      return
    }
    
    const team = this.data.teams[this.data.currentTeamIndex]
    
    try {
      // 更新数据库中的战队名称
      await db.collection('teams')
        .doc(team._id)
        .update({
          data: {
            team_name: newName
          }
        })
      
      // 更新本地数据
      const teams = this.data.teams
      teams[this.data.currentTeamIndex].team_name = newName
      
      this.setData({
        teams: teams,
        showRenameModal: false
      })
      
      wx.showToast({
        title: '改名成功',
        icon: 'success'
      })
      
    } catch (err) {
      console.error('改名失败:', err)
      wx.showToast({
        title: '改名失败',
        icon: 'none'
      })
    }
  },

  // 关闭改名弹窗
  closeRenameModal() {
    this.setData({ showRenameModal: false })
  },

  // 显示添加成员弹窗
  showAddMember(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentTeamIndex: index,
      newMemberName: '',
      showAddMemberModal: true
    })
  },

  // 输入新成员姓名
  onMemberNameInput(e) {
    this.setData({
      newMemberName: e.detail.value
    })
  },

  // 确认添加成员
  async confirmAddMember() {
    const name = this.data.newMemberName.trim()
    
    // 校验姓名
    if (!name) {
      wx.showToast({
        title: '请输入成员姓名',
        icon: 'none'
      })
      return
    }
    
    // 检查姓名是否已存在
    try {
      const existRes = await db.collection('team_members')
        .where({
          name: name
        })
        .get()
      
      if (existRes.data.length > 0) {
        wx.showToast({
          title: '该姓名已存在',
          icon: 'none'
        })
        return
      }
      
      const team = this.data.teams[this.data.currentTeamIndex]
      
      // 添加新成员到数据库
      await db.collection('team_members').add({
        data: {
          name: name,
          team_id: team.team_id,
          member_score: 0,      // 初始积分为0
          games_played: 0       // 初始对局数为0
        }
      })
      
      // 刷新数据
      this.loadTeams()
      
      this.setData({ showAddMemberModal: false })
      
      wx.showToast({
        title: '添加成功',
        icon: 'success'
      })
      
    } catch (err) {
      console.error('添加成员失败:', err)
      wx.showToast({
        title: '添加失败',
        icon: 'none'
      })
    }
  },

  // 关闭添加成员弹窗
  closeAddMemberModal() {
    this.setData({ showAddMemberModal: false })
  }
})