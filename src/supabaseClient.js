// src/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://iakygphxoxgnbneyipqr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_S4VXyw4ZKa0bpzasK8lREw_0Qw0jCPU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
