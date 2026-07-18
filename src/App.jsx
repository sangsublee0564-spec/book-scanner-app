import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (result) return

    const codeReader = new BrowserMultiFormatReader()
    let cancelled = false

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
          v.play().catch(() => {})
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    startScanning()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [result])

  function handleReset() {
    setResult(null)
    setError(null)
  }

  return (
    <div className="app">
      <h1>바코드 스캔 테스트</h1>

      {error && <p className="error">⚠️ {error}</p>}

      {!result && (
        <video ref={videoRef} className="video-el" autoPlay playsInline muted />
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