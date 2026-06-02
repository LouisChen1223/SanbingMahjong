/**
 * 将对局列表导出为 UTF-8 BOM CSV（Excel 可直接打开）
 * 排版：每个对局仅该局四人——姓名行 + 得点行，组间一行空白
 */
const { sortPlayersByWind } = require('./personalWind.js')
const { resolveDisplayName } = require('./displayName.js')

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function sortGamesByTimeAsc(games) {
  return [...games].sort((a, b) => {
    const ta = new Date(a.create_time).getTime()
    const tb = new Date(b.create_time).getTime()
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
  })
}

/** 本局四人（东南西北顺序，与记录页一致） */
function playersForGame(game) {
  const ps = Array.isArray(game.players) ? game.players : []
  return sortPlayersByWind(ps).filter(p => p && String(p.name || '').trim())
}

function scoreNumString(p) {
  const v = p.scoreNum
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? String(num) : ''
}

/**
 * 指定排版 CSV：每对局 4 列（仅该局四人），第1行姓名、第2行得点、第3行空白
 */
function buildGamesCsvRows(games, nameMap) {
  if (!games || !games.length) return ''

  const rows = []
  for (const game of sortGamesByTimeAsc(games)) {
    const players = playersForGame(game)
    if (!players.length) continue

    rows.push(players.map(p => escapeCsvCell(resolveDisplayName(p.name, nameMap))).join(','))
    rows.push(players.map(p => escapeCsvCell(scoreNumString(p))).join(','))
    rows.push('')
  }

  return rows.join('\r\n')
}

function buildExportFileName(prefix) {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
  return `${prefix}_${stamp}.csv`
}

/**
 * @param {object[]} games
 * @param {{ fileNamePrefix?: string }} options
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
function writeGamesCsvFile(games, options = {}) {
  const prefix = options.fileNamePrefix || '对局记录'
  const nameMap = options.nameMap || null
  const fileName = buildExportFileName(prefix)
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
  const csv = '\uFEFF' + buildGamesCsvRows(games, nameMap)

  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: csv,
      encoding: 'utf8',
      success: () => resolve({ filePath, fileName }),
      fail: err => reject(err)
    })
  })
}

/**
 * 分享或打开导出的文件（须在用户点击回调中调用 shareFileMessage）
 * @param {{ filePath: string, fileName: string }} fileInfo
 */
function presentExportedFile(fileInfo) {
  const { filePath, fileName } = fileInfo

  if (typeof wx.shareFileMessage === 'function') {
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => {},
      fail: () => openExportedFile(filePath)
    })
    return
  }
  openExportedFile(filePath)
}

function openExportedFile(filePath) {
  wx.openDocument({
    filePath,
    showMenu: true,
    fail: () => {
      wx.showModal({
        title: '导出完成',
        content:
          '文件已保存。若未自动打开，请使用右上角「转发」将文件发送到聊天后，用 Excel 打开。',
        showCancel: false
      })
    }
  })
}

module.exports = {
  buildGamesCsvRows,
  writeGamesCsvFile,
  presentExportedFile
}
