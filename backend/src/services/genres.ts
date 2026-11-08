import type { Genre } from '../domain/types.js';

/**
 * Browse categories. Colours are deliberately rich and varied (no two
 * neighbours alike) because the tiles are the colour of the Search screen.
 */
export const GENRES: Genre[] = [
  { kind: 'genre', id: 'electronic', name: 'Electronic', colors: ['#0F6FFF', '#00C2FF'] },
  { kind: 'genre', id: 'hip-hop-rap', name: 'Hip-Hop', colors: ['#FF5A36', '#FFB13B'] },
  { kind: 'genre', id: 'pop', name: 'Pop', colors: ['#FF3D7F', '#FF8FB1'] },
  { kind: 'genre', id: 'lo-fi', name: 'Lo-Fi', colors: ['#2E7D6B', '#7BD3B0'] },
  { kind: 'genre', id: 'rnb-soul', name: 'R&B', colors: ['#B5422C', '#F08A4B'] },
  { kind: 'genre', id: 'alternative', name: 'Alternative', colors: ['#3A3F4B', '#8E9AAF'] },
  { kind: 'genre', id: 'rock', name: 'Rock', colors: ['#C1121F', '#FF6B35'] },
  { kind: 'genre', id: 'house', name: 'House', colors: ['#0B8457', '#3DDC97'] },
  { kind: 'genre', id: 'ambient', name: 'Ambient', colors: ['#14505C', '#5FB7C9'] },
  { kind: 'genre', id: 'jazz', name: 'Jazz', colors: ['#A0522D', '#E9B872'] },
  { kind: 'genre', id: 'techno', name: 'Techno', colors: ['#1B1B1E', '#5C6B73'] },
  { kind: 'genre', id: 'classical', name: 'Classical', colors: ['#7A5C2E', '#D9B26F'] },
  { kind: 'genre', id: 'drum-bass', name: 'Drum & Bass', colors: ['#006D77', '#83C5BE'] },
  { kind: 'genre', id: 'folk', name: 'Folk', colors: ['#606C38', '#DDA15E'] },
  { kind: 'genre', id: 'metal', name: 'Metal', colors: ['#2B2D42', '#8D99AE'] },
  { kind: 'genre', id: 'latin', name: 'Latin', colors: ['#E63946', '#F4A261'] },
  { kind: 'genre', id: 'trap', name: 'Trap', colors: ['#D62828', '#F77F00'] },
  { kind: 'genre', id: 'acoustic', name: 'Acoustic', colors: ['#8C5E3C', '#D4A373'] },
];

/** Provider-specific genre names (Audius uses its own labels). */
export const GENRE_QUERY: Record<string, string> = {
  electronic: 'Electronic',
  'hip-hop-rap': 'Hip-Hop/Rap',
  pop: 'Pop',
  'lo-fi': 'Lo-Fi',
  'rnb-soul': 'R&B/Soul',
  alternative: 'Alternative',
  rock: 'Rock',
  house: 'House',
  ambient: 'Ambient',
  jazz: 'Jazz',
  techno: 'Techno',
  classical: 'Classical',
  'drum-bass': 'Drum & Bass',
  folk: 'Folk',
  metal: 'Metal',
  latin: 'Latin',
  trap: 'Trap',
  acoustic: 'Acoustic',
};
