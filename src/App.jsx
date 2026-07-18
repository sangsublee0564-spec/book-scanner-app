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

function App() {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const [playError, setPlayError] = useState('')

  function setVideoRef(el) {
    videoRef.current = el
    if (el) {
      el.muted = true
      el.defaultMuted = true
    }
  }

  useEffect(() => {
    if (result) return

    const codeReader = new BrowserMultiFormatReader(hints)
    let cancelled = false
    let nudgeInterval = null
    let debugInterval = null
    let frameCount = 0

    async function startScanning() {
      try {
        const controls = await Promise.race([
          codeReader.decodeFromConstraints(
            {
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            },
            videoRef.current,
            (scanResult) => {
              if (scanResult) setResult(scanResult.getText())
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
            `readyState=${v2?.readyState} paused=${v2?.paused} ` +
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

      {error && (
        <div>
          <p className="error">⚠️ {error}</p>
          <button onClick={handleReset}>다시 시도</button>
        </div>
      )}

      {!result && !error && (
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