import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Supabase client expects the project root, not a Data API endpoint such as
// `/rest/v1`. Strip accidental paths so auth URLs resolve under `/auth/v1`.
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const url = configuredUrl ? new URL(configuredUrl).origin : undefined
export const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const supabase = url && supabasePublicKey
  ? createClient(url, supabasePublicKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
