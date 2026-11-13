// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iakygphxoxgnbneyipqr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_S4VXyw4ZKa0bpzasK8lREw_0Qw0jCPU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
