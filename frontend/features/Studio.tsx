import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import {
  ChatComposer,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
  ChatToolCalls,
} from '@astryxdesign/core/Chat'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout'
import { Markdown } from '@astryxdesign/core/Markdown'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Timer } from '@astryxdesign/core/Timer'
import { Token } from '@astryxdesign/core/Token'
import { Mic, RotateCcw, Sparkles, Square, Volume2, X } from 'lucide-react'
import type { StudioProposal, StudioStep } from '../../src/domain/studio.ts'
import { call } from '../lib/api.ts'
import { useQuery } from '../lib/data.ts'
import { useDictation, usePlayback } from '../lib/voice.ts'

type Entry =
  | { role: 'user'; content: string; spoken: boolean }
  | {
      role: 'assistant'
      content: string
      steps: readonly StudioStep[]
      proposals: readonly StudioProposal[]
      spoken: boolean
    }
  | { role: 'notice'; content: string }

const apply = (proposal: StudioProposal) =>
  call((client) =>
    proposal.kind === 'stock_movement'
      ? client.stock.move({ params: { id: proposal.itemId }, payload: proposal.movement })
      : proposal.kind === 'meter_reading'
        ? client.meters.record({ params: { id: proposal.meterId }, payload: proposal.reading })
        : client.cleaning.status({ params: { id: proposal.taskId }, payload: proposal.status }),
  )

function Proposal({ proposal, onNotice }: { proposal: StudioProposal; onNotice: (message: string) => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'applied' | 'dismissed'>('idle')
  const confirm = async () => {
    setState('busy')
    try {
      await apply(proposal)
      setState('applied')
      onNotice('Appliqué : ' + proposal.summary)
    } catch (error) {
      setState('idle')
      onNotice('Échec : ' + (error instanceof Error ? error.message : 'action impossible.'))
    }
  }
  return (
    <Card variant="muted">
      <VStack gap={2}>
        <Text>{proposal.summary}</Text>
        {state === 'applied' ? (
          <Token label="Appliqué" color="green" size="sm" />
        ) : state === 'dismissed' ? (
          <Token label="Écarté" color="gray" size="sm" />
        ) : (
          <HStack gap={2}>
            <Button label="Appliquer" size="sm" onClick={() => void confirm()} isLoading={state === 'busy'} />
            <Button
              label="Écarter"
              size="sm"
              variant="ghost"
              isDisabled={state === 'busy'}
              onClick={() => setState('dismissed')}
            />
          </HStack>
        )}
      </VStack>
    </Card>
  )
}

export function Studio({ route, onClose }: { route: string; onClose: () => void }) {
  const loadStatus = useCallback(() => call((client) => client.studio.status()), []),
    status = useQuery('studio', loadStatus),
    [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reading, setReading] = useState<number | null>(null),
    playback = usePlayback(),
    end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [entries, busy])
  const notice = (content: string) => setEntries((current) => [...current, { role: 'notice', content }])
  const speak = async (key: number, text: string) => {
    if (playback.playing === key) return playback.stop()
    setReading(key)
    try {
      await playback.play(key, await call((client) => client.studio.speak({ payload: { text: text.slice(0, 4000) } })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lecture vocale impossible.')
    } finally {
      setReading(null)
    }
  }
  const send = async (text: string, spoken = false) => {
    const content = text.trim()
    if (!content || busy) return
    playback.stop()
    const next: Entry[] = [...entries, { role: 'user', content, spoken }]
    setEntries(next)
    setBusy(true)
    setError('')
    try {
      const messages = next.flatMap((entry) =>
        entry.role === 'notice' || !entry.content ? [] : [{ role: entry.role, content: entry.content }],
      )
      const reply = await call((client) => client.studio.ask({ payload: { messages, route } }))
      setEntries((current) => [
        ...current,
        { role: 'assistant', content: reply.text, steps: reply.steps, proposals: reply.proposals, spoken },
      ])
      if (spoken && reply.text) void speak(next.length, reply.text)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le studio n’a pas répondu.')
    } finally {
      setBusy(false)
    }
  }
  const available = status.data?.available ?? false,
    voice = status.data?.voice ?? false,
    dictation = useDictation(async (audio) => {
      const { text } = await call((client) => client.studio.transcribe({ payload: { audio, mime: 'audio/wav' } }))
      if (text) await send(text, true)
      else setError('Rien entendu. Rapprochez-vous du micro et réessayez.')
    }),
    recording = dictation.state === 'recording',
    canDictate = voice && !busy && dictation.state !== 'processing',
    { press, lift, cancel } = dictation,
    stopPlayback = playback.stop
  useEffect(() => {
    if (!canDictate && !recording) return
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && recording) return cancel()
      if (event.code !== 'KeyM' || !event.altKey || event.repeat) return
      event.preventDefault()
      stopPlayback()
      press()
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'KeyM' || event.key === 'Alt') lift()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [canDictate, recording, press, lift, cancel, stopPlayback])
  return (
    <Layout
      height="fill"
      padding={0}
      header={
        <LayoutHeader hasDivider padding={3}>
          <HStack gap={2} justify="between" align="center">
            <HStack gap={2} align="center">
              <Icon icon={Sparkles} />
              <Heading level={2}>AI Studio</Heading>
              {status.data && (
                <Token
                  label={available ? status.data.model : 'Non configuré'}
                  color={available ? 'blue' : 'gray'}
                  size="sm"
                />
              )}
            </HStack>
            <HStack gap={1}>
              <Button
                label="Nouvelle conversation"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<Icon icon={RotateCcw} />}
                isDisabled={busy || entries.length === 0}
                onClick={() => {
                  setEntries([])
                  setError('')
                }}
              />
              <Button
                label="Fermer le studio"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<Icon icon={X} />}
                onClick={onClose}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={3}>
          {entries.length === 0 ? (
            <EmptyState
              isCompact
              icon={<Icon icon={Sparkles} />}
              title={available ? 'Questionnez la résidence' : 'Aucun fournisseur IA'}
              description={
                available
                  ? 'Ex. « Quels articles sont sous le seuil ? », « Qui entre cette semaine ? ». Les actions proposées attendent votre confirmation.' +
                    (voice ? ' Maintenez ⌥ M ou le micro pour parler.' : '')
                  : 'Renseignez AI_PROVIDER et la clé AI_API_KEY dans .dev.vars pour activer le studio.'
              }
            />
          ) : (
            <ChatMessageList density="compact" align="top" isStreaming={busy} ref={end}>
              {entries.map((entry, index) =>
                entry.role === 'notice' ? (
                  <ChatSystemMessage key={index}>{entry.content}</ChatSystemMessage>
                ) : entry.role === 'user' ? (
                  <ChatMessage key={index} sender="user">
                    <ChatMessageBubble metadata={entry.spoken ? <Text type="supporting">Dicté</Text> : undefined}>
                      {entry.content}
                    </ChatMessageBubble>
                  </ChatMessage>
                ) : (
                  <ChatMessage key={index} sender="assistant">
                    {entry.steps.length > 0 && (
                      <ChatMessageBubble variant="ghost" width="100%">
                        <ChatToolCalls
                          label={entry.steps.length + ' consultation(s)'}
                          calls={entry.steps.map((step, position) => ({
                            key: String(position),
                            name: step.label,
                            status: step.ok ? 'complete' : 'error',
                          }))}
                        />
                      </ChatMessageBubble>
                    )}
                    {entry.content && (
                      <ChatMessageBubble
                        variant="ghost"
                        metadata={
                          voice ? (
                            <Button
                              label={playback.playing === index ? 'Arrêter la lecture' : 'Écouter la réponse'}
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              icon={<Icon icon={playback.playing === index ? Square : Volume2} />}
                              isLoading={reading === index}
                              onClick={() => void speak(index, entry.content)}
                            />
                          ) : undefined
                        }
                      >
                        <Markdown density="compact">{entry.content}</Markdown>
                      </ChatMessageBubble>
                    )}
                    {entry.proposals.length > 0 && (
                      <ChatMessageBubble variant="ghost" width="100%">
                        <VStack gap={2}>
                          {entry.proposals.map((proposal, position) => (
                            <Proposal key={position} proposal={proposal} onNotice={notice} />
                          ))}
                        </VStack>
                      </ChatMessageBubble>
                    )}
                  </ChatMessage>
                ),
              )}
              {dictation.state === 'processing' && <ChatSystemMessage>Transcription…</ChatSystemMessage>}
              {busy && <ChatSystemMessage>Analyse en cours…</ChatSystemMessage>}
            </ChatMessageList>
          )}
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={3}>
          <ChatComposer
            density="compact"
            placeholder="Posez une question ou décrivez une action…"
            isDisabled={!available || busy || recording}
            onSubmit={(value) => void send(value)}
            status={error || dictation.error ? { type: 'error', message: dictation.error || error } : undefined}
            headerContext={
              recording ? (
                <HStack gap={2} align="center">
                  <StatusDot variant="error" label="Enregistrement en cours" isPulsing />
                  <Timer startTime={dictation.startedAt} format="clock" />
                  <ProgressBar label="Niveau du micro" value={dictation.level} isLabelHidden variant="neutral" />
                  <Kbd keys="esc" />
                </HStack>
              ) : voice && available ? (
                <HStack gap={1} align="center">
                  <Text type="supporting">Maintenir</Text>
                  <Kbd keys="alt+m" />
                  <Text type="supporting">pour parler</Text>
                </HStack>
              ) : undefined
            }
            sendActions={
              voice && available ? (
                <Button
                  label={recording ? 'Envoyer la dictée' : 'Maintenir pour parler'}
                  variant={recording ? 'primary' : 'ghost'}
                  size="sm"
                  isIconOnly
                  icon={<Icon icon={recording ? Square : Mic} />}
                  isDisabled={!canDictate && !recording}
                  isLoading={dictation.state === 'processing'}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    playback.stop()
                    dictation.press()
                  }}
                  onPointerUp={dictation.lift}
                  onPointerLeave={() => recording && dictation.lift()}
                  onClick={(event) => {
                    if (event.detail === 0) dictation.press()
                  }}
                />
              ) : undefined
            }
          />
        </LayoutFooter>
      }
    />
  )
}
