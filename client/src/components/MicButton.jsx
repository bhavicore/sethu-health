import { useRef, useState } from 'react';
import { isRecordingSupported, recordClip, blobToBase64 } from '../lib/recorder';
import { careApi } from '../lib/careApi';

/** Small mic button that records a short clip, sends it to Sarvam STT, and
 * appends the transcript to the caller's text via onTranscript. Hidden
 * entirely when SARVAM_API_KEY isn't configured server-side. */
export default function MicButton({ language = 'hi', onTranscript, sarvamConfigured, disabled }) {
  const [state, setState] = useState('idle'); // idle | recording | transcribing | error
  const activeRef = useRef(null);

  if (!sarvamConfigured || !isRecordingSupported()) return null;

  async function toggle() {
    if (state === 'recording') {
      activeRef.current?.stop();
      return;
    }
    setState('recording');
    try {
      const { stop, result } = await recordClip({ maxMs: 30000 });
      activeRef.current = { stop };
      const blob = await result;
      setState('transcribing');
      const audioBase64 = await blobToBase64(blob);
      const res = await careApi.transcribe({ audioBase64, mimeType: 'audio/webm', language });
      if (res.transcript) onTranscript(res.transcript);
      setState(res.transcript ? 'idle' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      className={`mic-btn ${state === 'recording' ? 'mic-btn--active' : ''}`}
      onClick={toggle}
      disabled={disabled || state === 'transcribing'}
      title="Dictate (Sarvam Saaras STT)"
    >
      {state === 'recording' ? '● Stop' : state === 'transcribing' ? '…' : '🎙'}
    </button>
  );
}
