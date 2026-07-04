import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

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
    <div style={{ textAlign: 'center', padding: '20px', maxWidth: '480px', margin: '0 auto' }}>
      <h1>📚 책 스캔 앱</h1>
      {error && <p style={{ color: 'red' }}>오류: {error}</p>}

      {!isbn && devices.length > 1 && (
        <select
          value={deviceId || ''}
          onChange={(e) => setDeviceId(e.target.value)}
          style={{ marginBottom: '10px', padding: '6px', width: '100%' }}
        >
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `카메라 ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      {!isbn && (
        <video
          ref={videoRef}
          style={{
            width: '100%',
            maxHeight: '320px',
            objectFit: 'cover',
            borderRadius: '12px',
          }}
        />
      )}

      {loading && <p>책 정보를 가져오는 중...</p>}

      {book && (
        <div style={{ textAlign: 'left', marginTop: '16px' }}>
          {book.cover && (
            <img
              src={book.cover}
              alt={book.title}
              style={{ width: '150px', display: 'block', margin: '0 auto 12px' }}
            />
          )}
          <h2 style={{ textAlign: 'center' }}>{book.title || '제목을 찾을 수 없습니다'}</h2>
          <p style={{ textAlign: 'center', color: '#555' }}>
            {book.author} · {book.publisher}
          </p>
          {book.rating != null && (
            <p style={{ textAlign: 'center' }}>⭐ 평점: {book.rating} / 10</p>
          )}
          {book.description && (
            <p style={{ marginTop: '12px', lineHeight: 1.5 }}>{book.description}</p>
          )}

          {book.blogPosts?.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <h3>관련 블로그 글</h3>
              <ul>
                {book.blogPosts.map((post, i) => (
                  <li key={i}>
                    <a href={post.link} target="_blank" rel="noreferrer">
                      {post.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={handleRescan} style={{ marginTop: '20px', padding: '10px 20px' }}>
            다시 스캔하기
          </button>
        </div>
      )}
    </div>
  )
}

export default App