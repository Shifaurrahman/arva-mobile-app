import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useVoice } from '../hooks/useVoice';
import { login, askARVA } from '../services/arva';

// ─── Constants ───────────────────────────────────────────────────────────────
const WAKE_WORD = 'arva';
const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────
type ListenState = 'idle' | 'wake' | 'listening' | 'processing' | 'speaking';

interface Message {
  id: string;
  role: 'user' | 'arva';
  text: string;
}

interface HistoryMessage {
  role: string;
  content: string;
}

// ─── Orb Component (inline, self-contained) ──────────────────────────────────
function LiveOrb({ state }: { state: ListenState }) {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const pulse3 = useRef(new Animated.Value(1)).current;
  const glow   = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse1.stopAnimation();
    pulse2.stopAnimation();
    pulse3.stopAnimation();
    glow.stopAnimation();
    rotate.stopAnimation();

    if (state === 'idle') {
      // Slow breathe
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse1, { toValue: 1.08, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(pulse1, { toValue: 1,    duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      ).start();
      Animated.timing(glow, { toValue: 0.3, duration: 600, useNativeDriver: true }).start();
    }

    if (state === 'wake') {
      // Quick expand — "I heard you"
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.3, duration: 200, useNativeDriver: true }),
        Animated.timing(pulse1, { toValue: 1.1, duration: 300, useNativeDriver: true }),
      ]).start();
      Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }

    if (state === 'listening') {
      // Fast ripple rings
      const ripple = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1.5, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
            Animated.timing(anim, { toValue: 1,   duration: 0,   useNativeDriver: true }),
          ])
        ).start();
      ripple(pulse1, 0);
      ripple(pulse2, 300);
      ripple(pulse3, 600);
      Animated.timing(glow, { toValue: 0.9, duration: 300, useNativeDriver: true }).start();
    }

    if (state === 'processing') {
      // Rotate spin
      Animated.loop(
        Animated.timing(rotate, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.linear })
      ).start();
      Animated.timing(glow, { toValue: 0.6, duration: 300, useNativeDriver: true }).start();
    }

    if (state === 'speaking') {
      // Medium pulse + glow
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse1, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse1, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ])
      ).start();
      Animated.timing(glow, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();
    }
  }, [state]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const orbColor = {
    idle:       '#4A90D9',
    wake:       '#A78BFA',
    listening:  '#F472B6',
    processing: '#34D399',
    speaking:   '#60A5FA',
  }[state];

  const ringOpacity = state === 'listening' ? 0.3 : 0;

  return (
    <View style={orbStyles.container}>
      {/* Ripple rings (listening only) */}
      <Animated.View style={[orbStyles.ring, { transform: [{ scale: pulse3 }], opacity: ringOpacity, borderColor: orbColor }]} />
      <Animated.View style={[orbStyles.ring, { transform: [{ scale: pulse2 }], opacity: ringOpacity, borderColor: orbColor }]} />

      {/* Glow halo */}
      <Animated.View style={[orbStyles.glow, { opacity: glow, backgroundColor: orbColor }]} />

      {/* Core orb */}
      <Animated.View style={[
        orbStyles.orb,
        {
          backgroundColor: orbColor,
          transform: [
            { scale: state !== 'listening' ? pulse1 : new Animated.Value(1) },
            { rotate: state === 'processing' ? spin : '0deg' },
          ],
        }
      ]}>
        {state === 'idle'       && <Text style={orbStyles.icon}>◉</Text>}
        {state === 'wake'       && <Text style={orbStyles.icon}>◉</Text>}
        {state === 'listening'  && <Text style={orbStyles.icon}>🎙</Text>}
        {state === 'processing' && <Text style={orbStyles.icon}>⟳</Text>}
        {state === 'speaking'   && <Text style={orbStyles.icon}>◈</Text>}
      </Animated.View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  container: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute', width: 140, height: 140,
    borderRadius: 70, borderWidth: 1.5,
  },
  glow: {
    position: 'absolute', width: 120, height: 120,
    borderRadius: 60, opacity: 0.15,
    shadowColor: '#fff', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 30,
  },
  orb: {
    width: 86, height: 86, borderRadius: 43,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  icon: { fontSize: 28, color: '#fff' },
});

// ─── Status Label ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<ListenState, string> = {
  idle:       'Say "ARVA" to start',
  wake:       'Listening...',
  listening:  'Speak your command',
  processing: 'Thinking...',
  speaking:   'ARVA is speaking',
};

// ─── Wave bars (speaking indicator) ──────────────────────────────────────────
function WaveBars({ active }: { active: boolean }) {
  const bars = [0.4, 0.7, 1.0, 0.7, 0.4, 0.8, 0.5];
  const anims = useRef(bars.map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (active) {
      const loops = anims.map((a, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 80),
            Animated.timing(a, { toValue: bars[i], duration: 300 + i * 50, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.2,    duration: 300 + i * 50, useNativeDriver: true }),
          ])
        )
      );
      loops.forEach(l => l.start());
      return () => loops.forEach(l => l.stop());
    } else {
      anims.forEach(a => Animated.timing(a, { toValue: 0.3, duration: 200, useNativeDriver: true }).start());
    }
  }, [active]);

  return (
    <View style={waveStyles.container}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[waveStyles.bar, { transform: [{ scaleY: anim }] }]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 28 },
  bar: {
    width: 3, height: 24, borderRadius: 2,
    backgroundColor: '#60A5FA', opacity: 0.85,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ARVAScreen() {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [history,    setHistory]    = useState<HistoryMessage[]>([]);
  const [inputText,  setInputText]  = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [listenState, setListenState] = useState<ListenState>('idle');
  const [showInput,  setShowInput]  = useState(false);

  const flatListRef   = useRef<FlatList>(null);
  const isSpeakingRef = useRef(false);
  const wakeBuffer    = useRef('');   // rolling last ~10 words to detect wake word
  const commandBuffer = useRef('');   // accumulates command after wake word

  const { isRecording, isProcessing, startRecording, stopRecording } = useVoice();

  // ── Helpers ──────────────────────────────────────────────────────────────
  const addMessage = useCallback((role: 'user' | 'arva', text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const speakText = useCallback((text: string) => {
    // Strip markdown-ish symbols for cleaner TTS
    const clean = text.replace(/[*_`#|>]/g, '').replace(/\n/g, '. ');
    isSpeakingRef.current = true;
    setListenState('speaking');
    Speech.speak(clean, {
      language: 'en-US',
      rate: 0.92,
      pitch: 1.05,
      onDone: () => {
        isSpeakingRef.current = false;
        setListenState('idle');
      },
      onStopped: () => {
        isSpeakingRef.current = false;
        setListenState('idle');
      },
      onError: () => {
        isSpeakingRef.current = false;
        setListenState('idle');
      },
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    isSpeakingRef.current = false;
    setListenState('idle');
  }, []);

  // ── Send command to backend ───────────────────────────────────────────────
  const sendToARVA = useCallback(async (text: string) => {
    if (!text.trim()) return;
    addMessage('user', text);
    setListenState('processing');

    const newHistory: HistoryMessage[] = [...history, { role: 'user', content: text }];
    try {
      const reply = await askARVA(text, newHistory);
      addMessage('arva', reply);
      setHistory([...newHistory, { role: 'assistant', content: reply }]);
      speakText(reply);
    } catch (e: any) {
      const errMsg = e.message || 'Sorry, I could not connect to the server.';
      addMessage('arva', errMsg);
      speakText(errMsg);
    }
  }, [history, addMessage, speakText]);

  // ── Voice: hold-to-talk (manual, for type-fallback toolbar) ──────────────
  const handleVoicePressIn = async () => {
    if (!isLoggedIn) { Alert.alert('Please login first'); return; }
    if (isSpeakingRef.current) stopSpeaking();
    setListenState('listening');
    await startRecording();
  };

  const handleVoicePressOut = async () => {
    const text = await stopRecording();
    if (text) {
      await sendToARVA(text);
    } else {
      setListenState('idle');
    }
  };

  // ── Orb tap: interrupt speaking OR start recording ────────────────────────
  const handleOrbPress = async () => {
    if (!isLoggedIn) { Alert.alert('Please login first'); return; }

    if (isSpeakingRef.current) {
      // Interrupt ARVA — Gemini Live style
      stopSpeaking();
      return;
    }

    if (listenState === 'listening') {
      // Stop and send
      const text = await stopRecording();
      if (text) await sendToARVA(text);
      else setListenState('idle');
      return;
    }

    // Start recording
    setListenState('listening');
    await startRecording();
  };

  // ── Wake-word detection from continuous low-power transcription ───────────
  // In a real deployment you'd use a local on-device model (Picovoice Porcupine
  // or similar). Here we hook into the voice recognition partial results from
  // useVoice and detect the wake word in the rolling buffer.
  const onPartialResult = useCallback((partial: string) => {
    const lower = partial.toLowerCase();

    if (listenState === 'idle') {
      // Check if "arva" appeared
      if (lower.includes(WAKE_WORD)) {
        // Extract command that comes AFTER the wake word
        const afterWake = lower.split(WAKE_WORD).slice(1).join('').trim();
        commandBuffer.current = afterWake;
        setListenState('wake');

        // Haptic-style quick flash, then immediately go into listening
        setTimeout(() => setListenState('listening'), 350);
      }
    }

    if (listenState === 'listening') {
      commandBuffer.current = lower;
    }
  }, [listenState]);

  // ── Text send ─────────────────────────────────────────────────────────────
  const handleTextSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    if (isSpeakingRef.current) stopSpeaking();
    await sendToARVA(text);
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    try {
      setLoading(true);
      const name = await login(email, password);
      setIsLoggedIn(true);
      const greeting = `Hi ${name}! I'm ARVA. Say my name to give me a task — like "ARVA add task code review to Alex".`;
      addMessage('arva', greeting);
      speakText(greeting);
    } catch {
      Alert.alert('Login failed', 'Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={s.loginScreen}>
        <View style={s.loginCard}>
          {/* Orb preview */}
          <View style={s.loginOrbWrap}>
            <LiveOrb state="idle" />
          </View>
          <Text style={s.loginTitle}>ARVA</Text>
          <Text style={s.loginSub}>Voice-First Task Intelligence</Text>

          <TextInput
            style={s.loginInput}
            placeholder="Email"
            placeholderTextColor="#4A5568"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={s.loginInput}
            placeholder="Password"
            placeholderTextColor="#4A5568"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={s.loginBtn} onPress={handleLogin} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.screen}>

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>ARVA</Text>
        <TouchableOpacity
          style={s.keyboardToggle}
          onPress={() => setShowInput(v => !v)}
        >
          <Text style={s.keyboardToggleIcon}>{showInput ? '🎙' : '⌨️'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chat transcript ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        style={s.chatList}
        contentContainerStyle={s.chatContent}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.userBubble : s.arvaBubble]}>
            {item.role === 'arva' && (
              <Text style={s.bubbleSender}>ARVA</Text>
            )}
            <Text style={[s.bubbleText, item.role === 'user' ? s.userText : s.arvaText]}>
              {item.text}
            </Text>
          </View>
        )}
      />

      {/* ── Live Orb Section ── */}
      <View style={s.liveSection}>
        {/* Status label */}
        <Text style={s.statusLabel}>{STATUS_LABEL[listenState]}</Text>

        {/* Wave bars when speaking */}
        {listenState === 'speaking' && (
          <WaveBars active={true} />
        )}

        {/* Hint: tap to interrupt */}
        {listenState === 'speaking' && (
          <Text style={s.interruptHint}>Tap orb to interrupt</Text>
        )}

        {/* THE ORB */}
        <Pressable onPress={handleOrbPress} style={s.orbPressable}>
          <LiveOrb state={listenState} />
        </Pressable>

        {/* Wake word hint when idle */}
        {listenState === 'idle' && (
          <View style={s.wakeHint}>
            <Text style={s.wakeHintText}>Try: </Text>
            <Text style={s.wakeHintCommand}>"ARVA add task code review to Alex"</Text>
          </View>
        )}

        {/* Listening: tap to send */}
        {listenState === 'listening' && (
          <Text style={s.interruptHint}>Tap orb when done speaking</Text>
        )}
      </View>

      {/* ── Type fallback (toggle) ── */}
      {showInput && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.textRow}>
            <TextInput
              style={s.textInput}
              placeholder='Type a command...'
              placeholderTextColor="#4A5568"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleTextSend}
              returnKeyType="send"
              autoFocus
            />
            <TouchableOpacity style={s.sendBtn} onPress={handleTextSend}>
              <Text style={s.sendIcon}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BG        = '#070B14';
const SURFACE   = '#0F1623';
const BORDER    = '#1C2535';
const ACCENT    = '#3B82F6';
const ACCENT2   = '#818CF8';
const TEXT      = '#E2E8F0';
const MUTED     = '#4A5568';
const USER_BG   = '#1E3A5F';
const ARVA_BG   = '#111827';

const s = StyleSheet.create({
  // ── Login ──
  loginScreen: {
    flex: 1, backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  loginCard: {
    width: '100%', backgroundColor: SURFACE,
    borderRadius: 24, padding: 32,
    borderWidth: 1, borderColor: BORDER,
    alignItems: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 40, elevation: 12,
  },
  loginOrbWrap: { marginBottom: 20 },
  loginTitle: {
    fontSize: 42, fontWeight: '800', color: TEXT,
    letterSpacing: 8, marginBottom: 6,
  },
  loginSub: { fontSize: 13, color: MUTED, marginBottom: 36, letterSpacing: 1 },
  loginInput: {
    width: '100%', backgroundColor: BG, color: TEXT,
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14,
    marginBottom: 14, fontSize: 15,
    borderWidth: 1, borderColor: BORDER,
  },
  loginBtn: {
    width: '100%', backgroundColor: ACCENT,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 6,
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  // ── Main ──
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: TEXT, fontSize: 18, fontWeight: '700', letterSpacing: 6,
  },
  keyboardToggle: {
    position: 'absolute', right: 20,
    padding: 6,
  },
  keyboardToggleIcon: { fontSize: 20 },

  // ── Chat ──
  chatList: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },
  bubble: {
    maxWidth: '82%', borderRadius: 18, padding: 14,
    marginVertical: 5,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: USER_BG, borderBottomRightRadius: 4 },
  arvaBubble: { alignSelf: 'flex-start', backgroundColor: ARVA_BG, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: BORDER },
  bubbleSender: { fontSize: 10, color: ACCENT2, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#CBD5E1' },
  arvaText: { color: TEXT },

  // ── Live section ──
  liveSection: {
    alignItems: 'center',
    paddingVertical: 24, paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: BORDER,
    gap: 10,
  },
  statusLabel: {
    color: MUTED, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase',
  },
  orbPressable: {
    alignItems: 'center', justifyContent: 'center',
  },
  interruptHint: {
    color: MUTED, fontSize: 12, fontStyle: 'italic',
  },
  wakeHint: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4,
  },
  wakeHintText: { color: MUTED, fontSize: 13 },
  wakeHintCommand: {
    color: ACCENT2, fontSize: 13, fontStyle: 'italic',
  },

  // ── Text input ──
  textRow: {
    flexDirection: 'row', padding: 12, gap: 8,
    borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: SURFACE,
  },
  textInput: {
    flex: 1, backgroundColor: BG, color: TEXT,
    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12,
    borderWidth: 1, borderColor: BORDER, fontSize: 15,
  },
  sendBtn: {
    backgroundColor: ACCENT, borderRadius: 22,
    width: 46, alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
