import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const [playError, setPlayError] = useState('')

  // video 엘리먼트가 생성되는 즉시 muted를 확정시킴 (자동재생 정책 회피)
  function setVideoRef(el) {
    videoRef.current = el
    if (el) {
      el.muted = true
      el.defaultMuted = true
    }
  }

  useEffect(() => {
    if (result) return

    const codeReader = new BrowserMultiFormatReader()
    let cancelled = false
    let nudgeInterval = null
    let debugInterval = null
    let frameCount = 0

    async function startScanning() {
      try {
        const controls = await codeReader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (scanResult) => {
            if (scanResult) setResult(scanResult.getText())
          }
        )

        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls

        const v = videoRef.current
        if (v) {
          v.muted = true
          v.defaultMuted = true
          v.play().catch((e) => setPlayError(`${e.name}: ${e.message}`))

          if ('requestVideoFrameCallback' in v) {
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
            vid.play().catch((e) => setPlayError(`${e.name}: ${e.message}`))
          }
        }, 300)

        debugInterval = setInterval(() => {
          if (cancelled) return
          const v2 = videoRef.current
          const stream = v2?.srcObject
          const track = stream?.getVideoTracks?.()[0]
          setDebugInfo(
            `readyState=${v2?.readyState} paused=${v2?.paused} muted=${v2?.muted} ` +
            `size=${v2?.videoWidth}x${v2?.videoHeight} frames=${frameCount} ` +
            `trackState=${track?.readyState}`
          )
        }, 500)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    startScanning()

    return () => {
      cancelled = true
      clearInterval(nudgeInterval)
      clearInterval(debugInterval)
      controlsRef.current?.stop()
    }
  }, [result])

  function handleReset() {
    setResult(null)
    setError(null)
    setVideoPlaying(false)
    setPlayError('')
  }

  return (
    <div className="app">
      <h1>바코드 스캔 테스트</h1>

      {error && <p className="error">⚠️ {error}</p>}

      {!result && (
        <>
          <div style={{ position: 'relative' }}>
            <video
              ref={setVideoRef}
              className="video-el"
              autoPlay
              playsInline
              muted
              style={{ opacity: videoPlaying ? 1 : 0 }}
            />
            {!videoPlaying && <p>카메라 준비 중...</p>}
          </div>
          {debugInfo && (
            <p style={{ fontSize: '11px', color: '#888', wordBreak: 'break-all' }}>
              {debugInfo}
            </p>
          )}
          {playError && (
            <p style={{ fontSize: '11px', color: '#c0392b', wordBreak: 'break-all' }}>
              play() 오류: {playError}
            </p>
          )}
        </>
      )}

      {result && (
        <div className="result">
          <p>스캔 결과:</p>
          <p className="code">{result}</p>
          <button onClick={handleReset}>다시 스캔하기</button>
        </div>
      )}
    </div>
  )
}

export default App