
-- Add custom character fields to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS character_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS character_personality text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS character_speaking_style text DEFAULT NULL;

-- Create storage bucket for custom character avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('character-avatars', 'character-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'character-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow anyone to view avatars (public bucket)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'character-avatars');

-- Allow users to update their own avatars
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'character-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to delete their own avatars
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'character-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
