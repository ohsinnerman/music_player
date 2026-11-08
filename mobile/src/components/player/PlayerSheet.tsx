import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { ChevronDown, Ellipsis, Heart, ListMusic, MicVocal, MoonStar, SkipForward } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Track } from '@/api/types';
import { toggleLike, useIsLiked } from '@/library/hooks';
import { chrome } from '@/lib/chrome';
import { art, artistNames } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { openArtist } from '@/lib/nav';
import { alpha, usePalette } from '@/lib/palette';
import { player } from '@/player/engine';
import { clock, useCurrentTrack, usePlayer } from '@/player/store';
import { closePlayer, openPlayer, usePlayerUi } from '@/player/ui';
import { useSettings } from '@/settings/store';
import { GUTTER, ThemeScope, darkColors, makeStyles, spring, useColors } from '@/theme';
import { useDockGeometry } from '../dock/geometry';
import { PreviewBadge } from '../music/Badges';
import { openSleepTimer } from '../sheets/SleepTimer';
import { openTrackActions } from '../sheets/TrackActions';
import { Glass } from '../ui/Glass';
import { IconButton } from '../ui/IconButton';
import { Marquee } from '../ui/Marquee';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { Controls, PlayPauseIcon } from './Controls';
import { LivingBackground } from './LivingBackground';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';
import { Scrubber } from './Scrubber';

const HIDDEN_ON = ['/onboarding', '/auth'];

const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};
const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

function contextLabel(type?: string) {
  switch (type) {
    case 'album':
      return 'Playing from album';
    case 'playlist':
      return 'Playing from playlist';
    case 'artist':
      return 'Playing from artist';
    case 'genre':
      return 'Playing from genre';
    case 'liked':
      return 'Playing from your library';
    case 'search':
      return 'Playing from search';
    case 'radio':
      return 'Playing radio';
    default:
      return 'Now playing';
  }
}

const LikeButton = memo(function LikeButton({ track, size = 44 }: { track: Track; size?: number }) {
  const colors = useColors();
  const liked = useIsLiked(track.id);
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={style}>
      <IconButton
        icon={Heart}
        label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        size={size}
        iconSize={24}
        color={liked ? colors.accent : colors.text}
        fill={liked ? colors.accent : undefined}
        haptic="soft"
        onPress={() => {
          pop.set(0.7);
          pop.set(withSpring(1, { damping: 8, stiffness: 300 }));
          void toggleLike(track, liked);
        }}
      />
    </Animated.View>
  );
});

export function PlayerSheet() {
  const colors = useColors();
  const styles = useStyles();
  const g = useDockGeometry();
  const { W, H, insets } = g;
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const sleepAt = usePlayer((s) => s.sleepAt);
  const { panel, setPanel, isOpen, setOpen } = usePlayerUi();
  const living = useSettings((s) => s.livingBackground && !s.reduceTransparency);
  const path = usePathname();
  const hidden = HIDDEN_ON.some((p) => path.startsWith(p));
  const palette = usePalette(art(track?.artwork, 'small'));
  const [bgMounted, setBgMounted] = useState(false);

  const p = chrome.playerProgress;
  const c = chrome.dockCollapsed;
  const pm = chrome.playerPanel;

  /* ───── Full-player layout (screen coordinates) ───── */
  const top = insets.top;
  const bottomBarY = H - Math.max(insets.bottom, 12) - 12 - 48;
  const controlsY = bottomBarY - 14 - 76;
  const scrubY = controlsY - 18 - 46;
  const titleY = scrubY - 14 - 62;
  const artTop = top + 74;
  const S = Math.max(160, Math.min(W - 56, titleY - 28 - artTop));
  const artX = (W - S) / 2;
  const artY = artTop + Math.max(0, (titleY - 28 - artTop - S) / 2);
  const smallArt = { x: GUTTER, y: top + 66, s: 56 };
  const panelTop = smallArt.y + smallArt.s + 14;
  const panelHeight = scrubY - 6 - panelTop;

  /* ───── Shared animation state ───── */
  const playing = useSharedValue(isPlaying ? 1 : 0);
  useEffect(() => {
    playing.value = withSpring(isPlaying ? 1 : 0, spring.smooth);
  }, [isPlaying, playing]);

  const axis = useSharedValue(0); // 0 undecided, 1 vertical, 2 horizontal
  const swipeX = useSharedValue(0);
  const start = useSharedValue(0);

  // Collapse to mini when the queue empties.
  useEffect(() => {
    if (!track && p.value > 0) closePlayer();
  }, [track, p]);

  useAnimatedReaction(
    () => p.value > 0.5,
    (open, prev) => {
      if (prev !== null && open !== prev) scheduleOnRN(setOpen, open);
    },
  );
  useAnimatedReaction(
    () => p.value > 0.02,
    (show, prev) => {
      if (show && !prev) scheduleOnRN(setBgMounted, true);
    },
  );
  // Fully collapsed again → drop the (GPU-heavy) living background entirely.
  useAnimatedReaction(
    () => p.value < 0.001,
    (closed, prev) => {
      if (closed && prev === false) scheduleOnRN(setBgMounted, false);
    },
  );

  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (usePlayerUi.getState().panel !== 'none') setPanel(usePlayerUi.getState().panel);
      else closePlayer();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, setPanel]);

  /* ───── Gestures ───── */
  const range = g.miniY;
  const settle = (velocityY: number, fromFull: boolean) => {
    'worklet';
    const v = -velocityY / (fromFull ? H * 0.75 : range);
    const target = fromFull ? (p.value < 0.8 || velocityY > 700 ? 0 : 1) : p.value > 0.25 || velocityY < -500 ? 1 : 0;
    p.value = withSpring(target, { ...spring.sheet, velocity: v });
    scheduleOnRN(setOpen, target === 1);
    if (target === 1) scheduleOnRN(haptic.soft);
  };

  const miniPan = usePanGesture({
    activeOffsetY: [-8, 8],
    activeOffsetX: [-14, 14],
    onActivate: (e) => {
      'worklet';
      axis.value = Math.abs(e.translationX) > Math.abs(e.translationY) ? 2 : 1;
      start.value = p.value;
    },
    onUpdate: (e) => {
      'worklet';
      if (axis.value === 1) p.value = clamp01(start.value - e.translationY / range);
      else swipeX.value = e.translationX;
    },
    onDeactivate: (e) => {
      'worklet';
      if (axis.value === 1) settle(e.velocityY, false);
      else {
        if (e.translationX < -70 || e.velocityX < -800) scheduleOnRN(player.next);
        else if (e.translationX > 70 || e.velocityX > 800) scheduleOnRN(player.previous);
        swipeX.value = withSpring(0, spring.snappy);
      }
      axis.value = 0;
    },
  });
  const miniTap = useTapGesture({
    onActivate: () => {
      'worklet';
      scheduleOnRN(openPlayer);
    },
  });
  const miniGesture = useCompetingGestures(miniPan, miniTap);

  const fullPan = usePanGesture({
    activeOffsetY: [-10, 10],
    failOffsetX: [-24, 24],
    onActivate: () => {
      'worklet';
      start.value = p.value;
    },
    onUpdate: (e) => {
      'worklet';
      p.value = clamp01(start.value - Math.max(0, e.translationY) / (H * 0.75));
    },
    onDeactivate: (e) => {
      'worklet';
      settle(e.velocityY, true);
    },
  });

  /* ───── Animated styles ───── */
  const frame = useDerivedValue(() => {
    const cc = c.value;
    const mx = interpolate(cc, [0, 1], [g.M, g.miniXCollapsed], 'clamp');
    const my = interpolate(cc, [0, 1], [g.miniY, g.miniYCollapsed], 'clamp');
    const mw = g.W - g.M - mx;
    return { mx, my, mw };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const pp = p.value;
    return {
      left: lerp(f.mx, 0, pp),
      top: lerp(f.my, 0, pp),
      width: lerp(f.mw, W, pp),
      height: lerp(g.MINI_H, H, pp),
      borderRadius: interpolate(pp, [0, 0.9, 1], [g.MINI_H / 2, 34, 0], 'clamp'),
    };
  });

  const glassStyle = useAnimatedStyle(() => ({ opacity: 1 - clamp01(p.value * 2.2) }));
  const fullBgStyle = useAnimatedStyle(() => ({ opacity: clamp01(p.value * 1.8) }));
  const miniStyle = useAnimatedStyle(() => ({ opacity: 1 - clamp01(p.value * 5) }));
  const miniTextStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value * 0.6 }],
    opacity: 1 - Math.min(0.7, Math.abs(swipeX.value) / 140),
  }));
  const miniProgress = useAnimatedStyle(() => {
    const d = clock.duration.value;
    return { width: `${d > 0 ? Math.min(100, (clock.position.value / d) * 100) : 0}%` };
  });
  const fullStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const pp = p.value;
    return {
      opacity: clamp01((pp - 0.42) / 0.5),
      transform: [{ translateX: -lerp(f.mx, 0, pp) }, { translateY: (1 - pp) * 30 }],
    };
  });
  const titleBlockStyle = useAnimatedStyle(() => ({
    opacity: 1 - clamp01(pm.value * 2.5),
    transform: [{ translateY: pm.value * 24 }],
  }));
  const panelHeaderStyle = useAnimatedStyle(() => ({
    opacity: clamp01((pm.value - 0.4) / 0.6),
    transform: [{ translateY: (1 - pm.value) * -10 }],
  }));
  const panelBodyStyle = useAnimatedStyle(() => ({
    opacity: clamp01((pm.value - 0.3) / 0.7),
    transform: [{ translateY: (1 - pm.value) * 40 }],
  }));

  // Shared-element artwork: mini thumbnail → hero cover → small header art.
  const artStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const pp = p.value;
    const pnl = pm.value;
    const miniS = g.MINI_H - 16;
    const tx = lerp(artX, smallArt.x, pnl);
    const ty = lerp(artY, smallArt.y, pnl);
    const ts = lerp(S, smallArt.s, pnl);
    let s = lerp(miniS, ts, pp);
    let x = lerp(f.mx + 8, tx, pp);
    let y = lerp(f.my + 8, ty, pp);
    // Apple Music touch: the cover sinks back a little while paused.
    const k = 1 - 0.13 * (1 - playing.value) * (1 - pnl) * pp;
    x += (s * (1 - k)) / 2;
    y += (s * (1 - k)) / 2;
    s *= k;
    const scale = s / S;
    return {
      transform: [{ translateX: x - (S - s) / 2 }, { translateY: y - (S - s) / 2 }, { scale }],
      borderRadius: lerp(lerp(10, 18, pp), 10, pnl) / Math.max(scale, 0.01),
    };
  });
  const artShadow = useAnimatedStyle(() => ({ shadowOpacity: 0.55 * p.value * (1 - pm.value) * (0.5 + playing.value * 0.5) }));

  if (!track || hidden) return null;

  const coverUri = art(track.artwork, 'large');
  const zoneHeight = panel === 'none' ? titleY + 66 : panelTop - 4;

  return (
    <>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* Mini look */}
        <Animated.View style={[StyleSheet.absoluteFill, glassStyle]} pointerEvents="none">
          <Glass radius={g.MINI_H / 2} intensity={50} style={StyleSheet.absoluteFill} tint={alpha(palette.dominant, 0.16)} />
        </Animated.View>

        {/* Full look */}
        <Animated.View style={[StyleSheet.absoluteFill, fullBgStyle]} pointerEvents="none">
          {bgMounted && living ? (
            <LivingBackground uri={art(track.artwork, 'medium')} palette={palette} animate={isOpen} />
          ) : (
            <LinearGradient colors={[palette.dark, darkColors.bg]} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>

        {/* Mini player row */}
        <Animated.View style={[styles.miniRow, { height: g.MINI_H }, miniStyle]} pointerEvents={isOpen ? 'none' : 'box-none'}>
          <GestureDetector gesture={miniGesture}>
            <Animated.View style={styles.miniHit} accessibilityRole="button" accessibilityLabel={`Now playing: ${track.title}. Opens the player.`}>
              <View style={{ width: g.MINI_H - 4 }} />
              <Animated.View style={[{ flex: 1 }, miniTextStyle]}>
                <Text variant="headline" numberOfLines={1}>
                  {track.title}
                </Text>
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {artistNames(track)}
                </Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
          <PressableScale onPress={player.toggle} scaleTo={0.85} hapticOnPress="tap" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} style={styles.miniBtn}>
            <PlayPauseIcon playing={isPlaying} size={22} color={colors.text} />
          </PressableScale>
          <IconButton icon={SkipForward} label="Next" iconSize={21} fill={colors.text} strokeWidth={2.2} onPress={player.next} style={{ marginRight: 8 }} />
          <View style={styles.miniTrack} pointerEvents="none">
            <Animated.View style={[styles.miniFill, miniProgress]} />
          </View>
        </Animated.View>

        {/* Full player */}
        {/* The full player always sits on dark, artwork-tinted colour, so it keeps dark tokens in light mode too. */}
        <ThemeScope scheme="dark">
        <Animated.View style={[styles.full, { width: W, height: H }, fullStyle]} pointerEvents={isOpen ? 'box-none' : 'none'}>
          <GestureDetector gesture={fullPan}>
            <View style={[styles.dragZone, { height: zoneHeight }]}>
              {/* Header */}
              <View style={[styles.header, { top: top + 6 }]}>
                <IconButton icon={ChevronDown} label="Close player" iconSize={28} onPress={closePlayer} />
                <View style={styles.headerText}>
                  <Text variant="label" tone="secondary" numberOfLines={1}>
                    {contextLabel(context?.type)}
                  </Text>
                  <Text variant="headline" numberOfLines={1} align="center">
                    {context?.title ?? track.album?.title ?? 'Your queue'}
                  </Text>
                </View>
                <IconButton
                  icon={Ellipsis}
                  label="More options"
                  iconSize={24}
                  onPress={() => openTrackActions(track, [{ label: sleepAt !== null ? 'Sleep timer (on)' : 'Sleep timer', icon: MoonStar, onPress: openSleepTimer }])}
                />
              </View>

              {/* Big title block (artwork mode) */}
              <Animated.View style={[styles.titleBlock, { top: titleY, left: GUTTER + 4, right: GUTTER - 4 }, titleBlockStyle]} pointerEvents={panel === 'none' ? 'box-none' : 'none'}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Marquee variant="title1" style={{ fontSize: 24 }} active={isOpen && panel === 'none'}>
                    {track.title}
                  </Marquee>
                  <View style={styles.metaRow}>
                    {track.streamKind === 'preview' ? <PreviewBadge /> : null}
                    <PressableScale
                      onPress={() => {
                        const a = track.artists[0];
                        if (!a) return;
                        closePlayer();
                        setTimeout(() => openArtist(a.id), 260);
                      }}
                      style={{ flexShrink: 1 }}
                    >
                      <Text variant="body" tone="secondary" numberOfLines={1} style={{ fontSize: 17 }}>
                        {artistNames(track)}
                      </Text>
                    </PressableScale>
                  </View>
                </View>
                <LikeButton track={track} />
              </Animated.View>

              {/* Compact header (lyrics / queue mode) */}
              <Animated.View
                style={[styles.panelHeader, { top: smallArt.y, left: smallArt.x + smallArt.s + 14, right: GUTTER - 6, height: smallArt.s }, panelHeaderStyle]}
                pointerEvents={panel === 'none' ? 'none' : 'box-none'}
              >
                <PressableScale onPress={() => setPanel(panel)} style={{ flex: 1 }} accessibilityLabel="Back to artwork">
                  <Text variant="headline" numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {artistNames(track)}
                  </Text>
                </PressableScale>
                <LikeButton track={track} size={40} />
              </Animated.View>
            </View>
          </GestureDetector>

          {/* Lyrics / queue panel */}
          {panel !== 'none' ? (
            <Animated.View style={[styles.panelBody, { top: panelTop, height: panelHeight }, panelBodyStyle]}>
              {panel === 'lyrics' ? <LyricsView track={track} height={panelHeight} /> : <QueueView />}
            </Animated.View>
          ) : null}

          {/* Transport */}
          <View style={[styles.abs, { top: scrubY, left: GUTTER + 4 }]}>
            <Scrubber width={W - (GUTTER + 4) * 2} accent={palette.light} />
          </View>
          <View style={[styles.abs, { top: controlsY, left: GUTTER }]}>
            <Controls width={W - GUTTER * 2} />
          </View>
          <View style={[styles.bottomBar, { top: bottomBarY, left: GUTTER, right: GUTTER }]}>
            <IconButton
              icon={MicVocal}
              label="Lyrics"
              active={panel === 'lyrics'}
              color={darkColors.textSecondary}
              onPress={() => setPanel('lyrics')}
              background={panel === 'lyrics' ? 'rgba(255,255,255,0.12)' : undefined}
            />
            <View style={styles.sourceChip}>
              <Text variant="label" tone="tertiary" numberOfLines={1}>
                {track.streamKind === 'full' ? `Full track · ${track.provider}` : `30s preview · ${track.provider}`}
              </Text>
            </View>
            <IconButton
              icon={ListMusic}
              label="Queue"
              active={panel === 'queue'}
              color={darkColors.textSecondary}
              onPress={() => setPanel('queue')}
              background={panel === 'queue' ? 'rgba(255,255,255,0.12)' : undefined}
            />
          </View>
        </Animated.View>
        </ThemeScope>
      </Animated.View>

      {/* Shared artwork, above the sheet so it can travel freely */}
      <Animated.View pointerEvents="none" style={[styles.art, { width: S, height: S }, artStyle, styles.artShadow, artShadow]}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={320} cachePolicy="memory-disk" priority="high" recyclingKey={track.id} />
        ) : (
          <LinearGradient colors={[palette.vibrant, palette.dark]} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  sheet: { position: 'absolute', overflow: 'hidden' },
  miniRow: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center' },
  miniHit: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  miniTrack: { position: 'absolute', left: 22, right: 22, bottom: 0, height: 2, backgroundColor: colors.fill, borderRadius: 1, overflow: 'hidden' },
  miniFill: { height: '100%', backgroundColor: colors.textSecondary },
  full: { position: 'absolute', left: 0, top: 0 },
  dragZone: { position: 'absolute', left: 0, right: 0, top: 0 },
  header: { position: 'absolute', left: 8, right: 8, height: 52, flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  titleBlock: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, height: 62 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelHeader: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelBody: { position: 'absolute', left: 0, right: 0 },
  abs: { position: 'absolute' },
  bottomBar: { position: 'absolute', height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sourceChip: { paddingHorizontal: 12, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: darkColors.strokeStrong, justifyContent: 'center' },
  art: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', backgroundColor: colors.surface },
  artShadow: { shadowColor: '#000', shadowRadius: 30, shadowOffset: { width: 0, height: 18 } },
}));
