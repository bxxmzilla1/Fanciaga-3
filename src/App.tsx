import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import LoginScreen from './components/LoginScreen'
import ConnectScreen from './components/ConnectScreen'
import HomeScreen from './components/HomeScreen'

// Fanciaga 3 — flow:
//   1. Sign in with your Fanciaga account credentials.
//   2. ConnectScreen searches for your desktop Fanciaga app (the engine),
//      shows the ONLINE animation, pairs, and flashes the desktop fullscreen.
//   3. HomeScreen: AI Generation / Editing / Posting cards.

export default function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [paired, setPaired] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      if (!s) setPaired(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!authReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    )
  }

  if (!session) return <LoginScreen />

  if (!paired) {
    return <ConnectScreen userId={session.user.id} onConnected={() => setPaired(true)} />
  }

  return <HomeScreen userId={session.user.id} email={session.user.email ?? ''} onUnpaired={() => setPaired(false)} />
}
