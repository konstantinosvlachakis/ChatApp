import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from "expo-audio";

// One audio player shared by every voice-note row in the open chat, so only one plays at a time.
// Rows subscribe with `useChatAudioState(key)`, which returns a constant idle snapshot for every
// row except the active one: progress ticks re-render only the playing row.

export type ChatAudioState = {
  activeKey: string | null;
  playing: boolean;
  /** Source requested but not loaded yet. */
  loading: boolean;
  /** The source did not load in time (e.g. unsupported format). */
  error: boolean;
  currentTime: number;
  duration: number;
};

const IDLE: ChatAudioState = {
  activeKey: null,
  playing: false,
  loading: false,
  error: false,
  currentTime: 0,
  duration: 0,
};

const LOAD_TIMEOUT_MS = 15_000;
const STATUS_UPDATE_INTERVAL_MS = 250;

export class ChatAudioController {
  private player: AudioPlayer | null = null;
  private statusSubscription: { remove: () => void } | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private audioModeSet = false;
  private finished = false;
  private state: ChatAudioState = IDLE;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private setState(next: ChatAudioState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  private clearLoadTimer() {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private handleStatus = (status: AudioStatus) => {
    if (!this.state.activeKey) return;
    if (status.isLoaded) this.clearLoadTimer();
    if (status.didJustFinish) this.finished = true;
    const playing = status.didJustFinish ? false : status.playing;
    this.setState({
      ...this.state,
      playing,
      loading: !status.isLoaded && this.state.loading,
      error: false,
      currentTime: status.didJustFinish ? 0 : status.currentTime,
      duration: status.duration || this.state.duration,
    });
  };

  private ensurePlayer(uri: string): AudioPlayer {
    if (!this.audioModeSet) {
      this.audioModeSet = true;
      // Voice notes should be audible with the iOS silent switch on.
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
        this.audioModeSet = false;
      });
    }
    if (this.player) {
      this.player.replace({ uri });
      return this.player;
    }
    const player = createAudioPlayer({ uri }, { updateInterval: STATUS_UPDATE_INTERVAL_MS });
    this.statusSubscription = player.addListener("playbackStatusUpdate", this.handleStatus);
    this.player = player;
    return player;
  }

  /** Play/pause `key` (a message id); starting one row stops whichever was playing. */
  toggle(key: string, uri: string) {
    try {
      if (this.state.activeKey === key && this.player && !this.state.error) {
        if (this.state.playing) {
          this.player.pause();
          this.setState({ ...this.state, playing: false });
          return;
        }
        if (this.finished) {
          this.finished = false;
          this.player.seekTo(0).catch(() => undefined);
        }
        this.player.play();
        this.setState({ ...this.state, playing: true });
        return;
      }

      this.clearLoadTimer();
      this.finished = false;
      const player = this.ensurePlayer(uri);
      player.play();
      this.setState({ ...IDLE, activeKey: key, playing: true, loading: true });
      this.loadTimer = setTimeout(() => {
        this.loadTimer = null;
        if (this.state.activeKey !== key || !this.state.loading) return;
        this.player?.pause();
        this.setState({ ...this.state, playing: false, loading: false, error: true });
      }, LOAD_TIMEOUT_MS);
    } catch {
      this.setState({ ...IDLE, activeKey: key, error: true });
    }
  }

  /**
   * Stops playback and frees the native player (screen blur, app background, chat switch,
   * unmount). The next `toggle` creates a new player.
   */
  release() {
    this.clearLoadTimer();
    this.finished = false;
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    if (this.player) {
      try {
        this.player.pause();
      } catch {
        // already released natively
      }
      this.player.remove();
      this.player = null;
    }
    if (this.state !== IDLE) this.setState(IDLE);
  }
}

export const ChatAudioContext = createContext<ChatAudioController | null>(null);

/** Playback state for one row: the live state when `key` is active, else a constant idle state. */
export function useChatAudioState(key: string): ChatAudioState {
  const controller = useContext(ChatAudioContext);
  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : () => undefined),
    [controller]
  );
  const getSnapshot = useCallback(() => {
    if (!controller) return IDLE;
    const state = controller.getState();
    return state.activeKey === key ? state : IDLE;
  }, [controller, key]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useChatAudioController() {
  return useContext(ChatAudioContext);
}
