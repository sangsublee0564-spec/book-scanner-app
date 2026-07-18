import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import './App.css'

function renderStars(rating10) {
  const fiveScale = Math.round(rating10 / 2)
  return '★'.repeat(fiveScale) + '☆'.repeat(5 - fiveScale)
}

// 라벨에서 "camera 2, facing back" 같은 문자열의 숫자(2)를 뽑아냄
function extractCameraIndex(label = '') {
  const match = label.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : Infinity
}

function App() {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState(null)
  const [isbn, setIsbn] = useState(null)
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [deviceId, setDeviceId] = useState(null)

  useEffect(() => {
    async function loadDevices() {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        tempStream.getTracks().forEach((t) => t.stop())
      } catch (e) {
        setError(e.message)
        return
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput')

      // "facing back" 카메라들만 추려서, 번호가 가장 낮은(=보통 화질 좋은 기본 렌즈) 것 하나만 선택
      const backDevices = videoInputs.filter((d) => /back/i.test(d.label))
      const candidates = backDevices.length > 0 ? backDevices : videoInputs

      if (candidates.length > 0) {
        const best = [...candidates].sort(
          (a, b) => extractCameraIndex(a.label) - extractCameraIndex(b.label)
        )[0]
        setDeviceId(best.deviceId)
      }
    }
    loadDevices()
  }, [])

  useEffect(() => {
    if (isbn || !deviceId) return
    const codeReader = new BrowserMultiFormatReader()
    let nudgeInterval = null

    async function startScanning() {
      try {
        const controls = await codeReader.decodeFromConstraints(
          {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: 'continuous' }],
            },
          },
          videoRef.current,
          (result) => {
            if (result) setIsbn(result.getText())
          }
        )
        controlsRef.current = controls

        const v = videoRef.current
        if (v) {
          v.muted = true
          v.play().catch(() => {})
        }

        // 첫 프레임만 찍고 멈추는 문제 방지: 멈춰있으면 조용히 재생만 다시 시도
        nudgeInterval = setInterval(() => {
          const vid = videoRef.current
          if (vid && vid.paused) {
            vid.play().catch(() => {})
          }
        }, 400)
      } catch (err) {
        setError(err.message)
      }
    }

    startScanning()
    return () => {
      clearInterval(nudgeInterval)
      controlsRef.current?.stop()
    }
  }, [isbn, deviceId])

  useEffect(() => {
    if (!isbn) return
    controlsRef.current?.stop()
    setLoading(true)
    setBook(null)

    const apiBase = import.meta.env.DEV ? 'http://localhost:4000' : ''
    fetch(`${apiBase}/api/book?isbn=${isbn}`)
      .then((res) => res.json())
      .then((data) => {
        setBook(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [isbn])

  function handleRescan() {
    setIsbn(null)
    setBook(null)
    setError(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <img src="/icons.svg" alt="" className="app-icon" />
        <span className="app-title">책 스캔</span>
      </header>

      <main className="app-main">
        {error && <div className="alert">⚠️ {error}</div>}

        {!isbn && (
          <div className="scan-card">
            <div className="video-box">
              <video ref={videoRef} className="video-el" autoPlay playsInline muted />
            </div>
            <p className="hint">바코드를 카메라에 비춰주세요</p>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <span>책 정보를 가져오는 중...</span>
          </div>
        )}

        {book && (
          <div className="result">
            <section className="book-card">
              {book.cover && (
                <img className="cover" src={book.cover} alt={book.title} />
              )}
              <p className="book-title">{book.title || '제목을 찾을 수 없습니다'}</p>
              <p className="book-meta">{book.author} · {book.publisher}</p>
              {book.rating != null && (
                <div className="rating">
                  <span>{renderStars(book.rating)}</span>
                  <span>{book.rating}/10</span>
                </div>
              )}
              {book.description && (
                <p className="description">{book.description}</p>
              )}
            </section>

            {book.blogPosts?.length > 0 && (
              <section className="blog-card">
                <div className="blog-card-header">
                  <span className="naver-badge">N</span>
                  <span>네이버 블로그 리뷰</span>
                </div>

                {book.blogRecommendation && (
                  <div className="blog-recommend">
                    <span className="blog-recommend-percent">
                      👍 {book.blogRecommendation.recommendPercent}%
                    </span>
                    <span className="blog-recommend-summary">
                      {book.blogRecommendation.summary}
                    </span>
                  </div>
                )}

                <ul className="blog-list">
                  {book.blogPosts.slice(0, 3).map((post, i) => (
                    <li key={i}>
                        <a
                        href={post.link}
                        target="_blank"
                        rel="noreferrer"
                        className="blog-row"
                      >
                        <span className="naver-badge small">N</span>
                        <span className="blog-title">{post.title}</span>
                        <span className="arrow">›</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button onClick={handleRescan} className="rescan-btn">
              🔄 다시 스캔하기
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App