import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_AUDIO_SECONDS } from '../../src/domain/studio.ts'

const SAMPLE_RATE = 16000
const HOLD_DELAY = 400

export type DictationState = 'idle' | 'recording' | 'processing'

const toWav = (samples: Float32Array) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer),
    text = (offset: number, value: string) =>
      [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Uint8Array(buffer)
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

const encode = async (recording: Blob) => {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return toBase64(toWav(rendered.getChannelData(0)))
  } finally {
    void context.close()
  }
}

const microphoneError = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Accès au micro refusé. Autorisez-le dans le navigateur pour dicter.'
    : error instanceof DOMException && error.name === 'NotFoundError'
      ? 'Aucun micro détecté.'
      : 'Impossible d’enregistrer : ' + (error instanceof Error ? error.message : 'erreur inconnue.')

type Session = {
  stream: MediaStream
  recorder: MediaRecorder
  context: AudioContext
  frame: number
  timeout: number
  cancelled: boolean
}

const release = (current: Session) => {
  cancelAnimationFrame(current.frame)
  clearTimeout(current.timeout)
  current.stream.getTracks().forEach((track) => track.stop())
  void current.context.close()
}

export function useDictation(onAudio: (audio: string) => Promise<void>) {
  const [state, setState] = useState<DictationState>('idle'),
    [level, setLevel] = useState(0),
    [startedAt, setStartedAt] = useState(0),
    [error, setError] = useState(''),
    session = useRef<Session | null>(null),
    starting = useRef(false),
    pressedAt = useRef(0),
    handler = useRef(onAudio)
  useEffect(() => {
    handler.current = onAudio
  })

  const finish = useCallback(() => {
    const current = session.current
    if (current?.recorder.state === 'recording') current.recorder.stop()
  }, [])

  const cancel = useCallback(() => {
    const current = session.current
    if (!current) return
    current.cancelled = true
    if (current.recorder.state === 'recording') current.recorder.stop()
  }, [])

  const start = useCallback(async () => {
    if (session.current || starting.current) return
    setError('')
    starting.current = true
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch (cause) {
      setError(microphoneError(cause))
      return
    } finally {
      starting.current = false
    }
    const recorder = new MediaRecorder(stream),
      context = new AudioContext(),
      analyser = context.createAnalyser(),
      samples = new Uint8Array(analyser.fftSize),
      chunks: Blob[] = []
    context.createMediaStreamSource(stream).connect(analyser)
    const current: Session = { stream, recorder, context, frame: 0, timeout: 0, cancelled: false }
    const measure = () => {
      analyser.getByteTimeDomainData(samples)
      const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0)
      setLevel(Math.min(100, Math.round((peak / 128) * 160)))
      current.frame = requestAnimationFrame(measure)
    }
    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.onstop = () => {
      release(current)
      session.current = null
      setLevel(0)
      if (current.cancelled || chunks.length === 0) return setState('idle')
      setState('processing')
      void encode(new Blob(chunks, { type: recorder.mimeType }))
        .then((audio) => handler.current(audio))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Dictée impossible.'))
        .finally(() => setState('idle'))
    }
    session.current = current
    recorder.start()
    current.timeout = window.setTimeout(finish, MAX_AUDIO_SECONDS * 1000)
    measure()
    setStartedAt(Date.now())
    setState('recording')
  }, [finish])

  const press = useCallback(() => {
    pressedAt.current = Date.now()
    if (session.current) finish()
    else void start()
  }, [finish, start])

  const lift = useCallback(() => {
    if (session.current && Date.now() - pressedAt.current > HOLD_DELAY) finish()
  }, [finish])

  useEffect(
    () => () => {
      if (session.current) {
        session.current.cancelled = true
        session.current.recorder.stop()
      }
    },
    [],
  )

  return { state, level, startedAt, error, press, lift, cancel }
}

export function usePlayback() {
  const [playing, setPlaying] = useState<number | null>(null),
    audio = useRef<HTMLAudioElement | null>(null)
  const stop = useCallback(() => {
    audio.current?.pause()
    audio.current = null
    setPlaying(null)
  }, [])
  const play = useCallback(
    (key: number, source: { audio: string; mime: string }) => {
      stop()
      const element = new Audio(`data:${source.mime};base64,${source.audio}`)
      element.addEventListener('ended', () => {
        if (audio.current === element) stop()
      })
      audio.current = element
      setPlaying(key)
      return element.play().catch(() => stop())
    },
    [stop],
  )
  useEffect(() => stop, [stop])
  return { playing, play, stop }
}
