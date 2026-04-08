import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://exeudfxmwbvewojdemwa.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4ZXVkZnhtd2J2ZXdvamRlbXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjczMjEsImV4cCI6MjA5MTI0MzMyMX0.dZqDMOuP3vDj2BmyzfaeOVk-9bYiV8-4xGqpii-wxJ0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
