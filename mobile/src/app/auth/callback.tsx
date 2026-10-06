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
    let navigated = false
    const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value
    const authCode = first(code)
    const authError = first(errorDescription) || first(error)
    const completeSignIn = () => {
      if (!active || navigated) return
      navigated = true
      router.replace('/')
    }

    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || session) completeSignIn()
    }).data.subscription

    const timeout = setTimeout(() => {
      const showTimeoutError = async () => {
        const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
        if (active && !data.session) {
          setMessage(authError || 'Sign-in could not be completed. Please try again.')
        }
      }
      void showTimeoutError()
    }, 8000)

    const finishSignIn = async () => {
      if (!supabase) {
        return
      }

      try {
        const { data: initialData } = await supabase.auth.getSession()
        if (initialData.session) completeSignIn()
        else if (authCode) await supabase.auth.exchangeCodeForSession(authCode)
      } catch {
        // The sign-in screen may already be exchanging this one-time code.
      }
    }

    void finishSignIn()
    return () => {
      active = false
      clearTimeout(timeout)
      subscription?.unsubscribe()
    }
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
