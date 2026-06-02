// 运维：按 docId（与玩家姓名一致）删除个人赛 players 文档
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const name = event.name
  if (!name || typeof name !== 'string') {
    return { ok: false, error: '请在测试参数中传入 name，例如 {"name": "z y t"}' }
  }

  const docId = name
  const coll = db.collection('players')

  try {
    const res = await coll.doc(docId).remove()
    return { ok: true, docId, stats: res.stats || res, message: '已执行 remove（若 stats.removed 为 0 表示原本无此文档）' }
  } catch (e) {
    return { ok: false, docId, error: e.message || String(e) }
  }
}
