import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())

const PORT = 4000

app.get('/api/book', async (req, res) => {
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

  // 1) 알라딘: 책 정보 + 평점 + 소개글
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

  // 2) 네이버: 관련 블로그 글 목록
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

  res.json(result)
})

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`)
})