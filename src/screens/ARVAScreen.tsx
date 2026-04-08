import React, { useState, useRef, useCallback } from 'react';
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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useVoice } from '../hooks/useVoice';
import { login, askARVA } from '../services/arva';

const { width: W } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'arva';
  text: string;
}
interface HistoryItem {
  role: string;
  content: string;
}

// ─── Mic pulse ring (shown while recording) ───────────────────────────────────
function PulseRing({ active }: { active: boolean }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const loop    = useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    if (active) {
      loop.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale,   { toValue: 1.9, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
            Animated.timing(scale,   { toValue: 1,   duration: 0,   useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.35, duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 700, useNativeDriver: true }),
          ]),
        ])
      );
      loop.current.start();
    } else {
      loop.current?.stop();
      scale.setValue(1);
      opacity.setValue(0);
    }
  }, [active]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: 999,
          backgroundColor: '#EA4335',
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

// ─── Wave bars (ARVA speaking) ────────────────────────────────────────────────
function WaveBars({ active }: { active: boolean }) {
  const heights = [0.45, 0.75, 1.0, 0.75, 0.45, 0.8, 0.55];
  const anims   = useRef(heights.map(() => new Animated.Value(0.2))).current;

  React.useEffect(() => {
    if (active) {
      const loops = anims.map((a, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 70),
            Animated.timing(a, { toValue: heights[i], duration: 280 + i * 40, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.15,       duration: 280 + i * 40, useNativeDriver: true }),
          ])
        )
      );
      loops.forEach(l => l.start());
      return () => loops.forEach(l => l.stop());
    } else {
      anims.forEach(a =>
        Animated.timing(a, { toValue: 0.2, duration: 180, useNativeDriver: true }).start()
      );
    }
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3, height: 20, borderRadius: 2,
            backgroundColor: '#1A73E8',
            transform: [{ scaleY: a }],
          }}
        />
      ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ARVAScreen() {
  // Auth
  const [isLoggedIn,   setIsLoggedIn]   = useState(false);
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [authLoading,  setAuthLoading]  = useState(false);
  const [userName,     setUserName]     = useState('');

  // Chat
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [history,   setHistory]   = useState<HistoryItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending,   setSending]   = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const { isRecording, isProcessing, startRecording, stopRecording } = useVoice();

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addMessage = useCallback((role: 'user' | 'arva', text: string) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role, text }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const speakReply = useCallback((text: string) => {
    const clean = text.replace(/[*_`#|>]/g, '').replace(/\n+/g, '. ');
    setIsSpeaking(true);
    Speech.speak(clean, {
      language: 'en-US', rate: 0.93, pitch: 1.05,
      onDone:    () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError:   () => setIsSpeaking(false),
    });
  }, []);

  const sendToARVA = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isSpeaking) { Speech.stop(); setIsSpeaking(false); }

    addMessage('user', trimmed);
    setSending(true);

    const newHistory: HistoryItem[] = [...history, { role: 'user', content: trimmed }];
    try {
      const reply = await askARVA(trimmed, newHistory);
      addMessage('arva', reply);
      setHistory([...newHistory, { role: 'assistant', content: reply }]);
      speakReply(reply);
    } catch (e: any) {
      const msg = e.message || 'Could not reach the server.';
      addMessage('arva', msg);
      speakReply(msg);
    } finally {
      setSending(false);
    }
  }, [history, isSpeaking, addMessage, speakReply]);

  // ── Mic: tap once → start, tap again → stop & send ────────────────────────
  const handleMicPress = async () => {
    if (isProcessing) return;

    if (isRecording) {
      const text = await stopRecording();
      if (text) await sendToARVA(text);
    } else {
      if (isSpeaking) { Speech.stop(); setIsSpeaking(false); }
      await startRecording();
    }
  };

  // ── Text send ──────────────────────────────────────────────────────────────
  const handleTextSend = async () => {
    const text = inputText.trim();
    if (!text || sending || isRecording) return;
    setInputText('');
    await sendToARVA(text);
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Please enter email and password'); return; }
    setAuthLoading(true);
    try {
      const name = await login(email, password);
      setUserName(name);
      setIsLoggedIn(true);
      const greeting = `Hi ${name}! I'm ARVA. Tap the mic and speak your task, or type below.`;
      addMessage('arva', greeting);
      speakReply(greeting);
    } catch {
      Alert.alert('Login failed', 'Check your email and password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const micColor = isRecording ? '#EA4335' : '#1A73E8';
  const lastArvaId = [...messages].reverse().find(m => m.role === 'arva')?.id;

  const statusLine = isProcessing
    ? 'Transcribing your voice...'
    : isRecording
    ? 'Recording — tap ■ to send'
    : isSpeaking
    ? 'ARVA is speaking — tap mic to interrupt'
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={ls.screen}>
        <View style={ls.inner}>
          <View style={ls.logoCircle}>
            <Text style={ls.logoLetter}>A</Text>
          </View>
          <Text style={ls.title}>ARVA</Text>
          <Text style={ls.sub}>Your AI Task Assistant</Text>

          <View style={ls.card}>
            <TextInput
              style={ls.input}
              placeholder="Email"
              placeholderTextColor="#9AA0A6"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={ls.input}
              placeholder="Password"
              placeholderTextColor="#9AA0A6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity style={ls.btn} onPress={handleLogin} activeOpacity={0.85}>
              {authLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={ls.btnText}>Sign in</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  const isEmpty = messages.length === 0;

  return (
    <SafeAreaView style={ms.screen}>
      {/* Header */}
      <View style={ms.header}>
        <Text style={ms.headerTitle}>ARVA</Text>
      </View>

      {/* Chat or empty state */}
      {isEmpty ? (
        <View style={ms.emptyState}>
          <Text style={ms.greeting}>
            Hi <Text style={ms.greetingAccent}>{userName}</Text>,{'\n'}what do you need?
          </Text>
          <Text style={ms.hint}>Try: "Add task code review to Alex"</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          style={ms.list}
          contentContainerStyle={ms.listContent}
          renderItem={({ item }) => (
            <View style={[ms.bubble, item.role === 'user' ? ms.userBubble : ms.arvaBubble]}>
              {item.role === 'arva' && (
                <View style={ms.arvaRow}>
                  <View style={ms.arvaAvatar}><Text style={ms.arvaAvatarText}>A</Text></View>
                  <Text style={ms.arvaName}>ARVA</Text>
                  {isSpeaking && item.id === lastArvaId && <WaveBars active />}
                </View>
              )}
              <Text style={[ms.bubbleText, item.role === 'user' ? ms.userText : ms.arvaText]}>
                {item.text}
              </Text>
            </View>
          )}
        />
      )}

      {/* Input bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {statusLine && <Text style={ms.statusLine}>{statusLine}</Text>}

        <View style={ms.bar}>
          <TextInput
            style={ms.textField}
            placeholder={isRecording ? 'Listening...' : 'Message ARVA'}
            placeholderTextColor={isRecording ? '#EA4335' : '#9AA0A6'}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleTextSend}
            returnKeyType="send"
            multiline
            editable={!isRecording && !isProcessing}
          />

          {/* Send — only when text exists and not recording */}
          {inputText.trim().length > 0 && !isRecording && (
            <TouchableOpacity style={ms.sendBtn} onPress={handleTextSend} disabled={sending} activeOpacity={0.8}>
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ms.sendIcon}>↑</Text>
              }
            </TouchableOpacity>
          )}

          {/* Mic */}
          <TouchableOpacity
            style={[ms.micBtn, { backgroundColor: micColor }]}
            onPress={handleMicPress}
            disabled={isProcessing}
            activeOpacity={0.85}
          >
            <PulseRing active={isRecording} />
            {isProcessing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={ms.micIcon}>{isRecording ? '■' : '🎙'}</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Login styles ─────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#F8F9FA' },
  inner:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  logoCircle:  {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#1A73E8',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  logoLetter:  { fontSize: 36, fontWeight: '700', color: '#fff' },
  title:       { fontSize: 36, fontWeight: '800', color: '#202124', letterSpacing: 6, marginBottom: 6 },
  sub:         { fontSize: 14, color: '#5F6368', marginBottom: 40 },
  card:        {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  input:       {
    backgroundColor: '#F1F3F4', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#202124', marginBottom: 12,
  },
  btn:         { backgroundColor: '#1A73E8', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// ─── Main styles ──────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#fff' },
  header:        {
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#E8EAED',
    alignItems: 'center',
  },
  headerTitle:   { fontSize: 17, fontWeight: '700', color: '#202124', letterSpacing: 4 },

  // Empty
  emptyState:    { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  greeting:      { fontSize: 32, fontWeight: '300', color: '#202124', lineHeight: 44, marginBottom: 16 },
  greetingAccent:{ fontWeight: '600', color: '#1A73E8' },
  hint:          { fontSize: 14, color: '#9AA0A6', fontStyle: 'italic' },

  // List
  list:          { flex: 1 },
  listContent:   { padding: 16, paddingBottom: 8 },

  // Bubbles
  bubble:        { marginVertical: 6, maxWidth: '88%' },
  userBubble:    {
    alignSelf: 'flex-end', backgroundColor: '#E8F0FE',
    borderRadius: 20, borderBottomRightRadius: 5,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  arvaBubble:    {
    alignSelf: 'flex-start', backgroundColor: '#F8F9FA',
    borderRadius: 20, borderBottomLeftRadius: 5,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  arvaRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  arvaAvatar:    {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#1A73E8',
    alignItems: 'center', justifyContent: 'center',
  },
  arvaAvatarText:{ fontSize: 11, color: '#fff', fontWeight: '700' },
  arvaName:      { fontSize: 12, color: '#5F6368', fontWeight: '600' },
  bubbleText:    { fontSize: 15, lineHeight: 22 },
  userText:      { color: '#1A1A2E' },
  arvaText:      { color: '#202124' },

  // Status
  statusLine:    {
    textAlign: 'center', fontSize: 12, color: '#9AA0A6',
    paddingBottom: 4, fontStyle: 'italic',
  },

  // Input bar
  bar:           {
    flexDirection: 'row', alignItems: 'flex-end',
    margin: 12, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#F1F3F4', borderRadius: 28, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  textField:     {
    flex: 1, fontSize: 15, color: '#202124',
    maxHeight: 120, paddingVertical: 4,
    paddingTop: Platform.OS === 'ios' ? 4 : 2,
  },
  sendBtn:       {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1A73E8', alignItems: 'center', justifyContent: 'center',
  },
  sendIcon:      { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: -1 },
  micBtn:        {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', overflow: 'visible',
  },
  micIcon:       { fontSize: 18 },
});
