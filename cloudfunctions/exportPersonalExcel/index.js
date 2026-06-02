const cloud = require('wx-server-sdk')
const ExcelJS = require('exceljs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const PRIMARY_GAMES_COLLECTION = 'games'
const FALLBACK_GAMES_COLLECTION = 'games_backup'

const QUERY_PAGE_SIZE = 100
const HARD_LIMIT = 20000

function isNonEmptyString(s) {
  return typeof s === 'string' && s.trim().length > 0
}

function buildFileName(playerName) {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
  const safeName = String(playerName || '个人').replace(/[\\/:*?"<>|]/g, '_')
  return `${safeName}_个人战分数_${stamp}.xlsx`
}

async function resolveGameCollection() {
  try {
    const { data } = await db.collection(PRIMARY_GAMES_COLLECTION).limit(1).get()
    if (data && data.length > 0) return PRIMARY_GAMES_COLLECTION
  } catch (e) {
    // ignore
  }
  return FALLBACK_GAMES_COLLECTION
}

async function fetchGamesContainingPlayer(name) {
  const gameCollection = await resolveGameCollection()
  const _ = db.command
  const all = []
  let cursorTime = null

  while (all.length < HARD_LIMIT) {
    const whereData = {
      players: _.elemMatch({ name: _.eq(name) })
    }
    if (cursorTime) whereData.create_time = _.lt(cursorTime)

    const { data: batch } = await db
      .collection(gameCollection)
      .where(whereData)
      .orderBy('create_time', 'desc')
      .limit(QUERY_PAGE_SIZE)
      .get()

    if (!batch || batch.length === 0) break
    all.push(...batch)
    cursorTime = batch[batch.length - 1].create_time
    if (batch.length < QUERY_PAGE_SIZE) break
  }

  // 输出时按时间升序（第一轮、第二轮…）
  all.sort((a, b) => {
    const ta = new Date(a.create_time).getTime()
    const tb = new Date(b.create_time).getTime()
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
  })

  return { games: all, gameCollection }
}

const WIND_ORDER_LIST = ['东', '南', '西', '北']
const WIND_INDEX = { 东: 0, 南: 1, 西: 2, 北: 3 }

function sortPlayersByWind(players) {
  if (!players || players.length === 0) return []
  const hasAllWind = players.every(
    p => p.wind && WIND_INDEX[p.wind] !== undefined
  )
  if (!hasAllWind) return players.slice()
  return players.slice().sort((a, b) => WIND_INDEX[a.wind] - WIND_INDEX[b.wind])
}

function playersForGame(game) {
  const ps = Array.isArray(game.players) ? game.players : []
  return sortPlayersByWind(ps).filter(p => p && isNonEmptyString(p.name))
}

function scoreNumValue(p) {
  const v = p.scoreNum
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : null
}

async function fetchOfficialNameMap(playerNames) {
  const unique = [...new Set((playerNames || []).filter(isNonEmptyString).map(n => n.trim()))]
  const map = {}
  const batchSize = 20
  for (let i = 0; i < unique.length; i += batchSize) {
    const chunk = unique.slice(i, i + batchSize)
    await Promise.all(chunk.map(async (name) => {
      try {
        const { data } = await db.collection('players').doc(name).get()
        if (data && isNonEmptyString(data.official_name)) {
          map[name] = data.official_name.trim()
        }
      } catch (e) {
        // 无档案则导出仍用用户名
      }
    }))
  }
  return map
}

function resolveDisplayName(username, nameMap) {
  const key = String(username || '').trim()
  if (!key) return ''
  const official = nameMap && nameMap[key]
  if (isNonEmptyString(official)) return official.trim()
  return key
}

function collectPlayerNamesFromGames(games) {
  const names = new Set()
  for (const game of games) {
    playersForGame(game).forEach(p => {
      if (isNonEmptyString(p.name)) names.add(String(p.name).trim())
    })
  }
  return [...names]
}

async function buildWorkbookBuffer({ games, nameMap }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'mahjong-score'
  wb.created = new Date()
  const ws = wb.addWorksheet('个人战分数')

  const nameRowStyle = {
    alignment: { vertical: 'middle', horizontal: 'center' },
    font: { bold: true }
  }
  const scoreRowStyle = {
    alignment: { vertical: 'middle', horizontal: 'center' },
    numFmt: '0'
  }

  let wroteAny = false
  for (const game of games) {
    const players = playersForGame(game)
    if (!players.length) continue
    wroteAny = true

    const nameRow = ws.addRow(players.map(p => resolveDisplayName(p.name, nameMap)))
    nameRow.height = 20
    nameRow.eachCell(cell => {
      cell.style = nameRowStyle
    })

    const scoreRow = ws.addRow(players.map(p => scoreNumValue(p)))
    scoreRow.height = 18
    scoreRow.eachCell(cell => {
      cell.style = scoreRowStyle
    })

    ws.addRow([])
  }

  if (!wroteAny) {
    throw new Error('没有可导出的对局数据')
  }

  // 顶部冻结更像表格，但不改变排版要求（只冻结 0 行则无意义，这里不冻结）
  const buf = await wb.xlsx.writeBuffer()
  return { buffer: Buffer.from(buf) }
}

exports.main = async (event) => {
  const playerName = event && event.playerName
  if (!isNonEmptyString(playerName)) {
    return { ok: false, error: 'playerName 不能为空' }
  }

  try {
    const { games } = await fetchGamesContainingPlayer(playerName.trim())
    if (!games.length) {
      return { ok: false, error: '暂无对局可导出' }
    }

    const fileName = buildFileName(playerName.trim())
    const nameMap = await fetchOfficialNameMap(collectPlayerNamesFromGames(games))
    const { buffer } = await buildWorkbookBuffer({ games, nameMap })

    const cloudPath = `exports/personal/${fileName}`
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    return {
      ok: true,
      fileID: uploadRes.fileID,
      fileName,
      gameCount: games.length
    }
  } catch (err) {
    console.error('exportPersonalExcel failed:', err)
    return { ok: false, error: err && err.message ? err.message : '导出失败' }
  }
}

