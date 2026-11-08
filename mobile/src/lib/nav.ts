import { router } from 'expo-router';
import type { CatalogItem } from '@/api/types';

/** Navigate to the page for any catalogue item (tracks are handled by the caller: they play). */
export function openItem(item: CatalogItem) {
  switch (item.kind) {
    case 'album':
      return router.push({ pathname: '/album/[id]', params: { id: item.id } });
    case 'playlist':
      return item.provider === 'user'
        ? router.push({ pathname: '/my-playlist/[id]', params: { id: item.id } })
        : router.push({ pathname: '/playlist/[id]', params: { id: item.id } });
    case 'artist':
      return router.push({ pathname: '/artist/[id]', params: { id: item.id } });
    case 'genre':
      return router.push({ pathname: '/genre/[id]', params: { id: item.id, name: item.name } });
    default:
      return undefined;
  }
}

export const openArtist = (id: string) => router.push({ pathname: '/artist/[id]', params: { id } });
export const openAlbum = (id: string) => router.push({ pathname: '/album/[id]', params: { id } });

/** Tab switch from anywhere: pop detail screens, then select the tab. */
export function goTab(tab: 'index' | 'explore' | 'library') {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(tab === 'index' ? '/' : `/${tab}`);
}
