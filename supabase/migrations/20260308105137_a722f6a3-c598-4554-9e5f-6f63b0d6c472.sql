-- Add user_id column to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to known_faces
ALTER TABLE public.known_faces ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to environment_memories
ALTER TABLE public.environment_memories ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow all on known_faces" ON public.known_faces;
DROP POLICY IF EXISTS "Allow all on environment_memories" ON public.environment_memories;

-- Create proper per-user RLS policies for user_profiles
CREATE POLICY "Users can read own profile"
ON public.user_profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.user_profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.user_profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create proper per-user RLS policies for known_faces
CREATE POLICY "Users can read own faces"
ON public.known_faces FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own faces"
ON public.known_faces FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own faces"
ON public.known_faces FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own faces"
ON public.known_faces FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Create proper per-user RLS policies for environment_memories
CREATE POLICY "Users can read own memories"
ON public.environment_memories FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own memories"
ON public.environment_memories FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own memories"
ON public.environment_memories FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own memories"
ON public.environment_memories FOR DELETE TO authenticated
USING (user_id = auth.uid());