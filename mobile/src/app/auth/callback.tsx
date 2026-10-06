import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

/**
 * Supabase returns native OAuth sign-in to pearlcollections://auth/callback.
 * This route exists so Expo Router can receive that deep link instead of
 * rendering its unmatched-route screen. The sign-in screen completes the
 * Supabase session from the URL returned by openAuthSessionAsync.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    router.replace('/')
  }, [])

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#a9553c" />
      <Text style={styles.text}>Finishing sign-in…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f7f4ef' },
  text: { color: '#777772', fontSize: 14 },
})
