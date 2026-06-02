// 小程序端直连云数据库：单次 get 实际最多返回 20 条
const WX_DB_CLIENT_PAGE_SIZE = 20

/**
 * 分页拉取集合数据（hasMore 须与本页是否满 20 条对齐）
 * @param {(offset: number, limit: number) => Promise<{data: object[]}>} fetchPage
 */
async function fetchAllPages(fetchPage, hardLimit = 10000) {
  const all = []
  let offset = 0
  while (true) {
    const { data } = await fetchPage(offset, WX_DB_CLIENT_PAGE_SIZE)
    if (!data || !data.length) break
    all.push(...data)
    offset += data.length
    if (data.length < WX_DB_CLIENT_PAGE_SIZE) break
    if (offset >= hardLimit) break
  }
  return all
}

module.exports = {
  WX_DB_CLIENT_PAGE_SIZE,
  fetchAllPages
}
