import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { isSponsored, summarizeReviews } from './lib/blogRecommend.js'

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
    blogRecommendation: null,
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

  // 2) 네이버: 관련 블로그 글 목록 (+ 협찬 필터링, 추천비율 요약)
  try {
    const searchKeyword = (result.title || isbn) + ' 서평'
    const naverUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(searchKeyword)}&display=10`
    const naverRes = await fetch(naverUrl, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
      },
    })
    const naverData = await naverRes.json()

    const rawPosts = (naverData.items || []).map((item) => ({
      title: item.title.replace(/<\/?b>/g, ''),
      description: (item.description || '').replace(/<\/?b>/g, ''),
      link: item.link,
    }))

    const filteredPosts = rawPosts.filter((p) => !isSponsored(p)).slice(0, 3)

    result.blogPosts = filteredPosts.map((p) => ({
      title: p.title,
      link: p.link,
    }))

    result.blogRecommendation = await summarizeReviews(result.title || isbn, filteredPosts)
  } catch (err) {
    console.error('네이버 API 오류:', err.message)
  }

  res.json(result)
})

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`)
})