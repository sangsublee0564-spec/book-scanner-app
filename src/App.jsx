import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import './App.css'

const MAX_RETRIES = 3

function renderStars(rating10) {
  const fiveScale = Math.round(rating10 / 2)
  return '★'.repeat(fiveScale) + '☆'.repeat(5 - fiveScale)
}

function App() {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const initedRef = useRef(false)
  const [error, setError] = useState(null)
  const [isbn, setIsbn] = useState(null)
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [camReady, setCamReady] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [giveUp, setGiveUp] = useState(false)

  // 1) 마운트 시 카메라 목록을 먼저 조사해서 "후면(facing back)" 카메라를 기본값으로 지정
  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true

    let cancelled = false

    async function initCamera() {
      try {
        let allDevices = await navigator.mediaDevices.enumerateDevices()
        let videoInputs = allDevices.filter((d) => d.kind === 'videoinput')

        // 라벨이 비어있으면(권한 전) 임시로 카메라를 한 번 열어서 권한을 받은 뒤 다시 조사
        if (videoInputs.length > 0 && videoInputs.every((d) => !d.label)) {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
          tempStream.getTracks().forEach((t) => t.stop())
          allDevices = await navigator.mediaDevices.enumerateDevices()
          videoInputs = allDevices.filter((d) => d.kind === 'videoinput')
        }

        if (cancelled) return

        setDevices(videoInputs)

        // "facing back" 라벨을 가진 카메라를 우선 선택 (없으면 첫 번째 카메라)
        const backDevice =
          videoInputs.find((d) => /back/i.test(d.label)) || videoInputs[0]

        setDeviceId(backDevice ? backDevice.deviceId : null)
      } catch (err) {
        console.error('카메라 목록 조사 실패:', err.message)
      } finally {
        if (!cancelled) setCamReady(true)
      }
    }

    initCamera()

    return () => {
      cancelled = true
    }
  }, [])

  // 2) 실제 스캔 시작 (camReady된 뒤에만, 멈춰있으면 자동 재시도)
  useEffect(() => {
    if (isbn || !camReady || giveUp) return
    let cancelled = false
    let debugInterval = null
    let watchdogTimer = null

    function pickConstraints(id) {
      return id
        ? {
            deviceId: { exact: id },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
    }

    async function attemptScan() {
      const codeReader = new BrowserMultiFormatReader()
      try {
        const controls = await codeReader.decodeFromConstraints(
          { video: pickConstraints(deviceId) },
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

        // 진단용 상태 표시 (0.5초마다)
        debugInterval = setInterval(() => {
          if (cancelled) return
          const v = videoRef.current
          const stream = v?.srcObject
          const track = stream?.getVideoTracks?.()[0]
          setDebugInfo(
            `readyState=${v?.readyState} size=${v?.videoWidth}x${v?.videoHeight} ` +
            `paused=${v?.paused} trackReadyState=${track?.readyState} ` +
            `trackMuted=${track?.muted} trackLabel=${track?.label} retry=${retryTick}`
          )
        }, 500)

        // 멈춤 감지: 2.5초 후에도 화면이 안 뜨면 자동으로 카메라를 다시 켬
        watchdogTimer = setTimeout(() => {
          if (cancelled) return
          const v = videoRef.current
          const notReady = !v || v.readyState < 2 || v.videoWidth === 0
          if (notReady) {
            controlsRef.current?.stop()
            setRetryTick((n) => {
              const next = n + 1
              if (next > MAX_RETRIES) {
                setGiveUp(true)
                return n
              }
              return next
            })
          }
        }, 2500)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    attemptScan()

    return () => {
      cancelled = true
      clearInterval(debugInterval)
      clearTimeout(watchdogTimer)
      controlsRef.current?.stop()
    }
  }, [isbn, deviceId, camReady, retryTick, giveUp])

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

  function handleManualRetry() {
    setGiveUp(false)
    setError(null)
    setRetryTick((n) => n + 1)
  }

  function handleDeviceChange(e) {
    setGiveUp(false)
    setError(null)
    setRetryTick(0)
    setDeviceId(e.target.value)
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
                onChange={handleDeviceChange}
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
            {debugInfo && (
              <p style={{ fontSize: '10px', color: '#888', wordBreak: 'break-all', marginTop: '6px' }}>
                {debugInfo}
              </p>
            )}
            {giveUp && (
              <div className="alert" style={{ marginTop: '8px' }}>
                ⚠️ 카메라 연결이 원활하지 않습니다.
                <button onClick={handleManualRetry} className="rescan-btn" style={{ marginTop: '8px' }}>
                  🔄 다시 시도
                </button>
              </div>
            )}
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