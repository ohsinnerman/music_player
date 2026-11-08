import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Non-sensitive app state (settings, library cache, queue). Tokens never go here. */
export const persistStorage = createJSONStorage(() => AsyncStorage);
