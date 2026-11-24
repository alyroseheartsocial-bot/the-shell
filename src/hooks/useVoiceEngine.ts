/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryNode, VoicePreset } from '../types';
import { sanitizeVoicePreset, VOICE_ID_STORAGE_KEY } from '../lib/helpers';

interface UseVoiceEngineOptions {
  callsign: string;
  dynamicNotes: string;
  companionName?: string;
  companionPersonality?: string;
  preferredVoice: VoicePreset;
  memories: MemoryNode[];
  recentSummaries: string[];
  onLiveTurnCommitted: (userText: string, companionText: string) => void;
  onVoiceMemorySaved?: (item: { category: string; fact: string; importance: number }) => void;
  onVoiceImageGenerated?: (image: {
    id: string;
    assetId: string;
    prompt: string;
    stylePreset: string;
    aspectRatio: string;
    dataUrl: string;
    createdAtMs: number;
  }) => void;
  onThoughtUpdate: (thought: string) => void;
  onStatusChange: (status: string) => void;
}

function float32ToBase64Pcm16(float32Array: Float32Array): string {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Browser-voice fallback for read-aloud: used only when the server TTS
// request cannot produce audio (e.g. BYOAPI mode, or no Gemini key set —
// the server then answers with its "Voice needs a Gemini key" error).
// Text prep mirrors the server TTS cleaning in server.ts (code blocks,
// URLs and markdown artefacts removed), plus *asterisk action* spans are
// dropped whole so stage directions are never read aloud.
function cleanTextForBrowserSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/\*[^*\n]+\*/g, '') // remove *asterisk actions*
    .replace(/https?:\/\/[^\s]+/g, '') // remove URLs
    .replace(/[*_#`~[\]]/g, '') // remove markdown artifacts
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 950);
}

function speakWithBrowserVoice(text: string, onDone: () => void): boolean {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const clean = cleanTextForBrowserSpeech(text);
    if (!clean) return false;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.onend = onDone;
    utterance.onerror = onDone;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function cancelBrowserVoice(): void {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore — speechSynthesis unavailable
  }
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768.0;
  }
  return float32;
}

function float32ArrayToWavBase64(samples: Float32Array, sampleRate = 16000): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + samples.length * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useVoiceEngine({
  callsign,
  dynamicNotes,
  companionName,
  companionPersonality,
  preferredVoice,
  memories,
  recentSummaries,
  onLiveTurnCommitted,
  onVoiceMemorySaved,
  onVoiceImageGenerated,
  onThoughtUpdate,
  onStatusChange,
}: UseVoiceEngineOptions) {
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [companionVocalLevel, setCompanionVocalLevel] = useState(0);
  const [userMicLevel, setUserMicLevel] = useState(0);
  const [liveUserDraft, setLiveUserDraft] = useState('');
  const [liveCompanionDraft, setLiveCompanionDraft] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const isMutedRef = useRef(false);
  const callStateRef = useRef<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsPlaybackStopRef = useRef<(() => void) | null>(null);

  // Voice ID & State Retention: Guarantee custom Voice ID is persistent and never null or undefined
  const effectiveVoice: VoicePreset = sanitizeVoicePreset(
    preferredVoice ||
      (typeof window !== 'undefined' ? localStorage.getItem(VOICE_ID_STORAGE_KEY) : null) ||
      'Kore'
  );

  // Auto-reconnect & zero-failure vocal relay fallback state
  const reconnectAttemptsRef = useRef(0);
  const isRelayModeRef = useRef(false);
  const relayPcmAccumulatorRef = useRef<Float32Array[]>([]);
  const relayTotalSamplesRef = useRef(0);
  const hasSpokenInRelayTurnRef = useRef(false);
  const silenceRelayTimerRef = useRef<number | null>(null);
  const isProcessingRelayTurnRef = useRef(false);

  const userTranscriptAccRef = useRef('');
  const companionTranscriptAccRef = useRef('');

  // Keep latest callbacks in refs to avoid stale closures
  const callbacksRef = useRef({
    onLiveTurnCommitted,
    onVoiceMemorySaved,
    onVoiceImageGenerated,
    onThoughtUpdate,
    onStatusChange,
  });
  callbacksRef.current = {
    onLiveTurnCommitted,
    onVoiceMemorySaved,
    onVoiceImageGenerated,
    onThoughtUpdate,
    onStatusChange,
  };

  useEffect(() => {
    isMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const stopScheduledPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
  }, []);

  const startVocalMeterLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const dataArray = new Uint8Array(64);
    const tick = () => {
      const analyser = outputAnalyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        setCompanionVocalLevel(Math.min(1, avg * 2.6));
      } else {
        setCompanionVocalLevel(0);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Masculine TTS playback with preloaded audio buffer, retry resilience, and browser Web Speech safety net
  const speakMessage = useCallback(
    async (messageId: string, text: string) => {
      // Toggle off / pause if currently active
      if (speakingMessageId === messageId) {
        cancelBrowserVoice();
        if (ttsPlaybackStopRef.current) {
          ttsPlaybackStopRef.current();
          ttsPlaybackStopRef.current = null;
        }
        if (ttsAudioRef.current) {
          ttsAudioRef.current.pause();
          ttsAudioRef.current = null;
        }
        setSpeakingMessageId(null);
        setCompanionVocalLevel(0);
        return;
      }

      // Stop any existing playback first
      cancelBrowserVoice();
      if (ttsPlaybackStopRef.current) {
        ttsPlaybackStopRef.current();
        ttsPlaybackStopRef.current = null;
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }

      setVoiceError(null);
      setSpeakingMessageId(messageId);

      // Preload & await complete audio stream buffer before triggering output
      const playPreloadedAudioBuffer = async (audioDataUrl: string): Promise<void> => {
        const commaIdx = audioDataUrl.indexOf(',');
        const base64Data = commaIdx >= 0 ? audioDataUrl.slice(commaIdx + 1) : audioDataUrl;
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ttsCtx = new AudioCtx();
        if (ttsCtx.state === 'suspended') {
          await ttsCtx.resume();
        }

        // Await complete decoding of audio stream into uncompressed PCM buffer in memory
        const decodedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          ttsCtx.decodeAudioData(
            arrayBuffer.slice(0),
            (buffer) => resolve(buffer),
            (err) => reject(err || new Error('Failed to decode audio data buffer.'))
          );
        });

        // Trigger playback ONLY after buffer has been fully received, parsed, and decoded
        const sourceNode = ttsCtx.createBufferSource();
        sourceNode.buffer = decodedBuffer;

        const analyser = ttsCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.6;

        sourceNode.connect(analyser);
        analyser.connect(ttsCtx.destination);
        outputAnalyserRef.current = analyser;
        startVocalMeterLoop();

        let isStopped = false;
        ttsPlaybackStopRef.current = () => {
          if (isStopped) return;
          isStopped = true;
          try {
            sourceNode.stop();
          } catch {
            // ignore
          }
          outputAnalyserRef.current = null;
          ttsCtx.close().catch(() => {});
        };

        sourceNode.onended = () => {
          if (isStopped) return;
          isStopped = true;
          setSpeakingMessageId(null);
          setCompanionVocalLevel(0);
          outputAnalyserRef.current = null;
          ttsPlaybackStopRef.current = null;
          ttsCtx.close().catch(() => {});
        };

        sourceNode.start(0);
      };

      const MAX_ATTEMPTS = 2; // Primary attempt + 1 retry
      let lastError: Error | null = null;
      let playbackInitiated = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          console.log(
            `[Custom TTS] Speech synthesis request (Attempt ${attempt}/${MAX_ATTEMPTS}): voice="${effectiveVoice}", messageId="${messageId}", chars=${text.length}`
          );

          const abortCtrl = new AbortController();
          const timeoutMs = 12000;
          const timeoutId = window.setTimeout(() => {
            abortCtrl.abort();
          }, timeoutMs);

          let res: Response;
          try {
            res = await fetch('/api/tts/speak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, voice: effectiveVoice }),
              signal: abortCtrl.signal,
            });
          } catch (netErr) {
            if (abortCtrl.signal.aborted) {
              console.error(
                `[Custom TTS] Network timeout: Request exceeded ${timeoutMs}ms limit on attempt ${attempt}/${MAX_ATTEMPTS}.`
              );
              throw new Error(`Network timeout: request exceeded ${timeoutMs}ms limit`);
            }
            console.error(
              `[Custom TTS] Network failure during fetch on attempt ${attempt}/${MAX_ATTEMPTS}:`,
              netErr
            );
            throw netErr;
          } finally {
            window.clearTimeout(timeoutId);
          }

          if (!res.ok) {
            let errDetails: Record<string, unknown> | null = null;
            try {
              errDetails = await res.json();
            } catch {
              // ignore
            }

            const errorMsg =
              (errDetails && typeof errDetails.error === 'string' && errDetails.error) ||
              res.statusText ||
              `HTTP ${res.status}`;

            if (res.status === 401 || res.status === 403) {
              console.error(
                `[Custom TTS] Invalid API Key / Unauthorized error (${res.status}) on attempt ${attempt}:`,
                errorMsg
              );
            } else if (res.status === 429) {
              console.warn(
                `[Custom TTS] Rate Limit or Quota Exceeded (${res.status}) on attempt ${attempt}:`,
                errorMsg
              );
            } else {
              console.warn(
                `[Custom TTS] Server returned error (${res.status}) on attempt ${attempt}:`,
                errorMsg
              );
            }

            throw new Error(`Endpoint returned status ${res.status}: ${errorMsg}`);
          }

          const data = await res.json();

          if (!data || typeof data !== 'object') {
            console.warn(
              `[Custom TTS] Payload failure: Received non-object response (Attempt ${attempt}/${MAX_ATTEMPTS}):`,
              data
            );
            throw new Error('Invalid JSON payload received from TTS endpoint');
          }

          if (
            !data.audioDataUrl ||
            typeof data.audioDataUrl !== 'string' ||
            !data.audioDataUrl.startsWith('data:audio/')
          ) {
            console.warn(
              `[Custom TTS] Payload failure: Invalid audio stream data URL (Attempt ${attempt}/${MAX_ATTEMPTS}):`,
              data
            );
            throw new Error(data.error || 'Server did not return a valid audio stream data URL');
          }

          console.log(
            `[Custom TTS] Complete audio payload received (${data.audioDataUrl.length} chars). Awaiting buffer preloading & decoding...`
          );

          // Await complete audio buffer decoding before attempting output
          await playPreloadedAudioBuffer(data.audioDataUrl);

          playbackInitiated = true;
          console.log(`[Custom TTS] Audio output successfully started using voice "${effectiveVoice}".`);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            `[Custom TTS] Custom voice attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
            lastError.message
          );

          if (attempt < MAX_ATTEMPTS) {
            console.log(`[Custom TTS] Retrying custom voice call in 400ms...`);
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }

      if (!playbackInitiated) {
        const failureReason = lastError?.message || 'Vocal synthesis failed to render audio.';
        console.error(
          `[Custom TTS] Vocal engine error: All ${MAX_ATTEMPTS} synthesis attempts failed:`,
          {
            voiceId: effectiveVoice,
            error: failureReason,
            textLength: text.length,
          }
        );
        // Server voice unavailable (BYOAPI mode, no Gemini key, or a failed
        // /api/tts/speak response): fall back to the browser's built-in
        // voice so Listen / auto-speak still read the reply aloud. The
        // Gemini path above is untouched when it works.
        const browserVoiceStarted = speakWithBrowserVoice(text, () => {
          setSpeakingMessageId(null);
          setCompanionVocalLevel(0);
          ttsPlaybackStopRef.current = null;
        });
        if (browserVoiceStarted) {
          ttsPlaybackStopRef.current = () => {
            cancelBrowserVoice();
            setSpeakingMessageId(null);
            setCompanionVocalLevel(0);
            ttsPlaybackStopRef.current = null;
          };
          console.log(
            '[Custom TTS] Server voice unavailable; reading aloud with the browser built-in voice.'
          );
          return;
        }
        // No browser voice either — fail silently with the existing UI behaviour.
        setVoiceError(`Voice engine: ${failureReason}`);
        setSpeakingMessageId(null);
        setCompanionVocalLevel(0);
      }
    },
    [effectiveVoice, speakingMessageId, startVocalMeterLoop]
  );

  const endVoiceCall = useCallback(() => {
    cancelBrowserVoice();
    if (ttsPlaybackStopRef.current) {
      ttsPlaybackStopRef.current();
      ttsPlaybackStopRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (silenceRelayTimerRef.current) {
      window.clearTimeout(silenceRelayTimerRef.current);
      silenceRelayTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    stopScheduledPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
      outputAnalyserRef.current = null;
    }

    // Flush any remaining live transcript into chat
    const pendingUser = userTranscriptAccRef.current.trim();
    const pendingCompanion = companionTranscriptAccRef.current.trim();
    if (pendingUser || pendingCompanion) {
      callbacksRef.current.onLiveTurnCommitted(pendingUser, pendingCompanion);
    }
    userTranscriptAccRef.current = '';
    companionTranscriptAccRef.current = '';
    reconnectAttemptsRef.current = 0;
    isRelayModeRef.current = false;
    relayPcmAccumulatorRef.current = [];
    relayTotalSamplesRef.current = 0;
    hasSpokenInRelayTurnRef.current = false;
    isProcessingRelayTurnRef.current = false;

    setLiveUserDraft('');
    setLiveCompanionDraft('');
    setCompanionVocalLevel(0);
    setUserMicLevel(0);
    setCallSeconds(0);
    setCallState('idle');
    callbacksRef.current.onStatusChange('CONNECTED');
  }, [stopScheduledPlayback]);

  // Process a spoken turn in Continuous Vocal Relay Mode (when Gemini Live WebSocket hits API limits)
  const processRelaySpokenTurn = useCallback(async () => {
    if (isProcessingRelayTurnRef.current || relayTotalSamplesRef.current < 8000) {
      relayPcmAccumulatorRef.current = [];
      relayTotalSamplesRef.current = 0;
      hasSpokenInRelayTurnRef.current = false;
      return;
    }

    isProcessingRelayTurnRef.current = true;
    callbacksRef.current.onStatusChange('TRANSCRIBING');

    try {
      // Merge all accumulated 16kHz float32 chunks into a single Float32Array
      const merged = new Float32Array(relayTotalSamplesRef.current);
      let offset = 0;
      for (const chunk of relayPcmAccumulatorRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      relayPcmAccumulatorRef.current = [];
      relayTotalSamplesRef.current = 0;
      hasSpokenInRelayTurnRef.current = false;

      const wavBase64 = float32ArrayToWavBase64(merged, 16000);

      // Transcribe via multi-model failover
      const transcribeRes = await fetch('/api/audio/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: wavBase64, mimeType: 'audio/wav' }),
      });
      const transcribeData = await transcribeRes.json();
      const userText = (transcribeData.transcript || '').trim();

      if (!userText) {
        callbacksRef.current.onStatusChange('VOCAL LINK');
        isProcessingRelayTurnRef.current = false;
        return;
      }

      setLiveUserDraft(userText);
      callbacksRef.current.onStatusChange('COMPANION RESPONDING');

      // Query chat stream with 7-model failover
      const chatRes = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          callsign,
          dynamicNotes,
          companionName,
          companionPersonality,
          memories: memories.slice(0, 25).map((m) => ({
            category: m.category,
            fact: m.fact,
            importance: m.importance,
          })),
          recentSummaries: recentSummaries.slice(0, 4),
          autoFailover: true,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientTime: new Date().toISOString(),
        }),
      });

      if (!chatRes.ok || !chatRes.body) {
        throw new Error('Chat stream failover active');
      }

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = '';
      let accReply = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamBuffer += decoder.decode(value, { stream: true });
        const events = streamBuffer.split('\n\n');
        streamBuffer = events.pop() || '';

        for (const rawEvt of events) {
          const dataLine = rawEvt.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6));
            if (payload.type === 'token' && payload.text) {
              accReply += payload.text;
              setLiveCompanionDraft(accReply);
            } else if (payload.type === 'done' && payload.reply) {
              accReply = payload.reply;
              setLiveCompanionDraft(accReply);
            }
          } catch {
            // ignore
          }
        }
      }

      if (accReply.trim()) {
        callbacksRef.current.onLiveTurnCommitted(userText, accReply.trim());
        setLiveUserDraft('');
        setLiveCompanionDraft('');
        // Vocalize Companion's response seamlessly
        await speakMessage(`relay_${Date.now()}`, accReply.trim());
      }
    } catch {
      // Keep voice call alive even if a turn encountered a hiccup
    } finally {
      callbacksRef.current.onStatusChange('VOCAL LINK');
      isProcessingRelayTurnRef.current = false;
    }
  }, [callsign, dynamicNotes, companionName, companionPersonality, memories, recentSummaries, speakMessage]);

  const startVoiceCall = useCallback(async () => {
    if (callState === 'active' || callState === 'connecting') {
      endVoiceCall();
      return;
    }

    // Stop any TTS playback first
    if (ttsPlaybackStopRef.current) {
      ttsPlaybackStopRef.current();
      ttsPlaybackStopRef.current = null;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setSpeakingMessageId(null);

    setVoiceError(null);
    setCallState('connecting');
    callbacksRef.current.onStatusChange('LINKING VOICE');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,  // Standard browser microphone constraint — this is the exact WebRTC API property name, not branding.
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.65;
      analyser.connect(outputCtx.destination);
      outputAnalyserRef.current = analyser;
      nextStartTimeRef.current = outputCtx.currentTime;

      // Start the voice timer
      timerRef.current = window.setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);

      // Hook microphone audio processing
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) {
          setUserMicLevel(0);
          return;
        }

        const channelData = e.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < channelData.length; i += 8) {
          sumSq += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSq / (channelData.length / 8));
        setUserMicLevel(Math.min(1, rms * 6));

        // When in standard WebSocket mode: send PCM16 frames to Gemini Live API
        if (!isRelayModeRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const base64Audio = float32ToBase64Pcm16(channelData);
          wsRef.current.send(JSON.stringify({ type: 'audio', audio: base64Audio }));
        }

        // When in Continuous Vocal Relay Mode (when Live API hits limits): perform Voice Activity Detection (VAD)
        if (isRelayModeRef.current) {
          if (rms > 0.04) {
            hasSpokenInRelayTurnRef.current = true;
            if (silenceRelayTimerRef.current) {
              window.clearTimeout(silenceRelayTimerRef.current);
              silenceRelayTimerRef.current = null;
            }
            // Accumulate speech samples (up to 30 seconds max)
            if (relayTotalSamplesRef.current < 16000 * 30) {
              relayPcmAccumulatorRef.current.push(new Float32Array(channelData));
              relayTotalSamplesRef.current += channelData.length;
            }
          } else if (hasSpokenInRelayTurnRef.current && !silenceRelayTimerRef.current) {
            // User paused speech for > 950ms: automatically transcribe and answer!
            silenceRelayTimerRef.current = window.setTimeout(() => {
              silenceRelayTimerRef.current = null;
              void processRelaySpokenTurn();
            }, 950);
          }
        }
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
      startVocalMeterLoop();

      // Seamlessly switch to Continuous Vocal Relay mode if Live WebSocket hits API limits or capacity
      const switchToVocalRelayMode = (reason: string) => {
        isRelayModeRef.current = true;
        setCallState('active');
        callbacksRef.current.onStatusChange('VOCAL LINK');
        callbacksRef.current.onThoughtUpdate(reason);
        if (wsRef.current) {
          try {
            wsRef.current.close();
          } catch {
            // ignore
          }
          wsRef.current = null;
        }
      };

      const handleUnexpectedDisconnect = () => {
        if (isRelayModeRef.current || callStateRef.current === 'idle') return;

        if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current += 1;
          callbacksRef.current.onStatusChange('RESYNCING VOICE');
          callbacksRef.current.onThoughtUpdate('Resyncing live connection...');
          setTimeout(() => {
            if (callStateRef.current !== 'idle') {
              connectWebSocket();
            }
          }, 600 * reconnectAttemptsRef.current);
        } else {
          // If Live WebSocket disconnects or hits quota, seamlessly transition to Vocal Relay Mode so call never terminates!
          switchToVocalRelayMode('Live vocal channel operating via resilient vocal relay.');
        }
      };

      const connectWebSocket = () => {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/live`);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0;
          ws.send(
            JSON.stringify({
              type: 'init',
              callsign,
              dynamicNotes,
              companionName,
              companionPersonality,
              preferredVoice: effectiveVoice,
              memories: memories.slice(0, 25).map((m) => ({
                category: m.category,
                fact: m.fact,
                importance: m.importance,
              })),
              recentSummaries: recentSummaries.slice(0, 4),
              clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              clientTime: new Date().toISOString(),
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ready') {
              setCallState('active');
              callbacksRef.current.onStatusChange('VOCAL LINK');
              callbacksRef.current.onThoughtUpdate(`Live voice open with ${callsign}.`);
            } else if (msg.type === 'audio' && msg.audio && outputCtxRef.current && outputAnalyserRef.current) {
              const floatData = base64Pcm16ToFloat32(msg.audio);
              const audioBuffer = outputCtxRef.current.createBuffer(1, floatData.length, 24000);
              audioBuffer.getChannelData(0).set(floatData);

              const srcNode = outputCtxRef.current.createBufferSource();
              srcNode.buffer = audioBuffer;
              srcNode.connect(outputAnalyserRef.current);

              const now = outputCtxRef.current.currentTime;
              const startAt = Math.max(now, nextStartTimeRef.current);
              srcNode.start(startAt);
              nextStartTimeRef.current = startAt + audioBuffer.duration;
              activeSourcesRef.current.push(srcNode);

              srcNode.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter((n) => n !== srcNode);
              };
            } else if (msg.type === 'input_transcript' && msg.text) {
              userTranscriptAccRef.current += msg.text;
              setLiveUserDraft(userTranscriptAccRef.current.trim());
            } else if (msg.type === 'output_transcript' && msg.text) {
              companionTranscriptAccRef.current += msg.text;
              setLiveCompanionDraft(companionTranscriptAccRef.current.trim());
            } else if (msg.type === 'turn_complete') {
              const uText = userTranscriptAccRef.current.trim();
              const eText = companionTranscriptAccRef.current.trim();
              if (uText || eText) {
                callbacksRef.current.onLiveTurnCommitted(uText, eText);
              }
              userTranscriptAccRef.current = '';
              companionTranscriptAccRef.current = '';
              setLiveUserDraft('');
              setLiveCompanionDraft('');
            } else if (msg.type === 'memory_saved' && msg.item) {
              callbacksRef.current.onVoiceMemorySaved?.(msg.item);
            } else if (msg.type === 'image_generated' && msg.image) {
              callbacksRef.current.onVoiceImageGenerated?.(msg.image);
            } else if (msg.type === 'interrupted') {
              stopScheduledPlayback();
            } else if (msg.type === 'live_limit_switch_relay') {
              switchToVocalRelayMode(msg.message || 'Capacity protected. Live voice operating via vocal relay.');
            } else if (msg.type === 'reconnecting') {
              callbacksRef.current.onStatusChange('RESYNCING VOICE');
              callbacksRef.current.onThoughtUpdate('Resyncing live connection...');
            } else if (msg.type === 'closed') {
              handleUnexpectedDisconnect();
            } else if (msg.type === 'error') {
              handleUnexpectedDisconnect();
            }
          } catch {
            // ignore malformed frame
          }
        };

        ws.onerror = () => {
          handleUnexpectedDisconnect();
        };

        ws.onclose = () => {
          handleUnexpectedDisconnect();
        };
      };

      connectWebSocket();
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for real-time Voice Call.'
      );
      setCallState('idle');
      callbacksRef.current.onStatusChange('CONNECTED');
    }
  }, [
    callState,
    callsign,
    dynamicNotes,
    companionName,
    companionPersonality,
    endVoiceCall,
    memories,
    preferredVoice,
    processRelaySpokenTurn,
    recentSummaries,
    startVocalMeterLoop,
    stopScheduledPlayback,
  ]);

  useEffect(() => {
    return () => {
      endVoiceCall();
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
    };
  }, [endVoiceCall]);

  return {
    callState,
    isMicMuted,
    setIsMicMuted,
    callSeconds,
    companionVocalLevel,
    userMicLevel,
    liveUserDraft,
    liveCompanionDraft,
    voiceError,
    setVoiceError,
    speakingMessageId,
    startVoiceCall,
    endVoiceCall,
    speakMessage,
  };
}
