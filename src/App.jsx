import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import './App.css'

const hints = new Map()
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
])
hints.set(DecodeHintType.TRY_HARDER, true)

function timeoutAfter(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`카메라 응답 없음 (${ms / 1000}초 초과)`)), ms)
  )
}

function extractCameraIndex(label = '') {
  const match = label.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : Infinity
}

function renderStars(rating10) {
  const fiveScale = Math.round(rating10 / 2)
  return '★'.repeat(fiveScale) + '☆'.repeat(5 - fiveScale)
}

function App() {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState(null)
  const [isbn, setIsbn] = useState(null)
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [videoPlaying, setVideoPlaying] = useState(false)

  function setVideoRef(el) {
    videoRef.current = el
    if (el) {
      el.muted = true
      el.defaultMuted = true
    }
  }

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
      setDevices(videoInputs)

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

    const codeReader = new BrowserMultiFormatReader(hints)
    let cancelled = false
    let nudgeInterval = null

    async function startScanning() {
      try {
        const controls = await Promise.race([
          codeReader.decodeFromConstraints(
            {
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                advanced: [{ focusMode: 'continuous' }],
              },
            },
            videoRef.current,
            (scanResult) => {
              if (scanResult) setIsbn(scanResult.getText())
            }
          ),
          timeoutAfter(5000),
        ])

        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls

        const v = videoRef.current
        if (v) {
          v.muted = true
          v.defaultMuted = true
          v.play().catch(() => {})

          if ('requestVideoFrameCallback' in v) {
            let frameCount = 0
            const onFrame = () => {
              if (cancelled) return
              frameCount++
              if (frameCount >= 2) setVideoPlaying(true)
              v.requestVideoFrameCallback(onFrame)
            }
            v.requestVideoFrameCallback(onFrame)
          } else {
            v.addEventListener('playing', () => setVideoPlaying(true))
          }
        }

        nudgeInterval = setInterval(() => {
          if (cancelled) return
          const vid = videoRef.current
          if (vid && vid.paused) {
            vid.muted = true
            vid.play().catch(() => {})
          }
        }, 300)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    startScanning()

    return () => {
      cancelled = true
      clearInterval(nudgeInterval)
      controlsRef.current?.stop()
      setVideoPlaying(false)
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
    setVideoPlaying(false)
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
            {devices.length > 1 && (
              <select
                className="camera-select"
                value={deviceId || ''}
                onChange={(e) => {
                  setVideoPlaying(false)
                  setDeviceId(e.target.value)
                }}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
            <div className="video-box">
              <video
                ref={setVideoRef}
                className="video-el"
                autoPlay
                playsInline
                muted
                style={{ opacity: videoPlaying ? 1 : 0 }}
              />
              {!videoPlaying && (
                <div className="video-loading">
                  <div className="spinner" />
                  <span>카메라 준비 중...</span>
                </div>
              )}
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
                  <span className="source-tag">알라딘 제공</span>
                </div>
              )}

              {book.description && (
                <div className="description-block">
                  <p className="section-label">
                    줄거리 <span className="source-tag">알라딘 제공</span>
                  </p>
                  <p className="description">{book.description}</p>
                </div>
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
                      👍 블로그 추천율 {book.blogRecommendation.recommendPercent}%
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