import { useState, useEffect, useRef, useCallback } from 'react';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';
import { PermissionsAndroid, Platform } from 'react-native';

export function useVoice() {
  const [isRecording,  setIsRecording]  = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript,   setTranscript]   = useState('');
  const transcriptRef = useRef('');

  // ── Request mic permission (Android) ──────────────────────────────────
  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'ARVA needs microphone access to hear you',
          buttonPositive: 'Allow',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true; // iOS handled via Info.plist
  };

  // ── Wire up Voice events ───────────────────────────────────────────────
  useEffect(() => {
    Voice.onSpeechStart = () => {
      setIsRecording(true);
      setIsProcessing(false);
    };

    Voice.onSpeechEnd = () => {
      setIsRecording(false);
      setIsProcessing(true);
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] || '';
      transcriptRef.current = text;
      setTranscript(text);
      setIsProcessing(false);
    };

    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] || '';
      transcriptRef.current = text;
      setTranscript(text);
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      console.error('Voice error:', e.error);
      setIsRecording(false);
      setIsProcessing(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // ── Start recording ────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        console.warn('Microphone permission denied');
        return;
      }
      transcriptRef.current = '';
      setTranscript('');
      await Voice.start('en-US'); // Android default STT
    } catch (e) {
      console.error('startRecording error:', e);
      setIsRecording(false);
    }
  }, []);

  // ── Stop recording → returns transcript ───────────────────────────────
  const stopRecording = useCallback(async (): Promise<string> => {
    try {
      await Voice.stop();
      // Wait for onSpeechResults to fire
      await new Promise(res => setTimeout(res, 400));
      return transcriptRef.current;
    } catch (e) {
      console.error('stopRecording error:', e);
      setIsRecording(false);
      setIsProcessing(false);
      return '';
    }
  }, []);

  return {
    isRecording,
    isProcessing,
    transcript,
    startRecording,
    stopRecording,
  };
}
