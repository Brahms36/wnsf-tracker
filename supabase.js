import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wthbltdjqrgxxrwtjdxi.supabase.co'
const SUPABASE_KEY = 'sb_publishable_I6IXgQWG4u1FZhcBklWZ-w_Eu-EQ76r'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
