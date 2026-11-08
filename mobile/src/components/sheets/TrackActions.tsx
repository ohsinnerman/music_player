import { router } from 'expo-router';
import {
  Disc3,
  FileAudio,
  Heart,
  ListEnd,
  ListPlus,
  ListStart,
  type LucideIcon,
  MicVocal,
  Plus,
  Radio,
  Share2,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, ScrollView, Share, StyleSheet, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk, queryClient } from '@/api/queries';
import type { Track } from '@/api/types';
import { addToPlaylist, createPlaylist, toggleLike, useIsLiked, usePlaylists } from '@/library/hooks';
import { artistNames } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { getLocalLyrics, resetIdentity } from '@/local/identify';
import { removeDeviceTracks } from '@/local/import';
import { openAlbum, openArtist } from '@/lib/nav';
import { player } from '@/player/engine';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { Artwork } from '../ui/Artwork';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { closeSheet, openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

function Action({ icon: Icon, label, onPress, color: colorProp }: { icon: LucideIcon; label: string; onPress: () => void; color?: string }) {
  const colors = useColors();
  const color = colorProp ?? colors.text;
  const styles = useStyles();
  return (
    <PressableScale onPress={onPress} dim scaleTo={0.98} style={styles.action} hapticOnPress="tap">
      <Icon size={22} color={color} strokeWidth={1.9} />
      <Text variant="body" color={color}>
        {label}
      </Text>
    </PressableScale>
  );
}

function Header({ track }: { track: Track }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Artwork artwork={track.artwork} size={56} radius={radius.sm} />
      <View style={{ flex: 1 }}>
        <Text variant="title3" numberOfLines={1}>
          {track.title}
        </Text>
        <Text variant="callout" tone="secondary" numberOfLines={1}>
          {artistNames(track)}
        </Text>
      </View>
    </View>
  );
}

function TrackActionsBody({ track, close, extra }: { track: Track; close: () => void; extra?: TrackActionExtra[] }) {
  const colors = useColors();
  const styles = useStyles();
  const liked = useIsLiked(track.id);
  const local = !!track.local;
  const go = (fn: () => void) => () => {
    close();
    setTimeout(fn, 180);
  };
  return (
    <View>
      <Header track={track} />
      <View style={styles.sep} />
      <Action icon={ListStart} label="Play next" onPress={go(() => player.playNext(track))} />
      <Action icon={ListEnd} label="Add to queue" onPress={go(() => player.addToQueue(track))} />
      <Action
        icon={Heart}
        label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        color={liked ? colors.accent : colors.text}
        onPress={() => {
          haptic.soft();
          void toggleLike(track, liked);
          close();
        }}
      />
      <Action icon={ListPlus} label="Add to playlist" onPress={go(() => openPlaylistPicker([track]))} />
      {local ? null : (
      <Action
        icon={Radio}
        label="Start radio"
        onPress={go(async () => {
          try {
            const more = await endpoints.radio(track.id);
            void player.playTrack(track, { type: 'radio', id: track.id, title: `${track.title} Radio` }, more);
          } catch {
            toast('Radio isn’t available for this song', 'error');
          }
        })}
      />
      )}
      {!local && track.artists[0] ? <Action icon={UserRound} label="Go to artist" onPress={go(() => openArtist(track.artists[0]!.id))} /> : null}
      {!local && track.album ? <Action icon={Disc3} label="Go to album" onPress={go(() => openAlbum(track.album!.id))} /> : null}
      {local ? (
        <>
          <Action icon={FileAudio} label="File info" onPress={go(() => toast(fileInfo(track), 'info'))} />
          <Action
            icon={MicVocal}
            label="Find lyrics again"
            onPress={go(() => {
              resetIdentity(track.id);
              queryClient.removeQueries({ queryKey: qk.lyrics(track.id) });
              getLocalLyrics(track, { force: true })
                .then(() => toast('Lyrics found', 'success'))
                .catch(() => toast('Still no lyrics for this one', 'info'));
            })}
          />
        </>
      ) : (
        <Action icon={MicVocal} label="Song credits" onPress={go(() => toast(`${track.title} — ${artistNames(track)}${track.genre ? ` · ${track.genre}` : ''}`))} />
      )}
      <Action
        icon={Share2}
        label="Share"
        onPress={go(() => {
          Share.share({ message: `${track.title} by ${artistNames(track)} — listening on Aura` }).catch(() => undefined);
        })}
      />
      {extra?.map((e) => (
        <Action key={e.label} icon={e.icon} label={e.label} color={e.destructive ? colors.danger : colors.text} onPress={go(e.onPress)} />
      ))}
      {local ? <Action icon={Trash2} label="Remove from Aura" color={colors.danger} onPress={go(() => removeDeviceTracks([track.id]))} /> : null}
    </View>
  );
}

function fileInfo(t: Track): string {
  const l = t.local!;
  const parts = [l.codec ?? l.format.toUpperCase()];
  if (l.sampleRate) parts.push(`${(l.sampleRate / 1000).toFixed(l.sampleRate % 1000 ? 1 : 0)} kHz`);
  if (l.bitrateKbps) parts.push(`${l.bitrateKbps} kbps`);
  if (l.sizeBytes) parts.push(`${(l.sizeBytes / 1048576).toFixed(1)} MB`);
  return `${l.fileName}\n${parts.join(' · ')}`;
}

export interface TrackActionExtra {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
}

export function openTrackActions(track: Track, extra?: TrackActionExtra[]) {
  haptic.soft();
  openSheet((close) => <TrackActionsBody track={track} close={close} extra={extra} />);
}

export const removeExtra = (onPress: () => void): TrackActionExtra => ({ label: 'Remove from this playlist', icon: Trash2, onPress, destructive: true });

/* ───────────── Playlist picker ───────────── */

function PlaylistPicker({ tracks, close }: { tracks: Track[]; close: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { playlists } = usePlaylists();
  return (
    <View>
      <Text variant="title2" style={{ paddingHorizontal: GUTTER, marginBottom: 8 }}>
        Add to playlist
      </Text>
      <PressableScale
        onPress={() => {
          close();
          setTimeout(() => openCreatePlaylist(tracks), 220);
        }}
        dim
        scaleTo={0.98}
        style={styles.pickRow}
      >
        <View style={styles.newIcon}>
          <Plus size={22} color={colors.text} />
        </View>
        <Text variant="headline">New playlist</Text>
      </PressableScale>
      <ScrollView style={{ maxHeight: 360 }}>
        {playlists.map((p) => (
          <PressableScale
            key={p.id}
            dim
            scaleTo={0.98}
            style={styles.pickRow}
            onPress={async () => {
              close();
              if (await addToPlaylist(p.id, tracks)) {
                haptic.success();
                toast(`Added to ${p.title}`, 'success');
              }
            }}
          >
            <Artwork artwork={p.artwork} size={48} radius={radius.xs} />
            <View style={{ flex: 1 }}>
              <Text variant="headline" numberOfLines={1}>
                {p.title}
              </Text>
              <Text variant="caption" tone="tertiary">
                {p.trackCount ?? 0} songs
              </Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

export function openPlaylistPicker(tracks: Track[]) {
  openSheet((close) => <PlaylistPicker tracks={tracks} close={close} />);
}

/* ───────────── Create playlist ───────────── */

function CreatePlaylist({ tracks, close, onCreated }: { tracks: Track[]; close: () => void; onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const id = await createPlaylist(name, tracks);
    setBusy(false);
    if (id) {
      Keyboard.dismiss();
      haptic.success();
      close();
      toast(tracks.length ? `Added to ${name.trim()}` : 'Playlist created', 'success');
      if (onCreated) onCreated(id);
      else setTimeout(() => router.push({ pathname: '/my-playlist/[id]', params: { id } }), 250);
    }
  };
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 18, paddingTop: 4 }}>
      <Text variant="title2">Name your playlist</Text>
      <TextField label="Playlist name" placeholder="Late night drives" value={name} onChangeText={setName} autoFocus maxLength={80} returnKeyType="done" onSubmitEditing={submit} />
      <Button title="Create" size="lg" onPress={submit} loading={busy} disabled={!name.trim()} />
    </View>
  );
}

export function openCreatePlaylist(tracks: Track[] = [], onCreated?: (id: string) => void) {
  openSheet((close) => <CreatePlaylist tracks={tracks} close={close} onCreated={onCreated} />);
}

export { closeSheet };

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 10 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.strokeStrong, marginHorizontal: GUTTER, marginVertical: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: GUTTER + 2, height: 50 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  newIcon: { width: 48, height: 48, borderRadius: radius.xs, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
}));
