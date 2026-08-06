import { createClient } from '@supabase/supabase-js'

// Same Supabase project as the Fanciaga desktop app — signing in here with
// your Fanciaga account is what pairs the PWA with your desktop engine.
// Override per-deployment with Vercel env vars if you ever split projects.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://ewibtmmbakowxvtowhkj.supabase.co'
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3aWJ0bW1iYWtvd3h2dG93aGtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1OTY5MzAsImV4cCI6MjA5ODE3MjkzMH0.nKoAA3ZNRa_efPWOP_yBaaDp3Qg0t7ROprbmU24cbC8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
