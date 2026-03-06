
-- Enable RLS on all tables with permissive policies (personal companion, device-id based)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_memories ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth, device-id filtering done in app code)
CREATE POLICY "Allow all on user_profiles" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on known_faces" ON public.known_faces FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on environment_memories" ON public.environment_memories FOR ALL USING (true) WITH CHECK (true);
