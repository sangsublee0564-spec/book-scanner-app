import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import './App.css'

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

  useEffect(() => {
    if (isbn) return
    let cancelled = false
    let watchdogTimer = null
    let frameSeen = false

    function pickConstraints(id) {
      return id
        ? {
            deviceId: { exact: id },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }],
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }],
          }
    }

    async function warmUpOtherCamera(excludeId) {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = allDevices.filter((d) => d.kind === 'videoinput')
        const other = videoInputs.find((d) => d.deviceId !== excludeId)
        if (!other) return
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: other.deviceId } },
        })
        await new Promise((resolve) => setTimeout(resolve, 400))
        tempStream.getTracks().forEach((t) => t.stop())
      } catch (e) {
        // 워밍업 실패해도 무시하고 원래 카메라 재시도로 넘어갑니다
      }
    }

    async function attemptScan(retryCount, targetDeviceId) {
      const codeReader = new BrowserMultiFormatReader()
      frameSeen = false
      try {
        const controls = await codeReader.decodeFromConstraints(
          { video: pickConstraints(targetDeviceId) },
          videoRef.current,
          (result) => {
            if (result) setIsbn(result.getText())
          }
        )

        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        videoRef.current?.play().catch(() => {})

        if (devices.length === 0) {
          const allDevices = await navigator.mediaDevices.enumerateDevices()
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput')
          if (!cancelled) setDevices(videoInputs)
        }

        const videoEl = videoRef.current
        if (videoEl?.requestVideoFrameCallback) {
          const onFrame = () => {
            frameSeen = true
            if (!cancelled) {
              videoEl.requestVideoFrameCallback(onFrame)
            }
          }
          videoEl.requestVideoFrameCallback(onFrame)
        } else {
          frameSeen = true
        }

        watchdogTimer = setTimeout(async () => {
          if (cancelled) return
          if (!frameSeen && retryCount < 1) {
            controls.stop()
            await warmUpOtherCamera(targetDeviceId)
            if (!cancelled) attemptScan(retryCount + 1, targetDeviceId)
          }
        }, 2500)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    attemptScan(0, deviceId)

    return () => {
      cancelled = true
      clearTimeout(watchdogTimer)
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
            {devices.length > 1 && (
              <select
                className="camera-select"
                value={deviceId || ''}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
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