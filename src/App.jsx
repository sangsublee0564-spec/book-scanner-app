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
      if (videoInputs.length > 0) {
        setDeviceId(videoInputs[videoInputs.length - 1].deviceId)
      }
    }
    loadDevices()
  }, [])

  useEffect(() => {
    if (isbn || !deviceId) return
    const codeReader = new BrowserMultiFormatReader()

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
      } catch (err) {
        setError(err.message)
      }
    }

    startScanning()
    return () => controlsRef.current?.stop()
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
        <span className="app-icon">📚</span>
        <h1>책 스캔</h1>
      </header>

      <main className="app-main">
        {error && <div className="alert-error">⚠️ {error}</div>}

        {!isbn && (
          <div className="scanner-card">
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
            <div className="video-wrapper">
              <video ref={videoRef} className="video-preview" />
              <div className="scan-frame" />
            </div>
            <p className="scan-hint">바코드를 사각형 안에 비춰주세요</p>
          </div>
        )}

        {loading && (
          <div className="loading-box">
            <div className="spinner" />
            <p>책 정보를 가져오는 중...</p>
          </div>
        )}

        {book && (
          <div className="result-card">
            {book.cover && (
              <img src={book.cover} alt={book.title} className="book-cover" />
            )}
            <h2 className="book-title">{book.title || '제목을 찾을 수 없습니다'}</h2>
            <p className="book-meta">{book.author} · {book.publisher}</p>

            {book.rating != null && (
              <div className="rating-badge">
                <span className="stars">{renderStars(book.rating)}</span>
                <span>{book.rating}/10</span>
              </div>
            )}

            {book.description && (
              <div className="description-box">
                <p>{book.description}</p>
              </div>
            )}

            {book.blogPosts?.length > 0 && (
              <div className="blog-section">
                <h3>관련 블로그 글</h3>
                <ul className="blog-list">
                  {book.blogPosts.map((post, i) => (
                    <li key={i}>
                      <a href={post.link} target="_blank" rel="noreferrer" className="blog-item">
                        <span>{post.title}</span>
                        <span className="chevron">›</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
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