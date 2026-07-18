export default async function handler(req, res) {
  const isbn = req.query.isbn

  if (!isbn) {
    return res.status(400).json({ error: 'isbn 파라미터가 필요합니다' })
  }

  const result = {
    isbn,
    title: null,
    author: null,
    publisher: null,
    cover: null,
    description: null,
    rating: null,
    blogPosts: [],
  }

  try {
    const aladinUrl = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${process.env.ALADIN_TTB_KEY}&itemIdType=ISBN13&ItemId=${isbn}&output=js&Version=20131101&OptResult=fulldescription`
    const aladinRes = await fetch(aladinUrl)
    const aladinData = await aladinRes.json()
    const item = aladinData.item?.[0]
    if (item) {
      result.title = item.title
      result.author = item.author
      result.publisher = item.publisher
      result.cover = item.cover
      result.description = item.fullDescription || item.description
      result.rating = item.customerReviewRank
    }
  } catch (err) {
    console.error('알라딘 API 오류:', err.message)
  }

  try {
    const searchKeyword = (result.title || isbn) + ' 서평'
    const naverUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(searchKeyword)}&display=3`
    const naverRes = await fetch(naverUrl, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
      },
    })
    const naverData = await naverRes.json()
    result.blogPosts = (naverData.items || []).map((item) => ({
      title: item.title.replace(/<\/?b>/g, ''),
      link: item.link,
    }))
  } catch (err) {
    console.error('네이버 API 오류:', err.message)
  }

  res.status(200).json(result)
}