import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function AuthCallbackScreen() {
  const { code, error, error_description: errorDescription } = useLocalSearchParams<{
    code?: string | string[]
    error?: string | string[]
    error_description?: string | string[]
  }>()
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value

    const finishSignIn = async () => {
      const authError = first(errorDescription) || first(error)
      if (authError) {
        if (active) setMessage(authError)
        return
      }

      if (!supabase) {
        if (active) setMessage('Sign-in is unavailable. Check your Supabase settings and try again.')
        return
      }

      try {
        const { data: initialData, error: initialError } = await supabase.auth.getSession()
        if (initialError) throw initialError
        if (initialData.session) {
          if (active) router.replace('/')
          return
        }

        const authCode = first(code)
        if (!authCode) throw new Error('The sign-in link did not include a code. Please try again.')

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode)
        if (exchangeError) {
          // Another handler may have exchanged this same one-time code already.
          const { data: latestData } = await supabase.auth.getSession()
          if (!latestData.session) throw exchangeError
        }

        if (active) router.replace('/')
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.')
      }
    }

    void finishSignIn()
    return () => { active = false }
  }, [code, error, errorDescription])

  return (
    <View style={styles.container}>
      {message ? (
        <>
          <Text style={styles.error}>{message}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color="#a9553c" />
          <Text style={styles.text}>Signing you in...</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#f7f4ef' },
  text: { color: '#777772', fontSize: 14 },
  error: { color: '#8b2e26', fontSize: 15, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: '#a9553c' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
